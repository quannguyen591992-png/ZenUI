import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  createBriefHandler,
  createDesignDirectionCollectionHandler,
  createDesignDirectionEventsHandler,
  createDesignDirectionItemHandler,
  createDirectionChooseHandler,
  type DesignDirectionApiDependencies,
} from '../lib/server/design-direction-api'

import type { MaterializedDesignDirection, WebsiteBrief } from '@zenui/ai-core'

const userId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const origin = 'http://localhost'

const brief: WebsiteBrief = {
  description: 'NovaFlow giúp các nhóm sản phẩm nhỏ lên kế hoạch ra mắt.',
  offer: 'Không gian lập kế hoạch ra mắt sản phẩm',
  audience: 'Nhóm sản phẩm nhỏ chuẩn bị lần ra mắt đầu tiên',
  primaryGoal: 'Nhận yêu cầu đặt lịch tư vấn phù hợp',
  cta: 'Đặt lịch tư vấn',
  tone: 'Rõ ràng, tự tin và hiện đại',
  brandDetails: '',
  mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}

const directions: MaterializedDesignDirection[] = [0, 1, 2].map(index => ({
  id: `direction-${index}`,
  name: `Hướng ${index + 1}`,
  character: 'Rõ ràng',
  rationale: 'Hỗ trợ mục tiêu trong bản mô tả.',
  contract: {
    themePreset: index === 0 ? 'indigo' : index === 1 ? 'emerald' : 'coral',
    mood: index === 1 ? 'friendly' : index === 2 ? 'bold' : 'confident',
    density: index === 0 ? 'balanced' : index === 1 ? 'airy' : 'compact',
    navbarVariant: index === 0 ? 'compact' : index === 1 ? 'centered' : 'announcement',
    heroVariant: index === 0 ? 'split' : index === 1 ? 'centered' : 'product-shot',
    featuresVariant: index === 0 ? 'grid' : index === 1 ? 'alternating' : 'bento',
    testimonialsVariant: index === 1 ? 'spotlight' : 'cards',
    faqVariant: index === 0 ? 'stacked' : 'two-column',
    finalCtaVariant: index === 1 ? 'split' : 'panel',
    footerVariant: index === 0 ? 'simple' : 'columns',
  },
  document: createValidDesignFixture(),
}))

const run = {
  id: runId,
  projectId,
  workspaceId,
  createdBy: userId,
  expectedVersion: 1,
  round: 0,
  status: 'completed' as const,
  provider: 'mock',
  model: 'mock-v1',
  promptVersion: 'directions-v1',
  errorCode: null,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  directions,
  selectedDirectionId: null,
  documentVersion: null,
  revisionId: null,
  createdAt: new Date('2026-07-27T00:00:00.000Z'),
  updatedAt: new Date('2026-07-27T00:00:01.000Z'),
}

function dependencies(overrides: Partial<DesignDirectionApiDependencies> = {}): DesignDirectionApiDependencies {
  return {
    trustedOrigin: origin,
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    findProject: () => Promise.resolve({
      id: projectId, workspaceId, name: 'NovaFlow', status: 'active', creationState: 'onboarding',
      version: 1, document: createValidDesignFixture(),
    }),
    admission: { acquire: () => Promise.resolve({ accepted: true }) },
    directions: {
      saveBrief: () => Promise.resolve(brief),
      loadBrief: () => Promise.resolve(brief),
      create: () => Promise.resolve({ ...run, status: 'queued', directions: null }),
      findById: () => Promise.resolve(run),
      cancel: () => Promise.resolve({ ...run, status: 'cancelled', directions: null }),
      supersede: () => Promise.resolve({ ...run, status: 'superseded', directions: null }),
      accept: () => Promise.resolve({
        accepted: true, version: 2, revisionId: crypto.randomUUID(), directionId: directions[0]!.id,
        document: directions[0]!.document,
      }),
      fail: () => Promise.resolve({ ...run, status: 'failed', directions: null }),
    },
    queue: { enqueue: () => Promise.resolve() },
    pollIntervalMs: 1,
    heartbeatMs: 10,
    ...overrides,
  }
}

function request(path: string, method: string, body?: unknown, requestOrigin = origin): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('Stage 5 design direction API', () => {
  it('reads and saves a validated editable brief with exact Origin and RBAC', async () => {
    const handler = createBriefHandler(dependencies())
    const context = { params: Promise.resolve({ projectId }) }
    const get = await handler.GET(new Request(`http://localhost/api/v1/projects/${projectId}/brief?workspaceId=${workspaceId}`), context)
    expect(get.status).toBe(200)
    await expect(get.json()).resolves.toMatchObject({ data: brief })

    const put = await handler.PUT(request(`/api/v1/projects/${projectId}/brief`, 'PUT', { workspaceId, brief }), context)
    expect(put.status).toBe(200)
    expect((await handler.PUT(request(`/api/v1/projects/${projectId}/brief`, 'PUT', { workspaceId, brief }, 'https://attacker.test'), context)).status).toBe(403)
  })

  it('queues one bounded run with local IDs only and one reserved model budget', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined)
    const acquire = vi.fn().mockResolvedValue({ accepted: true })
    const handler = createDesignDirectionCollectionHandler(dependencies({ admission: { acquire }, queue: { enqueue } }))
    const response = await handler.POST(request(`/api/v1/projects/${projectId}/design-direction-runs`, 'POST', {
      workspaceId, requestId, expectedVersion: 1, brief, round: 0,
    }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(202)
    expect(acquire).toHaveBeenCalledWith({ userId, workspaceId, reservedTokens: 12_000 })
    expect(enqueue).toHaveBeenCalledWith({ designDirectionRunId: runId, projectId, workspaceId, userId })
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain('NovaFlow')
  })

  it('rejects unsafe, invalid, stale, viewer and exhausted requests before queueing', async () => {
    const enqueue = vi.fn()
    const handler = (deps = dependencies({ queue: { enqueue } })) => createDesignDirectionCollectionHandler(deps)
    const context = { params: Promise.resolve({ projectId }) }
    const body = { workspaceId, requestId, expectedVersion: 1, brief, round: 0 }
    expect((await handler().POST(request('/x', 'POST', body, 'https://attacker.test'), context)).status).toBe(403)
    expect((await handler().POST(request('/x', 'POST', { ...body, brief: { ...brief, offer: '' } }), context)).status).toBe(422)
    expect((await handler(dependencies({ findProject: () => Promise.resolve({
      id: projectId, workspaceId, name: 'NovaFlow', status: 'active', creationState: 'onboarding',
      version: 2, document: createValidDesignFixture(),
    }) })).POST(request('/x', 'POST', body), context)).status).toBe(409)
    expect((await handler(dependencies({ findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }) })).POST(request('/x', 'POST', body), context)).status).toBe(403)
    expect((await handler(dependencies({ admission: { acquire: () => Promise.resolve({ accepted: false, code: 'ai_budget_exceeded', retryAfterSeconds: 60 }) } })).POST(request('/x', 'POST', body), context)).status).toBe(429)
  })

  it('redacts provider/usage details, cancels safely and streams terminal status', async () => {
    const item = createDesignDirectionItemHandler(dependencies())
    const context = { params: Promise.resolve({ projectId, runId }) }
    const get = await item.GET(new Request(`http://localhost/x?workspaceId=${workspaceId}`), context)
    const body = await get.json()
    expect(body.data.directions).toHaveLength(3)
    expect(body.data).not.toHaveProperty('provider')
    expect(body.data).not.toHaveProperty('usage')
    expect(body.data).not.toHaveProperty('promptVersion')

    const cancelled = await item.DELETE(request('/x', 'DELETE', { workspaceId }), context)
    expect(cancelled.status).toBe(200)
    const events = await createDesignDirectionEventsHandler(dependencies())(
      new Request(`http://localhost/x?workspaceId=${workspaceId}`), context,
    )
    expect(await events.text()).toContain('"status":"completed"')
  })

  it('chooses a server-owned direction idempotently without accepting browser documents', async () => {
    const accept = vi.fn().mockResolvedValue({
      accepted: true, version: 2, revisionId: crypto.randomUUID(), directionId: directions[0]!.id,
      document: directions[0]!.document,
    })
    const response = await createDirectionChooseHandler(dependencies({
      directions: { ...dependencies().directions, accept },
    }))(request('/x', 'POST', {
      workspaceId, directionId: directions[0]!.id, document: createValidDesignFixture(),
    }), { params: Promise.resolve({ projectId, runId }) })

    expect(response.status).toBe(422)
    expect(accept).not.toHaveBeenCalled()

    const valid = await createDirectionChooseHandler(dependencies({
      directions: { ...dependencies().directions, accept },
    }))(request('/x', 'POST', { workspaceId, directionId: directions[0]!.id }), {
      params: Promise.resolve({ projectId, runId }),
    })
    expect(valid.status).toBe(200)
    expect(accept).toHaveBeenCalledWith(expect.anything(), projectId, runId, directions[0]!.id)
  })

  it('marks a run failed when enqueueing is unavailable', async () => {
    const fail = vi.fn().mockResolvedValue({ ...run, status: 'failed', directions: null })
    const response = await createDesignDirectionCollectionHandler(dependencies({
      directions: { ...dependencies().directions, fail },
      queue: { enqueue: () => Promise.reject(new Error('redis internal')) },
    })).POST(request('/x', 'POST', {
      workspaceId, requestId, expectedVersion: 1, brief, round: 0,
    }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(503)
    expect(fail).toHaveBeenCalledWith(expect.anything(), runId, expect.objectContaining({ errorCode: 'queue_unavailable' }))
  })

  it('fails closed for malformed origins, missing auth, membership and projects', async () => {
    const context = { params: Promise.resolve({ projectId }) }
    const body = { workspaceId, requestId, expectedVersion: 1, brief, round: 0 }
    const handler = (overrides: Partial<DesignDirectionApiDependencies>) => (
      createDesignDirectionCollectionHandler(dependencies(overrides))
    )

    expect((await handler({ trustedOrigin: 'not a url' }).POST(request('/x', 'POST', body), context)).status).toBe(500)
    expect((await handler({ getSession: () => Promise.resolve(null) }).POST(request('/x', 'POST', body), context)).status).toBe(401)
    expect((await handler({ findMembership: () => Promise.resolve(null) }).POST(request('/x', 'POST', body), context)).status).toBe(404)
    expect((await handler({ findProject: () => Promise.resolve(null) }).POST(request('/x', 'POST', body), context)).status).toBe(404)
    expect((await handler({ findProject: () => Promise.resolve({
      id: projectId, workspaceId, name: 'Accepted', status: 'active', creationState: 'accepted',
      version: 1, document: createValidDesignFixture(),
    }) }).POST(request('/x', 'POST', body), context)).status).toBe(409)
    expect((await handler({}).POST(new Request('http://localhost/x', {
      method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), context)).status).toBe(403)
  })

  it('handles missing and non-cancellable run resources and choose errors', async () => {
    const context = { params: Promise.resolve({ projectId, runId }) }
    const missingDirections = { ...dependencies().directions, findById: () => Promise.resolve(null) }
    const item = createDesignDirectionItemHandler(dependencies({ directions: missingDirections }))
    expect((await item.GET(new Request(`http://localhost/x?workspaceId=${workspaceId}`), context)).status).toBe(404)
    expect((await item.DELETE(request('/x', 'DELETE', { workspaceId }), context)).status).toBe(404)

    const notCancellable = createDesignDirectionItemHandler(dependencies({
      directions: { ...dependencies().directions, cancel: () => Promise.resolve(null) },
    }))
    expect((await notCancellable.DELETE(request('/x', 'DELETE', { workspaceId }), context)).status).toBe(409)

    for (const [code, status] of [
      ['not_found', 404],
      ['stale_document_version', 409],
      ['direction_not_found', 422],
      ['run_not_selectable', 422],
      ['invalid_design_document', 422],
    ] as const) {
      const choose = createDirectionChooseHandler(dependencies({
        directions: {
          ...dependencies().directions,
          accept: () => Promise.resolve({ accepted: false, code }),
        },
      }))
      const response = await choose(request('/x', 'POST', { workspaceId, directionId: 'direction-0' }), context)
      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toMatchObject({ error: { code } })
    }

    const unexpected = createDirectionChooseHandler(dependencies({
      directions: {
        ...dependencies().directions,
        accept: () => Promise.reject(new Error('database internal')),
      },
    }))
    const unexpectedResponse = await unexpected(
      request('/x', 'POST', { workspaceId, directionId: 'direction-0' }),
      context,
    )
    expect(unexpectedResponse.status).toBe(500)
    await expect(unexpectedResponse.json()).resolves.toEqual({
      error: { code: 'internal_error', message: 'An unexpected error occurred' },
    })
  })

  it('polls non-terminal SSE runs, emits changes and heartbeats, then closes', async () => {
    let call = 0
    const queued = { ...run, status: 'queued' as const, directions: null }
    const running = { ...run, status: 'running' as const, directions: null }
    const completed = run
    const handler = createDesignDirectionEventsHandler(dependencies({
      heartbeatMs: 0,
      directions: {
        ...dependencies().directions,
        findById: () => Promise.resolve([queued, running, completed][Math.min(call++, 2)]!),
      },
    }))
    const response = await handler(
      new Request(`http://localhost/x?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )
    const text = await response.text()
    expect(text).toContain('"status":"queued"')
    expect(text).toContain('"status":"running"')
    expect(text).toContain('"status":"completed"')
    expect(text).toContain(': heartbeat')
  })
})
