import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { SHARE_SLUG_LENGTH } from '@zenui/share-core'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createProjectRepository,
  createShareLinkRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }
const fixedSlug = 'A'.repeat(SHARE_SLUG_LENGTH)

describe('workspace-scoped share repository', () => {
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
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, { name: 'Shared page', document: createValidDesignFixture() })
    const revision = await projects.createRevision(owner, project.id, { source: 'manual', summary: 'Public snapshot' })
    return { db, project, revision, projects, repository: createShareLinkRepository(db) }
  }

  it('creates one idempotent revision-pinned link and hides it across tenants', async () => {
    const { project, revision, repository } = await setup()
    const requestId = crypto.randomUUID()
    const first = await repository.create(owner, project.id, {
      requestId,
      revisionId: revision.id,
      slug: fixedSlug,
      expiresAt: null,
    })
    const duplicate = await repository.create(owner, project.id, {
      requestId,
      revisionId: revision.id,
      slug: 'B'.repeat(SHARE_SLUG_LENGTH),
      expiresAt: null,
    })

    expect(first.created).toBe(true)
    expect(duplicate).toMatchObject({ created: false, link: { id: first.link.id, slug: fixedSlug } })
    expect(await repository.list(owner, project.id)).toEqual([expect.objectContaining({ revisionId: revision.id, status: 'active' })])
    expect(await repository.list(outsider, project.id)).toEqual([])
    expect(await repository.findById(outsider, first.link.id)).toBeNull()
  })

  it('serves the immutable revision snapshot after the draft changes', async () => {
    const { project, revision, projects, repository } = await setup()
    const created = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })
    const changed = structuredClone(project.document)
    changed.nodes['heading-1']!.props = { text: 'Changed draft', level: 1 }
    await projects.replaceDocument(owner, project.id, 1, changed)

    const view = await repository.findPublicBySlug(created.link.slug, new Date('2026-07-22T12:00:00.000Z'))
    expect(view?.document.nodes['heading-1']?.props).toMatchObject({ text: 'Build your next product' })
    expect(view).not.toHaveProperty('workspaceId')
    expect(view).not.toHaveProperty('projectId')
  })

  it('requires the revision to belong to the project and enforces unique slugs', async () => {
    const { projects, project, revision, repository } = await setup()
    const other = await projects.create(owner, { name: 'Other', document: createValidDesignFixture() })
    await expect(repository.create(owner, other.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })).rejects.toThrow('not_found')

    await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })
    await expect(repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })).rejects.toThrow('share_slug_conflict')
  })

  it('rejects invalid input and keeps missing links tenant-safe', async () => {
    const { project, revision, repository } = await setup()
    await expect(repository.create(owner, project.id, {
      requestId: 'invalid', revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })).rejects.toThrow('invalid_share_input')
    expect(await repository.list(owner, crypto.randomUUID())).toEqual([])
    expect(await repository.findById(owner, crypto.randomUUID())).toBeNull()
    expect(await repository.disable(owner, project.id, crypto.randomUUID())).toBeNull()
    expect(await repository.findPublicBySlug('invalid')).toBeNull()
    await expect(repository.create(outsider, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: 'D'.repeat(SHARE_SLUG_LENGTH), expiresAt: null,
    })).rejects.toThrow('not_found')
  })

  it('disables links terminally and hides disabled or expired public views', async () => {
    const { project, revision, repository } = await setup()
    const active = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: fixedSlug, expiresAt: null,
    })
    expect(await repository.findById(owner, active.link.id)).toMatchObject({ status: 'active' })
    expect(await repository.disable(owner, project.id, active.link.id)).toMatchObject({ status: 'disabled' })
    expect(await repository.disable(owner, project.id, active.link.id)).toMatchObject({ status: 'disabled' })
    expect(await repository.findPublicBySlug(fixedSlug)).toBeNull()

    const expired = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(),
      revisionId: revision.id,
      slug: 'C'.repeat(SHARE_SLUG_LENGTH),
      expiresAt: new Date('2026-07-22T11:00:00.000Z'),
    })
    expect(await repository.findPublicBySlug(expired.link.slug, new Date('2026-07-22T12:00:00.000Z'))).toBeNull()
  })
})
