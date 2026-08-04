import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { analyzeSiteIntelligence, type WebsiteBrief } from '@zenui/ai-core'
import { createValidDesignFixture } from '@zenui/design-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  browserSiteIntelligenceApi,
  SiteIntelligencePanel,
  type SiteIntelligenceApi,
  type SiteIntelligenceReviewSummary,
} from '../app/editor/site-intelligence-panel'

const projectId = '33333333-3333-4333-8333-333333333333'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const document = createValidDesignFixture()
document.projectId = projectId
const brief: WebsiteBrief = {
  description: 'A planning product', offer: 'Planning product', audience: 'small product teams',
  primaryGoal: 'book a consultation', cta: 'Book consultation', tone: 'clear', brandDetails: 'NovaFlow',
  mustHaveSections: ['introduction', 'benefits', 'trust', 'faq', 'contact'],
}
const analysis = analyzeSiteIntelligence({ document, brief })
const review: SiteIntelligenceReviewSummary = {
  id: '44444444-4444-4444-8444-444444444444', projectId, documentVersion: 1,
  policyVersion: analysis.policyVersion, analysis, dismissedFindingFingerprints: [], stale: false,
  createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z',
}

function api(overrides: Partial<SiteIntelligenceApi> = {}): SiteIntelligenceApi {
  return {
    loadLatest: () => Promise.resolve(null),
    create: () => Promise.resolve(review),
    dismiss: fingerprint => Promise.resolve({ findingFingerprint: fingerprint, active: true }),
    restore: fingerprint => Promise.resolve({ findingFingerprint: fingerprint, active: false }),
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SiteIntelligencePanel', () => {
  it('treats a successful null latest review as an empty state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: null }))
    vi.stubGlobal('fetch', fetchMock)
    const client = browserSiteIntelligenceApi(projectId, workspaceId)

    await expect(client.loadLatest()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reviews story, audience, mobile and content without mutating the document', async () => {
    const before = structuredClone(document)
    const user = userEvent.setup()
    render(<SiteIntelligencePanel
      projectId={projectId} workspaceId={workspaceId} document={document} brief={brief}
      canMutate api={api()} onFocusEvidence={vi.fn()} onSuggestion={vi.fn()} onRemix={vi.fn()}
    />)

    await user.click(screen.getByRole('button', { name: 'Kiểm tra website' }))
    expect(await screen.findByRole('heading', { name: 'Đánh giá website' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Câu chuyện' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Đối tượng' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Điện thoại' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Nội dung' })).toBeVisible()
    expect(screen.getAllByText(brief.primaryGoal, { exact: false }).length).toBeGreaterThan(0)
    expect(document).toEqual(before)
  })

  it('focuses evidence, explains design and prepares suggestions without applying them', async () => {
    const onFocusEvidence = vi.fn()
    const onSuggestion = vi.fn()
    const onRemix = vi.fn()
    const user = userEvent.setup()
    render(<SiteIntelligencePanel
      projectId={projectId} workspaceId={workspaceId} document={document} brief={brief}
      selectedNodeId="section-1" canMutate api={api({ loadLatest: () => Promise.resolve(review) })}
      onFocusEvidence={onFocusEvidence} onSuggestion={onSuggestion} onRemix={onRemix}
    />)

    expect(await screen.findByRole('heading', { name: 'Đánh giá website' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Chi tiết' }))
    expect(screen.getByRole('heading', { name: 'Lý do thiết kế' })).toBeVisible()
    expect(screen.getByText('Thứ bậc nội dung')).toBeVisible()

    const evidenceButton = screen.getAllByRole('button', { name: 'Xem chỗ này' })[0]
    await user.click(evidenceButton!)
    expect(onFocusEvidence).toHaveBeenCalled()
    const aiButton = screen.queryAllByRole('button', { name: 'Sửa bằng AI' })[0]
    if (aiButton) {
      await user.click(aiButton)
      expect(onSuggestion).toHaveBeenCalled()
    }
    await user.click(screen.getByRole('button', { name: 'Đổi cách trình bày' }))
    expect(onRemix).toHaveBeenCalledWith('section-1')
  })

  it('persists dismissals, reveals ignored findings and blocks mutations for viewers or stale reviews', async () => {
    const fingerprint = review.analysis.findings[0]!.fingerprint
    const dismiss = vi.fn().mockResolvedValue({ findingFingerprint: fingerprint, active: true })
    const restore = vi.fn().mockResolvedValue({ findingFingerprint: fingerprint, active: false })
    const user = userEvent.setup()
    const { rerender } = render(<SiteIntelligencePanel
      projectId={projectId} workspaceId={workspaceId} document={document} brief={brief}
      canMutate api={api({ loadLatest: () => Promise.resolve(review), dismiss, restore })}
      onFocusEvidence={vi.fn()} onSuggestion={vi.fn()} onRemix={vi.fn()}
    />)
    expect(await screen.findByRole('heading', { name: 'Đánh giá website' })).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: 'Bỏ qua' })[0]!)
    expect(dismiss).toHaveBeenCalledWith(fingerprint)
    await user.click(screen.getByRole('button', { name: 'Hiện mục đã bỏ' }))
    await user.click(screen.getByRole('button', { name: 'Khôi phục' }))
    expect(restore).toHaveBeenCalledWith(fingerprint)

    rerender(<SiteIntelligencePanel
      projectId={projectId} workspaceId={workspaceId} document={document} brief={brief}
      canMutate={false} api={api({ loadLatest: () => Promise.resolve({ ...review, stale: true }) })}
      onFocusEvidence={vi.fn()} onSuggestion={vi.fn()} onRemix={vi.fn()}
    />)
    expect(await screen.findByText('Đánh giá này đã cũ')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Đổi cách trình bày' })).toBeDisabled()
  })
})
