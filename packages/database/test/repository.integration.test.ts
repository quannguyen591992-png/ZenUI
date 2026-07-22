import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import { createProjectRepository, migrateTestDatabase } from '../src/index'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }

describe('workspace-scoped project repository', () => {
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

  it('creates and reads a validated draft only inside the trusted workspace context', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })

    expect(await repository.findById(owner, created.id)).toMatchObject({ name: 'Landing page', version: 1 })
    expect(await repository.findById(outsider, created.id)).toBeNull()
  })

  it('renames and archives only workspace-owned projects while active lists hide archives', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })

    expect(await repository.rename(owner, created.id, 'Renamed landing')).toMatchObject({
      id: created.id,
      name: 'Renamed landing',
      status: 'active',
    })
    expect(await repository.rename(outsider, created.id, 'Forged')).toBeNull()
    expect(await repository.archive(owner, created.id)).toMatchObject({ status: 'archived' })
    expect(await repository.list(owner)).toEqual([])
    expect(await repository.findById(owner, created.id)).toMatchObject({
      name: 'Renamed landing',
      status: 'archived',
    })
    expect(await repository.rename(owner, '55555555-5555-4555-8555-555555555555', 'Missing')).toBeNull()
    expect(await repository.archive(owner, '55555555-5555-4555-8555-555555555555')).toBeNull()
    await expect(repository.rename(owner, created.id, '')).rejects.toThrow('invalid_project')
  })

  it('updates a draft once at the expected version and rejects stale writes', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })
    const next = createValidDesignFixture()
    next.nodes['heading-1']!.props = { text: 'Saved', level: 1 }
    next.version = 2

    expect(await repository.replaceDocument(owner, created.id, 1, next)).toMatchObject({ accepted: true, version: 2 })
    expect(await repository.replaceDocument(owner, created.id, 1, next)).toEqual({ accepted: false, code: 'stale_document_version' })
  })

  it('returns not found for cross-workspace writes', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })

    expect(await repository.replaceDocument(
      outsider,
      created.id,
      1,
      createValidDesignFixture(),
    )).toEqual({ accepted: false, code: 'not_found' })
  })

  it('rejects missing membership and invalid project input', async () => {
    const repository = createProjectRepository(drizzle(client))
    const noMembership = {
      userId: owner.userId,
      workspaceId: outsider.workspaceId,
    }

    await expect(repository.create(noMembership, {
      name: 'Forbidden',
      document: createValidDesignFixture(),
    })).rejects.toThrow('forbidden')
    await expect(repository.create(owner, {
      name: '',
      document: createValidDesignFixture(),
    })).rejects.toThrow('invalid_project')
  })

  it('creates immutable revisions and restores one into a new draft version', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })
    const revision = await repository.createRevision(owner, created.id, {
      source: 'manual',
      summary: 'Initial snapshot',
    })
    const changed = createValidDesignFixture()
    changed.nodes['heading-1']!.props = { text: 'Changed', level: 1 }
    await repository.replaceDocument(owner, created.id, 1, changed)

    const restored = await repository.restoreRevision(owner, created.id, revision.id, 2)

    expect(restored).toMatchObject({ accepted: true, version: 3 })
    if (!restored.accepted) return
    expect(restored.document.nodes['heading-1']?.props).toMatchObject({ text: 'Build your next product' })
    expect(await repository.listRevisions(owner, created.id)).toHaveLength(2)
  })

  it('rejects stale and cross-workspace revision operations without changing snapshots', async () => {
    const repository = createProjectRepository(drizzle(client))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })
    const revision = await repository.createRevision(owner, created.id, {
      source: 'manual',
      summary: 'Initial snapshot',
    })

    expect(await repository.restoreRevision(owner, created.id, revision.id, 99)).toEqual({
      accepted: false, code: 'stale_document_version',
    })
    await expect(repository.createRevision(outsider, created.id, {
      source: 'manual', summary: 'Forbidden',
    })).rejects.toThrow('not_found')
    expect(await repository.listRevisions(outsider, created.id)).toEqual([])
    expect(await repository.restoreRevision(owner, created.id, '55555555-5555-4555-8555-555555555555', 1)).toEqual({
      accepted: false, code: 'not_found',
    })
  })

  it('rolls back project creation when the document is invalid', async () => {
    const repository = createProjectRepository(drizzle(client))
    const invalid = createValidDesignFixture()
    invalid.nodes['heading-1']!.parentId = 'missing'

    await expect(repository.create(owner, { name: 'Invalid', document: invalid })).rejects.toThrow('invalid_design_document')
    await expect(repository.create(owner, { name: 'Invalid', document: null })).rejects.toThrow('invalid_design_document')
    expect(await repository.list(owner)).toEqual([])
  })
})
