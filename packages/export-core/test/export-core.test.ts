import { describe, expect, it } from 'vitest'

import {
  EXPORT_CONTENT_TYPE,
  EXPORT_FILENAME,
  EXPORT_QUEUE_NAME,
  createDeterministicSiteArchive,
  exportJobSchema,
  exportRequestSchema,
  exportRunPublicSchema,
  exportStatusSchema,
} from '../src/index.js'

const ids = {
  exportRunId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
}

describe('export contracts', () => {
  it('validates strict requests and metadata-only queue jobs', () => {
    expect(EXPORT_QUEUE_NAME).toBe('zenui-export-v1')
    expect(exportRequestSchema.safeParse({ workspaceId: ids.workspaceId, requestId: crypto.randomUUID(), expectedVersion: 2 }).success).toBe(true)
    expect(exportRequestSchema.safeParse({ workspaceId: ids.workspaceId, requestId: crypto.randomUUID(), expectedVersion: 2, document: {} }).success).toBe(false)
    expect(exportJobSchema.safeParse(ids).success).toBe(true)
    expect(exportJobSchema.safeParse({ ...ids, document: { secret: true } }).success).toBe(false)
  })

  it('creates a deterministic path-safe multi-route archive', () => {
    const files = [
      { path: 'index.html', content: '<h1>Home</h1>' },
      { path: 'about/index.html', content: '<h1>About</h1>' },
    ]
    const first = createDeterministicSiteArchive(files)
    const second = createDeterministicSiteArchive([...files].reverse())

    expect(first).toEqual(second)
    expect(first.content.slice(0, 4)).toEqual(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(first.routeCount).toBe(2)
    expect(first.content.byteLength).toBe(first.bytes)
    expect(EXPORT_CONTENT_TYPE).toBe('application/zip')
    expect(EXPORT_FILENAME).toBe('zenui-export.zip')
    expect(() => createDeterministicSiteArchive([{ path: '../secret', content: 'no' }])).toThrow('invalid_archive_path')
    expect(() => createDeterministicSiteArchive([{ path: 'index.html', content: 'a' }, { path: 'index.html', content: 'b' }])).toThrow('duplicate_archive_path')
  })

  it('exposes only allowlisted statuses, errors and artifact metadata', () => {
    expect(exportStatusSchema.options).toEqual(['queued', 'running', 'completed', 'failed'])
    expect(exportRunPublicSchema.safeParse({
      id: ids.exportRunId,
      projectId: ids.projectId,
      status: 'completed',
      expectedVersion: 1,
      documentVersion: 1,
      artifact: { bytes: 1024, checksum: 'a'.repeat(64), contentType: EXPORT_CONTENT_TYPE, routeCount: 2 },
      errorCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).success).toBe(true)
    expect(exportRunPublicSchema.safeParse({
      id: ids.exportRunId, projectId: ids.projectId, status: 'failed', expectedVersion: 1,
      documentVersion: 1, artifact: null, errorCode: 'storage_unavailable', artifactKey: 'secret/key',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).success).toBe(false)
  })
})
