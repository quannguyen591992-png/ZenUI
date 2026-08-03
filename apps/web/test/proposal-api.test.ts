import { deriveProposalScope } from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  createProposalActionHandler,
  createProposalCollectionHandlers,
  createProposalEventsHandler,
  createProposalItemHandler,
  type ProposalApiDependencies,
  type ProposalApiRun,
} from '../lib/server/proposal-api'

const userId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const proposalId = '44444444-4444-4444-8444-444444444444'
const origin = 'http://localhost'
const document = createValidDesignFixture()
document.projectId = projectId
const scope = deriveProposalScope(document, 'heading-1')!

const run: ProposalApiRun = {
  id: proposalId,
  projectId,
  expectedVersion: 1,
  status: 'preparing',
  action: 'request',
  scope,
  summary: null,
  proposedDocument: null,
  errorCode: null,
  createdAt: new Date('2026-07-28T00:00:00.000Z'),
  updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

function dependencies(overrides: Partial<ProposalApiDependencies> = {}): ProposalApiDependencies {
  return {
    trustedOrigin: origin,
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Project', status: 'active', version: 1, document }),
    admission: { acquire: () => Promise.resolve({ accepted: true }) },
    proposals: {
      createProposal: () => Promise.resolve(run),
      findById: () => Promise.resolve(run),
      list: () => Promise.resolve([run]),
      acceptProposal: () => Promise.resolve({ accepted: true, version: 2, revisionId: crypto.randomUUID(), document: { ...document, version: 2 } }),
      discardProposal: () => Promise.resolve({ ...run, status: 'discarded' }),
      cancelProposal: () => Promise.resolve({ ...run, status: 'cancelled' }),
      fail: () => Promise.resolve(null),
    },
    queue: { enqueue: () => Promise.resolve() },
    pollIntervalMs: 1,
    heartbeatMs: 10,
    ...overrides,
  }
}

function request(body: unknown, requestOrigin = origin) {
  return new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals`, {
    method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

const body = {
  workspaceId, requestId: crypto.randomUUID(), action: 'request',
  prompt: 'Make this heading clearer', expectedVersion: 1, selectedNodeId: 'heading-1',
}

describe('proposal API', () => {
  it('derives server-owned scope, reserves budget and queues local IDs only', async () => {
    const createProposal = vi.fn().mockResolvedValue(run)
    const enqueue = vi.fn().mockResolvedValue(undefined)
    const acquire = vi.fn().mockResolvedValue({ accepted: true })
    const handlers = createProposalCollectionHandlers(dependencies({
      admission: { acquire }, queue: { enqueue },
      proposals: { ...dependencies().proposals, createProposal },
    }))

    const response = await handlers.POST(request(body), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(202)
    expect(createProposal).toHaveBeenCalledWith(expect.anything(), projectId, expect.objectContaining({
      scope, selectedNodeId: 'heading-1', action: 'request',
    }))
    expect(acquire).toHaveBeenCalledWith({ userId, workspaceId, reservedTokens: 8_000 })
    expect(enqueue).toHaveBeenCalledWith({ generationRunId: proposalId, projectId, workspaceId, userId })
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain(body.prompt)
  })

  it('rejects browser-authored scope, stale versions and foreign origins before side effects', async () => {
    const createProposal = vi.fn()
    const enqueue = vi.fn()
    const handlers = createProposalCollectionHandlers(dependencies({
      proposals: { ...dependencies().proposals, createProposal }, queue: { enqueue },
    }))
    expect((await handlers.POST(request({ ...body, scope }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
    expect((await handlers.POST(request(body, 'https://evil.test'), { params: Promise.resolve({ projectId }) })).status).toBe(403)
    expect((await createProposalCollectionHandlers(dependencies({
      findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Project', status: 'active', version: 2, document: { ...document, version: 2 } }),
    })).POST(request(body), { params: Promise.resolve({ projectId }) })).status).toBe(409)
    expect(createProposal).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('accepts and discards through explicit exact-origin actions only', async () => {
    const acceptProposal = vi.fn().mockResolvedValue({ accepted: true, version: 2, revisionId: crypto.randomUUID(), document: { ...document, version: 2 } })
    const discardProposal = vi.fn().mockResolvedValue({ ...run, status: 'discarded' })
    const deps = dependencies({ proposals: { ...dependencies().proposals, acceptProposal, discardProposal } })

    const accept = await createProposalActionHandler(deps, 'accept')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(accept.status).toBe(200)
    expect(acceptProposal).toHaveBeenCalledWith({ userId, workspaceId }, projectId, proposalId)

    const discard = await createProposalActionHandler(deps, 'discard')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(discard.status).toBe(200)
    expect(discardProposal).toHaveBeenCalledWith({ userId, workspaceId }, proposalId)
  })

  it('validates collection queries and server-owned scope before queueing', async () => {
    const handlers = createProposalCollectionHandlers(dependencies())
    expect((await handlers.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=invalid&limit=999`),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(422)

    const missingScopeDocument = structuredClone(document)
    delete missingScopeDocument.nodes['heading-1']
    expect((await createProposalCollectionHandlers(dependencies({
      findProject: () => Promise.resolve({
        id: projectId, workspaceId, name: 'Project', status: 'active', version: 1, document: missingScopeDocument,
      }),
    })).POST(request(body), { params: Promise.resolve({ projectId }) })).status).toBe(422)
  })

  it('requires authenticated workspace membership and hides missing projects', async () => {
    const handlers = createProposalCollectionHandlers(dependencies({ getSession: () => Promise.resolve(null) }))
    expect((await handlers.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(401)

    expect((await createProposalCollectionHandlers(dependencies({ findMembership: () => Promise.resolve(null) })).GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(404)
    expect((await createProposalCollectionHandlers(dependencies({
      findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }),
    })).POST(request(body), { params: Promise.resolve({ projectId }) })).status).toBe(403)
    expect((await createProposalCollectionHandlers(dependencies({ findProject: () => Promise.resolve(null) })).GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(404)
  })

  it('supports item lookup and closes status events for a ready proposal', async () => {
    const ready = { ...run, status: 'ready' as const, summary: 'Improved heading', proposedDocument: { ...document, version: 2 } }
    const deps = dependencies({ proposals: { ...dependencies().proposals, findById: () => Promise.resolve(ready) } })
    const item = await createProposalItemHandler(deps)(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(item.status).toBe(200)
    expect((await item.json()).data).toMatchObject({ id: proposalId, status: 'ready' })

    const events = await createProposalEventsHandler(deps)(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}/events?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(events.status).toBe(200)
    expect(events.headers.get('content-type')).toContain('text/event-stream')
    expect(await events.text()).toContain('event: status')

    const missing = dependencies({ proposals: { ...dependencies().proposals, findById: () => Promise.resolve(null) } })
    expect((await createProposalItemHandler(missing)(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )).status).toBe(404)
    expect((await createProposalEventsHandler(missing)(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}/events?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )).status).toBe(404)
  })

  it('streams a preparing proposal until its terminal ready update', async () => {
    const ready = { ...run, status: 'ready' as const, summary: 'Ready now', proposedDocument: { ...document, version: 2 } }
    let reads = 0
    const deps = dependencies({
      proposals: {
        ...dependencies().proposals,
        findById: () => Promise.resolve(reads++ === 0 ? run : ready),
      },
    })
    const response = await createProposalEventsHandler(deps)(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}/events?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )
    const stream = await response.text()
    expect(stream.match(/event: status/g)).toHaveLength(2)
    expect(stream).toContain('"status":"preparing"')
    expect(stream).toContain('"status":"ready"')
  })

  it('validates item, event and action inputs before repository mutations', async () => {
    const invalidItem = await createProposalItemHandler(dependencies())(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}?workspaceId=invalid`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(invalidItem.status).toBe(422)
    const invalidEvents = await createProposalEventsHandler(dependencies())(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals/${proposalId}/events?workspaceId=invalid`),
      { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(invalidEvents.status).toBe(422)
    const invalidAction = await createProposalActionHandler(dependencies(), 'discard')(
      request({ workspaceId, extra: true }), { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(invalidAction.status).toBe(422)
    const foreignAction = await createProposalActionHandler(dependencies(), 'cancel')(
      request({ workspaceId }, 'https://evil.test'), { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(foreignAction.status).toBe(403)
  })

  it('handles admission, replacement and queue failures without unsafe side effects', async () => {
    const limited = createProposalCollectionHandlers(dependencies({
      admission: { acquire: () => Promise.resolve({ accepted: false, code: 'ai_rate_limit_exceeded', retryAfterSeconds: 9 }) },
    }))
    const limitedResponse = await limited.POST(request(body), { params: Promise.resolve({ projectId }) })
    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('retry-after')).toBe('9')

    const ready = { ...run, status: 'ready' as const }
    const replacementCreate = vi.fn().mockResolvedValue({ ...run, action: 'try-another' as const })
    const replacement = createProposalCollectionHandlers(dependencies({
      proposals: { ...dependencies().proposals, findById: () => Promise.resolve(ready), createProposal: replacementCreate },
    }))
    const replacementResponse = await replacement.POST(request({
      workspaceId, requestId: crypto.randomUUID(), action: 'try-another', expectedVersion: 1,
      selectedNodeId: 'heading-1', previousProposalId: proposalId,
    }), { params: Promise.resolve({ projectId }) })
    expect(replacementResponse.status).toBe(202)
    expect(replacementCreate).toHaveBeenCalledWith(expect.anything(), projectId, expect.objectContaining({
      prompt: 'Prepare another bounded option for the same request and scope', previousProposalId: proposalId,
    }))
    const invalidPrevious = createProposalCollectionHandlers(dependencies({
      proposals: { ...dependencies().proposals, findById: () => Promise.resolve(null) },
    }))
    expect((await invalidPrevious.POST(request({
      workspaceId, requestId: crypto.randomUUID(), action: 'try-another', expectedVersion: 1,
      selectedNodeId: 'heading-1', previousProposalId: proposalId,
    }), { params: Promise.resolve({ projectId }) })).status).toBe(409)

    const fail = vi.fn().mockResolvedValue(null)
    const unavailable = createProposalCollectionHandlers(dependencies({
      queue: { enqueue: () => Promise.reject(new Error('offline')) },
      proposals: { ...dependencies().proposals, fail },
    }))
    expect((await unavailable.POST(request(body), { params: Promise.resolve({ projectId }) })).status).toBe(503)
    expect(fail).toHaveBeenCalledWith(expect.anything(), proposalId, expect.objectContaining({ errorCode: 'queue_unavailable' }))
  })

  it('routes media language only when the server verifies an exact image target', async () => {
    const mediaDocument = structuredClone(document)
    mediaDocument.nodes['image-1']!.props = {
      assetId: '66666666-6666-4666-8666-666666666666', alt: 'Current image', decorative: false,
    }
    const createProposal = vi.fn().mockResolvedValue({
      ...run,
      intent: 'replace-media' as const,
      scope: deriveProposalScope(mediaDocument, 'image-1')!,
    })
    const handlers = createProposalCollectionHandlers(dependencies({
      findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Project', status: 'active', version: 1, document: mediaDocument }),
      proposals: { ...dependencies().proposals, createProposal },
    }))
    const response = await handlers.POST(request({
      ...body,
      prompt: 'Đổi hình cho giống nội dung trang hơn',
      selectedNodeId: 'image-1',
    }), { params: Promise.resolve({ projectId }) })
    expect(response.status).toBe(202)
    expect(createProposal).toHaveBeenCalledWith(expect.anything(), projectId, expect.objectContaining({
      intent: 'replace-media', selectedNodeId: 'image-1',
      scope: expect.objectContaining({ kind: 'element', rootNodeId: 'image-1' }),
    }))

    expect((await handlers.POST(request({
      ...body,
      prompt: 'Đổi hình cho phù hợp',
      selectedNodeId: 'section-1',
      intent: 'replace-media',
    }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
  })

  it('accepts only server-captured section Remix intent and forwards bounded allowed changes', async () => {
    const createProposal = vi.fn().mockResolvedValue({ ...run, intent: 'remix-section' as const })
    const handlers = createProposalCollectionHandlers(dependencies({
      proposals: { ...dependencies().proposals, createProposal },
    }))
    const response = await handlers.POST(request({
      ...body,
      intent: 'remix-section',
      allowedChanges: [],
      selectedNodeId: 'section-1',
    }), { params: Promise.resolve({ projectId }) })
    expect(response.status).toBe(202)
    expect(createProposal).toHaveBeenCalledWith(expect.anything(), projectId, expect.objectContaining({
      intent: 'remix-section', allowedChanges: [],
      scope: expect.objectContaining({ kind: 'section', rootNodeId: 'section-1' }),
    }))

    expect((await handlers.POST(request({
      ...body,
      intent: 'remix-section',
      allowedChanges: [],
      selectedNodeId: 'heading-1',
    }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
    expect((await handlers.POST(request({
      ...body,
      intent: 'remix-section',
      allowedChanges: ['forged'],
      selectedNodeId: 'section-1',
    }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
  })

  it('filters non-proposal generation rows from public collection results', async () => {
    const legacy = {
      id: crypto.randomUUID(), projectId, expectedVersion: 1,
      delivery: 'apply' as const, proposalAction: null, proposalStatus: null,
      scope: null, proposedDocument: null, proposalSummary: null, errorCode: null,
      createdAt: new Date(), updatedAt: new Date(),
    }
    const handlers = createProposalCollectionHandlers(dependencies({
      proposals: { ...dependencies().proposals, list: () => Promise.resolve([legacy, run]) },
    }))
    const response = await handlers.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )
    expect((await response.json()).data).toEqual([expect.objectContaining({ id: proposalId })])
  })

  it('maps stale acceptance safely and never returns prompt, commands or provider details', async () => {
    const ready = { ...run, status: 'ready' as const, summary: 'Improved heading', proposedDocument: { ...document, version: 2 } }
    const handlers = createProposalCollectionHandlers(dependencies({ proposals: { ...dependencies().proposals, list: () => Promise.resolve([ready]) } }))
    const listed = await handlers.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/ai-proposals?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )
    const responseBody = await listed.json()
    expect(responseBody.data[0]).toMatchObject({ status: 'ready', summary: 'Improved heading' })
    expect(responseBody.data[0]).not.toHaveProperty('prompt')
    expect(responseBody.data[0]).not.toHaveProperty('commands')
    expect(responseBody.data[0]).not.toHaveProperty('provider')

    const stale = await createProposalActionHandler(dependencies({
      proposals: { ...dependencies().proposals, acceptProposal: () => Promise.resolve({ accepted: false, code: 'stale_document_version' }) },
    }), 'accept')(request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) })
    expect(stale.status).toBe(409)

    const notReady = await createProposalActionHandler(dependencies({
      proposals: { ...dependencies().proposals, acceptProposal: () => Promise.resolve({ accepted: false, code: 'proposal_not_ready' }) },
    }), 'accept')(request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) })
    expect(notReady.status).toBe(409)

    const invalid = await createProposalActionHandler(dependencies({
      proposals: { ...dependencies().proposals, acceptProposal: () => Promise.resolve({ accepted: false, code: 'invalid_design_document' }) },
    }), 'accept')(request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) })
    expect(invalid.status).toBe(422)

    const cancelled = await createProposalActionHandler(dependencies(), 'cancel')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) },
    )
    expect(cancelled.status).toBe(200)
    expect((await cancelled.json()).data).toMatchObject({ status: 'cancelled' })

    const missingDiscard = await createProposalActionHandler(dependencies({
      proposals: { ...dependencies().proposals, discardProposal: () => Promise.resolve(null) },
    }), 'discard')(request({ workspaceId }), { params: Promise.resolve({ projectId, proposalId }) })
    expect(missingDiscard.status).toBe(404)
  })
})
