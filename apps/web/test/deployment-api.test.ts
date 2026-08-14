import { describe, expect, it, vi } from 'vitest'

import { createDeploymentHandlers } from '../lib/server/deployment-api'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const connectionId = '44444444-4444-4444-8444-444444444444'
const deploymentId = '55555555-5555-4555-8555-555555555555'
const requestId = '66666666-6666-4666-8666-666666666666'
const userId = '77777777-7777-4777-8777-777777777777'
const route = { params: Promise.resolve({ projectId }) }
const queued = {
  id: deploymentId, projectId, workspaceId, revisionId, provider: 'vercel' as const,
  target: 'preview' as const, status: 'queued' as const, url: null, errorCode: null,
  leadFormsLive: false,
  createdAt: new Date('2026-07-22T12:00:00.000Z'), updatedAt: new Date('2026-07-22T12:00:00.000Z'),
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    trustedOrigin: 'http://localhost:3000',
    getSession: vi.fn().mockResolvedValue({ userId }),
    findMembership: vi.fn().mockResolvedValue({ userId, workspaceId, role: 'owner' as const }),
    findProject: vi.fn().mockResolvedValue({ id: projectId, workspaceId }),
    findRevision: vi.fn().mockResolvedValue({ id: revisionId, projectId }),
    findConnection: vi.fn().mockResolvedValue({ id: connectionId, status: 'connected' as const }),
    admission: { acquire: vi.fn().mockResolvedValue({ accepted: true as const }) },
    deployments: {
      create: vi.fn().mockResolvedValue({ created: true, deployment: queued }),
      list: vi.fn().mockResolvedValue([queued]),
      findById: vi.fn().mockResolvedValue(queued),
      disableLeadForms: vi.fn().mockResolvedValue({
        ...queued,
        status: 'ready',
        url: 'https://zenui-test.vercel.app',
        leadFormsLive: false,
      }),
      fail: vi.fn().mockResolvedValue({ ...queued, status: 'failed', errorCode: 'queue_unavailable' }),
    },
    queue: { enqueue: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  }
}

function post(body: unknown, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000/api/v1/projects/${projectId}/deployments`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

const createBody = { workspaceId, revisionId, requestId, target: 'preview', confirmed: true }

describe('deployment API', () => {
  it('enforces Origin before side effects and queues one explicit revision deployment', async () => {
    const deps = dependencies()
    const denied = await createDeploymentHandlers(deps).POST(post(createBody, 'https://evil.test'), route)
    expect(denied.status).toBe(403)
    expect(deps.getSession).not.toHaveBeenCalled()
    expect(deps.deployments.create).not.toHaveBeenCalled()

    const accepted = await createDeploymentHandlers(deps).POST(post(createBody), route)
    expect(accepted.status).toBe(202)
    expect(accepted.headers.get('location')).toContain(deploymentId)
    expect(deps.deployments.create).toHaveBeenCalledWith(expect.any(Object), projectId, {
      revisionId, connectionId, requestId, target: 'preview',
    })
    expect(deps.queue.enqueue).toHaveBeenCalledWith({ deploymentId, projectId, workspaceId, userId })
  })

  it('requires confirmation, owner permission, valid revision and active connection', async () => {
    expect((await createDeploymentHandlers(dependencies()).POST(post({ ...createBody, confirmed: false }), route)).status).toBe(422)
    expect((await createDeploymentHandlers(dependencies({
      findMembership: vi.fn().mockResolvedValue({ userId, workspaceId, role: 'editor' }),
    })).POST(post(createBody), route)).status).toBe(403)
    expect((await createDeploymentHandlers(dependencies({ findRevision: vi.fn().mockResolvedValue(null) })).POST(post(createBody), route)).status).toBe(404)
    expect((await createDeploymentHandlers(dependencies({ findConnection: vi.fn().mockResolvedValue(null) })).POST(post(createBody), route)).status).toBe(409)
  })

  it('does not enqueue idempotent duplicates and returns safe rate/queue errors', async () => {
    const duplicate = dependencies({ deployments: {
      create: vi.fn().mockResolvedValue({ created: false, deployment: queued }),
      list: vi.fn(), findById: vi.fn(), disableLeadForms: vi.fn(), fail: vi.fn(),
    } })
    expect((await createDeploymentHandlers(duplicate).POST(post(createBody), route)).status).toBe(202)
    expect(duplicate.queue.enqueue).not.toHaveBeenCalled()

    const limited = await createDeploymentHandlers(dependencies({
      admission: { acquire: vi.fn().mockResolvedValue({ accepted: false, retryAfterSeconds: 30 }) },
    })).POST(post(createBody), route)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')

    const failed = dependencies({ queue: { enqueue: vi.fn().mockRejectedValue(new Error('provider-secret')) } })
    const response = await createDeploymentHandlers(failed).POST(post(createBody), route)
    expect(response.status).toBe(503)
    expect(failed.deployments.fail).toHaveBeenCalledWith(expect.any(Object), deploymentId, 'queue_unavailable')
    expect(JSON.stringify(await response.json())).not.toContain('provider-secret')
  })

  it('disables live Deployment Lead Forms with exact Origin and project authorization', async () => {
    const deps = dependencies()
    const handlers = createDeploymentHandlers(deps)
    const request = new Request(
      `http://localhost/api/v1/projects/${projectId}/deployments/${deploymentId}/lead-forms?workspaceId=${workspaceId}`,
      { method: 'DELETE', headers: { origin: 'http://localhost:3000' } },
    )
    const response = await handlers.DELETE_LEAD_FORMS(request, {
      params: Promise.resolve({ projectId, deploymentId }),
    })
    expect(response.status).toBe(200)
    expect(deps.deployments.disableLeadForms).toHaveBeenCalledWith(
      { userId, workspaceId },
      projectId,
      deploymentId,
    )
    expect(await response.json()).toMatchObject({
      data: { id: deploymentId, leadFormsLive: false },
    })

    const denied = await handlers.DELETE_LEAD_FORMS(new Request(request.url, {
      method: 'DELETE',
      headers: { origin: 'https://evil.test' },
    }), {
      params: Promise.resolve({ projectId, deploymentId }),
    })
    expect(denied.status).toBe(403)
  })

  it('denies viewer and cross-project Deployment Lead Form management', async () => {
    const request = new Request(
      `http://localhost/api?workspaceId=${workspaceId}`,
      { method: 'DELETE', headers: { origin: 'http://localhost:3000' } },
    )
    const viewer = dependencies({
      findMembership: vi.fn().mockResolvedValue({
        userId, workspaceId, role: 'viewer',
      }),
    })
    expect((await createDeploymentHandlers(viewer).DELETE_LEAD_FORMS(
      request,
      { params: Promise.resolve({ projectId, deploymentId }) },
    )).status).toBe(403)
    expect(viewer.deployments.disableLeadForms).not.toHaveBeenCalled()

    const crossProject = dependencies({
      findProject: vi.fn().mockResolvedValue(null),
    })
    expect((await createDeploymentHandlers(crossProject).DELETE_LEAD_FORMS(
      request,
      { params: Promise.resolve({ projectId, deploymentId }) },
    )).status).toBe(404)
    expect(crossProject.deployments.disableLeadForms).not.toHaveBeenCalled()
  })

  it('returns only redacted tenant-scoped list and item resources', async () => {
    const deps = dependencies()
    const handlers = createDeploymentHandlers(deps)
    const list = await handlers.GET_LIST(new Request(`http://localhost/api?workspaceId=${workspaceId}`), route)
    const listBody = await list.json()
    expect(list.status).toBe(200)
    expect(listBody.data).toHaveLength(1)
    expect(JSON.stringify(listBody)).not.toMatch(/workspaceId|projectId|providerDeploymentId|artifactKey|connectionId/i)

    const item = await handlers.GET_ITEM(new Request(`http://localhost/api?workspaceId=${workspaceId}`), {
      params: Promise.resolve({ projectId, deploymentId }),
    })
    expect(item.status).toBe(200)

    const hidden = await createDeploymentHandlers(dependencies({
      deployments: { create: vi.fn(), list: vi.fn(), findById: vi.fn().mockResolvedValue(null), fail: vi.fn() },
    })).GET_ITEM(new Request(`http://localhost/api?workspaceId=${workspaceId}`), {
      params: Promise.resolve({ projectId, deploymentId }),
    })
    expect(hidden.status).toBe(404)
  })
})
