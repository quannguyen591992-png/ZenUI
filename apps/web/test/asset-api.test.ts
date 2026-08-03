import { describe, expect, it, vi } from 'vitest'

import { createAssetHandlers } from '../lib/server/asset-api'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const assetId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const route = { params: Promise.resolve({ projectId }) }

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: assetId, workspaceId, projectId, createdBy: userId, requestId,
    scope: 'project' as const, source: 'upload' as const, status: 'queued' as const,
    parentAssetId: null, transform: null, sourceObjectKey: 'private/source', objectKey: null,
    contentType: null, width: null, height: null, bytes: null, checksum: null,
    defaultAlt: 'Product dashboard', attribution: null, providerResultId: null, errorCode: null,
    attemptCount: 0, archived: false, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const record = asset()
  return {
    trustedOrigin: 'http://localhost:3000',
    maxUploadBytes: 8,
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' as const }),
    findProject: () => Promise.resolve({ id: projectId, version: 1 }),
    admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
    assets: {
      create: vi.fn().mockResolvedValue(record),
      createDerivative: vi.fn().mockResolvedValue(asset({ source: 'derivative', parentAssetId: assetId })),
      findById: vi.fn().mockResolvedValue(record),
      list: vi.fn().mockResolvedValue([record]),
      fail: vi.fn().mockResolvedValue(asset({ status: 'failed', errorCode: 'queue_unavailable' })),
      archive: vi.fn().mockResolvedValue(asset({ archived: true })),
    },
    sourceStore: { put: vi.fn().mockResolvedValue(undefined) },
    queue: { enqueue: vi.fn().mockResolvedValue(undefined) },
    search: { search: vi.fn().mockResolvedValue([{
      resultId: '42', width: 1200, height: 800,
      previewUrl: 'https://images.pexels.com/photos/42/medium.jpeg', alt: 'Planning board',
      attribution: { provider: 'pexels', creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' },
    }]) },
    ...overrides,
  }
}

function uploadRequest(body: Uint8Array, origin = 'http://localhost:3000') {
  const url = new URL(`http://localhost/api/v1/projects/${projectId}/assets/uploads`)
  url.searchParams.set('workspaceId', workspaceId)
  url.searchParams.set('requestId', requestId)
  url.searchParams.set('scope', 'project')
  url.searchParams.set('filename', 'hero.jpg')
  url.searchParams.set('defaultAlt', 'Product dashboard')
  const payload = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  return new Request(url, {
    method: 'POST', headers: { origin, 'content-type': 'image/jpeg', 'content-length': String(body.byteLength) }, body: payload,
  })
}

describe('asset API', () => {
  it('checks Origin before reading upload bytes and queues a local-ID-only job', async () => {
    const deps = dependencies()
    const handlers = createAssetHandlers(deps)
    expect((await handlers.UPLOAD(uploadRequest(new Uint8Array([1]), 'https://evil.test'), route)).status).toBe(403)
    expect(deps.sourceStore.put).not.toHaveBeenCalled()

    const response = await handlers.UPLOAD(uploadRequest(new Uint8Array([0xff, 0xd8, 0xff])), route)
    expect(response.status).toBe(202)
    expect(deps.sourceStore.put).toHaveBeenCalledWith(expect.objectContaining({ bytes: expect.any(Uint8Array) }))
    expect(deps.queue.enqueue).toHaveBeenCalledWith({ assetId, projectId, workspaceId, userId })
    expect(JSON.stringify(deps.queue.enqueue.mock.calls)).not.toContain('private/source')
  })

  it('rejects missing/oversized/unsupported upload metadata before persistence', async () => {
    const handlers = createAssetHandlers(dependencies())
    expect((await handlers.UPLOAD(new Request('http://localhost/upload', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: new Uint8Array([1]).buffer }), route)).status).toBe(422)
    expect((await handlers.UPLOAD(uploadRequest(new Uint8Array(9)), route)).status).toBe(413)
    const unsupported = uploadRequest(new Uint8Array([1]))
    unsupported.headers.set('content-type', 'image/svg+xml')
    expect((await handlers.UPLOAD(unsupported, route)).status).toBe(415)
    const mismatched = uploadRequest(new Uint8Array([1, 2, 3]))
    mismatched.headers.set('content-length', '2')
    expect((await handlers.UPLOAD(mismatched, route)).status).toBe(422)
    const workspaceScope = uploadRequest(new Uint8Array([1]))
    const workspaceUrl = new URL(workspaceScope.url)
    workspaceUrl.searchParams.set('scope', 'workspace')
    expect((await handlers.UPLOAD(new Request(workspaceUrl, {
      method: 'POST', headers: workspaceScope.headers, body: new Uint8Array([1]).buffer,
    }), route)).status).toBe(422)
  })

  it('authenticates reads and keeps item lookup tenant-safe', async () => {
    const noSession = createAssetHandlers(dependencies({ getSession: () => Promise.resolve(null) }))
    expect((await noSession.LIST(new Request(`http://localhost/assets?workspaceId=${workspaceId}`), route)).status).toBe(401)
    const noMembership = createAssetHandlers(dependencies({ findMembership: () => Promise.resolve(null) }))
    expect((await noMembership.LIST(new Request(`http://localhost/assets?workspaceId=${workspaceId}`), route)).status).toBe(404)
    expect((await createAssetHandlers(dependencies()).LIST(new Request('http://localhost/assets?workspaceId=invalid'), route)).status).toBe(422)

    const deps = dependencies()
    const handlers = createAssetHandlers(deps)
    expect((await handlers.GET_ITEM(
      new Request(`http://localhost/assets/${assetId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, assetId }) },
    )).status).toBe(200)
    deps.assets.findById.mockResolvedValue(asset({ projectId: null, scope: 'workspace' }))
    expect((await handlers.GET_ITEM(
      new Request(`http://localhost/assets/${assetId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, assetId }) },
    )).status).toBe(200)
    deps.assets.findById.mockResolvedValue(asset({ projectId: crypto.randomUUID() }))
    expect((await handlers.GET_ITEM(
      new Request(`http://localhost/assets/${assetId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, assetId }) },
    )).status).toBe(404)
  })

  it('lists redacted assets and returns a redacted search result', async () => {
    const deps = dependencies()
    const handlers = createAssetHandlers(deps)
    const list = await handlers.LIST(new Request(`http://localhost/assets?workspaceId=${workspaceId}`), route)
    expect(await list.json()).not.toHaveProperty('data.0.sourceObjectKey')

    const search = await handlers.SEARCH(new Request(`http://localhost/assets/search?workspaceId=${workspaceId}&query=launch&limit=3`), route)
    const payload = JSON.stringify(await search.json())
    expect(payload).toContain('medium.jpeg')
    expect(payload).not.toContain('server-secret')
    expect(payload).not.toContain('large2x')
  })

  it('imports only a provider result ID and creates bounded derivatives', async () => {
    const deps = dependencies()
    const handlers = createAssetHandlers(deps)
    const imported = await handlers.IMPORT(new Request('http://localhost/import', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, requestId, resultId: '42', defaultAlt: 'Planning board' }),
    }), route)
    expect(imported.status).toBe(202)
    expect(deps.assets.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ source: 'pexels', providerResultId: '42' }))
    expect(JSON.stringify(deps.assets.create.mock.calls)).not.toContain('https://')

    const derivative = await handlers.DERIVATIVE(new Request('http://localhost/derivative', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, requestId, transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 600, outputHeight: 400 } }),
    }), { params: Promise.resolve({ projectId, assetId }) })
    expect(derivative.status).toBe(202)
    expect(deps.queue.enqueue).toHaveBeenLastCalledWith({ assetId, projectId, workspaceId, userId })
    expect((await handlers.DERIVATIVE(new Request('http://localhost/derivative', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, requestId, transform: { x: 0.9, y: 0, width: 0.5, height: 1, outputWidth: 600, outputHeight: 400 } }),
    }), { params: Promise.resolve({ projectId, assetId }) })).status).toBe(422)
  })

  it('archives only project-owned items and handles missing project context safely', async () => {
    const deps = dependencies()
    const handlers = createAssetHandlers(deps)
    const archived = await handlers.ARCHIVE(new Request('http://localhost/archive', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ projectId, assetId }) })
    expect(archived.status).toBe(200)

    deps.assets.archive.mockResolvedValue(null)
    expect((await handlers.ARCHIVE(new Request('http://localhost/archive', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ projectId, assetId }) })).status).toBe(404)
    expect((await createAssetHandlers(dependencies({ findProject: () => Promise.resolve(null) })).LIST(
      new Request(`http://localhost/assets?workspaceId=${workspaceId}`), route,
    )).status).toBe(404)
  })

  it('enforces mutate permission, rate limits and queue failure redaction', async () => {
    expect((await createAssetHandlers(dependencies({
      findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }),
    })).UPLOAD(uploadRequest(new Uint8Array([1])), route)).status).toBe(403)
    expect((await createAssetHandlers(dependencies({
      admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 30 }) },
    })).UPLOAD(uploadRequest(new Uint8Array([1])), route)).status).toBe(429)
    expect((await createAssetHandlers(dependencies({
      queue: { enqueue: () => Promise.reject(new Error('secret private/source')) },
    })).UPLOAD(uploadRequest(new Uint8Array([1])), route)).status).toBe(503)
  })
})
