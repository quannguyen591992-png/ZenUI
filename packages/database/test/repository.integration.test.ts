import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAssetRepository,
  createBrandKitRepository,
  createProjectRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

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
    const repository = createProjectRepository(drizzle(client, { schema }))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })

    expect(await repository.findById(owner, created.id)).toMatchObject({ name: 'Landing page', version: 1 })
    expect(await repository.findById(outsider, created.id)).toBeNull()
  })

  it('renames and archives only workspace-owned projects while active lists hide archives', async () => {
    const repository = createProjectRepository(drizzle(client, { schema }))
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
    const repository = createProjectRepository(drizzle(client, { schema }))
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
    const repository = createProjectRepository(drizzle(client, { schema }))
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
    const repository = createProjectRepository(drizzle(client, { schema }))
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
    const repository = createProjectRepository(drizzle(client, { schema }))
    const created = await repository.create(owner, {
      name: 'Landing page',
      document: createValidDesignFixture(),
    })
    const revision = await repository.createRevision(owner, created.id, {
      source: 'manual',
      summary: 'Initial snapshot',
    })
    expect(revision).toMatchObject({ documentVersion: 1 })
    expect(revision).not.toHaveProperty('documentSnapshot')
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
    const repository = createProjectRepository(drizzle(client, { schema }))
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
    const repository = createProjectRepository(drizzle(client, { schema }))
    const invalid = createValidDesignFixture()
    invalid.nodes['heading-1']!.parentId = 'missing'

    await expect(repository.create(owner, { name: 'Invalid', document: invalid })).rejects.toThrow('invalid_design_document')
    await expect(repository.create(owner, { name: 'Invalid', document: null })).rejects.toThrow('invalid_design_document')
    expect(await repository.list(owner)).toEqual([])
  })

  it('owns idempotent project assets and safe lifecycle transitions inside one workspace', async () => {
    const database = drizzle(client, { schema })
    const project = await createProjectRepository(database).create(owner, {
      name: 'Asset project', document: createValidDesignFixture(),
    })
    const repository = createAssetRepository(database)
    const requestId = '55555555-5555-4555-8555-555555555555'

    const first = await repository.create(owner, {
      projectId: project.id,
      requestId,
      scope: 'project',
      source: 'upload',
      defaultAlt: 'Product dashboard',
      sourceObjectKey: 'asset-sources/opaque-upload',
    })
    const duplicate = await repository.create(owner, {
      projectId: project.id,
      requestId,
      scope: 'project',
      source: 'upload',
      defaultAlt: 'Product dashboard',
      sourceObjectKey: 'asset-sources/different-key',
    })
    expect(duplicate.id).toBe(first.id)
    expect(await repository.findById(outsider, first.id)).toBeNull()

    expect(await repository.claim(owner, first.id)).toMatchObject({ status: 'importing', attemptCount: 1 })
    expect(await repository.complete(owner, first.id, {
      objectKey: `assets/${first.id}.webp`, contentType: 'image/webp', width: 1200, height: 800,
      bytes: 1024, checksum: 'a'.repeat(64),
    })).toMatchObject({ status: 'ready', width: 1200, errorCode: null })
    expect(await repository.archive(owner, first.id)).toMatchObject({ archived: true, status: 'ready' })
  })

  it('loads only complete ready assets authorized for portable publication', async () => {
    const database = drizzle(client, { schema })
    const projects = createProjectRepository(database)
    const project = await projects.create(owner, { name: 'Published project', document: createValidDesignFixture() })
    const otherProject = await projects.create(owner, { name: 'Other project', document: createValidDesignFixture() })
    const repository = createAssetRepository(database)
    const projectAsset = await repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'upload',
      defaultAlt: 'Project image', sourceObjectKey: 'asset-sources/project-image',
    })
    const workspaceAsset = await repository.create(owner, {
      requestId: crypto.randomUUID(), scope: 'workspace', source: 'upload',
      defaultAlt: 'Workspace image', sourceObjectKey: 'asset-sources/workspace-image',
    })
    const otherAsset = await repository.create(owner, {
      projectId: otherProject.id, requestId: crypto.randomUUID(), scope: 'project', source: 'upload',
      defaultAlt: 'Other image', sourceObjectKey: 'asset-sources/other-image',
    })
    for (const [asset, checksum] of [[projectAsset, 'a'.repeat(64)], [workspaceAsset, 'b'.repeat(64)], [otherAsset, 'c'.repeat(64)]] as const) {
      await repository.claim(owner, asset.id)
      await repository.complete(owner, asset.id, {
        objectKey: `assets/${asset.id}/image.webp`, contentType: 'image/webp', width: 1200, height: 800,
        bytes: 4, checksum,
      })
    }

    await expect(repository.getPublicationAssets(owner, project.id, [workspaceAsset.id, projectAsset.id]))
      .resolves.toEqual([
        { id: projectAsset.id, objectKey: `assets/${projectAsset.id}/image.webp`, contentType: 'image/webp', bytes: 4, checksum: 'a'.repeat(64) },
        { id: workspaceAsset.id, objectKey: `assets/${workspaceAsset.id}/image.webp`, contentType: 'image/webp', bytes: 4, checksum: 'b'.repeat(64) },
      ].sort((left, right) => left.id.localeCompare(right.id)))
    await expect(repository.getPublicationAssets(owner, project.id, [otherAsset.id])).rejects.toThrow('asset_not_publishable')
    await expect(repository.getPublicationAssets(outsider, project.id, [projectAsset.id])).rejects.toThrow('not_found')
    await repository.archive(owner, workspaceAsset.id)
    await expect(repository.getPublicationAssets(owner, project.id, [workspaceAsset.id])).rejects.toThrow('asset_not_publishable')
  })

  it('creates derivatives only from ready assets in the same authorized scope', async () => {
    const database = drizzle(client, { schema })
    const project = await createProjectRepository(database).create(owner, {
      name: 'Derivative project', document: createValidDesignFixture(),
    })
    const repository = createAssetRepository(database)
    const parent = await repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'upload',
      defaultAlt: 'Parent', sourceObjectKey: 'asset-sources/parent',
    })
    await expect(repository.createDerivative(owner, project.id, parent.id, {
      requestId: crypto.randomUUID(), transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 600, outputHeight: 400 },
    })).rejects.toThrow('asset_not_ready')
    await repository.claim(owner, parent.id)
    await repository.complete(owner, parent.id, {
      objectKey: `assets/${parent.id}.webp`, contentType: 'image/webp', width: 1200, height: 800,
      bytes: 1024, checksum: 'b'.repeat(64),
    })

    expect(await repository.createDerivative(owner, project.id, parent.id, {
      requestId: crypto.randomUUID(), transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 600, outputHeight: 400 },
    })).toMatchObject({ source: 'derivative', parentAssetId: parent.id, status: 'queued' })
    await expect(repository.createDerivative(outsider, project.id, parent.id, {
      requestId: crypto.randomUUID(), transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 600, outputHeight: 400 },
    })).rejects.toThrow('not_found')
  })

  it('covers workspace assets, provider imports and safe worker/public lifecycle reads', async () => {
    const database = drizzle(client, { schema })
    const project = await createProjectRepository(database).create(owner, {
      name: 'Workspace asset project', document: createValidDesignFixture(),
    })
    const repository = createAssetRepository(database)

    await expect(repository.create(owner, {
      requestId: crypto.randomUUID(), scope: 'project', source: 'upload', defaultAlt: 'Missing project',
      sourceObjectKey: 'asset-sources/missing-project',
    })).rejects.toThrow('invalid_asset_input')
    await expect(repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'workspace', source: 'upload',
      defaultAlt: 'Wrong scope', sourceObjectKey: 'asset-sources/wrong-scope',
    })).rejects.toThrow('invalid_asset_input')
    await expect(repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'pexels',
      defaultAlt: 'Missing result',
    })).rejects.toThrow('invalid_asset_input')

    const logo = await repository.create(owner, {
      requestId: crypto.randomUUID(), scope: 'workspace', source: 'upload', defaultAlt: 'NovaFlow logo',
      sourceObjectKey: 'asset-sources/workspace-logo',
    })
    const imported = await repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'pexels',
      defaultAlt: 'Planning board', providerResultId: '42',
      attribution: { provider: 'pexels', creatorName: 'Ada', creatorUrl: 'https://www.pexels.com/@ada' },
    })
    const generated = await repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'generated',
      defaultAlt: 'AI generated planning workspace', sourceObjectKey: 'asset-sources/generated-image',
    })
    expect(await repository.list(owner, project.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: logo.id, scope: 'workspace' }),
      expect.objectContaining({ id: imported.id, providerResultId: '42' }),
      expect.objectContaining({ id: generated.id, source: 'generated', providerResultId: null }),
    ]))
    expect(await repository.list(outsider, project.id)).toEqual([])
    expect(await repository.getWorkerInput(outsider, imported.id)).toBeNull()
    expect(await repository.getPublicReady(imported.id)).toBeNull()
    expect(await repository.fail(owner, imported.id, 'provider_error')).toMatchObject({ status: 'failed', errorCode: 'provider_error' })
    expect(await repository.claim(owner, imported.id)).toBeNull()
    expect(await repository.archive(outsider, imported.id)).toBeNull()
  })

  it('returns ready derivative worker input and rejects invalid lifecycle transitions', async () => {
    const database = drizzle(client, { schema })
    const project = await createProjectRepository(database).create(owner, {
      name: 'Derivative worker project', document: createValidDesignFixture(),
    })
    const repository = createAssetRepository(database)
    const parent = await repository.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'upload',
      defaultAlt: 'Parent', sourceObjectKey: 'asset-sources/parent-worker',
    })
    expect(await repository.complete(owner, parent.id, {
      objectKey: 'assets/invalid.webp', contentType: 'image/webp', width: 0, height: 1,
      bytes: 1, checksum: 'a'.repeat(64),
    })).toBeNull()
    await repository.claim(owner, parent.id)
    const ready = await repository.complete(owner, parent.id, {
      objectKey: `assets/${parent.id}.webp`, contentType: 'image/webp', width: 1200, height: 800,
      bytes: 1024, checksum: 'c'.repeat(64),
    })
    expect(await repository.getPublicReady(parent.id)).toMatchObject({ id: parent.id, status: 'ready' })
    expect(await repository.fail(owner, parent.id, 'invalid_image')).toBeNull()

    const requestId = crypto.randomUUID()
    const derivative = await repository.createDerivative(owner, project.id, parent.id, {
      requestId, transform: { x: 0.1, y: 0, width: 0.8, height: 1, outputWidth: 600, outputHeight: 400 },
    })
    const duplicate = await repository.createDerivative(owner, project.id, parent.id, {
      requestId, transform: { x: 0, y: 0, width: 1, height: 1, outputWidth: 300, outputHeight: 200 },
    })
    expect(duplicate.id).toBe(derivative.id)
    expect(await repository.getWorkerInput(owner, derivative.id)).toMatchObject({
      id: derivative.id, parentObjectKey: ready?.objectKey,
    })

    await database.update(schema.assets).set({
      status: 'failed', errorCode: 'invalid_image', objectKey: null, contentType: null,
      width: null, height: null, bytes: null, checksum: null,
    }).where(eq(schema.assets.id, parent.id))
    expect(await repository.getWorkerInput(owner, derivative.id)).toBeNull()
    expect(await repository.fail(owner, crypto.randomUUID(), 'invalid_image')).toBeNull()
  })

  it('updates a versioned Brand Kit and applies it atomically to a project draft', async () => {
    const database = drizzle(client, { schema })
    const projects = createProjectRepository(database)
    const project = await projects.create(owner, { name: 'Brand project', document: createValidDesignFixture() })
    const brands = createBrandKitRepository(database)
    const initial = await brands.save(owner, {
      expectedVersion: 0,
      name: 'NovaFlow',
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    })
    expect(initial).toMatchObject({ version: 1, name: 'NovaFlow' })
    await expect(brands.save(owner, {
      expectedVersion: 0,
      name: 'Stale',
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    })).rejects.toThrow('stale_brand_kit_version')

    const applied = await brands.applyToProject(owner, project.id, {
      expectedBrandKitVersion: 1,
      expectedDocumentVersion: 1,
    })
    expect(applied).toMatchObject({ accepted: true, version: 2 })
    if (!applied.accepted) return
    expect(applied.document.theme).toMatchObject({
      colors: initial.colors,
      fonts: initial.fonts,
    })
    expect(applied.document.nodes['heading-1']?.props).toMatchObject({ text: 'Build your next product' })
    await expect(brands.load(outsider)).resolves.toBeNull()
  })

  it('requires a ready workspace logo and rejects stale Brand Kit application inputs', async () => {
    const database = drizzle(client, { schema })
    const projects = createProjectRepository(database)
    const project = await projects.create(owner, { name: 'Logo brand project', document: createValidDesignFixture() })
    const assets = createAssetRepository(database)
    const brands = createBrandKitRepository(database)
    const projectLogo = await assets.create(owner, {
      projectId: project.id, requestId: crypto.randomUUID(), scope: 'project', source: 'upload',
      defaultAlt: 'Project logo', sourceObjectKey: 'asset-sources/project-logo',
    })
    await expect(brands.save(owner, {
      expectedVersion: 0, name: 'NovaFlow', logoAssetId: projectLogo.id,
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    })).rejects.toThrow('invalid_brand_logo')

    const workspaceLogo = await assets.create(owner, {
      requestId: crypto.randomUUID(), scope: 'workspace', source: 'upload',
      defaultAlt: 'Workspace logo', sourceObjectKey: 'asset-sources/brand-logo',
    })
    await assets.claim(owner, workspaceLogo.id)
    await assets.complete(owner, workspaceLogo.id, {
      objectKey: `assets/${workspaceLogo.id}.webp`, contentType: 'image/webp', width: 200, height: 80,
      bytes: 512, checksum: 'd'.repeat(64),
    })
    const kit = await brands.save(owner, {
      expectedVersion: 0, name: 'NovaFlow', logoAssetId: workspaceLogo.id,
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Arial' },
    })
    expect(kit.logoAssetId).toBe(workspaceLogo.id)
    expect(await brands.applyToProject(owner, project.id, {
      expectedBrandKitVersion: 99, expectedDocumentVersion: 1,
    })).toEqual({ accepted: false, code: 'not_found' })
    expect(await brands.applyToProject(owner, project.id, {
      expectedBrandKitVersion: kit.version, expectedDocumentVersion: 99,
    })).toEqual({ accepted: false, code: 'stale_document_version' })
    expect(await brands.applyToProject(outsider, project.id, {
      expectedBrandKitVersion: kit.version, expectedDocumentVersion: 1,
    })).toEqual({ accepted: false, code: 'not_found' })
  })
})
