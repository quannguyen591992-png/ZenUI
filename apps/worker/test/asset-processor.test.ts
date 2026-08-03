import { describe, expect, it, vi } from 'vitest'

import { createAssetProcessor } from '../src/index.js'

const ids = {
  assetId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.assetId, workspaceId: ids.workspaceId, projectId: ids.projectId, createdBy: ids.userId,
    requestId: '55555555-5555-4555-8555-555555555555', scope: 'project' as const,
    source: 'upload' as const, status: 'queued' as const, parentAssetId: null, transform: null,
    sourceObjectKey: 'private/source', objectKey: null, contentType: null, width: null, height: null,
    bytes: null, checksum: null, defaultAlt: 'Dashboard', attribution: null, providerResultId: null,
    errorCode: null, attemptCount: 0, archived: false, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const run = record()
  return {
    repository: {
      getWorkerInput: vi.fn().mockResolvedValue(run),
      claim: vi.fn().mockResolvedValue({ ...run, status: 'importing' }),
      complete: vi.fn().mockResolvedValue({ ...run, status: 'ready' }),
      fail: vi.fn().mockResolvedValue({ ...run, status: 'failed' }),
    },
    sourceStore: {
      get: vi.fn().mockResolvedValue({ bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    assetStore: { get: vi.fn(), put: vi.fn().mockResolvedValue(undefined) },
    provider: { resolve: vi.fn() },
    importer: vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]), width: 600, height: 400,
      checksum: 'a'.repeat(64), contentType: 'image/webp' as const,
    }),
    ...overrides,
  }
}

describe('asset worker processor', () => {
  it('normalizes an upload once and stores an immutable owned object', async () => {
    const deps = dependencies()
    await createAssetProcessor(deps)({ data: ids })

    expect(deps.sourceStore.get).toHaveBeenCalledWith('private/source')
    expect(deps.assetStore.put).toHaveBeenCalledWith(expect.objectContaining({
      key: `assets/${ids.assetId}/image.webp`, contentType: 'image/webp', checksum: 'a'.repeat(64),
    }))
    expect(deps.repository.complete).toHaveBeenCalledWith(
      { userId: ids.userId, workspaceId: ids.workspaceId }, ids.assetId,
      expect.objectContaining({ objectKey: `assets/${ids.assetId}/image.webp`, width: 600, height: 400 }),
    )
    expect(deps.sourceStore.delete).toHaveBeenCalledWith('private/source')
  })

  it('resolves Pexels only by durable result ID and never queue URL data', async () => {
    const deps = dependencies({
      repository: {
        ...dependencies().repository,
        getWorkerInput: vi.fn().mockResolvedValue(record({
          source: 'pexels', sourceObjectKey: null, providerResultId: '42',
        })),
      },
      provider: { resolve: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([0xff, 0xd8, 0xff]), contentType: 'image/jpeg',
        attribution: { provider: 'pexels', creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' },
      }) },
    })
    await createAssetProcessor(deps)({ data: ids })
    expect(deps.provider.resolve).toHaveBeenCalledWith('42')
    expect(JSON.stringify(ids)).not.toContain('http')
  })

  it('creates a derivative only from a ready parent object', async () => {
    const deps = dependencies({
      repository: {
        ...dependencies().repository,
        getWorkerInput: vi.fn().mockResolvedValue(record({
          source: 'derivative', sourceObjectKey: null,
          parentAssetId: '66666666-6666-4666-8666-666666666666',
          transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 600, outputHeight: 400 },
          parentObjectKey: 'assets/parent/image.webp',
        })),
      },
      assetStore: {
        get: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
        put: vi.fn().mockResolvedValue(undefined),
      },
    })
    await createAssetProcessor(deps)({ data: ids })
    expect(deps.assetStore.get).toHaveBeenCalledWith('assets/parent/image.webp')
    expect(deps.importer).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/webp', expect.objectContaining({ transform: expect.any(Object) }))
  })

  it('maps processing failures to a safe durable code without raw logging data', async () => {
    const deps = dependencies({ importer: vi.fn().mockRejectedValue(new Error('secret source URL')) })
    const result = await createAssetProcessor(deps)({ data: ids })
    expect(deps.repository.fail).toHaveBeenCalledWith(
      { userId: ids.userId, workspaceId: ids.workspaceId }, ids.assetId, 'import_failed',
    )
    expect(result).toMatchObject({ status: 'failed' })
  })
})
