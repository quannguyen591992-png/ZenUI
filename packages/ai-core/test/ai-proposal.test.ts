import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  createMockLlmProvider,
  deriveProposalScope,
  materializeProposal,
  proposalRequestSchema,
  proposalScopeSchema,
  proposalSnapshotMatches,
  runProposalGeneration,
  captureRemixConstraints,
  proposalIntentSchema,
  routeProposalIntent,
  materializeMediaProposal,
  validateProposalRemix,
} from '../src/index.js'

const runId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const workspaceId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const previousProposalId = '55555555-5555-4555-8555-555555555555'

function document() {
  const value = createValidDesignFixture()
  value.projectId = projectId
  return value
}

describe('AI proposal contracts', () => {
  it('derives canonical page, section and element scopes from the accepted document', () => {
    const accepted = document()

    expect(deriveProposalScope(accepted, null)).toEqual({
      kind: 'page',
      rootNodeId: accepted.pages[0]!.rootNodeId,
      label: 'Toàn website',
      sectionNodeId: null,
    })
    expect(deriveProposalScope(accepted, 'section-1')).toEqual({
      kind: 'section',
      rootNodeId: 'section-1',
      label: 'Phần Nội dung',
      sectionNodeId: 'section-1',
    })
    expect(deriveProposalScope(accepted, 'heading-1')).toEqual({
      kind: 'element',
      rootNodeId: 'heading-1',
      label: 'Tiêu đề trong Phần Nội dung',
      sectionNodeId: 'section-1',
    })
    expect(deriveProposalScope(accepted, 'missing')).toBeNull()
    expect(proposalScopeSchema.safeParse({ kind: 'page', rootNodeId: 'page-1', label: 'x', sectionNodeId: 'forged' }).success).toBe(false)
  })

  it('validates request, refine and try-another inputs without accepting browser-authored scope', () => {
    const base = {
      workspaceId,
      requestId: crypto.randomUUID(),
      action: 'request' as const,
      prompt: 'Make this section shorter and clearer',
      expectedVersion: 1,
      selectedNodeId: 'section-1',
    }
    expect(proposalRequestSchema.safeParse(base).success).toBe(true)
    expect(proposalRequestSchema.safeParse({ ...base, scope: { kind: 'page' } }).success).toBe(false)
    expect(proposalRequestSchema.safeParse({ ...base, action: 'refine', previousProposalId }).success).toBe(true)
    expect(proposalRequestSchema.safeParse({ ...base, action: 'refine' }).success).toBe(false)
    expect(proposalRequestSchema.safeParse({
      ...base,
      action: 'try-another',
      previousProposalId,
      prompt: undefined,
    }).success).toBe(true)
    expect(proposalRequestSchema.safeParse({ ...base, action: 'try-another' }).success).toBe(false)
    expect(proposalRequestSchema.safeParse({
      ...base,
      intent: 'remix-section',
      allowedChanges: [],
    }).success).toBe(true)
    expect(proposalRequestSchema.safeParse({
      ...base,
      selectedNodeId: undefined,
      intent: 'remix-section',
      allowedChanges: [],
    }).success).toBe(false)
    expect(proposalRequestSchema.safeParse({
      ...base,
      intent: 'remix-section',
      allowedChanges: ['copy', 'forged'],
    }).success).toBe(false)
    expect(proposalIntentSchema.parse('remix-section')).toBe('remix-section')
    expect(proposalIntentSchema.parse('replace-media')).toBe('replace-media')
    expect(proposalRequestSchema.safeParse({
      ...base,
      intent: 'replace-media',
      selectedNodeId: undefined,
    }).success).toBe(false)
  })

  it('routes contextual image replacement only for an exact image or media slot target', () => {
    const accepted = document()
    accepted.nodes['image-1']!.props = {
      assetId: '66666666-6666-4666-8666-666666666666',
      alt: 'Current product view',
      decorative: false,
    }
    accepted.nodes['hero-slot'] = {
      id: 'hero-slot',
      type: 'feature-card',
      parentId: 'container-1',
      children: [],
      props: { title: 'Hero visual', description: 'Reserved visual area', mediaSlot: 'hero-image' },
      style: { width: 'full', aspectRatio: 'wide' },
      responsive: {},
    }
    accepted.nodes['container-1']!.children.push('hero-slot')

    expect(routeProposalIntent({
      document: accepted,
      selectedNodeId: 'image-1',
      requestedIntent: 'standard',
      prompt: 'Đổi hình cho giống nội dung trang hơn',
    })).toEqual({ accepted: true, intent: 'replace-media', targetNodeId: 'image-1' })
    expect(routeProposalIntent({
      document: accepted,
      selectedNodeId: 'hero-slot',
      requestedIntent: 'standard',
      prompt: 'Tạo ảnh phù hợp bằng AI',
    })).toEqual({ accepted: true, intent: 'replace-media', targetNodeId: 'hero-slot' })
    expect(routeProposalIntent({
      document: accepted,
      selectedNodeId: 'image-1',
      requestedIntent: 'standard',
      prompt: 'Sửa mô tả ảnh cho rõ hơn',
    })).toEqual({ accepted: true, intent: 'standard', targetNodeId: 'image-1' })
    expect(routeProposalIntent({
      document: accepted,
      selectedNodeId: 'section-1',
      requestedIntent: 'replace-media',
      prompt: 'Đổi hình cho phù hợp',
    })).toEqual({ accepted: false, code: 'invalid_media_target' })
  })

  it('materializes media proposals without mutating the accepted document', () => {
    const accepted = document()
    accepted.nodes['image-1']!.props = {
      assetId: '66666666-6666-4666-8666-666666666666',
      alt: 'Current product view',
      decorative: false,
    }
    const before = structuredClone(accepted)
    const existing = materializeMediaProposal({
      document: accepted,
      targetNodeId: 'image-1',
      assetId: '77777777-7777-4777-8777-777777777777',
      alt: 'Updated product view matching the page content',
      runId,
      expectedVersion: 1,
      summary: 'Prepared a more relevant image',
    })
    expect(existing).toMatchObject({
      accepted: true,
      commands: [expect.objectContaining({
        type: 'UPDATE_PROPS', nodeId: 'image-1',
        patch: { assetId: '77777777-7777-4777-8777-777777777777', alt: 'Updated product view matching the page content', decorative: false, src: null },
      })],
      proposedDocument: { version: 2 },
    })
    expect(accepted).toEqual(before)

    accepted.nodes['hero-slot'] = {
      id: 'hero-slot', type: 'feature-card', parentId: 'container-1', children: [],
      props: { title: 'Hero visual', description: 'Reserved visual area', mediaSlot: 'hero-image' },
      style: { width: 'full', aspectRatio: 'wide' }, responsive: {},
    }
    accepted.nodes['container-1']!.children.push('hero-slot')
    const slot = materializeMediaProposal({
      document: accepted,
      targetNodeId: 'hero-slot',
      assetId: '88888888-8888-4888-8888-888888888888',
      alt: 'Team collaborating on the product',
      runId,
      expectedVersion: 1,
      summary: 'Prepared the Hero image',
    })
    expect(slot).toMatchObject({
      accepted: true,
      commands: [expect.objectContaining({
        type: 'REPLACE_SUBTREE', nodeId: 'hero-slot', rootNodeId: expect.stringContaining('media-image'),
        nodes: [expect.objectContaining({ type: 'image', props: { assetId: '88888888-8888-4888-8888-888888888888', alt: 'Team collaborating on the product', decorative: false } })],
      })],
    })
  })

  it('revalidates protected Remix constraints at proposal completion and acceptance boundaries', () => {
    const accepted = document()
    const captured = captureRemixConstraints({ document: accepted, sectionNodeId: 'section-1' })
    if (!captured.accepted) throw new Error('expected Remix constraints')
    const layoutOnly = structuredClone(accepted)
    layoutOnly.nodes['section-1']!.style = { ...layoutOnly.nodes['section-1']!.style, textAlign: 'center' }

    expect(validateProposalRemix({
      intent: 'remix-section',
      base: accepted,
      proposed: layoutOnly,
      constraints: captured.constraints,
    })).toEqual({ accepted: true })

    const escaped = structuredClone(layoutOnly)
    escaped.nodes['paragraph-1']!.props = { text: 'Changed copy' }
    expect(validateProposalRemix({
      intent: 'remix-section',
      base: accepted,
      proposed: escaped,
      constraints: captured.constraints,
    })).toEqual({ accepted: false, code: 'constraint_violation' })
    expect(validateProposalRemix({ intent: 'standard', base: accepted, proposed: escaped })).toEqual({ accepted: true })
  })

  it('materializes an isolated proposal and rejects scope escape without mutating the base', () => {
    const accepted = document()
    const before = structuredClone(accepted)
    const scope = deriveProposalScope(accepted, 'heading-1')!
    const result = materializeProposal({
      document: accepted,
      scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'A clearer promise' } }],
      summary: 'Shortened the main promise',
      runId,
      expectedVersion: 1,
    })

    expect(result).toMatchObject({ accepted: true, summary: 'Shortened the main promise' })
    expect(accepted).toEqual(before)
    if (!result.accepted) return
    expect(result.proposedDocument.nodes['heading-1']?.props).toMatchObject({ text: 'A clearer promise' })
    expect(result.commands).toEqual([expect.objectContaining({ source: 'ai', documentVersion: 1 })])
    expect(proposalSnapshotMatches(accepted, result.commands, result.proposedDocument)).toBe(true)

    expect(materializeProposal({
      document: accepted,
      scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'paragraph-1', patch: { text: 'escaped' } }],
      summary: 'Escaped',
      runId,
      expectedVersion: 1,
    })).toEqual({ accepted: false, code: 'scope_violation' })
  })

  it('generates a proposal against accepted base and keeps previous proposal context bounded', async () => {
    const accepted = document()
    const provider = createMockLlmProvider([{
      output: {
        summary: 'Improved the selected heading',
        operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Proposal heading' } }],
      },
    }])
    const result = await runProposalGeneration({
      provider,
      job: {
        generationRunId: runId,
        projectId,
        workspaceId,
        userId,
        prompt: 'Improve this heading',
        expectedVersion: 1,
        selectedNodeId: 'heading-1',
      },
      document: accepted,
      previousProposal: {
        id: previousProposalId,
        summary: 'An earlier proposal',
        request: 'Make it concise',
      },
      maxRepairAttempts: 0,
      maxTransientRetries: 0,
    })

    expect(result).toMatchObject({ accepted: true, summary: 'Improved the selected heading' })
    expect(accepted.nodes['heading-1']?.props).not.toMatchObject({ text: 'Proposal heading' })
    if (!result.accepted) return
    expect(result.proposedDocument.nodes['heading-1']?.props).toMatchObject({ text: 'Proposal heading' })
    expect(result.scope).toMatchObject({ kind: 'element', rootNodeId: 'heading-1' })
  })

  it('detects tampered proposal snapshots and invalid scope before provider work', async () => {
    const accepted = document()
    const scope = deriveProposalScope(accepted, 'heading-1')!
    const result = materializeProposal({
      document: accepted,
      scope,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Reviewed' } }],
      summary: 'Reviewed',
      runId,
      expectedVersion: 1,
    })
    if (!result.accepted) throw new Error('expected proposal')
    const tampered = structuredClone(result.proposedDocument)
    tampered.nodes['heading-1']!.props = { text: 'Tampered' }
    expect(proposalSnapshotMatches(accepted, result.commands, tampered)).toBe(false)

    await expect(runProposalGeneration({
      provider: createMockLlmProvider([]),
      job: {
        generationRunId: runId,
        projectId,
        workspaceId,
        userId,
        prompt: 'Improve missing content',
        expectedVersion: 1,
        selectedNodeId: 'missing',
      },
      document: accepted,
    })).resolves.toEqual(expect.objectContaining({ accepted: false, code: 'scope_violation' }))
  })
})
