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
  createQueueRecoveryRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
}
const encrypted = {
  ciphertext: Buffer.from('encrypted-token-bytes').toString('base64'),
  iv: Buffer.alloc(12, 1).toString('base64'),
  authTag: Buffer.alloc(16, 2).toString('base64'),
  keyVersion: 1,
}

describe('durable queue leases and recovery', () => {
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
    const project = await projects.create(owner, {
      name: 'Operations page',
      document: createValidDesignFixture(),
    })
    const revision = await projects.createRevision(owner, project.id, {
      source: 'manual',
      summary: 'Operations revision',
    })
    const connection = await createProviderConnectionRepository(db).connect(owner, {
      id: crypto.randomUUID(),
      provider: 'vercel',
      configurationId: `icfg_${crypto.randomUUID()}`,
      teamId: null,
      scopes: ['deployment:read-write'],
      encryptedCredential: encrypted,
    })
    return {
      db,
      project,
      revision,
      connection,
      generations: createGenerationRepository(db),
      exports: createExportRepository(db),
      deployments: createDeploymentRepository(db),
      recovery: createQueueRecoveryRepository(db),
    }
  }

  it('claims and heartbeats each queue row with a bounded durable lease', async () => {
    const { project, revision, connection, generations, exports, deployments } = await setup()
    const now = new Date('2026-07-23T00:00:00.000Z')
    const generation = await generations.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Create a beta page', expectedVersion: 1,
    })
    const exportRun = await exports.create(owner, project.id, {
      requestId: crypto.randomUUID(), expectedVersion: 1,
    })
    const deployment = await deployments.create(owner, project.id, {
      revisionId: revision.id,
      connectionId: connection.id,
      requestId: crypto.randomUUID(),
      target: 'preview',
    })

    await generations.claim(owner, generation.id, {
      provider: 'mock', model: 'mock-v1', promptVersion: 'v1',
    }, { now, leaseSeconds: 60 })
    await exports.claim(owner, exportRun.run.id, { now, leaseSeconds: 60 })
    await deployments.claimUploading(owner, deployment.deployment.id, { now, leaseSeconds: 60 })

    const heartbeatAt = new Date('2026-07-23T00:00:20.000Z')
    expect(await generations.heartbeat(owner, generation.id, { now: heartbeatAt, leaseSeconds: 60 })).toBe(true)
    expect(await exports.heartbeat(owner, exportRun.run.id, { now: heartbeatAt, leaseSeconds: 60 })).toBe(true)
    expect(await deployments.heartbeat(owner, deployment.deployment.id, { now: heartbeatAt, leaseSeconds: 60 })).toBe(true)

    const rows = await client.query<{
      kind: string
      attempt_count: number
      lease_expires_at: Date
      last_heartbeat_at: Date
    }>(`
      SELECT 'generation' AS kind, attempt_count, lease_expires_at, last_heartbeat_at
      FROM generation_runs WHERE id = $1
      UNION ALL
      SELECT 'export' AS kind, attempt_count, lease_expires_at, last_heartbeat_at
      FROM export_runs WHERE id = $2
      UNION ALL
      SELECT 'deployment' AS kind, attempt_count, lease_expires_at, last_heartbeat_at
      FROM deployments WHERE id = $3
      ORDER BY kind
    `, [generation.id, exportRun.run.id, deployment.deployment.id])

    expect(rows.rows).toEqual([
      expect.objectContaining({ kind: 'deployment', attempt_count: 1 }),
      expect.objectContaining({ kind: 'export', attempt_count: 1 }),
      expect.objectContaining({ kind: 'generation', attempt_count: 1 }),
    ])
    for (const row of rows.rows) {
      expect(new Date(row.last_heartbeat_at).toISOString()).toBe(heartbeatAt.toISOString())
      expect(new Date(row.lease_expires_at).toISOString()).toBe('2026-07-23T00:01:20.000Z')
    }
  })

  it('recovers stale rows without repeating unsafe external side effects', async () => {
    const { project, revision, connection, generations, exports, deployments, recovery } = await setup()
    const queuedGeneration = await generations.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Queued generation', expectedVersion: 1,
    })
    const runningGeneration = await generations.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'edit-page', prompt: 'Running generation', expectedVersion: 1,
    })
    const queuedExport = await exports.create(owner, project.id, { requestId: crypto.randomUUID(), expectedVersion: 1 })
    const runningExport = await exports.create(owner, project.id, { requestId: crypto.randomUUID(), expectedVersion: 1 })
    const queuedDeployment = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    const uploadingDeployment = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    const buildingDeployment = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    const startedAt = new Date('2026-07-22T23:00:00.000Z')
    await generations.claim(owner, runningGeneration.id, {
      provider: 'mock', model: 'mock-v1', promptVersion: 'v1',
    }, { now: startedAt, leaseSeconds: 60 })
    await exports.claim(owner, runningExport.run.id, { now: startedAt, leaseSeconds: 60 })
    await deployments.claimUploading(owner, uploadingDeployment.deployment.id, { now: startedAt, leaseSeconds: 60 })
    await deployments.claimUploading(owner, buildingDeployment.deployment.id, { now: startedAt, leaseSeconds: 60 })
    await deployments.recordArtifact(owner, buildingDeployment.deployment.id, {
      artifactKey: 'deployments/private/site.bundle', checksum: 'a'.repeat(64), bytes: 100,
      contentType: 'application/zip', providerProjectName: 'zenui-12345678', providerDeploymentId: 'dpl_reconcile',
    })
    await client.exec(`
      UPDATE generation_runs SET updated_at = '2026-07-22T23:00:00Z'
      WHERE id = '${queuedGeneration.id}';
      UPDATE export_runs SET updated_at = '2026-07-22T23:00:00Z'
      WHERE id = '${queuedExport.run.id}';
      UPDATE deployments SET updated_at = '2026-07-22T23:00:00Z'
      WHERE id = '${queuedDeployment.deployment.id}';
    `)

    const actions = await recovery.recover({
      now: new Date('2026-07-23T00:10:00.000Z'),
      staleQueuedBefore: new Date('2026-07-23T00:00:00.000Z'),
      batchSize: 50,
      maxAttempts: 3,
    })

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'generation', action: 'enqueue', id: queuedGeneration.id }),
      expect.objectContaining({ kind: 'generation', action: 'failed', id: runningGeneration.id }),
      expect.objectContaining({ kind: 'export', action: 'enqueue', id: queuedExport.run.id }),
      expect.objectContaining({ kind: 'export', action: 'enqueue', id: runningExport.run.id }),
      expect.objectContaining({ kind: 'deployment', action: 'enqueue', id: queuedDeployment.deployment.id }),
      expect.objectContaining({ kind: 'deployment', action: 'failed', id: uploadingDeployment.deployment.id }),
      expect.objectContaining({ kind: 'deployment', action: 'reconcile', id: buildingDeployment.deployment.id }),
    ]))
    expect(await generations.findById(owner, runningGeneration.id)).toMatchObject({ status: 'failed', errorCode: 'provider_error' })
    expect(await exports.findById(owner, runningExport.run.id)).toMatchObject({ status: 'queued' })
    expect(await deployments.findById(owner, uploadingDeployment.deployment.id))
      .toMatchObject({ status: 'failed', errorCode: 'provider_outcome_unknown' })
    expect(await deployments.findById(owner, buildingDeployment.deployment.id)).toMatchObject({ status: 'building' })
  })
})
