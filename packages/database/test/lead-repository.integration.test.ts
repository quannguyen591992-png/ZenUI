import { PGlite } from '@electric-sql/pglite'
import {
  createValidDesignFixture,
  type DesignDocument,
} from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createDeploymentRepository,
  createLeadRepository,
  createProjectRepository,
  createProviderConnectionRepository,
  createShareLinkRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = {
  userId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
}
const outsider = {
  userId: '33333333-3333-4333-8333-333333333333',
  workspaceId: '44444444-4444-4444-8444-444444444444',
}
const receivedAt = new Date('2026-08-13T12:00:00.000Z')
const envelope = {
  ciphertext: Buffer.from('encrypted-lead-payload').toString('base64'),
  iv: Buffer.alloc(12, 1).toString('base64'),
  authTag: Buffer.alloc(16, 2).toString('base64'),
  keyVersion: 1,
}
const encryptedCredential = {
  ciphertext: Buffer.from('encrypted-token-bytes').toString('base64'),
  iv: Buffer.alloc(12, 3).toString('base64'),
  authTag: Buffer.alloc(16, 4).toString('base64'),
  keyVersion: 1,
}

function withLeadForm(): DesignDocument {
  const document = createValidDesignFixture()
  document.nodes['lead-form-1'] = {
    id: 'lead-form-1',
    type: 'lead-form',
    parentId: 'container-1',
    children: [],
    props: {
      title: 'Yêu cầu tư vấn',
      description: 'Hãy cho chúng tôi biết nhu cầu của bạn.',
      submitLabel: 'Gửi yêu cầu',
      successCopy: 'Cảm ơn bạn. Chúng tôi sẽ liên hệ lại.',
      fields: [
        {
          key: 'email',
          type: 'email',
          label: 'Email',
          required: true,
        },
      ],
      consent: {
        label: 'Tôi đồng ý được liên hệ.',
        required: true,
      },
    },
    style: {},
    responsive: {},
  }
  document.nodes['container-1']!.children.push('lead-form-1')
  return document
}

describe('Customer Leads repository', () => {
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

  async function setup(document = withLeadForm()) {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, {
      name: 'Customer Leads project',
      document,
    })
    const revision = await projects.createRevision(
      owner,
      project.id,
      { source: 'manual', summary: 'Live lead form' },
    )
    const share = await createShareLinkRepository(db).create(
      owner,
      project.id,
      {
        requestId: crypto.randomUUID(),
        revisionId: revision.id,
        slug: 'A'.repeat(32),
        expiresAt: null,
      },
    )
    return {
      db,
      project,
      revision,
      share,
      shares: createShareLinkRepository(db),
      leads: createLeadRepository(db),
    }
  }

  async function provision() {
    const context = await setup()
    const result = await context.leads.provisionBindings(
      owner,
      context.project.id,
      context.share.link.id,
    )
    expect(result.bindings).toHaveLength(1)
    return {
      ...context,
      binding: result.bindings[0]!,
    }
  }

  it('provisions exact immutable form bindings idempotently', async () => {
    const context = await setup()
    const first = await context.leads.provisionBindings(
      owner,
      context.project.id,
      context.share.link.id,
    )
    const duplicate = await context.leads.provisionBindings(
      owner,
      context.project.id,
      context.share.link.id,
    )

    expect(first).toEqual({
      bindings: [{
        id: expect.any(String),
        shareLinkId: context.share.link.id,
        revisionId: context.revision.id,
        formNodeId: 'lead-form-1',
        pageRoute: '/',
        formTitle: 'Yêu cầu tư vấn',
        status: 'active',
      }],
    })
    expect(duplicate).toEqual(first)
    await expect(context.leads.provisionBindings(
      outsider,
      context.project.id,
      context.share.link.id,
    )).rejects.toThrow('not_found')
  })

  it('resolves only active Share bindings with immutable form metadata', async () => {
    const context = await provision()
    const resolved = await context.leads.resolvePublicBinding(
      context.share.link.slug,
      '/',
      'lead-form-1',
      receivedAt,
    )

    expect(resolved).toMatchObject({
      bindingId: context.binding.id,
      workspaceId: owner.workspaceId,
      projectId: context.project.id,
      shareLinkId: context.share.link.id,
      revisionId: context.revision.id,
      formNodeId: 'lead-form-1',
      pageRoute: '/',
      form: { title: 'Yêu cầu tư vấn' },
    })
    expect(await context.leads.resolvePublicBinding(
      context.share.link.slug,
      '/other',
      'lead-form-1',
      receivedAt,
    )).toBeNull()
    await context.shares.disable(
      owner,
      context.project.id,
      context.share.link.id,
    )
    expect(await context.leads.resolvePublicBinding(
      context.share.link.slug,
      '/',
      'lead-form-1',
      receivedAt,
    )).toBeNull()
  })

  it('appends encrypted leads idempotently with fixed 90-day expiry', async () => {
    const context = await provision()
    const requestId = crypto.randomUUID()
    const first = await context.leads.appendEncrypted({
      bindingId: context.binding.id,
      leadId: crypto.randomUUID(),
      requestId,
      envelope,
      receivedAt,
    })
    const duplicate = await context.leads.appendEncrypted({
      bindingId: context.binding.id,
      leadId: crypto.randomUUID(),
      requestId,
      envelope: { ...envelope, ciphertext: 'different' },
      receivedAt: new Date(receivedAt.getTime() + 1_000),
    })

    expect(first.created).toBe(true)
    expect(duplicate).toMatchObject({
      created: false,
      lead: { id: first.lead.id },
    })
    expect(first.lead.expiresAt.toISOString()).toBe(
      '2026-11-11T12:00:00.000Z',
    )
    expect(await context.leads.countNew(
      owner,
      context.project.id,
    )).toEqual({ newCount: 1 })
  })

  it('lists redacted summaries newest-first and isolates project detail', async () => {
    const context = await provision()
    const first = await context.leads.appendEncrypted({
      bindingId: context.binding.id,
      leadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      envelope,
      receivedAt,
    })
    const second = await context.leads.appendEncrypted({
      bindingId: context.binding.id,
      leadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      envelope,
      receivedAt: new Date(receivedAt.getTime() + 1_000),
    })

    const summaries = await context.leads.list(
      owner,
      context.project.id,
      50,
    )
    expect(summaries.map(item => item.id)).toEqual([
      second.lead.id,
      first.lead.id,
    ])
    expect(summaries[0]).not.toHaveProperty('ciphertext')
    expect(await context.leads.list(
      outsider,
      context.project.id,
      50,
    )).toEqual([])
    expect(await context.leads.findEncryptedById(
      outsider,
      context.project.id,
      first.lead.id,
    )).toBeNull()
    expect(await context.leads.findEncryptedById(
      owner,
      context.project.id,
      first.lead.id,
    )).toMatchObject({
      envelope,
      context: {
        workspaceId: owner.workspaceId,
        projectId: context.project.id,
        shareLinkId: context.share.link.id,
        revisionId: context.revision.id,
        formNodeId: 'lead-form-1',
        leadId: first.lead.id,
      },
    })
  })

  it('resolves and persists an active Deployment Lead in the shared Inbox', async () => {
    const db = drizzle(client, { schema })
    const projects = createProjectRepository(db)
    const project = await projects.create(owner, {
      name: 'Deployment Leads project',
      document: withLeadForm(),
    })
    const revision = await projects.createRevision(owner, project.id, {
      source: 'manual', summary: 'Deploy lead form',
    })
    const connection = await createProviderConnectionRepository(db).connect(owner, {
      id: crypto.randomUUID(),
      provider: 'vercel',
      configurationId: 'icfg_deployment_leads',
      teamId: null,
      scopes: ['deployment:read-write'],
      encryptedCredential,
    })
    const deployments = createDeploymentRepository(db)
    const created = await deployments.create(owner, project.id, {
      revisionId: revision.id,
      connectionId: connection.id,
      requestId: crypto.randomUUID(),
      target: 'preview',
    })
    const worker = await deployments.getWorkerInput(owner, created.deployment.id)
    const binding = worker?.leadFormBindings[0]
    expect(binding).toBeDefined()
    await deployments.claimUploading(owner, created.deployment.id)
    await deployments.recordArtifact(owner, created.deployment.id, {
      artifactKey: 'deployments/private/site.bundle',
      checksum: 'e'.repeat(64),
      bytes: 100,
      contentType: 'application/zip',
      providerProjectName: 'zenui-12345678',
      providerDeploymentId: 'dpl_lead_intake',
    })
    await deployments.completeReady(owner, created.deployment.id, 'https://zenui-intake.vercel.app')

    const leads = createLeadRepository(db)
    const resolved = await leads.resolveDeploymentBinding(binding!.publicBindingId, '/', 'lead-form-1')
    expect(resolved).toMatchObject({
      workspaceId: owner.workspaceId,
      projectId: project.id,
      deploymentId: created.deployment.id,
      revisionId: revision.id,
      deploymentOrigin: 'https://zenui-intake.vercel.app',
      formNodeId: 'lead-form-1',
      pageRoute: '/',
      form: { title: 'Yêu cầu tư vấn' },
    })
    const leadId = crypto.randomUUID()
    const appended = await leads.appendEncrypted({
      bindingId: resolved!.bindingId,
      leadId,
      requestId: crypto.randomUUID(),
      envelope,
      receivedAt,
    })
    expect(appended.created).toBe(true)
    expect(await leads.findEncryptedById(owner, project.id, leadId)).toMatchObject({
      envelope,
      context: {
        publication: 'deployment',
        workspaceId: owner.workspaceId,
        projectId: project.id,
        deploymentId: created.deployment.id,
        revisionId: revision.id,
        formNodeId: 'lead-form-1',
        leadId,
      },
    })
    expect(await leads.list(owner, project.id)).toEqual([
      expect.objectContaining({ id: leadId, status: 'new' }),
    ])
  })

  it('rejects invalid publication combinations at the database boundary', async () => {
    const context = await provision()
    const connection = await createProviderConnectionRepository(context.db).connect(
      owner,
      {
        id: crypto.randomUUID(),
        provider: 'vercel',
        configurationId: 'icfg_invalid_publication',
        teamId: null,
        scopes: ['deployment:read-write'],
        encryptedCredential,
      },
    )
    const deployment = await createDeploymentRepository(context.db).create(
      owner,
      context.project.id,
      {
        revisionId: context.revision.id,
        connectionId: connection.id,
        requestId: crypto.randomUUID(),
        target: 'preview',
      },
    )
    const invalidBindingId = crypto.randomUUID()

    await expect(client.query(
      `INSERT INTO lead_form_bindings (
        id, workspace_id, project_id, share_link_id, deployment_id,
        public_binding_id, revision_id, form_node_id, page_route,
        form_title, form_snapshot, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'invalid-form', '/', 'Invalid', '{}'::jsonb, 'active')`,
      [
        invalidBindingId,
        owner.workspaceId,
        context.project.id,
        context.share.link.id,
        deployment.deployment.id,
        'Z'.repeat(32),
        context.revision.id,
      ],
    )).rejects.toThrow(/lead_form_bindings_publication_exactly_one_check/)
  })

  it('atomically marks new leads contacted and makes retries idempotent', async () => {
    const context = await provision()
    const appended = await context.leads.appendEncrypted({
      bindingId: context.binding.id,
      leadId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      envelope,
      receivedAt,
    })
    const contactedAt = new Date('2026-08-13T12:05:00.000Z')

    const first = await context.leads.markContacted(
      owner,
      context.project.id,
      appended.lead.id,
      1,
      contactedAt,
    )
    const retry = await context.leads.markContacted(
      owner,
      context.project.id,
      appended.lead.id,
      1,
      new Date('2026-08-13T12:06:00.000Z'),
    )

    expect(first).toMatchObject({
      accepted: true,
      lead: {
        status: 'contacted',
        version: 2,
        contactedAt,
      },
    })
    expect(retry).toEqual(first)
    expect(await context.leads.countNew(
      owner,
      context.project.id,
    )).toEqual({ newCount: 0 })
    expect(await context.leads.markContacted(
      outsider,
      context.project.id,
      appended.lead.id,
      1,
      contactedAt,
    )).toEqual({ accepted: false, code: 'not_found' })
  })

  it('hard-deletes only bounded expired lead rows without returning IDs', async () => {
    const context = await provision()
    for (let index = 0; index < 3; index += 1) {
      await context.leads.appendEncrypted({
        bindingId: context.binding.id,
        leadId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        envelope,
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    }

    const result = await context.leads.purgeExpired({
      now: receivedAt,
      batchSize: 2,
    })
    expect(result).toEqual({ scanned: 2, deleted: 2 })
    expect(result).not.toHaveProperty('ids')
    expect(await context.leads.countNew(
      owner,
      context.project.id,
    )).toEqual({ newCount: 1 })
  })
})
