'use client'

import { useEffect, useRef, useState } from 'react'

import { generationErrorLabel } from '../../lib/ui-copy'

export interface AiRunSummary {
  id: string
  mode: 'generate' | 'edit-page' | 'edit-selection'
  status: 'queued' | 'running' | 'repairing' | 'completed' | 'failed'
  repairCount: number
  errorCode: string | null
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  documentVersion: number | null
  revisionId: string | null
}

export interface AiAssistantApi {
  listRuns(projectId: string, workspaceId: string): Promise<AiRunSummary[]>
  createRun(projectId: string, input: {
    workspaceId: string
    requestId: string
    mode: AiRunSummary['mode']
    prompt: string
    expectedVersion: number
    selectedNodeId?: string
  }): Promise<AiRunSummary>
  subscribe(
    projectId: string,
    workspaceId: string,
    runId: string,
    onEvent: (run: AiRunSummary) => void,
    onError?: () => void,
  ): () => void
}

interface AiAssistantProps {
  projectId: string
  workspaceId: string
  expectedVersion: number
  selectedNodeId: string | null
  canSubmit: boolean
  api: AiAssistantApi
  onCompleted: (run: AiRunSummary) => Promise<void>
}

export const browserAiAssistantApi: AiAssistantApi = {
  async listRuns(projectId, workspaceId) {
    return readData(await fetch(`/api/v1/projects/${projectId}/generation-runs?workspaceId=${encodeURIComponent(workspaceId)}&limit=20`))
  },
  async createRun(projectId, input) {
    return readData(await fetch(`/api/v1/projects/${projectId}/generation-runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }))
  },
  subscribe(projectId, workspaceId, runId, onEvent, onError) {
    const events = new EventSource(`/api/v1/projects/${projectId}/generation-runs/${runId}/events?workspaceId=${encodeURIComponent(workspaceId)}`)
    events.addEventListener('status', event => {
      try {
        onEvent(JSON.parse((event as MessageEvent<string>).data) as AiRunSummary)
      } catch {
        onError?.()
      }
    })
    events.addEventListener('error', () => onError?.())
    return () => events.close()
  },
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('ai_request_failed')
  return body.data
}

function statusLabel(status: AiRunSummary['status']): string {
  switch (status) {
    case 'queued': return 'AI đang chờ xử lý'
    case 'running': return 'AI đang xử lý'
    case 'repairing': return 'AI đang sửa kết quả'
    case 'completed': return 'AI đã hoàn tất'
    case 'failed': return 'AI đã dừng an toàn'
  }
}

export function AiAssistant({
  projectId,
  workspaceId,
  expectedVersion,
  selectedNodeId,
  canSubmit,
  api,
  onCompleted,
}: AiAssistantProps) {
  const [mode, setMode] = useState<AiRunSummary['mode']>('generate')
  const [prompt, setPrompt] = useState('')
  const [runs, setRuns] = useState<AiRunSummary[] | null>(null)
  const [active, setActive] = useState<AiRunSummary | null>(null)
  const [error, setError] = useState('')
  const closeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let mounted = true
    void api.listRuns(projectId, workspaceId)
      .then(result => { if (mounted) setRuns(result) })
      .catch(() => { if (mounted) { setRuns([]); setError('Không thể tải lịch sử AI.') } })
    return () => {
      mounted = false
      closeRef.current?.()
    }
  }, [api, projectId, workspaceId])

  const selectionMissing = mode === 'edit-selection' && !selectedNodeId
  const promptValid = prompt.trim().length >= 3 && prompt.trim().length <= 4000
  const isActive = active && !['completed', 'failed'].includes(active.status)
  const submitDisabled = !canSubmit || selectionMissing || !promptValid || Boolean(isActive)

  const submit = async (): Promise<void> => {
    setError('')
    try {
      const run = await api.createRun(projectId, {
        workspaceId,
        requestId: crypto.randomUUID(),
        mode,
        prompt: prompt.trim(),
        expectedVersion,
        ...(mode === 'edit-selection' && selectedNodeId ? { selectedNodeId } : {}),
      })
      setActive(run)
      setRuns(current => [run, ...(current ?? [])])
      closeRef.current?.()
      closeRef.current = api.subscribe(projectId, workspaceId, run.id, event => {
        setActive(event)
        setRuns(current => (current ?? []).map(item => item.id === event.id ? event : item))
        if (event.status === 'completed') {
          closeRef.current?.()
          closeRef.current = null
          void onCompleted(event)
        }
        if (event.status === 'failed') {
          closeRef.current?.()
          closeRef.current = null
        }
      }, () => setError('Kết nối trạng thái AI đã bị gián đoạn.'))
    } catch {
      setError('Không thể bắt đầu yêu cầu AI.')
    }
  }

  return (
    <section className="ai-assistant" aria-labelledby="ai-assistant-heading">
      <h2 id="ai-assistant-heading">Trợ lý AI</h2>
      <label>
        Chế độ AI
        <select aria-label="Chế độ AI" value={mode} onChange={event => setMode(event.target.value as AiRunSummary['mode'])}>
          <option value="generate">Tạo trang</option>
          <option value="edit-page">Sửa toàn trang</option>
          <option value="edit-selection">Sửa phần đang chọn</option>
        </select>
      </label>
      {mode === 'edit-selection' && (
        <p>{selectedNodeId ? `Đã chọn thành phần: ${selectedNodeId}` : 'Hãy chọn một thành phần trước khi dùng chế độ này.'}</p>
      )}
      <label>
        Yêu cầu cho AI
        <textarea
          aria-label="Yêu cầu cho AI"
          value={prompt}
          maxLength={4000}
          onChange={event => setPrompt(event.target.value)}
        />
      </label>
      <button type="button" disabled={submitDisabled} onClick={() => void submit()}>Chạy AI</button>
      {error && <p role="alert">{error}</p>}
      {active && (
        <div role="status" aria-live="polite">
          <strong>{statusLabel(active.status)}</strong>
          {active.status === 'repairing' && <span>Lần sửa {active.repairCount}</span>}
          {active.usage.totalTokens > 0 && <span>{active.usage.totalTokens} token</span>}
          {active.errorCode && <span>{generationErrorLabel(active.errorCode)}</span>}
        </div>
      )}
      {runs === null ? <p role="status">Đang tải lịch sử AI</p> : runs.length === 0 ? <p>Chưa có lần chạy AI nào.</p> : (
        <ul aria-label="Các lần chạy AI gần đây">
          {runs.map(run => <li key={run.id}>{statusLabel(run.status)}</li>)}
        </ul>
      )}
    </section>
  )
}
