import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  createGenerationCollectionHandlers,
  createGenerationEventsHandler,
  createGenerationItemHandler,
  type GenerationApiDependencies,
  type GenerationApiRun,
} from '../lib/server/generation-api'

const userId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const runId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const origin = 'http://localhost'

const run: GenerationApiRun = {
  id: runId,
  projectId,
  workspaceId,
  createdBy: userId,
  mode: 'generate',
  selectedNodeId: null,
  expectedVersion: 1,
  status: 'queued',
  provider: null,
  model: null,
  promptVersion: null,
  repairCount: 0,
  errorCode: null,
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  documentVersion: null,
  revisionId: null,
  createdAt: new Date('2026-07-22T00:00:00.000Z'),
  updatedAt: new Date('2026-07-22T00:00:00.000Z'),
}

function dependencies(overrides: Partial<GenerationApiDependencies> = {}): GenerationApiDependencies {
  return {
    trustedOrigin: origin,
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    findProject: () => Promise.resolve({
      id: projectId, workspaceId, name: 'AI project', status: 'active', version: 1,
      document: createValidDesignFixture(),
    }),
    admission: { acquire: () => Promise.resolve({ accepted: true }) },
    runs: {
      create: () => Promise.resolve(run),
      findById: () => Promise.resolve(run),
      list: () => Promise.resolve([run]),
      fail: () => Promise.resolve({ ...run, status: 'failed' }),
    },
    queue: { enqueue: () => Promise.resolve() },
    pollIntervalMs: 1,
    heartbeatMs: 10,
    ...overrides,
  }
}

function postBody(body: unknown, requestOrigin = origin): Request {
  return new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs`, {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  workspaceId,
  requestId,
  mode: 'generate',
  prompt: 'Create a focused SaaS landing page',
  expectedVersion: 1,
}

describe('generation API handlers', () => {
  it('queues one authorized generation run and reserves the bounded generate budget', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined)
    const acquire = vi.fn().mockResolvedValue({ accepted: true })
    const handlers = createGenerationCollectionHandlers(dependencies({ admission: { acquire }, queue: { enqueue } }))

    const response = await handlers.POST(postBody(validBody), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(202)
    expect(response.headers.get('Location')).toBe(`/api/v1/projects/${projectId}/generation-runs/${runId}`)
    await expect(response.json()).resolves.toMatchObject({
      data: { ...run, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() },
    })
    expect(acquire).toHaveBeenCalledWith({ userId, workspaceId, reservedTokens: 12_000 })
    expect(enqueue).toHaveBeenCalledWith({ generationRunId: runId, userId, projectId, workspaceId })
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain(validBody.prompt)
  })

  it('rejects unsafe Origin before admission, repository and queue side effects', async () => {
    const acquire = vi.fn()
    const create = vi.fn()
    const enqueue = vi.fn()
    const handlers = createGenerationCollectionHandlers(dependencies({
      admission: { acquire },
      runs: { ...dependencies().runs, create },
      queue: { enqueue },
    }))

    const response = await handlers.POST(postBody(validBody, 'https://attacker.example'), {
      params: Promise.resolve({ projectId }),
    })

    expect(response.status).toBe(403)
    expect(acquire).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it.each([
    [{ ...validBody, prompt: '' }, 422],
    [{ ...validBody, mode: 'edit-selection' }, 422],
    [{ ...validBody, mode: 'generate', selectedNodeId: 'heading-1' }, 422],
    [{ ...validBody, expectedVersion: 2 }, 409],
  ])('rejects invalid or stale generation input', async (body, status) => {
    const response = await createGenerationCollectionHandlers(dependencies()).POST(postBody(body), {
      params: Promise.resolve({ projectId }),
    })
    expect(response.status).toBe(status)
  })

  it('returns safe auth, role and tenant errors', async () => {
    const context = { params: Promise.resolve({ projectId }) }
    const unauthorized = await createGenerationCollectionHandlers(dependencies({
      getSession: () => Promise.resolve(null),
    })).POST(postBody(validBody), context)
    expect(unauthorized.status).toBe(401)

    const viewer = await createGenerationCollectionHandlers(dependencies({
      findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }),
    })).POST(postBody(validBody), context)
    expect(viewer.status).toBe(403)

    const hidden = await createGenerationCollectionHandlers(dependencies({
      findProject: () => Promise.resolve(null),
    })).POST(postBody(validBody), context)
    expect(hidden.status).toBe(404)
  })

  it('reserves the smaller edit budget for page edits', async () => {
    const acquire = vi.fn().mockResolvedValue({ accepted: true })
    const response = await createGenerationCollectionHandlers(dependencies({
      admission: { acquire },
      runs: { ...dependencies().runs, create: () => Promise.resolve({ ...run, mode: 'edit-page' }) },
    })).POST(postBody({ ...validBody, mode: 'edit-page' }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(202)
    expect(acquire).toHaveBeenCalledWith({ userId, workspaceId, reservedTokens: 8_000 })
  })

  it('returns 429 with Retry-After when user or workspace admission is exhausted', async () => {
    const response = await createGenerationCollectionHandlers(dependencies({
      admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 42, code: 'ai_rate_limit_exceeded' }) },
    })).POST(postBody(validBody), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    await expect(response.json()).resolves.toEqual({
      error: { code: 'ai_rate_limit_exceeded', message: 'AI request limit exceeded' },
    })
  })

  it('marks a queued run failed when enqueueing is unavailable', async () => {
    const fail = vi.fn().mockResolvedValue({ ...run, status: 'failed' })
    const response = await createGenerationCollectionHandlers(dependencies({
      queue: { enqueue: () => Promise.reject(new Error('redis credentials and internal stack')) },
      runs: { ...dependencies().runs, fail },
    })).POST(postBody(validBody), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'queue_unavailable', message: 'AI generation is temporarily unavailable' },
    })
    expect(fail).toHaveBeenCalledWith(expect.anything(), runId, expect.objectContaining({ errorCode: 'queue_unavailable' }))
  })

  it('lists and reads only tenant-scoped run metadata without prompt or raw output', async () => {
    const collection = createGenerationCollectionHandlers(dependencies())
    const listed = await collection.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs?workspaceId=${workspaceId}&limit=10`),
      { params: Promise.resolve({ projectId }) },
    )
    expect(listed.status).toBe(200)
    const listBody = await listed.json()
    expect(listBody.data[0]).not.toHaveProperty('prompt')
    expect(listBody.data[0]).not.toHaveProperty('rawOutput')

    const item = createGenerationItemHandler(dependencies())
    const read = await item(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs/${runId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )
    expect(read.status).toBe(200)
    await expect(read.json()).resolves.toMatchObject({
      data: { ...run, createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString() },
    })

    const missing = await createGenerationItemHandler(dependencies({
      runs: { ...dependencies().runs, findById: () => Promise.resolve(null) },
    }))(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs/${runId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )
    expect(missing.status).toBe(404)
  })

  it('rejects malformed list/item queries and run-project mismatches', async () => {
    const collection = createGenerationCollectionHandlers(dependencies())
    expect((await collection.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs?workspaceId=bad&limit=1000`),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(422)
    expect((await createGenerationItemHandler(dependencies({
      runs: { ...dependencies().runs, findById: () => Promise.resolve({ ...run, projectId: crypto.randomUUID() }) },
    }))(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs/${runId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )).status).toBe(404)
  })

  it('validates selected nodes and maps budget admission failures', async () => {
    const context = { params: Promise.resolve({ projectId }) }
    const missingNode = await createGenerationCollectionHandlers(dependencies()).POST(postBody({
      ...validBody, mode: 'edit-selection', selectedNodeId: 'missing',
    }), context)
    expect(missingNode.status).toBe(422)

    const budget = await createGenerationCollectionHandlers(dependencies({
      admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 60, code: 'ai_budget_exceeded' }) },
    })).POST(postBody(validBody), context)
    expect(budget.status).toBe(429)
    await expect(budget.json()).resolves.toMatchObject({ error: { code: 'ai_budget_exceeded' } })
  })

  it('returns a terminal initial SSE event without polling again', async () => {
    const findById = vi.fn().mockResolvedValue({ ...run, status: 'failed', errorCode: 'provider_error' })
    const response = await createGenerationEventsHandler(dependencies({
      runs: { ...dependencies().runs, findById },
    }))(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs/${runId}/events?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )
    expect(await response.text()).toContain('"status":"failed"')
    expect(findById).toHaveBeenCalledOnce()
  })

  it('streams validated durable status events and closes at a terminal state', async () => {
    let polls = 0
    const handler = createGenerationEventsHandler(dependencies({
      runs: {
        ...dependencies().runs,
        findById: () => {
          polls += 1
          return Promise.resolve(polls === 1 ? run : {
            ...run,
            status: 'completed',
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
            documentVersion: 2,
            revisionId: '66666666-6666-4666-8666-666666666666',
          })
        },
      },
    }))

    const response = await handler(
      new Request(`http://localhost/api/v1/projects/${projectId}/generation-runs/${runId}/events?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, runId }) },
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('"status":"queued"')
    expect(text).toContain('"status":"completed"')
    expect(text).not.toContain('prompt')
  })
})
