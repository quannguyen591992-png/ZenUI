import { describe, expect, it, vi } from 'vitest'

import { createPublicAssetHandler, validateAssetOrigin } from '../lib/server/public-asset-api'

const assetId = '11111111-1111-4111-8111-111111111111'
const bytes = new Uint8Array([1, 2, 3])

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    assetOrigin: 'http://127.0.0.1:3000',
    assets: { getPublicReady: vi.fn().mockResolvedValue({
      id: assetId, status: 'ready', objectKey: 'assets/private/image.webp',
      contentType: 'image/webp', bytes: bytes.byteLength, checksum: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
    }) },
    store: { get: vi.fn().mockResolvedValue(bytes) },
    ...overrides,
  }
}

describe('public immutable asset delivery', () => {
  it('requires a hostname isolated from the editor', () => {
    expect(validateAssetOrigin('https://assets.example.com', 'https://app.example.com')).toBe('https://assets.example.com')
    expect(() => validateAssetOrigin('https://app.example.com:444', 'https://app.example.com')).toThrow()
    expect(() => validateAssetOrigin('http://assets.example.com', 'https://app.example.com')).toThrow()
  })

  it('rejects the wrong host before database or object access', async () => {
    const deps = dependencies()
    const response = await createPublicAssetHandler(deps)(
      new Request(`http://localhost:3000/a/${assetId}`, { headers: { host: 'localhost:3000' } }),
      { params: Promise.resolve({ assetId }) },
    )
    expect(response.status).toBe(404)
    expect(deps.assets.getPublicReady).not.toHaveBeenCalled()
    expect(deps.store.get).not.toHaveBeenCalled()
  })

  it('returns uniform 404 for invalid, missing or non-ready IDs', async () => {
    const deps = dependencies({ assets: { getPublicReady: vi.fn().mockResolvedValue(null) } })
    const handler = createPublicAssetHandler(deps)
    expect((await handler(new Request('http://127.0.0.1:3000/a/not-a-uuid'), { params: Promise.resolve({ assetId: 'not-a-uuid' }) })).status).toBe(404)
    expect((await handler(new Request(`http://127.0.0.1:3000/a/${assetId}`), { params: Promise.resolve({ assetId }) })).status).toBe(404)
  })

  it('serves verified WebP with immutable cookie-free headers', async () => {
    const response = await createPublicAssetHandler(dependencies())(
      new Request(`http://127.0.0.1:3000/a/${assetId}`),
      { params: Promise.resolve({ assetId }) },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('content-length')).toBe(String(bytes.byteLength))
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.has('set-cookie')).toBe(false)
  })

  it('returns a safe 503 instead of corrupted bytes', async () => {
    const response = await createPublicAssetHandler(dependencies({
      store: { get: vi.fn().mockResolvedValue(new Uint8Array([9])) },
    }))(
      new Request(`http://127.0.0.1:3000/a/${assetId}`),
      { params: Promise.resolve({ assetId }) },
    )
    expect(response.status).toBe(503)
    expect(await response.text()).toBe('Asset unavailable')
  })
})
