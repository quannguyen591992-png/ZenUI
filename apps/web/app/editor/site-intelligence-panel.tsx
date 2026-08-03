'use client'

import {
  explainDesignEvidence,
  type SiteIntelligenceFinding,
  type SiteIntelligenceReview,
  type WebsiteBrief,
} from '@zenui/ai-core'
import { useEffect, useMemo, useState } from 'react'

import type { DesignDocument } from '@zenui/design-schema'

export interface SiteIntelligenceReviewSummary {
  id: string
  projectId: string
  documentVersion: number
  policyVersion: string
  analysis: SiteIntelligenceReview
  dismissedFindingFingerprints: string[]
  stale: boolean
  createdAt: string | Date
  updatedAt: string | Date
}

export interface SiteIntelligenceApi {
  loadLatest(): Promise<SiteIntelligenceReviewSummary | null>
  create(expectedVersion: number): Promise<SiteIntelligenceReviewSummary>
  dismiss(fingerprint: string): Promise<{ findingFingerprint: string; active: boolean }>
  restore(fingerprint: string): Promise<{ findingFingerprint: string; active: boolean }>
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('site_intelligence_request_failed')
  return body.data
}

export function browserSiteIntelligenceApi(projectId: string, workspaceId: string): SiteIntelligenceApi {
  return {
    loadLatest: async () => readData(await fetch(
      `/api/v1/projects/${projectId}/site-intelligence-reviews/latest?workspaceId=${encodeURIComponent(workspaceId)}`,
    )),
    create: async expectedVersion => readData(await fetch(`/api/v1/projects/${projectId}/site-intelligence-reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, requestId: crypto.randomUUID(), expectedVersion }),
    })),
    dismiss: async fingerprint => readData(await fetch(`/api/v1/projects/${projectId}/site-intelligence-findings/${fingerprint}/dismiss`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
    })),
    restore: async fingerprint => readData(await fetch(`/api/v1/projects/${projectId}/site-intelligence-findings/${fingerprint}/restore`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
    })),
  }
}

const categoryLabels = {
  story: 'Câu chuyện',
  audience: 'Đối tượng',
  mobile: 'Điện thoại',
  content: 'Nội dung',
} as const

type Category = keyof typeof categoryLabels

interface SiteIntelligencePanelProps {
  projectId: string
  workspaceId: string
  document: DesignDocument
  brief: WebsiteBrief
  selectedNodeId?: string | null
  canMutate: boolean
  api?: SiteIntelligenceApi
  onFocusEvidence: (nodeId: string) => void
  onSuggestion: (prompt: string, sectionNodeId: string) => void
  onRemix: (sectionNodeId: string) => void
}

export function SiteIntelligencePanel({
  projectId,
  workspaceId,
  document,
  brief,
  selectedNodeId,
  canMutate,
  api,
  onFocusEvidence,
  onSuggestion,
  onRemix,
}: SiteIntelligencePanelProps) {
  const [review, setReview] = useState<SiteIntelligenceReviewSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<Category>('story')
  const [showDismissed, setShowDismissed] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const client = useMemo(() => api ?? browserSiteIntelligenceApi(projectId, workspaceId), [api, projectId, workspaceId])

  useEffect(() => {
    let active = true
    void client.loadLatest().then(value => { if (active) setReview(value) }).catch(() => undefined)
    return () => { active = false }
  }, [client])

  const run = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setReview(await client.create(document.version))
    } catch {
      setError('Không thể kiểm tra website lúc này. Website của bạn vẫn giữ nguyên.')
    } finally {
      setLoading(false)
    }
  }

  const dismissed = new Set(review?.dismissedFindingFingerprints ?? [])
  const findings = (review?.analysis.findings ?? []).filter(finding => (
    finding.category === category && (showDismissed ? dismissed.has(finding.fingerprint) : !dismissed.has(finding.fingerprint))
  ))
  const explanations = showExplanation
    ? explainDesignEvidence({ document, brief, selectedNodeId: selectedNodeId ?? null })
    : []

  const updateDismissal = async (finding: SiteIntelligenceFinding, active: boolean): Promise<void> => {
    try {
      if (active) await client.dismiss(finding.fingerprint)
      else await client.restore(finding.fingerprint)
      setReview(current => current ? {
        ...current,
        dismissedFindingFingerprints: active
          ? [...new Set([...current.dismissedFindingFingerprints, finding.fingerprint])]
          : current.dismissedFindingFingerprints.filter(value => value !== finding.fingerprint),
      } : current)
    } catch {
      setError('Không thể cập nhật mục đã bỏ qua.')
    }
  }

  if (!review) {
    return (
      <section className="site-intelligence" aria-labelledby="site-intelligence-start">
        <h2 id="site-intelligence-start">Hiểu website của bạn</h2>
        <p>Kiểm tra câu chuyện trang, đối tượng, nội dung và bố cục điện thoại dựa trên bản mô tả.</p>
        <button type="button" disabled={!canMutate || loading} onClick={() => void run()}>
          {loading ? 'Đang kiểm tra...' : 'Kiểm tra website'}
        </button>
        <small>Đánh giá không tự thay đổi website và không dự đoán kết quả kinh doanh.</small>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  return (
    <section className="site-intelligence" aria-labelledby="site-intelligence-heading">
      <header>
        <h2 id="site-intelligence-heading">Đánh giá website</h2>
        <p>Mục tiêu: <strong>{brief.primaryGoal}</strong></p>
        <p>Đối tượng: <strong>{brief.audience}</strong></p>
      </header>
      {review.stale && <p className="site-intelligence-stale">Đánh giá này đã cũ</p>}
      <div role="tablist" aria-label="Nhóm đánh giá website">
        {(Object.keys(categoryLabels) as Category[]).map(value => (
          <button
            key={value} type="button" role="tab" aria-selected={category === value}
            onClick={() => setCategory(value)}
          >{categoryLabels[value]}</button>
        ))}
      </div>
      {category === 'story' && (
        <ol className="site-intelligence-story">
          {review.analysis.story.map(step => (
            <li key={step.nodeId}>
              <button type="button" onClick={() => onFocusEvidence(step.nodeId)}>
                <strong>{step.purposeLabel}: {step.label}</strong>
                <span>{step.explanation}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {findings.length === 0 ? <p>Không có mục mới trong nhóm này.</p> : (
        <ul className="site-intelligence-findings">
          {findings.map(finding => (
            <li key={finding.fingerprint}>
              <span>{finding.severity === 'warning' ? 'Cần chú ý' : 'Gợi ý'}</span>
              <h3>{finding.title}</h3>
              <p>{finding.explanation}</p>
              <p><strong>Bằng chứng:</strong> {finding.evidence[0]?.detail}</p>
              <p><strong>Theo bản mô tả:</strong> {finding.citations.map(citation => citation.value).join(' · ')}</p>
              <div>
                <button type="button" onClick={() => onFocusEvidence(finding.evidence[0]!.nodeId)}>Xem bằng chứng</button>
                {finding.suggestedPrompt && !dismissed.has(finding.fingerprint) && (
                  <button
                    type="button" disabled={!canMutate || review.stale}
                    onClick={() => onSuggestion(finding.suggestedPrompt!, finding.evidence[0]!.sectionNodeId)}
                  >Cải thiện bằng AI</button>
                )}
                <button type="button" disabled={!canMutate} onClick={() => void updateDismissal(finding, !dismissed.has(finding.fingerprint))}>
                  {dismissed.has(finding.fingerprint) ? 'Khôi phục mục này' : 'Bỏ qua mục này'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer>
        <button type="button" onClick={() => setShowDismissed(value => !value)}>
          {showDismissed ? 'Hiện mục đang hoạt động' : 'Hiện mục đã bỏ qua'}
        </button>
        <button type="button" onClick={() => setShowExplanation(value => !value)}>Giải thích thiết kế này</button>
        <button
          type="button" disabled={!canMutate || review.stale}
          onClick={() => onRemix(selectedNodeId ?? review.analysis.story[0]!.nodeId)}
        >Thử cách trình bày khác, giữ nội dung</button>
        <button type="button" disabled={!canMutate || loading} onClick={() => void run()}>Kiểm tra lại website</button>
      </footer>
      {showExplanation && (
        <section aria-labelledby="design-explanation-heading">
          <h3 id="design-explanation-heading">Vì sao thiết kế này hỗ trợ bản mô tả?</h3>
          {explanations.map(explanation => (
            <article key={explanation.kind}>
              <h4>{explanation.title}</h4><p>{explanation.explanation}</p>
            </article>
          ))}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
