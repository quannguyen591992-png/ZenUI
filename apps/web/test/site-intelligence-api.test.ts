import { analyzeSiteIntelligence, type WebsiteBrief } from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  createSiteIntelligenceFindingActionHandler,
  createSiteIntelligenceItemHandler,
  createSiteIntelligenceLatestHandler,
  createSiteIntelligenceReviewCollectionHandler,
  type SiteIntelligenceApiDependencies,
  type SiteIntelligenceApiReview,
} from '../lib/server/site-intelligence-api'

const userId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const reviewId = '44444444-4444-4444-8444-444444444444'
const origin = 'http://localhost'
const document = createValidDesignFixture()
document.projectId = projectId
const brief: WebsiteBrief = {
  description: 'A planning product', offer: 'Planning product', audience: 'small product teams',
  primaryGoal: 'book a consultation', cta: 'Book consultation', tone: 'clear', brandDetails: 'NovaFlow',
  mustHaveSections: ['introduction', 'benefits', 'contact'],
}
const analysis = analyzeSiteIntelligence({ document, brief })
const review: SiteIntelligenceApiReview = {
  id: reviewId, projectId, documentVersion: 1, policyVersion: analysis.policyVersion,
  analysis, dismissedFindingFingerprints: [], stale: false,
  createdAt: new Date('2026-07-28T00:00:00.000Z'), updatedAt: new Date('2026-07-28T00:00:00.000Z'),
}

function dependencies(overrides: Partial<SiteIntelligenceApiDependencies> = {}): SiteIntelligenceApiDependencies {
  return {
    trustedOrigin: origin,
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Project', status: 'active', version: 1, document }),
    loadBrief: () => Promise.resolve(brief),
    reviews: {
      create: () => Promise.resolve(review),
      findById: () => Promise.resolve(review),
      findLatest: () => Promise.resolve(review),
      dismiss: () => Promise.resolve({ findingFingerprint: analysis.findings[0]!.fingerprint, active: true }),
      restore: () => Promise.resolve({ findingFingerprint: analysis.findings[0]!.fingerprint, active: false }),
    },
    ...overrides,
  }
}

function request(body: unknown, requestOrigin = origin) {
  return new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews`, {
    method: 'POST', headers: { origin: requestOrigin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('site intelligence API', () => {
  it('derives analysis server-side and creates an idempotent version-bound review', async () => {
    const create = vi.fn().mockResolvedValue(review)
    const handler = createSiteIntelligenceReviewCollectionHandler(dependencies({
      reviews: { ...dependencies().reviews, create },
    }))
    const response = await handler.POST(request({
      workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1,
    }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith({ userId, workspaceId }, projectId, expect.objectContaining({
      expectedVersion: 1, analysis: expect.objectContaining({ policyVersion: 'site-intelligence-v1' }),
    }))
    expect((await response.json()).data).not.toHaveProperty('document')
  })

  it('rejects browser-authored analysis, foreign origins, stale versions and viewers', async () => {
    const handler = createSiteIntelligenceReviewCollectionHandler(dependencies())
    expect((await handler.POST(request({
      workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1, analysis,
    }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
    expect((await handler.POST(request({
      workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1,
    }, 'https://evil.test'), { params: Promise.resolve({ projectId }) })).status).toBe(403)
    expect((await createSiteIntelligenceReviewCollectionHandler(dependencies({
      findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Project', status: 'active', version: 2, document: { ...document, version: 2 } }),
    })).POST(request({ workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1 }), {
      params: Promise.resolve({ projectId }),
    })).status).toBe(409)
    expect((await createSiteIntelligenceReviewCollectionHandler(dependencies({
      findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }),
    })).POST(request({ workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1 }), {
      params: Promise.resolve({ projectId }),
    })).status).toBe(403)
  })

  it('reads latest and item reviews with tenant-safe validation', async () => {
    const latest = await createSiteIntelligenceLatestHandler(dependencies())(
      new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews/latest?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )
    expect(latest.status).toBe(200)
    expect((await latest.json()).data).toMatchObject({ id: reviewId, stale: false })

    const empty = await createSiteIntelligenceLatestHandler(dependencies({
      reviews: { ...dependencies().reviews, findLatest: () => Promise.resolve(null) },
    }))(
      new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews/latest?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual({ data: null })

    const item = await createSiteIntelligenceItemHandler(dependencies())(
      new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews/${reviewId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, reviewId }) },
    )
    expect(item.status).toBe(200)
    expect((await createSiteIntelligenceItemHandler(dependencies({
      reviews: { ...dependencies().reviews, findById: () => Promise.resolve(null) },
    }))(
      new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews/${reviewId}?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId, reviewId }) },
    )).status).toBe(404)
  })

  it('dismisses and restores only known finding fingerprints via exact-origin actions', async () => {
    const fingerprint = analysis.findings[0]!.fingerprint
    const dismiss = vi.fn().mockResolvedValue({ findingFingerprint: fingerprint, active: true })
    const restore = vi.fn().mockResolvedValue({ findingFingerprint: fingerprint, active: false })
    const deps = dependencies({ reviews: { ...dependencies().reviews, dismiss, restore } })

    const dismissed = await createSiteIntelligenceFindingActionHandler(deps, 'dismiss')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, fingerprint }) },
    )
    expect(dismissed.status).toBe(200)
    expect(dismiss).toHaveBeenCalledWith({ userId, workspaceId }, projectId, fingerprint)
    const restored = await createSiteIntelligenceFindingActionHandler(deps, 'restore')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, fingerprint }) },
    )
    expect(restored.status).toBe(200)
    expect(restore).toHaveBeenCalledWith({ userId, workspaceId }, projectId, fingerprint)

    expect((await createSiteIntelligenceFindingActionHandler(dependencies(), 'dismiss')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, fingerprint: 'invalid' }) },
    )).status).toBe(422)
    expect((await createSiteIntelligenceFindingActionHandler(dependencies({
      reviews: { ...dependencies().reviews, dismiss: () => Promise.resolve(null) },
    }), 'dismiss')(
      request({ workspaceId }), { params: Promise.resolve({ projectId, fingerprint }) },
    )).status).toBe(404)
  })

  it('requires session, membership, brief and existing project without leaking tenant data', async () => {
    const latestRequest = new Request(`http://localhost/api/v1/projects/${projectId}/site-intelligence-reviews/latest?workspaceId=${workspaceId}`)
    expect((await createSiteIntelligenceLatestHandler(dependencies({ getSession: () => Promise.resolve(null) }))(
      latestRequest, { params: Promise.resolve({ projectId }) },
    )).status).toBe(401)
    expect((await createSiteIntelligenceLatestHandler(dependencies({ findMembership: () => Promise.resolve(null) }))(
      latestRequest, { params: Promise.resolve({ projectId }) },
    )).status).toBe(404)
    expect((await createSiteIntelligenceLatestHandler(dependencies({ findProject: () => Promise.resolve(null) }))(
      latestRequest, { params: Promise.resolve({ projectId }) },
    )).status).toBe(404)
    expect((await createSiteIntelligenceReviewCollectionHandler(dependencies({ loadBrief: () => Promise.resolve(null) })).POST(
      request({ workspaceId, requestId: crypto.randomUUID(), expectedVersion: 1 }),
      { params: Promise.resolve({ projectId }) },
    )).status).toBe(409)
  })
})
