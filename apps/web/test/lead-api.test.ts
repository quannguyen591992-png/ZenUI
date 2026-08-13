import { workspaceMembers } from '@zenui/database'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/server/runtime-session', () => ({
  getRuntimeSession: vi.fn(),
}))

vi.mock('../lib/server/database', () => ({
  getDatabase: vi.fn(() => ({})),
}))

import { createLeadHandlers } from '../lib/server/lead-api'
import { createLeadRouteDependencies } from '../lib/server/lead-route-dependencies'
import { createRuntimeLeadKeyring } from '../lib/server/runtime-lead-keyring'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const leadId = '44444444-4444-4444-8444-444444444444'
const receivedAt = new Date('2026-08-13T08:00:00.000Z')
const expiresAt = new Date('2026-11-11T08:00:00.000Z')

function summary(
  status: 'new' | 'contacted' = 'new',
  version = status === 'new' ? 1 : 2,
) {
  return {
    id: leadId,
    status,
    version,
    formTitle: 'Nhận tư vấn',
    receivedAt,
    expiresAt,
    contactedAt: status === 'contacted'
      ? new Date('2026-08-13T09:00:00.000Z')
      : null,
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const leads = {
    list: vi.fn().mockResolvedValue([summary()]),
    countNew: vi.fn().mockResolvedValue({ newCount: 1 }),
    findEncryptedById: vi.fn().mockResolvedValue({
      summary: summary(),
      envelope: {
        ciphertext: 'ciphertext',
        iv: 'initialization-vector',
        authTag: 'authentication-tag',
        keyVersion: 1,
      },
      context: {
        workspaceId,
        projectId,
        shareLinkId: '55555555-5555-4555-8555-555555555555',
        revisionId: '66666666-6666-4666-8666-666666666666',
        formNodeId: 'lead-form-1',
        leadId,
      },
    }),
    markContacted: vi.fn().mockResolvedValue({
      accepted: true,
      lead: summary('contacted'),
    }),
  }
  const keyring = {
    decrypt: vi.fn().mockReturnValue({
      formTitle: 'Nhận tư vấn',
      fields: [{
        key: 'email',
        type: 'email',
        label: 'Email',
        value: 'visitor@example.test',
      }],
    }),
  }
  return {
    trustedOrigin: 'http://localhost:3000',
    getSession: () => Promise.resolve({ userId }),
    access: {
      findMembership: () => Promise.resolve({
        userId,
        workspaceId,
        role: 'owner' as const,
      }),
      projectBelongsToWorkspace: () => Promise.resolve(true),
    },
    leads,
    keyring,
    ...overrides,
  }
}

function getRequest(path = '') {
  return new Request(
    `http://localhost:3000/api/v1/projects/${projectId}/leads${path}?workspaceId=${workspaceId}`,
  )
}

function patchRequest(body: unknown, origin = 'http://localhost:3000') {
  return new Request(
    `http://localhost:3000/api/v1/projects/${projectId}/leads/${leadId}`,
    {
      method: 'PATCH',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

const projectRoute = {
  params: Promise.resolve({ projectId }),
}
const leadRoute = {
  params: Promise.resolve({ projectId, leadId }),
}

const environment = { ...process.env }

afterEach(() => {
  process.env = { ...environment }
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Customer Leads route dependencies', () => {
  it('fails closed when lead encryption keys are missing', () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'false'
    delete process.env.LEAD_ENCRYPTION_KEYS
    delete process.env.LEAD_ENCRYPTION_ACTIVE_KEY_VERSION

    expect(() => createLeadRouteDependencies()).toThrow(
      'LEAD_ENCRYPTION_KEYS is required',
    )
  })

  it('derives a stable isolated keyring in guarded local mode', () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.AUTH_SECRET = 'local-auth-secret-for-tests'
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'true'
    process.env.LEAD_ENCRYPTION_KEYS = 'invalid-local-placeholder'
    delete process.env.LEAD_ENCRYPTION_ACTIVE_KEY_VERSION

    const first = createRuntimeLeadKeyring()
    const second = createRuntimeLeadKeyring()
    const context = {
      workspaceId,
      projectId,
      shareLinkId: '55555555-5555-4555-8555-555555555555',
      revisionId: '66666666-6666-4666-8666-666666666666',
      formNodeId: 'lead-form-1',
      leadId,
    }
    const payload = {
      formTitle: 'Nhận tư vấn',
      fields: [{
        key: 'email',
        type: 'email' as const,
        label: 'Email',
        value: 'visitor@example.test',
      }],
    }

    const encrypted = first.encrypt(payload, context)

    expect(second.decrypt(encrypted, context)).toEqual(payload)
  })

  it.each([
    ['invalid JSON', '{'],
    ['non-object JSON', '[]'],
    ['non-string key value', '{"1":32}'],
  ])('rejects %s lead key configuration', (_, keys) => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'false'
    process.env.LEAD_ENCRYPTION_KEYS = keys
    process.env.LEAD_ENCRYPTION_ACTIVE_KEY_VERSION = '1'

    expect(() => createLeadRouteDependencies()).toThrow(
      'LEAD_ENCRYPTION_KEYS is invalid',
    )
  })

  it.each(['0', '1.5', '1000001'])(
    'rejects invalid active key version %s',
    version => {
      process.env.APP_ORIGIN = 'http://localhost:3000'
      process.env.ZENUI_E2E_ENABLED = 'false'
      process.env.ZENUI_LOCAL_AUTH_ENABLED = 'false'
      process.env.LEAD_ENCRYPTION_KEYS = JSON.stringify({
        1: Buffer.alloc(32, 9).toString('base64'),
      })
      process.env.LEAD_ENCRYPTION_ACTIVE_KEY_VERSION = version

      expect(() => createLeadRouteDependencies()).toThrow(
        'LEAD_ENCRYPTION_ACTIVE_KEY_VERSION is invalid',
      )
    },
  )

  it('uses the isolated deterministic keyring in E2E runtime', () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    vi.stubEnv('NODE_ENV', 'test')
    process.env.ZENUI_E2E_ENABLED = 'true'
    delete process.env.LEAD_ENCRYPTION_KEYS
    delete process.env.LEAD_ENCRYPTION_ACTIVE_KEY_VERSION

    const dependencies = createLeadRouteDependencies()

    expect(dependencies.trustedOrigin).toBe('http://localhost:3000')
    expect(dependencies.leads).toBeDefined()
    expect(dependencies.keyring).toBeDefined()
  })

  it('maps and safely misses workspace memberships', async () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    vi.stubEnv('NODE_ENV', 'test')
    process.env.ZENUI_E2E_ENABLED = 'true'
    const limit = vi.fn()
      .mockResolvedValueOnce([{ userId, workspaceId, role: 'editor' }])
      .mockResolvedValueOnce([])
    const database = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          expect(table).toBe(workspaceMembers)
          return {
            where: vi.fn(() => ({ limit })),
          }
        }),
      })),
    }
    const { getDatabase } = await import('../lib/server/database')
    vi.mocked(getDatabase).mockReturnValue(
      database as unknown as ReturnType<typeof getDatabase>,
    )
    const routeDependencies = createLeadRouteDependencies()

    await expect(routeDependencies.access.findMembership(
      userId,
      workspaceId,
    )).resolves.toEqual({ userId, workspaceId, role: 'editor' })
    await expect(routeDependencies.access.findMembership(
      userId,
      workspaceId,
    )).resolves.toBeNull()
  })
})

describe('Customer Leads API', () => {
  it('lists redacted summaries and returns a lightweight new count', async () => {
    const handlers = createLeadHandlers(dependencies())
    const listed = await handlers.GET_LIST(getRequest(), projectRoute)
    const count = await handlers.GET_COUNT(
      getRequest('/count'),
      projectRoute,
    )

    expect(listed.status).toBe(200)
    await expect(listed.json()).resolves.toEqual({ data: [{
      id: leadId,
      status: 'new',
      version: 1,
      formTitle: 'Nhận tư vấn',
      receivedAt: receivedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      contactedAt: null,
    }] })
    expect(count.status).toBe(200)
    await expect(count.json()).resolves.toEqual({
      data: { newCount: 1 },
    })
  })

  it('authorizes before decrypting and returns only safe detail fields', async () => {
    const deps = dependencies()
    const response = await createLeadHandlers(deps).GET_DETAIL(
      getRequest(`/${leadId}`),
      leadRoute,
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      data: {
        id: leadId,
        fields: [{
          key: 'email',
          label: 'Email',
          type: 'email',
          value: 'visitor@example.test',
        }],
      },
    })
    expect(body).not.toHaveProperty('data.ciphertext')
    expect(body).not.toHaveProperty('data.iv')
    expect(body).not.toHaveProperty('data.authTag')
    expect(body).not.toHaveProperty('data.keyVersion')
  })

  it('marks a lead contacted with exact Origin and optimistic version', async () => {
    const deps = dependencies()
    const response = await createLeadHandlers(deps).PATCH(
      patchRequest({ workspaceId, expectedVersion: 1 }),
      leadRoute,
    )

    expect(response.status).toBe(200)
    expect(deps.leads.markContacted).toHaveBeenCalledWith(
      { userId, workspaceId },
      projectId,
      leadId,
      1,
    )
    await expect(response.json()).resolves.toMatchObject({
      data: { status: 'contacted', version: 2 },
    })
  })

  it('denies viewer and cross-project access before reading lead data', async () => {
    const viewer = dependencies({
      access: {
        findMembership: () => Promise.resolve({
          userId,
          workspaceId,
          role: 'viewer' as const,
        }),
        projectBelongsToWorkspace: () => Promise.resolve(true),
      },
    })
    const viewerResponse = await createLeadHandlers(viewer).GET_LIST(
      getRequest(),
      projectRoute,
    )
    expect(viewerResponse.status).toBe(403)
    expect(viewer.leads.list).not.toHaveBeenCalled()

    const crossProject = dependencies({
      access: {
        findMembership: () => Promise.resolve({
          userId,
          workspaceId,
          role: 'owner' as const,
        }),
        projectBelongsToWorkspace: () => Promise.resolve(false),
      },
    })
    const crossProjectResponse = await createLeadHandlers(
      crossProject,
    ).GET_DETAIL(getRequest(`/${leadId}`), leadRoute)
    expect(crossProjectResponse.status).toBe(404)
    expect(crossProject.keyring.decrypt).not.toHaveBeenCalled()
  })

  it('returns safe origin, conflict and decrypt errors without crypto material', async () => {
    const wrongOrigin = await createLeadHandlers(dependencies()).PATCH(
      patchRequest(
        { workspaceId, expectedVersion: 1 },
        'https://evil.example.test',
      ),
      leadRoute,
    )
    expect(wrongOrigin.status).toBe(403)

    const conflict = await createLeadHandlers(dependencies({
      leads: {
        ...dependencies().leads,
        markContacted: vi.fn().mockResolvedValue({
          accepted: false,
          code: 'conflict',
        }),
      },
    })).PATCH(
      patchRequest({ workspaceId, expectedVersion: 1 }),
      leadRoute,
    )
    expect(conflict.status).toBe(409)

    const failedDecrypt = await createLeadHandlers(dependencies({
      keyring: {
        decrypt: vi.fn().mockImplementation(() => {
          throw new Error('lead_decryption_failed ciphertext')
        }),
      },
    })).GET_DETAIL(getRequest(`/${leadId}`), leadRoute)
    expect(failedDecrypt.status).toBe(500)
    const body = await failedDecrypt.text()
    expect(body).not.toContain('ciphertext')
    expect(body).not.toContain('lead_decryption_failed')
  })
})
