import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createUsageHandlers } from '../lib/server/usage-api'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const projectId = '11111111-1111-4111-8111-111111111111'
const itemId = '44444444-4444-4444-8444-444444444444'
const report = {
  range: {
    days: 30,
    timezone: 'UTC',
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-08-18T08:00:00.000Z',
  },
  totals: {
    todayTokens: 30,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    pricedEstimatedMicroUsd: 53,
    unpricedCount: 0,
    currency: 'USD' as const,
  },
  series: [{
    date: '2026-08-18',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
  }],
  items: [{
    id: itemId,
    projectId,
    projectName: 'Landing page',
    provider: 'google-gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    text: {
      provider: 'google-gemini',
      model: 'gemini-2.5-flash',
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      pricing: {
        status: 'priced' as const,
        pricingVersion: 'google-gemini-2026-08-13',
        inputRateMicroUsdPerMillion: 300_000,
        outputRateMicroUsdPerMillion: 2_500_000,
        inputEstimatedMicroUsd: 3,
        outputEstimatedMicroUsd: 50,
        totalEstimatedMicroUsd: 53,
        currency: 'USD' as const,
      },
    },
    textPricing: {
      status: 'priced' as const,
      pricingVersion: 'google-gemini-2026-08-13',
      inputRateMicroUsdPerMillion: 300_000,
      outputRateMicroUsdPerMillion: 2_500_000,
      inputEstimatedMicroUsd: 3,
      outputEstimatedMicroUsd: 50,
      totalEstimatedMicroUsd: 53,
      currency: 'USD' as const,
    },
    image: null,
    stockCount: 0,
    pricing: {
      status: 'priced' as const,
      totalEstimatedMicroUsd: 53,
      currency: 'USD' as const,
    },
    createdAt: '2026-08-18T08:00:00.000Z',
  }],
  page: 1,
  pageSize: 25,
  total: 1,
  totalPages: 1,
}

function dependencies() {
  return {
    getSession: vi.fn().mockResolvedValue({ userId }),
    access: {
      findMembership: vi.fn().mockResolvedValue({
        userId,
        workspaceId,
        role: 'owner' as const,
      }),
      projectBelongsToWorkspace: vi.fn().mockResolvedValue(true),
    },
    usage: {
      report: vi.fn().mockResolvedValue(report),
    },
    now: () => new Date('2026-08-18T08:00:00.000Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AI Usage API', () => {
  it('hard-binds usage to the authenticated user and validates filters', async () => {
    const deps = dependencies()
    const response = await createUsageHandlers(deps).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage?days=30&projectId=${projectId}&timezone=Asia%2FHo_Chi_Minh&page=1&pageSize=25`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )

    expect(response.status).toBe(200)
    expect(deps.usage.report).toHaveBeenCalledWith(
      { userId, workspaceId },
      {
        days: 30,
        projectId,
        timezone: 'Asia/Ho_Chi_Minh',
        page: 1,
        pageSize: 25,
      },
      new Date('2026-08-18T08:00:00.000Z'),
    )
    expect(await response.json()).toEqual({ data: report })
  })

  it('rejects client user IDs and invalid query bounds', async () => {
    const deps = dependencies()
    const userResponse = await createUsageHandlers(deps).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage?userId=${crypto.randomUUID()}`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )
    const daysResponse = await createUsageHandlers(deps).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage?days=91`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )

    expect(userResponse.status).toBe(422)
    expect(daysResponse.status).toBe(422)
    expect(deps.usage.report).not.toHaveBeenCalled()
  })

  it('requires membership and hides cross-workspace projects', async () => {
    const missing = dependencies()
    missing.access.findMembership.mockResolvedValue(null)
    const missingResponse = await createUsageHandlers(missing).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )
    const foreign = dependencies()
    foreign.access.projectBelongsToWorkspace.mockResolvedValue(false)
    const foreignResponse = await createUsageHandlers(foreign).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage?projectId=${projectId}`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )

    expect(missingResponse.status).toBe(404)
    expect(foreignResponse.status).toBe(404)
    expect(missing.usage.report).not.toHaveBeenCalled()
    expect(foreign.usage.report).not.toHaveBeenCalled()
  })

  it('returns safe unauthorized and sanitized repository errors', async () => {
    const unauthorized = dependencies()
    unauthorized.getSession.mockResolvedValue(null)
    const unauthorizedResponse = await createUsageHandlers(
      unauthorized,
    ).GET(new Request(
      `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage`,
    ), { params: Promise.resolve({ workspaceId }) })
    const failed = dependencies()
    failed.usage.report.mockRejectedValue(
      new Error('postgresql-password-secret'),
    )
    const failedResponse = await createUsageHandlers(failed).GET(
      new Request(
        `http://localhost:3000/api/v1/workspaces/${workspaceId}/ai-usage`,
      ),
      { params: Promise.resolve({ workspaceId }) },
    )

    expect(unauthorizedResponse.status).toBe(401)
    expect(failedResponse.status).toBe(500)
    expect(JSON.stringify(await failedResponse.json()))
      .not.toContain('postgresql-password-secret')
  })
})
