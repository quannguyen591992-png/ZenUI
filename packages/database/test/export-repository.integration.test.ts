import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { EXPORT_CONTENT_TYPE } from '@zenui/export-core'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createExportRepository,
  createProjectRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }

describe('workspace-scoped export repository', () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    await migrateTestDatabase(client)
    await client.exec(`
      INSERT INTO users (id, name, email) VALUES
        ('${owner.userId}', 'Owner', 'owner@example.test'),
        ('${outsider.userId}', 'Outsider', 'outsider@example.test');
      INSERT INTO workspaces (id, name, created_by) VALUES
        ('${owner.workspaceId}', 'Owner Workspace', '${owner.userId}'),
        ('${outsider.workspaceId}', 'Other Workspace', '${outsider.userId}');
      INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
        ('${owner.workspaceId}', '${owner.userId}', 'owner'),
        ('${outsider.workspaceId}', '${outsider.userId}', 'owner');
    `)
  })

  async function setup() {
    const db = drizzle(client, { schema })
    const project = await createProjectRepository(db).create(owner, { name: 'Export page', document: createValidDesignFixture() })
    return { project, repository: createExportRepository(db) }
  }

  it('snapshots one idempotent queued export without exposing the document', async () => {
    const { project, repository } = await setup()
    const requestId = crypto.randomUUID()
    const first = await repository.create(owner, project.id, { requestId, expectedVersion: 1 })
    const duplicate = await repository.create(owner, project.id, { requestId, expectedVersion: 1 })

    expect(first.created).toBe(true)
    expect(duplicate.created).toBe(false)
    expect(duplicate.run.id).toBe(first.run.id)
    expect(first.run).toMatchObject({ status: 'queued', documentVersion: 1 })
    expect(first.run).not.toHaveProperty('document')
    expect(await repository.findById(outsider, first.run.id)).toBeNull()
    expect(await repository.getWorkerInput(owner, first.run.id)).toMatchObject({ document: expect.any(Object) })
  })

  it('rejects stale snapshots and enforces terminal transitions', async () => {
    const { project, repository } = await setup()
    await expect(repository.create(owner, project.id, { requestId: crypto.randomUUID(), expectedVersion: 2 }))
      .rejects.toThrow('stale_document_version')
    const created = await repository.create(owner, project.id, { requestId: crypto.randomUUID(), expectedVersion: 1 })
    expect(await repository.claim(owner, created.run.id)).toMatchObject({ status: 'running' })
    expect(await repository.claim(owner, created.run.id)).toBeNull()
    expect(await repository.complete(owner, created.run.id, {
      artifactKey: `exports/${owner.workspaceId}/${project.id}/${created.run.id}/site.zip`,
      checksum: 'a'.repeat(64), bytes: 1200, contentType: EXPORT_CONTENT_TYPE, routeCount: 3,
    })).toMatchObject({ status: 'completed', artifact: { bytes: 1200, routeCount: 3 } })
    expect(await repository.fail(owner, created.run.id, 'export_failed')).toBeNull()
  })

  it('fails queued or running exports with allowlisted codes only', async () => {
    const { project, repository } = await setup()
    const created = await repository.create(owner, project.id, { requestId: crypto.randomUUID(), expectedVersion: 1 })
    expect(await repository.fail(owner, created.run.id, 'storage_unavailable')).toMatchObject({ status: 'failed', errorCode: 'storage_unavailable' })
    expect(await repository.fail(owner, created.run.id, 'provider-secret-detail')).toBeNull()
  })
})
