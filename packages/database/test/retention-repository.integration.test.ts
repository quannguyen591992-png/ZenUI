import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDeploymentRepository,
  createExportRepository,
  createGenerationRepository,
  createProjectRepository,
  createProviderConnectionRepository,
  createRetentionRepository,
  createShareLinkRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
}
const now = new Date('2026-07-23T00:00:00.000Z')
const old = new Date('2026-03-01T00:00:00.000Z')
const encrypted = {
  ciphertext: Buffer.from('encrypted-token-bytes').toString('base64'),
  iv: Buffer.alloc(12, 1).toString('base64'),
  authTag: Buffer.alloc(16, 2).toString('base64'),
  keyVersion: 1,
}

describe('conservative retention repository', () => {
  let client: PGlite

  beforeEach(async () => {
    client = new PGlite()
    await migrateTestDatabase(client)
    await client.exec(`
      INSERT INTO users (id, name, email)
      VALUES ('${owner.userId}', 'Owner', 'owner@example.test');
      INSERT INTO workspaces (id, name, created_by)
      VALUES ('${owner.workspaceId}', 'Owner Workspace', '${owner.userId}');
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ('${owner.workspaceId}', '${owner.userId}', 'owner');
    `)
  })

  async function setup() {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, { name: 'Retained project', document: createValidDesignFixture() })
    const revision = await projects.createRevision(owner, project.id, { source: 'manual', summary: 'Retained revision' })
    const generation = await createGenerationRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Sensitive prompt to redact', expectedVersion: 1,
    })
    await createGenerationRepository(db).fail(owner, generation.id, {
      errorCode: 'provider_error', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, repairCount: 0,
    })
    const exportRun = await createExportRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1,
    })
    await createExportRepository(db).fail(owner, exportRun.run.id, 'export_failed')
    const share = await createShareLinkRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: 'A'.repeat(32), expiresAt: null,
    })
    await createShareLinkRepository(db).disable(owner, project.id, share.link.id)
    const connection = await createProviderConnectionRepository(db).connect(owner, {
      id: crypto.randomUUID(), provider: 'vercel', configurationId: `icfg_${crypto.randomUUID()}`,
      teamId: null, scopes: ['deployment:read-write'], encryptedCredential: encrypted,
    })
    const deployment = await createDeploymentRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, connectionId: connection.id, target: 'preview',
    })
    await createDeploymentRepository(db).fail(owner, deployment.deployment.id, 'provider_error')
    await client.exec(`
      UPDATE generation_runs SET completed_at = '${old.toISOString()}', updated_at = '${old.toISOString()}' WHERE id = '${generation.id}';
      UPDATE export_runs SET completed_at = '${old.toISOString()}', updated_at = '${old.toISOString()}' WHERE id = '${exportRun.run.id}';
      UPDATE share_links SET disabled_at = '${old.toISOString()}', updated_at = '${old.toISOString()}' WHERE id = '${share.link.id}';
      UPDATE deployments SET completed_at = '${old.toISOString()}', updated_at = '${old.toISOString()}' WHERE id = '${deployment.deployment.id}';
    `)
    return { project, revision, generation, exportRun, share, deployment, repository: createRetentionRepository(db) }
  }

  it('dry-runs count-only cleanup without mutating retained rows or exposing identifiers', async () => {
    const { repository, generation } = await setup()
    const result = await repository.cleanup({ now, batchSize: 50, dryRun: true })
    expect(result).toEqual({
      operation: 'retention_cleanup', outcome: 'completed', scanned: 4, changed: 0, failed: 0,
      candidates: { generationPrompts: 1, failedExports: 1, disabledShares: 1, failedDeployments: 1 },
    })
    expect(result).not.toHaveProperty('ids')
    expect((await client.query<{ prompt: string }>('SELECT prompt FROM generation_runs WHERE id = $1', [generation.id])).rows[0]?.prompt)
      .toBe('Sensitive prompt to redact')
  })

  it('redacts/de-references terminal metadata but keeps projects, revisions, usage and durable audit rows', async () => {
    const { repository, project, revision, generation, exportRun, share, deployment } = await setup()
    const result = await repository.cleanup({ now, batchSize: 50, dryRun: false })
    expect(result).toMatchObject({ scanned: 4, changed: 4, failed: 0 })

    const generationRow = (await client.query<{ prompt: string | null; retained_cleanup_at: Date | null }>(
      'SELECT prompt, retained_cleanup_at FROM generation_runs WHERE id = $1', [generation.id],
    )).rows[0]
    expect(generationRow?.prompt).toBeNull()
    expect(generationRow?.retained_cleanup_at).toBeTruthy()
    expect((await client.query('SELECT id FROM generation_runs WHERE id = $1', [generation.id])).rows).toHaveLength(1)
    expect((await client.query('SELECT id FROM projects WHERE id = $1', [project.id])).rows).toHaveLength(1)
    expect((await client.query('SELECT id FROM revisions WHERE id = $1', [revision.id])).rows).toHaveLength(1)
    expect((await client.query('SELECT retained_cleanup_at FROM export_runs WHERE id = $1', [exportRun.run.id])).rows[0]).toBeTruthy()
    expect((await client.query('SELECT retained_cleanup_at FROM share_links WHERE id = $1', [share.link.id])).rows[0]).toBeTruthy()
    expect((await client.query('SELECT retained_cleanup_at FROM deployments WHERE id = $1', [deployment.deployment.id])).rows[0]).toBeTruthy()
    expect(await repository.cleanup({ now, batchSize: 50, dryRun: false })).toMatchObject({ scanned: 0, changed: 0 })
  })

  it('bounds a mixed cleanup batch and defers ambiguous provider outcomes', async () => {
    const { repository, generation, deployment } = await setup()
    await client.exec(`
      UPDATE deployments SET error_code = 'provider_outcome_unknown'
      WHERE id = '${deployment.deployment.id}';
    `)
    expect(await repository.cleanup({ now, batchSize: 2, dryRun: true })).toEqual({
      operation: 'retention_cleanup', outcome: 'completed', scanned: 2, changed: 0, failed: 0,
      candidates: { generationPrompts: 1, failedExports: 1, disabledShares: 0, failedDeployments: 0 },
    })
    expect((await client.query<{ prompt: string }>('SELECT prompt FROM generation_runs WHERE id = $1', [generation.id])).rows[0]?.prompt)
      .toBe('Sensitive prompt to redact')
  })

  it('keeps active, recent and reconciliation-pending rows outside retention candidates', async () => {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, { name: 'Recent project', document: createValidDesignFixture() })
    const revision = await projects.createRevision(owner, project.id, { source: 'manual', summary: 'Recent revision' })
    const generation = await createGenerationRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Recent prompt', expectedVersion: 1,
    })
    const exportRun = await createExportRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1,
    })
    const share = await createShareLinkRepository(db).create(owner, project.id, {
      requestId: crypto.randomUUID(), revisionId: revision.id, slug: 'B'.repeat(32), expiresAt: null,
    })
    expect(generation.status).toBe('queued')
    expect(exportRun.run.status).toBe('queued')
    expect(share.link.status).toBe('active')
    expect(await createRetentionRepository(db).cleanup({ now, batchSize: 50, dryRun: true })).toEqual({
      operation: 'retention_cleanup', outcome: 'completed', scanned: 0, changed: 0, failed: 0,
      candidates: { generationPrompts: 0, failedExports: 0, disabledShares: 0, failedDeployments: 0 },
    })
  })

  it('validates bounded cleanup inputs', async () => {
    const db = drizzle(client, { schema })
    await expect(createRetentionRepository(db).cleanup({ now, batchSize: 0, dryRun: true }))
      .rejects.toThrow('invalid_retention_cleanup_input')
  })
})
