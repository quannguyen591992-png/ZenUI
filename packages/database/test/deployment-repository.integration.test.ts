import { PGlite } from '@electric-sql/pglite'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDeploymentRepository,
  createProjectRepository,
  createProviderConnectionRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }
const encrypted = {
  ciphertext: Buffer.from('encrypted-token-bytes').toString('base64'),
  iv: Buffer.alloc(12, 1).toString('base64'),
  authTag: Buffer.alloc(16, 2).toString('base64'),
  keyVersion: 1,
}

describe('workspace-scoped provider connections and deployments', () => {
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
    const project = await projects.create(owner, { name: 'Deploy page', document: createValidDesignFixture() })
    const revision = await projects.createRevision(owner, project.id, { source: 'manual', summary: 'Launch' })
    const connections = createProviderConnectionRepository(db)
    const connection = await connections.connect(owner, {
      id: crypto.randomUUID(), provider: 'vercel', configurationId: 'icfg_owner', teamId: 'team_owner',
      scopes: ['deployment:read-write', 'integration-configuration:read-write'], encryptedCredential: encrypted,
    })
    return { db, project, revision, connection, connections, deployments: createDeploymentRepository(db) }
  }

  it('stores encrypted credentials only and clears them on disconnect', async () => {
    const { connection, connections } = await setup()
    expect(connection).toMatchObject({ provider: 'vercel', status: 'connected' })
    expect(connection).not.toHaveProperty('encryptedCredential')
    expect(await connections.findPublic(outsider, 'vercel')).toBeNull()

    const internal = await connections.getInternal(owner, connection.id)
    expect(internal?.encryptedCredential).toEqual(encrypted)
    const raw = await client.query<{ ciphertext: string | null }>(
      'SELECT credential_ciphertext AS ciphertext FROM provider_connections WHERE id = $1',
      [connection.id],
    )
    expect(raw.rows[0]?.ciphertext).toBe(encrypted.ciphertext)
    expect(raw.rows[0]?.ciphertext).not.toContain('provider-secret-token')

    expect(await connections.disconnect(owner, connection.id)).toMatchObject({ status: 'disconnected' })
    expect((await connections.getInternal(owner, connection.id))?.encryptedCredential).toBeNull()
    expect(await connections.disconnect(owner, connection.id)).toMatchObject({ status: 'disconnected' })
  })

  it('creates one idempotent revision-pinned deployment and hides it across tenants', async () => {
    const { project, revision, connection, deployments } = await setup()
    const requestId = crypto.randomUUID()
    const first = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId, target: 'preview',
    })
    const duplicate = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId, target: 'preview',
    })

    expect(first.created).toBe(true)
    expect(duplicate.created).toBe(false)
    expect(duplicate.deployment.id).toBe(first.deployment.id)
    expect(first.deployment).toMatchObject({ revisionId: revision.id, status: 'queued', target: 'preview' })
    expect(first.deployment).not.toHaveProperty('providerDeploymentId')
    expect(await deployments.findById(outsider, first.deployment.id)).toBeNull()
    expect(await deployments.list(outsider, project.id)).toEqual([])
  })

  it('keeps the immutable revision snapshot after the draft changes', async () => {
    const { project, revision, connection, deployments } = await setup()
    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'production',
    })
    const changed = createValidDesignFixture()
    changed.nodes['heading-1']!.props = { text: 'Changed draft', level: 1 }
    await createProjectRepository(drizzle(client, { schema })).replaceDocument(owner, project.id, 1, changed)

    const worker = await deployments.getWorkerInput(owner, created.deployment.id)
    expect(worker?.document.nodes['heading-1']?.props).toMatchObject({ text: 'Build your next product' })
    expect(worker?.connection.encryptedCredential).toEqual(encrypted)
  })

  it('rejects wrong-project revisions, disconnected connections and invalid input', async () => {
    const { db, project, connection, deployments, connections } = await setup()
    const other = await createProjectRepository(db).create(owner, { name: 'Other', document: createValidDesignFixture() })
    const otherRevision = await createProjectRepository(db).createRevision(owner, other.id, { source: 'manual', summary: 'Other' })
    await expect(deployments.create(owner, project.id, {
      revisionId: otherRevision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })).rejects.toThrow('not_found')
    await connections.disconnect(owner, connection.id)
    await expect(deployments.create(owner, project.id, {
      revisionId: otherRevision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })).rejects.toThrow()
    await expect(deployments.create(owner, project.id, {
      revisionId: 'invalid', connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })).rejects.toThrow('invalid_deployment_input')
  })

  it('enforces atomic forward and terminal deployment transitions', async () => {
    const { project, revision, connection, deployments } = await setup()
    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    expect(await deployments.claimUploading(owner, created.deployment.id)).toMatchObject({ status: 'uploading' })
    expect(await deployments.claimUploading(owner, created.deployment.id)).toBeNull()
    expect(await deployments.recordArtifact(owner, created.deployment.id, {
      artifactKey: 'deployments/private/site.bundle', checksum: 'a'.repeat(64), bytes: 1200,
      contentType: 'application/zip', providerProjectName: 'zenui-a1b2c3d4',
      providerDeploymentId: 'dpl_test',
    })).toMatchObject({ status: 'building' })
    expect(await deployments.completeReady(owner, created.deployment.id, 'https://zenui-test.vercel.app'))
      .toMatchObject({ status: 'ready', url: 'https://zenui-test.vercel.app' })
    expect(await deployments.fail(owner, created.deployment.id, 'provider_error')).toBeNull()
    expect(await deployments.completeReady(owner, created.deployment.id, 'https://evil.example.test')).toBeNull()
  })

  it('allows safe failure only from non-terminal states', async () => {
    const { project, revision, connection, deployments } = await setup()
    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    expect(await deployments.fail(owner, created.deployment.id, 'queue_unavailable'))
      .toMatchObject({ status: 'failed', errorCode: 'queue_unavailable' })
    expect(await deployments.fail(owner, created.deployment.id, 'provider-secret-detail')).toBeNull()
  })

  it('covers authorized lookup, revision listing and safe URL normalization branches', async () => {
    const { project, revision, connection, deployments } = await setup()
    expect(await deployments.findRevision(owner, project.id, revision.id)).toEqual({ id: revision.id, projectId: project.id })
    expect(await deployments.findRevision(owner, project.id, crypto.randomUUID())).toBeNull()
    expect(await deployments.findRevision(outsider, project.id, revision.id)).toBeNull()

    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    expect(await deployments.list(owner, project.id)).toEqual([expect.objectContaining({ id: created.deployment.id })])
    expect(await deployments.findById(owner, created.deployment.id)).toMatchObject({ id: created.deployment.id, url: null })
    expect(await deployments.getWorkerInput(outsider, created.deployment.id)).toBeNull()
    expect(await deployments.recordArtifact(owner, created.deployment.id, { artifactKey: '' })).toBeNull()

    await deployments.claimUploading(owner, created.deployment.id)
    await deployments.recordArtifact(owner, created.deployment.id, {
      artifactKey: 'deployments/private/site.bundle', checksum: 'b'.repeat(64), bytes: 100,
      contentType: 'application/zip', providerProjectName: 'zenui-12345678',
      providerDeploymentId: 'dpl_url',
    })
    expect(await deployments.completeReady(owner, created.deployment.id, 'not-a-url')).toBeNull()
    expect(await deployments.completeReady(owner, created.deployment.id, 'http://zenui-test.vercel.app')).toBeNull()
    expect(await deployments.completeReady(owner, created.deployment.id, 'https://zenui-test.vercel.app/'))
      .toMatchObject({ status: 'ready', url: 'https://zenui-test.vercel.app' })
  })

  it('reconnects disconnected credentials, disables configurations and rejects conflicts safely', async () => {
    const { connection, connections } = await setup()
    await connections.disconnect(owner, connection.id)
    expect(await connections.getInternal(outsider, connection.id)).toBeNull()
    expect(await connections.disconnect(owner, crypto.randomUUID())).toBeNull()

    const reconnected = await connections.connect(owner, {
      id: crypto.randomUUID(), provider: 'vercel', configurationId: 'icfg_reconnected', teamId: null,
      scopes: ['deployment:read-write'], encryptedCredential: encrypted,
    })
    expect(reconnected).toMatchObject({ id: connection.id, status: 'connected' })
    await expect(connections.connect(owner, {
      id: crypto.randomUUID(), provider: 'vercel', configurationId: 'icfg_conflict', teamId: null,
      scopes: ['deployment:read-write'], encryptedCredential: encrypted,
    })).rejects.toThrow('provider_connection_exists')
    expect(await connections.disableByConfiguration('icfg_reconnected')).toMatchObject({ status: 'disabled' })
    expect(await connections.disableByConfiguration('missing-configuration')).toBeNull()
  })

  it('exposes internal reconciliation input and attaches one discovered provider deployment safely', async () => {
    const { project, revision, connection, deployments } = await setup()
    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id, connectionId: connection.id, requestId: crypto.randomUUID(), target: 'preview',
    })
    expect(await deployments.getReconciliationInput(outsider, created.deployment.id)).toBeNull()
    expect(await deployments.getReconciliationInput(owner, created.deployment.id)).toMatchObject({
      id: created.deployment.id,
      providerDeploymentId: null,
      providerProjectName: null,
      connection: { encryptedCredential: encrypted },
    })
    await deployments.fail(owner, created.deployment.id, 'provider_outcome_unknown')

    expect(await deployments.attachProviderDeployment(owner, created.deployment.id, {
      providerProjectName: 'zenui-12345678', providerDeploymentId: 'dpl_discovered',
    })).toMatchObject({ status: 'building' })
    expect(await deployments.attachProviderDeployment(owner, created.deployment.id, {
      providerProjectName: 'zenui-12345678', providerDeploymentId: 'dpl_duplicate',
    })).toBeNull()
    expect(await deployments.getReconciliationInput(owner, created.deployment.id)).toMatchObject({
      providerProjectName: 'zenui-12345678', providerDeploymentId: 'dpl_discovered',
    })
  })

  it('rotates encrypted credentials with compare-and-swap version semantics', async () => {
    const { connection, connections } = await setup()
    const rotated = { ...encrypted, ciphertext: Buffer.from('rotated').toString('base64'), keyVersion: 2 }
    expect(await connections.rotateCredential(connection.id, 99, rotated)).toBe(false)
    expect(await connections.rotateCredential(connection.id, 1, rotated)).toBe(true)
    expect((await connections.getInternal(owner, connection.id))?.encryptedCredential).toEqual(rotated)
    expect(await connections.rotateCredential(connection.id, 1, encrypted)).toBe(false)
    expect(await connections.countCredentialsByKeyVersion(2)).toBe(1)
  })

  it('rejects malformed provider connections before persistence', async () => {
    const db = drizzle(client, { schema })
    const connections = createProviderConnectionRepository(db)
    await expect(connections.connect(owner, {
      id: 'invalid', provider: 'vercel', configurationId: 'icfg_invalid', teamId: null,
      scopes: ['deployment:read-write'], encryptedCredential: encrypted,
    })).rejects.toThrow('invalid_provider_connection_input')
  })
})
