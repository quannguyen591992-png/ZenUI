'use client'

import { useEffect, useRef, useState } from 'react'

import { componentLabel, generationErrorLabel } from '../../lib/ui-copy'
import { DesignDocumentRenderer } from '../components/design-document-renderer'

import type { ProposalAction, ProposalIntent, ProposalScope, RemixAllowedChange } from '@zenui/ai-core'
import type { DesignDocument } from '@zenui/design-schema'
import type { RenderViewport } from '@zenui/html-compiler/render'

export type AiProposalStatus =
  | 'preparing' | 'ready' | 'accepted' | 'discarded' | 'superseded'
  | 'cancelled' | 'stale' | 'invalid-scope' | 'failed'

export interface AiProposalSummary {
  id: string
  projectId: string
  expectedVersion: number
  status: AiProposalStatus
  action: ProposalAction
  intent?: ProposalIntent
  scope: ProposalScope
  summary: string | null
  proposedDocument: DesignDocument | null
  errorCode: string | null
}

export interface AiProposalApi {
  create(projectId: string, input: {
    workspaceId: string
    requestId: string
    action: ProposalAction
    intent?: ProposalIntent
    allowedChanges?: RemixAllowedChange[]
    prompt?: string
    expectedVersion: number
    selectedNodeId?: string
    previousProposalId?: string
  }): Promise<AiProposalSummary>
  subscribe(
    projectId: string,
    workspaceId: string,
    proposalId: string,
    onEvent: (proposal: AiProposalSummary) => void,
    onError?: (reason: 'connection' | 'timeout') => void,
  ): () => void
  accept(projectId: string, workspaceId: string, proposalId: string): Promise<{
    version: number
    revisionId: string
    document: DesignDocument
  }>
  discard(projectId: string, workspaceId: string, proposalId: string): Promise<AiProposalSummary>
  cancel(projectId: string, workspaceId: string, proposalId: string): Promise<AiProposalSummary>
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: { code?: string } }
  if (!response.ok || body.data === undefined) {
    throw Object.assign(new Error('proposal_request_failed'), { code: body.error?.code })
  }
  return body.data
}

const PROPOSAL_POLL_INTERVAL_MS = 500
const PROPOSAL_POLL_MAX_ERRORS = 3
export const PROPOSAL_POLL_TIMEOUT_MS = 120_000

export const browserAiProposalApi: AiProposalApi = {
  create: async (projectId, input) => readData(await fetch(`/api/v1/projects/${projectId}/ai-proposals`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })),
  subscribe(projectId, workspaceId, proposalId, onEvent, onError) {
    let closed = false
    let errors = 0
    let elapsedMs = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      timer = setTimeout(() => {
        elapsedMs += PROPOSAL_POLL_INTERVAL_MS
        if (elapsedMs >= PROPOSAL_POLL_TIMEOUT_MS) {
          closed = true
          onError?.('timeout')
          return
        }
        void poll()
      }, PROPOSAL_POLL_INTERVAL_MS)
    }
    const poll = async (): Promise<void> => {
      try {
        const proposal = await readData<AiProposalSummary>(await fetch(
          `/api/v1/projects/${projectId}/ai-proposals/${proposalId}?workspaceId=${encodeURIComponent(workspaceId)}`,
        ))
        if (closed) return
        errors = 0
        onEvent(proposal)
        if (proposal.status === 'preparing') schedule()
      } catch {
        if (closed) return
        errors += 1
        if (errors >= PROPOSAL_POLL_MAX_ERRORS) {
          closed = true
          onError?.('connection')
          return
        }
        schedule()
      }
    }
    void poll()
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
    }
  },
  accept: async (projectId, workspaceId, proposalId) => readData(await fetch(`/api/v1/projects/${projectId}/ai-proposals/${proposalId}/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
  })),
  discard: async (projectId, workspaceId, proposalId) => readData(await fetch(`/api/v1/projects/${projectId}/ai-proposals/${proposalId}/discard`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
  })),
  cancel: async (projectId, workspaceId, proposalId) => readData(await fetch(`/api/v1/projects/${projectId}/ai-proposals/${proposalId}/cancel`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
  })),
}

interface ProposalChange {
  key: string
  label: string
  before: string
  after: string
}

const proposalPropertyLabels: Record<string, string> = {
  alt: 'Mô tả ảnh',
  backgroundColor: 'Màu nền',
  brand: 'Thương hiệu',
  color: 'Màu chữ',
  description: 'Mô tả',
  href: 'Liên kết',
  label: 'Nhãn',
  level: 'Cấp tiêu đề',
  name: 'Tên',
  text: 'Nội dung',
  title: 'Tiêu đề',
}

function subtreeNodeIds(document: DesignDocument, rootNodeId: string): string[] {
  const node = document.nodes[rootNodeId]
  if (!node) return []
  return [rootNodeId, ...node.children.flatMap(childId => subtreeNodeIds(document, childId))]
}

function displayProposalValue(value: unknown): string {
  if (typeof value === 'string') return value.trim() || 'Trống'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return 'Không có'
  return JSON.stringify(value)
}

function proposalPreviewRootId(
  current: DesignDocument,
  proposed: DesignDocument,
  rootNodeId: string,
): string {
  if (proposed.nodes[rootNodeId]) return rootNodeId
  const currentNode = current.nodes[rootNodeId]
  if (!currentNode?.parentId) return rootNodeId
  const currentParent = current.nodes[currentNode.parentId]
  const proposedParent = proposed.nodes[currentNode.parentId]
  if (!currentParent || !proposedParent) return rootNodeId
  const childIndex = currentParent.children.indexOf(rootNodeId)
  return childIndex >= 0 ? proposedParent.children[childIndex] ?? rootNodeId : rootNodeId
}

function proposalChanges(
  current: DesignDocument,
  proposed: DesignDocument,
  rootNodeId: string,
): ProposalChange[] {
  const changes: ProposalChange[] = []
  for (const nodeId of subtreeNodeIds(current, rootNodeId)) {
    const beforeNode = current.nodes[nodeId]
    const afterNode = proposed.nodes[nodeId]
    if (!beforeNode || !afterNode) continue
    for (const [group, beforeValues, afterValues] of [
      ['props', beforeNode.props, afterNode.props],
      ['style', beforeNode.style, afterNode.style],
      ['responsive', beforeNode.responsive, afterNode.responsive],
    ] as const) {
      const keys = new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])
      for (const property of keys) {
        const before = beforeValues[property as keyof typeof beforeValues]
        const after = afterValues[property as keyof typeof afterValues]
        if (JSON.stringify(before) === JSON.stringify(after)) continue
        changes.push({
          key: `${nodeId}-${group}-${property}`,
          label: `${componentLabel(beforeNode.type)} · ${proposalPropertyLabels[property] ?? property}`,
          before: displayProposalValue(before),
          after: displayProposalValue(after),
        })
        if (changes.length >= 12) return changes
      }
    }
  }
  return changes
}

interface ContextualAiProps {
  projectId: string
  workspaceId: string
  expectedVersion: number
  selectedNodeId: string | null
  scopeLabel: string
  acceptedDocument: DesignDocument
  viewport: RenderViewport
  assetOrigin: string
  canSubmit: boolean
  api: AiProposalApi
  initialPrompt?: string
  initialIntent?: ProposalIntent
  initialAllowedChanges?: RemixAllowedChange[]
  onAccepted: (result: { version: number; revisionId: string; document: DesignDocument }) => Promise<void> | void
  onStateChange?: (proposal: AiProposalSummary | null) => void
}

export function ContextualAi({
  projectId,
  workspaceId,
  expectedVersion,
  selectedNodeId,
  scopeLabel,
  acceptedDocument,
  viewport,
  assetOrigin,
  canSubmit,
  api,
  initialPrompt = '',
  initialIntent = 'standard',
  initialAllowedChanges = [],
  onAccepted,
  onStateChange,
}: ContextualAiProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [proposal, setProposal] = useState<AiProposalSummary | null>(null)
  const [error, setError] = useState('')
  const [refining, setRefining] = useState(false)
  const [refinement, setRefinement] = useState('')
  const [applying, setApplying] = useState(false)
  const [previewChoice, setPreviewChoice] = useState<'current' | 'proposed'>('proposed')
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [pollFailure, setPollFailure] = useState<'connection' | 'timeout' | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const compareButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => () => closeRef.current?.(), [])
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt)
  }, [initialPrompt])
  useEffect(() => onStateChange?.(proposal), [onStateChange, proposal])
  useEffect(() => {
    if (!comparisonOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    const focusable = (): HTMLElement[] => dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [href], textarea, [tabindex]:not([tabindex="-1"])'))
      : []
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setComparisonOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) return
      const first = elements[0]!
      const last = elements.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => focusable()[0]?.focus())
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      compareButtonRef.current?.focus()
    }
  }, [comparisonOpen])

  const subscribe = (next: AiProposalSummary): void => {
    setProposal(next)
    setPollFailure(null)
    closeRef.current?.()
    closeRef.current = api.subscribe(projectId, workspaceId, next.id, event => {
      setProposal(event)
      if (event.status !== 'preparing') {
        closeRef.current?.()
        closeRef.current = null
      }
    }, reason => {
      closeRef.current = null
      setPollFailure(reason)
    })
  }

  const create = async (action: ProposalAction, request: string, previousProposalId?: string): Promise<void> => {
    setError('')
    try {
      const next = await api.create(projectId, {
        workspaceId, requestId: crypto.randomUUID(), action,
        intent: initialIntent,
        allowedChanges: initialAllowedChanges,
        ...(action !== 'try-another' ? { prompt: request } : {}),
        expectedVersion,
        ...(selectedNodeId ? { selectedNodeId } : {}),
        ...(previousProposalId ? { previousProposalId } : {}),
      })
      subscribe(next)
      setPreviewChoice('proposed')
      setRefining(false)
      setRefinement('')
    } catch {
      setError('Không thể chuẩn bị đề xuất. Website của bạn vẫn giữ nguyên.')
    }
  }

  const reset = (): void => {
    closeRef.current?.()
    closeRef.current = null
    setProposal(null)
    setPollFailure(null)
    setError('')
    setRefining(false)
  }

  const cancelAndReset = async (): Promise<void> => {
    if (!proposal) return reset()
    setError('')
    try {
      await api.cancel(projectId, workspaceId, proposal.id)
      reset()
    } catch (value) {
      const code = (value as { code?: string }).code
      if (pollFailure && (code === 'not_found' || code === 'proposal_not_cancellable')) {
        reset()
        return
      }
      setError('Không thể hủy đề xuất lúc này. Website của bạn vẫn giữ nguyên.')
    }
  }

  const discard = async (): Promise<void> => {
    if (!proposal) return
    try {
      await api.discard(projectId, workspaceId, proposal.id)
      setProposal(null)
      setRefining(false)
    } catch {
      setError('Không thể bỏ đề xuất lúc này.')
    }
  }

  const accept = async (): Promise<void> => {
    if (!proposal || proposal.status !== 'ready') return
    setApplying(true)
    setError('')
    try {
      const result = await api.accept(projectId, workspaceId, proposal.id)
      await onAccepted(result)
      setProposal(null)
    } catch (value) {
      const code = (value as { code?: string }).code
      setError(code === 'stale_document_version'
        ? 'Website đã thay đổi trong khi bản xem trước mở. Hãy tạo đề xuất mới.'
        : 'Không thể chấp nhận đề xuất. Website của bạn vẫn giữ nguyên.')
    } finally {
      setApplying(false)
    }
  }

  const mediaIntent = initialIntent === 'replace-media'
  const suggestions = mediaIntent
    ? ['Tạo ảnh phù hợp bằng AI', 'Đổi hình cho giống nội dung trang hơn', 'Tìm ảnh phù hợp từ thư viện']
    : ['Ngắn gọn hơn', 'Cao cấp hơn', 'Cải thiện hành động chính']
  if (!proposal) {
    return (
      <section className="contextual-ai" aria-labelledby="contextual-ai-heading">
        <h2 id="contextual-ai-heading">Cùng thiết kế</h2>
        <p>Đang chỉnh: <strong>{scopeLabel}</strong></p>
        <label>
          {mediaIntent ? 'Bạn muốn hình ảnh mới thể hiện điều gì?' : 'Bạn muốn cải thiện điều gì?'}
          <textarea
            aria-label="Bạn muốn cải thiện điều gì?"
            placeholder={mediaIntent ? 'Ví dụ: Đổi hình cho giống nội dung trang hơn' : undefined}
            value={prompt}
            maxLength={4000}
            onChange={event => setPrompt(event.target.value)}
          />
        </label>
        <div className="contextual-ai-suggestions" aria-label="Gợi ý AI">
          {suggestions.map(suggestion => <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}
        </div>
        <button type="button" disabled={!canSubmit || prompt.trim().length < 3} onClick={() => void create('request', prompt.trim())}>Đề xuất thay đổi</button>
        <small>Không có thay đổi nào được áp dụng trước khi bạn kiểm tra.</small>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  if (proposal.status === 'preparing') {
    return (
      <section className="contextual-ai" aria-label="Đang chuẩn bị đề xuất">
        <h2>{pollFailure ? 'Chưa thể hoàn tất bản xem trước' : 'Đang chuẩn bị bản xem trước'}</h2>
        <p>Phạm vi: {proposal.scope.label}</p>
        {pollFailure && <p role="alert">{pollFailure === 'timeout'
          ? 'AI xử lý quá lâu. Website của bạn vẫn giữ nguyên.'
          : 'Kết nối trạng thái đề xuất bị gián đoạn. Website của bạn vẫn giữ nguyên.'}</p>}
        <button type="button" onClick={() => void cancelAndReset()}>{pollFailure ? 'Hủy và thử lại' : 'Hủy đề xuất'}</button>
        {error && <p role="alert">{error}</p>}
      </section>
    )
  }

  if (proposal.status !== 'ready' || !proposal.proposedDocument) {
    return (
      <section className="contextual-ai" aria-label="Đề xuất không sẵn sàng">
        <h2>Không thể chuẩn bị thay đổi này</h2>
        <p role="alert">{proposal.status === 'failed' && proposal.errorCode
          ? `${generationErrorLabel(proposal.errorCode)} Website của bạn vẫn giữ nguyên.`
          : 'Website của bạn vẫn giữ nguyên.'}</p>
        <button type="button" onClick={reset}>Thử lại yêu cầu</button>
      </section>
    )
  }

  const proposedPreviewRootId = proposalPreviewRootId(
    acceptedDocument,
    proposal.proposedDocument,
    proposal.scope.rootNodeId,
  )
  const changes = proposalChanges(acceptedDocument, proposal.proposedDocument, proposal.scope.rootNodeId)

  return (
    <section className="ai-proposal-review" aria-labelledby="proposal-review-heading">
      <header>
        <span>Phạm vi: {proposal.scope.label}</span>
        <h2 id="proposal-review-heading">Kiểm tra thay đổi được đề xuất</h2>
      </header>
      <p><strong>Được giữ nguyên:</strong> {proposal.intent === 'remix-section'
        ? 'nội dung, hành động chính, thương hiệu và các section xung quanh.'
        : 'nội dung xung quanh, cấu trúc an toàn và quyền xuất bản của bạn.'}</p>
      <section className="ai-proposal-summary" aria-labelledby="proposal-summary-heading">
        <h3 id="proposal-summary-heading">Thay đổi cụ thể</h3>
        {changes.length > 0 ? (
          <ul aria-label="Tóm tắt thay đổi">
            {changes.slice(0, 3).map(change => (
              <li key={change.key}>
                <strong>{change.label}</strong>
                <span>{change.before}</span>
                <span aria-hidden="true">→</span>
                <span>{change.after}</span>
              </li>
            ))}
          </ul>
        ) : <p>Không tìm thấy giá trị hiển thị nào khác trong phạm vi này.</p>}
      </section>
      <button
        ref={compareButtonRef}
        className="ai-proposal-compare-button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setPreviewChoice('proposed')
          setComparisonOpen(true)
        }}
      >So sánh nội dung cũ và mới</button>
      <p><strong>Tóm tắt:</strong> {proposal.summary}</p>
      {comparisonOpen && (
        <div className="ai-comparison-backdrop" data-testid="comparison-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget) setComparisonOpen(false)
        }}>
          <div
            ref={dialogRef}
            className="ai-comparison-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="comparison-dialog-heading"
          >
            <header>
              <div>
                <span>Phạm vi: {proposal.scope.label}</span>
                <h2 id="comparison-dialog-heading">So sánh nội dung cũ và mới</h2>
              </div>
              <button type="button" aria-label="Đóng so sánh" onClick={() => setComparisonOpen(false)}>Đóng</button>
            </header>
            <div className="ai-proposal-tabs" role="tablist" aria-label="Chọn bản xem trước">
              <button
                type="button"
                role="tab"
                aria-selected={previewChoice === 'current'}
                aria-controls="current-proposal-panel"
                onClick={() => setPreviewChoice('current')}
              >Xem hiện tại</button>
              <button
                type="button"
                role="tab"
                aria-selected={previewChoice === 'proposed'}
                aria-controls="proposed-proposal-panel"
                onClick={() => setPreviewChoice('proposed')}
              >Xem đề xuất</button>
            </div>
            <div className="ai-proposal-comparison">
              <section
                id="current-proposal-panel"
                role="tabpanel"
                aria-labelledby="current-proposal-heading"
                data-active={previewChoice === 'current'}
              >
                <h3 id="current-proposal-heading">Hiện tại</h3>
                <DesignDocumentRenderer
                  document={acceptedDocument}
                  rootNodeId={proposal.scope.rootNodeId}
                  viewport={viewport}
                  assetOrigin={assetOrigin}
                  compact
                  ariaLabel="Website hiện tại"
                />
              </section>
              <section
                id="proposed-proposal-panel"
                role="tabpanel"
                aria-labelledby="proposed-proposal-heading"
                data-active={previewChoice === 'proposed'}
              >
                <h3 id="proposed-proposal-heading">Đề xuất</h3>
                <DesignDocumentRenderer
                  document={proposal.proposedDocument}
                  rootNodeId={proposedPreviewRootId}
                  viewport={viewport}
                  assetOrigin={assetOrigin}
                  compact
                  ariaLabel="Website được đề xuất"
                />
              </section>
            </div>
            <section className="ai-proposal-changes" aria-labelledby="proposal-changes-heading">
              <h3 id="proposal-changes-heading">Chi tiết trước và sau</h3>
              {changes.length > 0 ? (
                <ul aria-label="Chi tiết thay đổi">
                  {changes.map(change => (
                    <li key={change.key}>
                      <strong>{change.label}</strong>
                      <span><small>Trước</small>{change.before}</span>
                      <span><small>Sau</small>{change.after}</span>
                    </li>
                  ))}
                </ul>
              ) : <p>Không tìm thấy giá trị hiển thị nào khác trong phạm vi này.</p>}
            </section>
          </div>
        </div>
      )}
      {refining && (
        <div className="proposal-refine">
          <label>Điều chỉnh đề xuất<textarea aria-label="Điều chỉnh đề xuất" value={refinement} onChange={event => setRefinement(event.target.value)} /></label>
          <button type="button" disabled={refinement.trim().length < 3} onClick={() => void create('refine', refinement.trim(), proposal.id)}>Tạo đề xuất tinh chỉnh</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" onClick={() => void discard()}>Bỏ đề xuất</button>
        <button type="button" onClick={() => void create('try-another', '', proposal.id)}>Thử phương án khác</button>
        <button type="button" onClick={() => setRefining(true)}>Tinh chỉnh</button>
        <button type="button" disabled={!canSubmit || applying} onClick={() => void accept()}>Chấp nhận thay đổi</button>
      </footer>
    </section>
  )
}
