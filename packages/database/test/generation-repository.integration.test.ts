import { PGlite } from '@electric-sql/pglite'
import { deriveProposalScope, materializeMediaProposal, materializeProposal, mediaProposalReviewSchema } from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { drizzle } from 'drizzle-orm/pglite'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createGenerationRepository,
  createProjectRepository,
  createUsageRepository,
  migrateTestDatabase,
} from '../src/index'
import * as schema from '../src/schema'

const owner = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' }
const outsider = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: '44444444-4444-4444-8444-444444444444' }

const usage = { inputTokens: 120, outputTokens: 80, totalTokens: 200 }
const imageUsage = {
  provider: 'google-gemini' as const,
  model: 'gemini-3.1-flash-image',
  imageSize: '1K' as const,
  imageCount: 1,
  inputTokens: 100,
  outputTokens: 1_120,
  totalTokens: 1_220,
  tokenSource: 'provider_metadata' as const,
}

describe('workspace-scoped generation repository', () => {
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
    const project = await createProjectRepository(db).create(owner, {
      name: 'AI landing page',
      document: createValidDesignFixture(),
    })
    return { db, project, repository: createGenerationRepository(db) }
  }

  it('creates an idempotent queued run and hides it from another workspace', async () => {
    const { project, repository } = await setup()
    const requestId = '55555555-5555-4555-8555-555555555555'
    const input = {
      requestId,
      mode: 'generate' as const,
      prompt: 'Create a product landing page',
      expectedVersion: 1,
    }

    const first = await repository.create(owner, project.id, input)
    const duplicate = await repository.create(owner, project.id, input)

    expect(duplicate.id).toBe(first.id)
    expect(first).toMatchObject({ status: 'queued', mode: 'generate', expectedVersion: 1 })
    expect(first).not.toHaveProperty('prompt')
    expect(await repository.findById(outsider, first.id)).toBeNull()
    expect(await repository.list(outsider, project.id)).toEqual([])
    expect(await repository.list(owner, project.id)).toHaveLength(1)
  })

  it('enforces valid claim and repairing transitions', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(),
      mode: 'edit-selection',
      selectedNodeId: 'heading-1',
      prompt: 'Improve this heading',
      expectedVersion: 1,
    })

    expect(await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v1' }))
      .toMatchObject({ status: 'running', provider: 'mock' })
    expect(await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v1' })).toBeNull()
    expect(await repository.markRepairing(owner, run.id, 1)).toMatchObject({ status: 'repairing', repairCount: 1 })
    expect(await repository.markRepairing(owner, run.id, 3)).toBeNull()
  })

  it('atomically saves an AI document, immutable revision, priced usage and completed run', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Generate', expectedVersion: 1,
    })
    await repository.claim(owner, run.id, {
      provider: 'google-gemini', model: 'gemini-2.5-flash', promptVersion: 'v1',
    })
    const document = createValidDesignFixture()
    document.nodes['heading-1']!.props = { text: 'AI generated', level: 1 }
    document.version = 2

    const completed = await repository.complete(owner, run.id, {
      document,
      summary: 'AI generated landing page',
      usage,
      repairCount: 0,
    })

    expect(completed).toMatchObject({ accepted: true, run: { status: 'completed', documentVersion: 2 } })
    if (!completed.accepted) return
    expect(completed.run.revisionId).toBeTruthy()
    const savedProject = await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id)
    expect(savedProject?.document.nodes['heading-1']?.props).toMatchObject({ text: 'AI generated' })
    const usageRows = await client.query<{
      total_tokens: number
      pricing_version: string | null
      input_rate_micro_usd_per_million: number | null
      output_rate_micro_usd_per_million: number | null
      input_estimated_micro_usd: number | null
      output_estimated_micro_usd: number | null
      total_estimated_micro_usd: number | null
      currency: string | null
    }>(`SELECT
      total_tokens, pricing_version,
      input_rate_micro_usd_per_million,
      output_rate_micro_usd_per_million,
      input_estimated_micro_usd,
      output_estimated_micro_usd,
      total_estimated_micro_usd,
      currency
    FROM usage_records WHERE generation_run_id = $1`, [run.id])
    expect(usageRows.rows[0]).toEqual({
      total_tokens: 200,
      pricing_version: 'google-gemini-2026-08-13',
      input_rate_micro_usd_per_million: 300_000,
      output_rate_micro_usd_per_million: 2_500_000,
      input_estimated_micro_usd: 36,
      output_estimated_micro_usd: 200,
      total_estimated_micro_usd: 236,
      currency: 'USD',
    })
    const revisions = await client.query<{ source: string; generation_run_id: string }>('SELECT source, generation_run_id FROM revisions WHERE generation_run_id = $1', [run.id])
    expect(revisions.rows[0]).toEqual({ source: 'ai', generation_run_id: run.id })
  })

  it('persists failure usage once and leaves unknown models explicitly unpriced', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Fail', expectedVersion: 1,
    })
    await repository.claim(owner, run.id, {
      provider: 'google-gemini', model: 'gemini-unknown', promptVersion: 'v1',
    })

    expect(await repository.fail(owner, run.id, {
      errorCode: 'provider_error', usage, repairCount: 0,
    })).toMatchObject({ status: 'failed' })
    expect(await repository.fail(owner, run.id, {
      errorCode: 'provider_error', usage, repairCount: 0,
    })).toBeNull()

    const rows = await client.query<{
      count: number
      total_tokens: number
      pricing_version: string | null
      total_estimated_micro_usd: number | null
      currency: string | null
    }>(`SELECT count(*) OVER ()::int AS count,
      total_tokens, pricing_version,
      total_estimated_micro_usd, currency
    FROM usage_records WHERE generation_run_id = $1`, [run.id])
    expect(rows.rows).toEqual([{
      count: 1,
      total_tokens: 200,
      pricing_version: null,
      total_estimated_micro_usd: null,
      currency: null,
    }])
  })

  it('fails stale completion without changing the document or creating a revision', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Generate stale', expectedVersion: 1,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v1' })
    const changed = createValidDesignFixture()
    changed.nodes['heading-1']!.props = { text: 'Human edit', level: 1 }
    await createProjectRepository(drizzle(client, { schema })).replaceDocument(owner, project.id, 1, changed)
    const generated = createValidDesignFixture()
    generated.nodes['heading-1']!.props = { text: 'Must not overwrite', level: 1 }

    const completed = await repository.complete(owner, run.id, {
      document: generated,
      summary: 'Stale AI output',
      usage,
      repairCount: 0,
    })

    expect(completed).toEqual({ accepted: false, code: 'stale_document_version' })
    expect((await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id))?.document.nodes['heading-1']?.props)
      .toMatchObject({ text: 'Human edit' })
    expect((await client.query('SELECT id FROM revisions WHERE generation_run_id = $1', [run.id])).rows).toEqual([])
    expect(await repository.findById(owner, run.id)).toMatchObject({ status: 'failed', errorCode: 'stale_document_version' })
  })

  it('validates generation modes and returns null for hidden worker inputs and terminal updates', async () => {
    const { project, repository } = await setup()
    await expect(repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'edit-selection', prompt: 'Missing selection', expectedVersion: 1,
    })).rejects.toThrow('invalid_generation_input')
    await expect(repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', selectedNodeId: 'heading-1', prompt: 'Extra selection', expectedVersion: 1,
    })).rejects.toThrow('invalid_generation_input')
    await expect(repository.create(outsider, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Hidden project', expectedVersion: 1,
    })).rejects.toThrow('not_found')
    expect(await repository.getWorkerInput(outsider, crypto.randomUUID())).toBeNull()
    expect(await repository.fail(owner, crypto.randomUUID(), {
      errorCode: 'provider_error', usage, repairCount: 0,
    })).toBeNull()
    expect(await repository.complete(owner, crypto.randomUUID(), {
      document: createValidDesignFixture(), summary: 'Missing', usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'not_found' })
  })

  it('rejects invalid completion payloads and documents without mutating the draft', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'generate', prompt: 'Generate', expectedVersion: 1,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v1' })
    expect(await repository.complete(owner, run.id, {
      document: null, summary: 'Invalid document', usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'invalid_design_document' })
    expect(await repository.complete(owner, run.id, {
      document: createValidDesignFixture(), summary: '', usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'invalid_design_document' })
    expect(await repository.complete(owner, run.id, {
      document: createValidDesignFixture(), summary: 'Invalid usage',
      usage: { inputTokens: -1, outputTokens: 0, totalTokens: 0 }, repairCount: 0,
    })).toEqual({ accepted: false, code: 'invalid_design_document' })
  })

  it('stores a ready proposal without changing the accepted draft or creating a revision', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(),
      action: 'request',
      prompt: 'Make this heading clearer',
      expectedVersion: 1,
      selectedNodeId: 'heading-1',
      scope,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const proposal = materializeProposal({
      document: project.document,
      scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Reviewed proposal' } }],
      summary: 'Clarified the heading',
      runId: run.id,
      expectedVersion: 1,
    })
    if (!proposal.accepted) throw new Error('expected proposal')

    const completed = await repository.completeProposal(owner, run.id, {
      commands: proposal.commands,
      proposedDocument: proposal.proposedDocument,
      summary: proposal.summary,
      usage,
      repairCount: 0,
    })

    expect(completed).toMatchObject({ accepted: true, run: { proposalStatus: 'ready' } })
    expect((await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id))?.version).toBe(1)
    expect((await client.query('SELECT id FROM revisions WHERE generation_run_id = $1', [run.id])).rows).toEqual([])
  })

  it('keeps legacy exact-image proposals compatible when no v2 media review is present', async () => {
    const { project, repository } = await setup()
    project.document.nodes['image-1']!.props = {
      assetId: '55555555-5555-4555-8555-555555555555', alt: 'Current image', decorative: false,
    }
    await createProjectRepository(drizzle(client, { schema })).replaceDocument(owner, project.id, 1, project.document)
    const document = { ...project.document, version: 2 }
    const scope = deriveProposalScope(document, 'image-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', intent: 'replace-media',
      prompt: 'Thay bằng một hình khác', expectedVersion: 2,
      selectedNodeId: 'image-1', scope,
    })
    await repository.claim(owner, run.id, {
      provider: 'google-gemini', model: 'gemini-3.1-flash-lite', promptVersion: 'v2',
    })
    const materialized = materializeMediaProposal({
      document, targetNodeId: 'image-1',
      assetId: '77777777-7777-4777-8777-777777777777',
      alt: 'Replacement image', runId: run.id, expectedVersion: 2,
      summary: 'Prepared a replacement image',
    })
    if (!materialized.accepted) throw new Error('expected media proposal')

    expect(await repository.completeProposal(owner, run.id, {
      commands: materialized.commands,
      proposedDocument: materialized.proposedDocument,
      summary: materialized.summary,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      repairCount: 0,
    })).toMatchObject({
      accepted: true,
      run: { proposalStatus: 'ready', mediaReview: null },
    })
    expect((await client.query<{
      pricing_version: string | null
      total_estimated_micro_usd: number | null
    }>(`SELECT pricing_version, total_estimated_micro_usd
      FROM usage_records WHERE generation_run_id = $1`, [run.id])).rows[0]).toEqual({
      pricing_version: null,
      total_estimated_micro_usd: null,
    })
    await client.query(`UPDATE usage_records SET
      pricing_version = 'legacy-text-price',
      input_rate_micro_usd_per_million = 250000,
      output_rate_micro_usd_per_million = 1500000,
      input_estimated_micro_usd = 0,
      output_estimated_micro_usd = 0,
      total_estimated_micro_usd = 0,
      currency = 'USD'
      WHERE generation_run_id = $1`, [run.id])
    const report = await createUsageRepository(drizzle(client, { schema })).report(owner, {
      days: 1,
      page: 1,
      pageSize: 25,
      timezone: 'UTC',
    }, new Date())
    expect(report.items[0]).toMatchObject({
      text: null,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      pricing: {
        status: 'unpriced',
        reason: 'unsupported_media_cost',
      },
    })
    expect(report.totals.unpricedCount).toBe(1)
  })

  it('persists actual Gemini image usage and combined cost for replace-media', async () => {
    const { project, repository } = await setup()
    project.document.nodes['image-1']!.props = {
      assetId: '55555555-5555-4555-8555-555555555555', alt: 'Current image', decorative: false,
    }
    const projectRepository = createProjectRepository(drizzle(client, { schema }))
    await projectRepository.replaceDocument(owner, project.id, 1, project.document)
    const document = { ...project.document, version: 2 }
    const scope = deriveProposalScope(document, 'image-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', intent: 'replace-media',
      prompt: 'Thay bằng ảnh văn phòng sáng sủa', expectedVersion: 2,
      selectedNodeId: 'image-1', scope,
    })
    await repository.claim(owner, run.id, {
      provider: 'google-gemini', model: 'gemini-3.1-flash-lite', promptVersion: 'v2',
    })
    const materialized = materializeMediaProposal({
      document, targetNodeId: 'image-1',
      assetId: '77777777-7777-4777-8777-777777777777',
      alt: 'Văn phòng sáng sủa', runId: run.id, expectedVersion: 2,
      summary: 'Prepared a replacement image',
    })
    if (!materialized.accepted) throw new Error('expected media proposal')

    expect(await repository.completeProposal(owner, run.id, {
      commands: materialized.commands,
      proposedDocument: materialized.proposedDocument,
      summary: materialized.summary,
      usage,
      repairCount: 0,
      mediaUsage: { generated: [imageUsage], stockCount: 0 },
    })).toMatchObject({ accepted: true })

    const rows = await client.query<{
      image_provider: string | null
      image_model: string | null
      image_size: string | null
      image_count: number | null
      image_input_tokens: number | null
      image_output_tokens: number | null
      image_total_tokens: number | null
      image_total_estimated_micro_usd: number | null
    }>(`SELECT image_provider, image_model, image_size, image_count,
      image_input_tokens, image_output_tokens, image_total_tokens,
      image_total_estimated_micro_usd
      FROM usage_records WHERE generation_run_id = $1`, [run.id])
    expect(rows.rows).toEqual([{
      image_provider: 'google-gemini',
      image_model: 'gemini-3.1-flash-image',
      image_size: '1K',
      image_count: 1,
      image_input_tokens: 100,
      image_output_tokens: 1_120,
      image_total_tokens: 1_220,
      image_total_estimated_micro_usd: 67_250,
    }])

    const report = await createUsageRepository(drizzle(client, { schema })).report(owner, {
      days: 1, page: 1, pageSize: 25, timezone: 'UTC',
    }, new Date())
    expect(report.totals).toMatchObject({
      inputTokens: 220,
      outputTokens: 1_200,
      totalTokens: 1_420,
      pricedEstimatedMicroUsd: 67_400,
      unpricedCount: 0,
    })
    expect(report.items[0]).toMatchObject({
      inputTokens: 220,
      outputTokens: 1_200,
      totalTokens: 1_420,
      text: {
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-lite',
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        pricing: {
          status: 'priced',
          totalEstimatedMicroUsd: 150,
        },
      },
      image: {
        provider: 'google-gemini',
        model: 'gemini-3.1-flash-image',
        imageSize: '1K',
        imageCount: 1,
        stockCount: 0,
        inputTokens: 100,
        outputTokens: 1_120,
        totalTokens: 1_220,
        pricing: {
          status: 'priced',
          totalEstimatedMicroUsd: 67_250,
        },
      },
      pricing: {
        status: 'priced',
        totalEstimatedMicroUsd: 67_400,
      },
    })
  })

  it('stores bounded media candidates and redacts internal visual brief fields from the public run', async () => {
    const { project, repository } = await setup()
    project.document.nodes['image-1']!.props = {
      assetId: '55555555-5555-4555-8555-555555555555', alt: 'Current image', decorative: false,
    }
    const projectRepository = createProjectRepository(drizzle(client, { schema }))
    await projectRepository.replaceDocument(owner, project.id, 1, project.document)
    const scope = deriveProposalScope(project.document, 'image-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', intent: 'replace-media',
      prompt: 'Thay bằng sơ đồ quy trình năm bước', expectedVersion: 2,
      selectedNodeId: 'image-1', scope,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const materialized = materializeMediaProposal({
      document: { ...project.document, version: 2 }, targetNodeId: 'image-1',
      assetId: '77777777-7777-4777-8777-777777777777',
      alt: 'Sơ đồ quy trình phát triển năm bước', runId: run.id, expectedVersion: 2,
      summary: 'Prepared a process diagram',
    })
    if (!materialized.accepted) throw new Error('expected media proposal')
    const review = mediaProposalReviewSchema.parse({
      version: 'media-proposal-review-v1',
      visualBrief: {
        version: 'visual-brief-v1', subject: 'Quy trình phát triển', message: 'Năm bước',
        representation: 'process-diagram', composition: 'Năm cột có mũi tên',
        mustInclude: ['5 bước'], mustAvoid: ['người'], peoplePolicy: 'forbidden',
        textPolicy: 'symbolic-only', style: 'editorial diagram', palette: ['#2563eb'],
        aspectRatio: 'wide', focalArea: 'center',
        generationPrompt: 'Five step process diagram, no people, no readable text',
        searchQuery: null, alt: 'Sơ đồ quy trình phát triển năm bước',
      },
      candidates: [{
        candidateId: 'candidate-1', assetId: '77777777-7777-4777-8777-777777777777',
        source: 'generated', score: 0.91, passed: true, safeReason: 'Phù hợp với brief.',
      }],
      selectedCandidateId: 'candidate-1', rootRequestId: run.id,
      previousProposalId: null, rejectedCandidateIds: [],
    })
    const completed = await repository.completeProposal(owner, run.id, {
      commands: materialized.commands, proposedDocument: materialized.proposedDocument,
      summary: materialized.summary, usage, repairCount: 0, mediaReview: review,
    })
    expect(completed).toMatchObject({
      accepted: true,
      run: {
        proposalStatus: 'ready',
        mediaReview: {
          version: 'media-proposal-review-v1', representation: 'process-diagram',
          candidates: [{ candidateId: 'candidate-1', assetId: '77777777-7777-4777-8777-777777777777' }],
        },
      },
    })
    expect(JSON.stringify(completed)).not.toMatch(/generationPrompt|searchQuery|mustAvoid|rootRequestId/)
    const row = (await client.query<{ proposal_media_review: { visualBrief: { generationPrompt: string } } }>(
      'SELECT proposal_media_review FROM generation_runs WHERE id = $1',
      [run.id],
    )).rows[0]
    expect(row?.proposal_media_review.visualBrief.generationPrompt).toContain('Five step process diagram')
  })

  it('discards proposals without mutation and atomically accepts the exact reviewed proposal once', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const createReady = async (text: string) => {
      const run = await repository.createProposal(owner, project.id, {
        requestId: crypto.randomUUID(), action: 'request', prompt: 'Improve heading', expectedVersion: 1,
        selectedNodeId: 'heading-1', scope,
      })
      await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
      const proposal = materializeProposal({
        document: project.document, scope,
        operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text } }],
        summary: 'Improved heading', runId: run.id, expectedVersion: 1,
      })
      if (!proposal.accepted) throw new Error('expected proposal')
      await repository.completeProposal(owner, run.id, {
        commands: proposal.commands, proposedDocument: proposal.proposedDocument,
        summary: proposal.summary, usage, repairCount: 0,
      })
      return run
    }

    const discarded = await createReady('Discarded text')
    expect(await repository.discardProposal(owner, discarded.id)).toMatchObject({ proposalStatus: 'discarded' })
    expect((await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id))?.version).toBe(1)

    const ready = await createReady('Accepted proposal')
    const accepted = await repository.acceptProposal(owner, project.id, ready.id)
    expect(accepted).toMatchObject({ accepted: true, version: 2, document: { nodes: { 'heading-1': { props: { text: 'Accepted proposal' } } } } })
    const duplicate = await repository.acceptProposal(owner, project.id, ready.id)
    expect(duplicate).toMatchObject({ accepted: true, version: 2 })
    expect((await client.query('SELECT id FROM revisions WHERE generation_run_id = $1', [ready.id])).rows).toHaveLength(1)
  })

  it('keeps stale proposals reviewable but blocks acceptance without overwriting newer work', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Improve heading', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const proposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Must not overwrite' } }],
      summary: 'Proposal', runId: run.id, expectedVersion: 1,
    })
    if (!proposal.accepted) throw new Error('expected proposal')
    await repository.completeProposal(owner, run.id, {
      commands: proposal.commands, proposedDocument: proposal.proposedDocument,
      summary: proposal.summary, usage, repairCount: 0,
    })
    const human = structuredClone(project.document)
    human.nodes['heading-1']!.props = { text: 'Newer human edit', level: 1 }
    await createProjectRepository(drizzle(client, { schema })).replaceDocument(owner, project.id, 1, human)

    expect(await repository.acceptProposal(owner, project.id, run.id)).toEqual({ accepted: false, code: 'stale_document_version' })
    expect(await repository.findById(owner, run.id)).toMatchObject({ proposalStatus: 'stale' })
    expect((await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id))?.document.nodes['heading-1']?.props)
      .toMatchObject({ text: 'Newer human edit' })
  })

  it('validates proposal creation, replacement and supersession against the accepted base', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const original = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Improve heading', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })
    await repository.claim(owner, original.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const firstProposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'First option' } }],
      summary: 'First option', runId: original.id, expectedVersion: 1,
    })
    if (!firstProposal.accepted) throw new Error('expected proposal')
    await repository.completeProposal(owner, original.id, {
      commands: firstProposal.commands, proposedDocument: firstProposal.proposedDocument,
      summary: firstProposal.summary, usage, repairCount: 0,
    })

    const replacementRequestId = crypto.randomUUID()
    const replacementInput = {
      requestId: replacementRequestId, action: 'refine' as const, prompt: 'Make it shorter', expectedVersion: 1,
      feedbackCodes: ['copy_mismatch' as const],
      selectedNodeId: 'heading-1', previousProposalId: original.id, scope,
    }
    const replacement = await repository.createProposal(owner, project.id, replacementInput)
    expect((await repository.createProposal(owner, project.id, replacementInput)).id).toBe(replacement.id)
    expect(replacement).toMatchObject({
      mode: 'edit-selection', previousProposalId: original.id, originalRequest: 'Improve heading',
      feedbackCodes: ['copy_mismatch'],
    })
    const lineage = (await client.query<{
      original_request: string
      prompt: string
      proposal_feedback_codes: string[]
      proposal_lineage: unknown
    }>(
      'SELECT original_request, prompt, proposal_feedback_codes, proposal_lineage FROM generation_runs WHERE id = $1',
      [replacement.id],
    )).rows[0]
    expect(lineage).toMatchObject({
      original_request: 'Improve heading',
      prompt: 'Make it shorter',
      proposal_feedback_codes: ['copy_mismatch'],
      proposal_lineage: { version: 'proposal-lineage-v1', rootRequestId: original.id },
    })
    await repository.claim(owner, replacement.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const refinedProposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Short option' } }],
      summary: 'Short option', runId: replacement.id, expectedVersion: 1,
    })
    if (!refinedProposal.accepted) throw new Error('expected proposal')
    expect(await repository.completeProposal(owner, replacement.id, {
      commands: refinedProposal.commands, proposedDocument: refinedProposal.proposedDocument,
      summary: refinedProposal.summary, usage, repairCount: 0,
    })).toMatchObject({ accepted: true, run: { proposalStatus: 'ready' } })
    expect(await repository.findById(owner, original.id)).toMatchObject({ proposalStatus: 'superseded' })

    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Invalid initial replacement', expectedVersion: 1,
      selectedNodeId: 'heading-1', previousProposalId: original.id, scope,
    })).rejects.toThrow('invalid_proposal_input')
    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'refine', prompt: 'Missing previous', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })).rejects.toThrow('invalid_proposal_input')
    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Page selection mismatch', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope: deriveProposalScope(project.document, null)!,
    })).rejects.toThrow('invalid_proposal_input')
    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Scope root mismatch', expectedVersion: 1,
      selectedNodeId: 'paragraph-1', scope,
    })).rejects.toThrow('invalid_proposal_input')
    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Stale base', expectedVersion: 2,
      selectedNodeId: 'heading-1', scope,
    })).rejects.toThrow('stale_document_version')
    await expect(repository.createProposal(outsider, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Hidden project', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })).rejects.toThrow('not_found')
    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'try-another', prompt: 'Invalid previous state', expectedVersion: 1,
      selectedNodeId: 'heading-1', previousProposalId: original.id, scope,
    })).rejects.toThrow('proposal_not_replaceable')
  })

  it('enforces constraint-preserving Remix at completion and acceptance boundaries', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'section-1')!
    const createRemix = async () => {
      const run = await repository.createProposal(owner, project.id, {
        requestId: crypto.randomUUID(), action: 'request', intent: 'remix-section', allowedChanges: [],
        prompt: 'Try another section layout while preserving content', expectedVersion: 1,
        selectedNodeId: 'section-1', scope,
      })
      await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
      return run
    }

    const valid = await createRemix()
    expect(valid).toMatchObject({ proposalIntent: 'remix-section', proposalConstraints: expect.any(Object) })
    const validProposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_STYLE', nodeId: 'section-1', patch: { textAlign: 'center' } }],
      summary: 'Remixed layout', runId: valid.id, expectedVersion: 1,
    })
    if (!validProposal.accepted) throw new Error('expected valid Remix')
    expect(await repository.completeProposal(owner, valid.id, {
      commands: validProposal.commands, proposedDocument: validProposal.proposedDocument,
      summary: validProposal.summary, usage, repairCount: 0,
    })).toMatchObject({ accepted: true, run: { proposalStatus: 'ready' } })

    const invalid = await createRemix()
    const invalidProposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Changed copy' } }],
      summary: 'Escaped constraint', runId: invalid.id, expectedVersion: 1,
    })
    if (!invalidProposal.accepted) throw new Error('expected materialized proposal')
    expect(await repository.completeProposal(owner, invalid.id, {
      commands: invalidProposal.commands, proposedDocument: invalidProposal.proposedDocument,
      summary: invalidProposal.summary, usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'scope_violation' })
    expect(await repository.findById(owner, invalid.id)).toMatchObject({ proposalStatus: 'invalid-scope' })

    await expect(repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', intent: 'remix-section', allowedChanges: [],
      prompt: 'Invalid element Remix', expectedVersion: 1, selectedNodeId: 'heading-1',
      scope: deriveProposalScope(project.document, 'heading-1')!,
    })).rejects.toThrow('invalid_proposal_input')
  })

  it('cancels preparing proposals and rejects late, malformed or mismatched completion', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const createRun = () => repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request' as const, prompt: 'Improve heading', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })

    const cancelled = await createRun()
    expect(await repository.cancelProposal(owner, cancelled.id)).toMatchObject({ proposalStatus: 'cancelled' })
    expect(await repository.cancelProposal(owner, cancelled.id)).toBeNull()
    expect(await repository.completeProposal(owner, cancelled.id, {
      commands: [], proposedDocument: project.document, summary: 'Late completion', usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'invalid_design_document' })

    const running = await createRun()
    await repository.claim(owner, running.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })
    const proposal = materializeProposal({
      document: project.document, scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Expected snapshot' } }],
      summary: 'Expected snapshot', runId: running.id, expectedVersion: 1,
    })
    if (!proposal.accepted) throw new Error('expected proposal')
    const mismatched = structuredClone(proposal.proposedDocument)
    mismatched.nodes['heading-1']!.props = { text: 'Tampered snapshot', level: 1 }
    expect(await repository.completeProposal(owner, running.id, {
      commands: proposal.commands, proposedDocument: mismatched, summary: proposal.summary, usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'invalid_design_document' })
    expect(await repository.completeProposal(owner, crypto.randomUUID(), {
      commands: proposal.commands, proposedDocument: proposal.proposedDocument,
      summary: proposal.summary, usage, repairCount: 0,
    })).toEqual({ accepted: false, code: 'not_found' })
    expect(await repository.discardProposal(owner, running.id)).toBeNull()
    expect(await repository.discardProposal(owner, crypto.randomUUID())).toBeNull()
  })

  it('records safe failures and usage without exposing provider details', async () => {
    const { project, repository } = await setup()
    const run = await repository.create(owner, project.id, {
      requestId: crypto.randomUUID(), mode: 'edit-page', prompt: 'Improve page', expectedVersion: 1,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v1' })

    expect(await repository.fail(owner, run.id, {
      errorCode: 'invalid_model_output',
      usage,
      repairCount: 2,
    })).toMatchObject({ status: 'failed', errorCode: 'invalid_model_output', repairCount: 2 })
    expect(await repository.fail(owner, run.id, {
      errorCode: 'provider leaked stack and token',
      usage,
      repairCount: 2,
    })).toBeNull()
    const visible = await repository.findById(owner, run.id)
    expect(visible).not.toHaveProperty('prompt')
    expect(visible).not.toHaveProperty('rawOutput')
  })

  it('moves a failed proposal to a terminal state without changing the accepted draft', async () => {
    const { project, repository } = await setup()
    const scope = deriveProposalScope(project.document, 'heading-1')!
    const run = await repository.createProposal(owner, project.id, {
      requestId: crypto.randomUUID(), action: 'request', prompt: 'Shorten this heading', expectedVersion: 1,
      selectedNodeId: 'heading-1', scope,
    })
    await repository.claim(owner, run.id, { provider: 'mock', model: 'mock-v1', promptVersion: 'v2' })

    expect(await repository.fail(owner, run.id, {
      errorCode: 'provider_timeout', usage, repairCount: 0,
    })).toMatchObject({
      status: 'failed', proposalStatus: 'failed', errorCode: 'provider_timeout',
    })
    expect((await createProjectRepository(drizzle(client, { schema })).findById(owner, project.id))?.version).toBe(1)
    expect((await client.query('SELECT id FROM revisions WHERE generation_run_id = $1', [run.id])).rows).toEqual([])
  })
})
