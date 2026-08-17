import { describe, expect, it } from 'vitest'

import { createPublicFontHandler } from '../lib/server/public-font-api'

const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32])

function request(
  path: string,
  host = 'assets.example.com',
  options: {
    forwardedProto?: string
    urlHost?: string
    urlProtocol?: 'http' | 'https'
  } = {},
) {
  return new Request(
    `${options.urlProtocol ?? 'https'}://${options.urlHost ?? host}${path}`,
    {
    headers: {
      host,
      ...(options.forwardedProto
        ? { 'x-forwarded-proto': options.forwardedProto }
        : {}),
    },
  })
}

describe('public immutable font delivery', () => {
  it('serves only allowlisted WOFF2 subsets from the exact asset host', async () => {
    const load = () => Promise.resolve({
      bytes,
      checksum: '78636849015e5d2ab5689e3f2aff050a589cbede7b789470076f450f03acb2bb',
    })
    const handler = createPublicFontHandler({ assetOrigin: 'https://assets.example.com', load })
    const response = await handler(
      request('/f/be-vietnam-pro/vietnamese.woff2'),
      { params: Promise.resolve({ fontId: 'be-vietnam-pro', subset: 'vietnamese' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('font/woff2')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.has('set-cookie')).toBe(false)
  })

  it('accepts the exact HTTPS asset host behind the local asset proxy', async () => {
    const load = () => Promise.resolve({
      bytes,
      checksum: '78636849015e5d2ab5689e3f2aff050a589cbede7b789470076f450f03acb2bb',
    })
    const handler = createPublicFontHandler({
      assetOrigin: 'https://assets.example.com',
      load,
    })
    const response = await handler(
      request('/f/noto-serif/vietnamese.woff2', 'assets.example.com', {
        forwardedProto: 'https',
        urlHost: 'localhost:3000',
        urlProtocol: 'http',
      }),
      {
        params: Promise.resolve({
          fontId: 'noto-serif',
          subset: 'vietnamese',
        }),
      },
    )

    expect(response.status).toBe(200)
  })

  it('rejects wrong hosts, traversal, unknown fonts and unknown subsets before loading', async () => {
    const load = () => Promise.resolve({ bytes, checksum: 'unused' })
    const handler = createPublicFontHandler({ assetOrigin: 'https://assets.example.com', load })

    for (const [fontId, subset, host] of [
      ['be-vietnam-pro', 'vietnamese', 'app.example.com'],
      ['../private', 'vietnamese', 'assets.example.com'],
      ['unknown', 'vietnamese', 'assets.example.com'],
      ['be-vietnam-pro', 'all.css', 'assets.example.com'],
    ] as const) {
      const response = await handler(
        request('/f/rejected/file.woff2', host),
        { params: Promise.resolve({ fontId, subset }) },
      )
      expect(response.status).toBe(404)
    }
  })
})
