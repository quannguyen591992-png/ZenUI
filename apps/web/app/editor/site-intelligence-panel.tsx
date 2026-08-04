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
      <section className="site-intel-pro" aria-labelledby="site-intelligence-start">
        <h2 id="site-intelligence-start" className="intel-heading">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Hiểu website của bạn
        </h2>
        <p className="intel-desc">Kiểm tra câu chuyện trang, đối tượng, nội dung và bố cục điện thoại dựa trên bản mô tả.</p>
        <button className="intel-btn-primary" type="button" disabled={!canMutate || loading} onClick={() => void run()}>
          {loading ? 'Đang kiểm tra...' : 'Kiểm tra website'}
        </button>
        <small className="intel-disclaimer">Đánh giá không tự thay đổi website và không dự đoán kết quả kinh doanh.</small>
        {error && <p role="alert" className="intel-error">{error}</p>}
      </section>
    )
  }

  return (
    <section className="site-intel-pro" aria-labelledby="site-intelligence-heading">
      <header className="intel-header-box">
        <h2 id="site-intelligence-heading">Đánh giá website</h2>
        <div className="intel-meta">
          <p>Mục tiêu: <strong>{brief.primaryGoal}</strong></p>
          <p>Đối tượng: <strong>{brief.audience}</strong></p>
        </div>
      </header>
      {review.stale && <p className="intel-stale-badge">Đánh giá này đã cũ</p>}
      <div className="intel-tabs" role="tablist" aria-label="Nhóm đánh giá website">
        {(Object.keys(categoryLabels) as Category[]).map(value => (
          <button
            key={value} type="button" role="tab" aria-selected={category === value}
            onClick={() => setCategory(value)}
            className={`intel-tab ${category === value ? 'active' : ''}`}
          >{categoryLabels[value]}</button>
        ))}
      </div>
      {category === 'story' && (
        <ol className="intel-story-timeline">
          {review.analysis.story.map(step => (
            <li key={step.nodeId}>
              <button className="intel-story-btn" type="button" onClick={() => onFocusEvidence(step.nodeId)}>
                <strong>{step.purposeLabel}: {step.label}</strong>
                <span>{step.explanation}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {findings.length === 0 ? <p className="intel-empty">Không có mục mới trong nhóm này.</p> : (
        <ul className="intel-bento-grid">
          {findings.map(finding => (
            <li key={finding.fingerprint} className={`intel-bento-card ${finding.severity === 'warning' ? 'warning' : 'suggestion'}`}>
              <div className="bento-badge">{finding.severity === 'warning' ? 'Cần chú ý' : 'Gợi ý'}</div>
              <h3>{finding.title}</h3>
              <p className="bento-desc">{finding.explanation}</p>
              <div className="bento-meta">
                <p><strong>Bằng chứng:</strong> {finding.evidence[0]?.detail}</p>
                <p><strong>Theo mô tả:</strong> {finding.citations.map(citation => citation.value).join(' · ')}</p>
              </div>
              <div className="bento-actions">
                <button type="button" className="btn-text" onClick={() => onFocusEvidence(finding.evidence[0]!.nodeId)}>Xem chỗ này</button>
                {finding.suggestedPrompt && !dismissed.has(finding.fingerprint) && (
                  <button
                    type="button" className="btn-ai" disabled={!canMutate || review.stale}
                    onClick={() => onSuggestion(finding.suggestedPrompt!, finding.evidence[0]!.sectionNodeId)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6 7.6 2.4-7.6 2.4L12 22l-2.4-7.6-7.6-2.4 7.6-2.4L12 2z"/></svg>
                    Sửa bằng AI
                  </button>
                )}
                <button type="button" className="btn-text" disabled={!canMutate} onClick={() => void updateDismissal(finding, !dismissed.has(finding.fingerprint))}>
                  {dismissed.has(finding.fingerprint) ? 'Khôi phục' : 'Bỏ qua'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer className="intel-footer">
        <div className="footer-actions">
          <button type="button" className="btn-outline" onClick={() => setShowDismissed(value => !value)}>
            {showDismissed ? 'Hiện đang bật' : 'Hiện mục đã bỏ'}
          </button>
          <button type="button" className="btn-outline" onClick={() => setShowExplanation(value => !value)}>Chi tiết</button>
          <button
            type="button" className="btn-outline" disabled={!canMutate || review.stale}
            onClick={() => onRemix(selectedNodeId ?? review.analysis.story[0]!.nodeId)}
          >Đổi cách trình bày</button>
          <button type="button" className="btn-primary" disabled={!canMutate || loading} onClick={() => void run()}>Kiểm tra lại</button>
        </div>
      </footer>
      {showExplanation && (
        <section className="intel-explanations" aria-labelledby="design-explanation-heading">
          <h3 id="design-explanation-heading">Lý do thiết kế</h3>
          {explanations.map(explanation => (
            <article key={explanation.kind} className="intel-explain-card">
              <h4>{explanation.title}</h4><p>{explanation.explanation}</p>
            </article>
          ))}
        </section>
      )}
      {error && <p role="alert" className="intel-error">{error}</p>}
    </section>
  )
}
