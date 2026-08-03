import { createValidDesignFixture } from '@zenui/design-schema'
import { EXPORT_CONTENT_TYPE, EXPORT_FILENAME } from '@zenui/export-core'
import { describe, expect, it, vi } from 'vitest'

import { createExportHandlers } from '../lib/server/export-api'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const exportId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const route = { params: Promise.resolve({ projectId }) }

function dependencies(overrides: Record<string, unknown> = {}) {
  const run = {
    id: exportId, projectId, workspaceId, createdBy: userId,
    expectedVersion: 1, documentVersion: 1, status: 'queued' as const,
    artifact: null, errorCode: null, createdAt: new Date(), updatedAt: new Date(),
  }
  return {
    trustedOrigin: 'http://localhost:3000',
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' as const }),
    findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Page', status: 'active' as const, version: 1, document: createValidDesignFixture() }),
    admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
    runs: {
      create: vi.fn().mockResolvedValue({ created: true, run }),
      findById: vi.fn().mockResolvedValue(run),
      fail: vi.fn().mockResolvedValue({ ...run, status: 'failed' }),
      getArtifactKey: vi.fn().mockResolvedValue(null),
    },
    queue: { enqueue: vi.fn().mockResolvedValue(undefined) },
    store: { get: vi.fn().mockResolvedValue(null) },
    ...overrides,
  }
}

function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000/api/v1/projects/${projectId}/exports`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('export API', () => {
  it('enforces Origin before side effects and queues one idempotent export', async () => {
    const deps = dependencies()
    const handlers = createExportHandlers(deps)
    const denied = await handlers.POST(request({ workspaceId, requestId, expectedVersion: 1 }, 'https://evil.test'), route)
    expect(denied.status).toBe(403)
    expect(deps.runs.create).not.toHaveBeenCalled()

    const accepted = await handlers.POST(request({ workspaceId, requestId, expectedVersion: 1 }), route)
    expect(accepted.status).toBe(202)
    expect(accepted.headers.get('location')).toContain(exportId)
    expect(deps.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ exportRunId: exportId }))
  })

  it('returns safe validation, stale, rate and queue errors', async () => {
    expect((await createExportHandlers(dependencies()).POST(request({ workspaceId }), route)).status).toBe(422)
    expect((await createExportHandlers(dependencies({
      findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Page', status: 'active', version: 2, document: createValidDesignFixture() }),
    })).POST(request({ workspaceId, requestId, expectedVersion: 1 }), route)).status).toBe(409)
    const limited = await createExportHandlers(dependencies({ admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 30 }) } }))
      .POST(request({ workspaceId, requestId, expectedVersion: 1 }), route)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')
    expect((await createExportHandlers(dependencies({ queue: { enqueue: () => Promise.reject(new Error('secret')) } }))
      .POST(request({ workspaceId, requestId, expectedVersion: 1 }), route)).status).toBe(503)
  })

  it('returns redacted status and proxies only completed bounded artifacts', async () => {
    const artifact = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    const completed = {
      id: exportId, projectId, workspaceId, createdBy: userId, expectedVersion: 1, documentVersion: 1,
      status: 'completed' as const, artifact: {
        bytes: artifact.byteLength, checksum: 'a'.repeat(64), contentType: EXPORT_CONTENT_TYPE, routeCount: 2,
      },
      errorCode: null, createdAt: new Date(), updatedAt: new Date(),
    }
    const deps = dependencies({ runs: {
      create: vi.fn(), findById: vi.fn().mockResolvedValue(completed), fail: vi.fn(), getArtifactKey: vi.fn().mockResolvedValue('private/key'),
    }, store: { get: vi.fn().mockResolvedValue(artifact) } })
    const handlers = createExportHandlers(deps)
    const item = await handlers.GET_ITEM(new Request(`http://localhost/api?workspaceId=${workspaceId}`), { params: Promise.resolve({ projectId, exportId }) })
    expect(await item.json()).not.toHaveProperty('data.artifactKey')
    const download = await handlers.GET_DOWNLOAD(new Request(`http://localhost/api?workspaceId=${workspaceId}`), { params: Promise.resolve({ projectId, exportId }) })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain(EXPORT_FILENAME)
    expect(download.headers.get('content-type')).toBe(EXPORT_CONTENT_TYPE)
    expect(download.headers.get('cache-control')).toBe('private, no-store')
  })
})
