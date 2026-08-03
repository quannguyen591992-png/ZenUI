import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import {
  AssetPipelineError,
  assertGlobalAddresses,
  createPexelsAdapter,
  detectRasterType,
  normalizeRasterImage,
  readBoundedBody,
  validateImageSourceUrl,
} from '../src/server.js'

describe('secure image ingestion primitives', () => {
  it.each([
    'http://images.pexels.com/photo.jpg',
    'ftp://images.pexels.com/photo.jpg',
    '//images.pexels.com/photo.jpg',
    'https://user:pass@images.pexels.com/photo.jpg',
    'https://images.pexels.com:8443/photo.jpg',
    'https://images.pexels.com/photo.jpg#fragment',
    'https://127.0.0.1/photo.jpg',
    'https://[::1]/photo.jpg',
    'https://images.pexels.com.evil.test/photo.jpg',
  ])('rejects unsafe provider URL %s before DNS', value => {
    expect(() => validateImageSourceUrl(value, ['images.pexels.com'])).toThrow(AssetPipelineError)
  })

  it('accepts only an exact normalized HTTPS provider host', () => {
    expect(validateImageSourceUrl('https://IMAGES.PEXELS.COM./photos/1.jpeg', ['images.pexels.com']).hostname)
      .toBe('images.pexels.com.')
  })

  it.each([
    [['127.0.0.1']], [['10.0.0.1']], [['172.16.0.1']], [['192.168.1.1']], [['169.254.1.1']], [['100.64.0.1']],
    [['0.0.0.0']], [['224.0.0.1']], [['::1']], [['fc00::1']], [['fe80::1']], [['ff00::1']], [['::ffff:127.0.0.1']],
    [['8.8.8.8', '10.0.0.1']],
  ] satisfies [string[]][])('rejects denied or mixed DNS answers %j', addresses => {
    expect(() => assertGlobalAddresses(addresses)).toThrow(AssetPipelineError)
  })

  it('accepts globally routable A, AAAA and mapped IPv4 answers', () => {
    expect(assertGlobalAddresses(['8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8']))
      .toEqual(['8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8'])
  })

  it('rejects empty or malformed DNS answers', () => {
    expect(() => assertGlobalAddresses([])).toThrow(AssetPipelineError)
    expect(() => assertGlobalAddresses(['not-an-address'])).toThrow(AssetPipelineError)
  })

  it('reads a bounded non-empty stream and rejects invalid bounds or empty input', async () => {
    const stream = (async function* () {
      await Promise.resolve()
      yield new Uint8Array([1, 2])
      yield new Uint8Array([3])
    })()
    await expect(readBoundedBody(stream, 3)).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await expect(readBoundedBody((async function* () { await Promise.resolve(); yield new Uint8Array([1]) })(), 0))
      .rejects.toMatchObject({ code: 'image_too_large' })
    const empty = {
      [Symbol.asyncIterator]() {
        return { next: () => Promise.resolve({ done: true as const, value: undefined }) }
      },
    }
    await expect(readBoundedBody(empty, 3)).rejects.toMatchObject({ code: 'invalid_image' })
  })

  it('bounds streamed bytes even when content length is absent or false', async () => {
    const stream = (async function* () {
      await Promise.resolve()
      yield new Uint8Array([1, 2, 3])
      yield new Uint8Array([4, 5, 6])
    })()
    await expect(readBoundedBody(stream, 5)).rejects.toMatchObject({ code: 'image_too_large' })
  })

  it('requires exact MIME and raster magic agreement', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const webp = new TextEncoder().encode('RIFF0000WEBP')
    expect(detectRasterType(jpeg, 'image/jpeg')).toBe('jpeg')
    expect(detectRasterType(png, 'IMAGE/PNG')).toBe('png')
    expect(detectRasterType(webp, 'image/webp')).toBe('webp')
    expect(() => detectRasterType(jpeg, 'image/png')).toThrow(AssetPipelineError)
    expect(() => detectRasterType(new TextEncoder().encode('<svg/>'), 'image/svg+xml')).toThrow(AssetPipelineError)
  })

  it('normalizes a bounded raster to metadata-free deterministic WebP', async () => {
    const input = await sharp({
      create: { width: 64, height: 32, channels: 3, background: '#2563eb' },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer()

    const first = await normalizeRasterImage(input, { maxInputPixels: 10_000, maxWidth: 48, maxHeight: 48, maxOutputBytes: 100_000 })
    const second = await normalizeRasterImage(input, { maxInputPixels: 10_000, maxWidth: 48, maxHeight: 48, maxOutputBytes: 100_000 })

    expect(first.contentType).toBe('image/webp')
    expect(first.width).toBeLessThanOrEqual(48)
    expect(first.height).toBeLessThanOrEqual(48)
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(first.checksum).toBe(second.checksum)
    expect(await sharp(first.bytes).metadata()).toMatchObject({ format: 'webp' })
  })

  it('applies bounded crop transforms without mutating the source', async () => {
    const input = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#2563eb' } }).png().toBuffer()
    const result = await normalizeRasterImage(input, {
      maxInputPixels: 10_000, maxWidth: 80, maxHeight: 40, maxOutputBytes: 100_000,
      transform: { x: 0.25, y: 0, width: 0.5, height: 1, outputWidth: 64, outputHeight: 64 },
    })
    expect(result).toMatchObject({ width: 64, height: 64, contentType: 'image/webp' })
    expect(await sharp(input).metadata()).toMatchObject({ format: 'png', width: 80, height: 40 })
  })

  it('rejects decoded pixel bombs and oversized normalized output before persistence', async () => {
    const input = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).png().toBuffer()
    await expect(normalizeRasterImage(input, {
      maxInputPixels: 1_000, maxWidth: 100, maxHeight: 100, maxOutputBytes: 100_000,
    })).rejects.toMatchObject({ code: 'image_dimensions_exceeded' })
    await expect(normalizeRasterImage(input, {
      maxInputPixels: 20_000, maxWidth: 100, maxHeight: 100, maxOutputBytes: 1,
    })).rejects.toMatchObject({ code: 'image_too_large' })
  })

  it('rejects malformed raster input with a safe error', async () => {
    await expect(normalizeRasterImage(new TextEncoder().encode('not-an-image'), {
      maxInputPixels: 1_000, maxWidth: 100, maxHeight: 100, maxOutputBytes: 100_000,
    })).rejects.toMatchObject({ code: 'invalid_image' })
  })

  it('downloads one fixed-provider result through bounded validated transport', async () => {
    const source = await sharp({
      create: { width: 32, height: 16, channels: 3, background: '#2563eb' },
    }).jpeg().toBuffer()
    const adapter = createPexelsAdapter({
      apiKey: 'server-secret',
      resolveHost: hostname => {
        expect(hostname).toBe('images.pexels.com')
        return Promise.resolve(['8.8.8.8'])
      },
      fetch: input => {
        const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
        if (url === 'https://api.pexels.com/v1/photos/42') {
          return Promise.resolve(Response.json({
            id: 42, width: 32, height: 16,
            photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
            src: { medium: 'https://images.pexels.com/photos/42/medium.jpeg', large2x: 'https://images.pexels.com/photos/42/large.jpeg' },
            alt: 'A launch planning board',
          }))
        }
        if (url === 'https://images.pexels.com/photos/42/large.jpeg') {
          return Promise.resolve(new Response(source, { headers: { 'content-type': 'image/jpeg', 'content-length': String(source.byteLength) } }))
        }
        return Promise.resolve(new Response(null, { status: 404 }))
      },
    })

    const result = await adapter.resolve('42')

    expect(result.contentType).toBe('image/jpeg')
    expect(result.bytes).toEqual(new Uint8Array(source))
    expect(result.attribution).toEqual({ provider: 'pexels', creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' })
  })

  it('maps fixed-provider search failures to allowlisted errors', async () => {
    for (const [status, code] of [[401, 'provider_auth'], [403, 'provider_auth'], [429, 'provider_rate_limit'], [500, 'provider_error']] as const) {
      const adapter = createPexelsAdapter({
        apiKey: 'server-secret',
        fetch: () => Promise.resolve(new Response(null, { status })),
      })
      await expect(adapter.search('launch plan')).rejects.toMatchObject({ code })
    }
    const invalid = createPexelsAdapter({
      apiKey: 'server-secret',
      fetch: () => Promise.resolve(Response.json({ photos: [{ id: null }] })),
    })
    await expect(invalid.search('launch plan')).rejects.toMatchObject({ code: 'provider_error' })
    expect(() => createPexelsAdapter({ apiKey: '' })).toThrow(AssetPipelineError)
  })

  it('maps provider photo failures and identity mismatches to allowlisted errors', async () => {
    for (const [status, code] of [[401, 'provider_auth'], [429, 'provider_rate_limit'], [500, 'provider_error']] as const) {
      const adapter = createPexelsAdapter({
        apiKey: 'server-secret',
        fetch: () => Promise.resolve(new Response(null, { status })),
      })
      await expect(adapter.resolve('42')).rejects.toMatchObject({ code })
    }
    const mismatched = createPexelsAdapter({
      apiKey: 'server-secret',
      fetch: () => Promise.resolve(Response.json({
        id: 43, width: 32, height: 16, photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
        src: { medium: 'https://images.pexels.com/medium.jpeg', large2x: 'https://images.pexels.com/large.jpeg' }, alt: 'Board',
      })),
    })
    await expect(mismatched.resolve('42')).rejects.toMatchObject({ code: 'provider_error' })
  })

  it('rejects redirects and mixed DNS answers while downloading provider bytes', async () => {
    const mixed = createPexelsAdapter({
      apiKey: 'server-secret',
      resolveHost: () => Promise.resolve(['8.8.8.8', '10.0.0.1']),
      fetch: input => {
        const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
        return Promise.resolve(url.includes('/v1/photos/')
          ? Response.json({
              id: 42, width: 32, height: 16, photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
              src: { medium: 'https://images.pexels.com/medium.jpeg', large2x: 'https://images.pexels.com/large.jpeg' }, alt: 'Board',
            })
          : new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }))
      },
    })
    await expect(mixed.resolve('42')).rejects.toMatchObject({ code: 'invalid_source' })

    const redirected = createPexelsAdapter({
      apiKey: 'server-secret', resolveHost: () => Promise.resolve(['8.8.8.8']),
      fetch: input => {
        const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
        return Promise.resolve(url.includes('/v1/photos/')
          ? Response.json({
              id: 42, width: 32, height: 16, photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
              src: { medium: 'https://images.pexels.com/medium.jpeg', large2x: 'https://images.pexels.com/large.jpeg' }, alt: 'Board',
            })
          : new Response(null, { status: 302, headers: { location: 'https://evil.test/image.jpg' } }))
      },
    })
    await expect(redirected.resolve('42')).rejects.toMatchObject({ code: 'invalid_source' })
  })

  it('rejects missing, oversized, empty and MIME-mismatched provider bodies', async () => {
    const photo = {
      id: 42, width: 32, height: 16, photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
      src: { medium: 'https://images.pexels.com/medium.jpeg', large2x: 'https://images.pexels.com/large.jpeg' }, alt: 'Board',
    }
    const cases = [
      { response: new Response(null, { status: 500 }), code: 'provider_error' },
      { response: new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg', 'content-length': '9' } }), code: 'image_too_large' },
      { response: new Response(new Uint8Array([]), { headers: { 'content-type': 'image/jpeg' } }), code: 'invalid_image' },
      { response: new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/png' } }), code: 'invalid_image' },
    ] as const
    for (const testCase of cases) {
      const adapter = createPexelsAdapter({
        apiKey: 'server-secret', maxDownloadBytes: 8,
        resolveHost: () => Promise.resolve(['8.8.8.8']),
        fetch: input => {
          const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
          return Promise.resolve(url.includes('/v1/photos/') ? Response.json(photo) : testCase.response)
        },
      })
      await expect(adapter.resolve('42')).rejects.toMatchObject({ code: testCase.code })
    }
  })

  it('maps request timeouts and unexpected transport errors safely', async () => {
    const timeout = createPexelsAdapter({
      apiKey: 'server-secret', timeoutMs: 1,
      fetch: (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
    })
    await expect(timeout.search('launch plan')).rejects.toMatchObject({ code: 'provider_timeout' })

    const failed = createPexelsAdapter({
      apiKey: 'server-secret',
      fetch: () => Promise.reject(new Error('network unavailable')),
    })
    await expect(failed.search('launch plan')).rejects.toMatchObject({ code: 'provider_error' })
  })

  it('keeps Pexels secrets and source URLs server-only', async () => {
    const requests: { url: string; authorization: string | null }[] = []
    const adapter = createPexelsAdapter({
      apiKey: 'server-secret',
      fetch: (input, init) => {
        const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
        requests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
        return Promise.resolve(Response.json({
          photos: [{
            id: 42, width: 1200, height: 800,
            photographer: 'Ada', photographer_url: 'https://www.pexels.com/@ada',
            src: { medium: 'https://images.pexels.com/photos/42/medium.jpeg', large2x: 'https://images.pexels.com/photos/42/large.jpeg' },
            alt: 'A launch planning board',
          }],
        }))
      },
    })

    const results = await adapter.search('launch plan', 1)
    expect(requests).toEqual([{ url: 'https://api.pexels.com/v1/search?query=launch+plan&per_page=1', authorization: 'server-secret' }])
    expect(results).toEqual([{
      resultId: '42', width: 1200, height: 800,
      previewUrl: 'https://images.pexels.com/photos/42/medium.jpeg',
      alt: 'A launch planning board',
      attribution: { provider: 'pexels', creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' },
    }])
    expect(JSON.stringify(results)).not.toContain('large.jpeg')
  })
})
