'use client'

import {
  deploymentPublicSchema,
  providerConnectionPublicSchema,
  type DeploymentPublic,
  type ProviderConnectionPublic,
} from '@zenui/deployment-core'
import { useEffect, useRef, useState } from 'react'

import { deploymentErrorLabel } from '../../lib/ui-copy'

import { inspectProviderPopup, PROVIDER_POPUP_MAX_ATTEMPTS, PROVIDER_POPUP_POLL_INTERVAL_MS } from './provider-popup-monitor'

interface RevisionSummary {
  id: string
  summary: string
  source: string
  createdAt: string
}

export interface DeployApi {
  getConnection(workspaceId: string): Promise<ProviderConnectionPublic | null>
  authorize(input: { workspaceId: string; returnPath: string }): Promise<{ url: string }>
  disconnect(workspaceId: string): Promise<ProviderConnectionPublic>
  create(projectId: string, input: {
    workspaceId: string
    revisionId: string
    requestId: string
    target: 'preview' | 'production'
    confirmed: true
  }): Promise<DeploymentPublic>
  get(projectId: string, workspaceId: string, deploymentId: string): Promise<DeploymentPublic>
  disableLeadForms(
    projectId: string,
    workspaceId: string,
    deploymentId: string,
  ): Promise<DeploymentPublic>
}

async function data<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('deploy_request_failed')
  return body.data
}

export const browserDeployApi: DeployApi = {
  async getConnection(workspaceId) {
    const result = await data<unknown>(await fetch(`/api/v1/provider-connections/vercel?workspaceId=${encodeURIComponent(workspaceId)}`))
    return result === null ? null : providerConnectionPublicSchema.parse(result)
  },
  async authorize(input) {
    return data(await fetch('/api/v1/provider-connections/vercel/authorize', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }))
  },
  async disconnect(workspaceId) {
    const result = await data<unknown>(await fetch(`/api/v1/provider-connections/vercel?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
    }))
    return providerConnectionPublicSchema.parse(result)
  },
  async create(projectId, input) {
    const result = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/deployments`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }))
    return deploymentPublicSchema.parse(result)
  },
  async get(projectId, workspaceId, deploymentId) {
    const result = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/deployments/${deploymentId}?workspaceId=${encodeURIComponent(workspaceId)}`))
    return deploymentPublicSchema.parse(result)
  },
  async disableLeadForms(projectId, workspaceId, deploymentId) {
    const result = await data<unknown>(await fetch(
      `/api/v1/projects/${projectId}/deployments/${deploymentId}/lead-forms?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' },
    ))
    return deploymentPublicSchema.parse(result)
  },
}

interface DeployPanelProps {
  projectId: string
  workspaceId: string
  revisions: RevisionSummary[]
  api?: DeployApi
  enabled?: boolean
}

export function DeployPanel({ projectId, workspaceId, revisions, api = browserDeployApi, enabled = true }: DeployPanelProps) {
  const [open, setOpen] = useState(false)
  const [connection, setConnection] = useState<ProviderConnectionPublic | null>(null)
  const [loadingConnection, setLoadingConnection] = useState(false)
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? '')
  const [target, setTarget] = useState<'preview' | 'production'>('preview')
  const [confirmed, setConfirmed] = useState(false)
  const [deployment, setDeployment] = useState<DeploymentPublic | null>(null)
  const [leadFormsDisabled, setLeadFormsDisabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<number | null>(null)
  const popup = useRef<Window | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    if (!revisionId && revisions[0]) setRevisionId(revisions[0].id)
  }, [revisionId, revisions])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    popup.current?.close()
  }, [])

  const loadConnection = async (): Promise<ProviderConnectionPublic | null> => {
    const result = await api.getConnection(workspaceId)
    setConnection(result)
    return result
  }

  const show = async (): Promise<void> => {
    setOpen(current => !current)
    if (open || !enabled) return
    setLoadingConnection(true)
    setError('')
    try { await loadConnection() } catch { setError('Không thể tải kết nối Vercel.') } finally { setLoadingConnection(false) }
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.authorize({ workspaceId, returnPath: `/projects/${projectId}` })
      popup.current = window.open(result.url, 'zenui-vercel-connect', 'popup,width=720,height=720')
      if (!popup.current) throw new Error('popup_blocked')
      let attempts = 0
      const returnPath = `/projects/${projectId}`
      const poll = async (): Promise<void> => {
        const activePopup = popup.current
        if (!activePopup) return
        const state = inspectProviderPopup(activePopup, window.location.origin, returnPath)
        if (state === 'misconfigured') {
          activePopup.close()
          setBusy(false)
          setError('Redirect URL của Vercel chưa trỏ đến callback của ZenUI. Hãy cập nhật cấu hình rồi kết nối lại.')
          return
        }
        if (state === 'closed') {
          setBusy(false)
          return
        }
        try {
          const current = await loadConnection()
          if (current?.status === 'connected') {
            setBusy(false)
            activePopup.close()
            return
          }
        } catch {
          // Callback có thể vẫn đang hoàn tất; giữ vòng kiểm tra có giới hạn.
        }
        attempts += 1
        if (attempts >= PROVIDER_POPUP_MAX_ATTEMPTS) {
          activePopup.close()
          setBusy(false)
          setError('Kết nối Vercel mất quá nhiều thời gian. Hãy kiểm tra Redirect URL rồi thử lại.')
          return
        }
        timer.current = window.setTimeout(() => void poll(), PROVIDER_POPUP_POLL_INTERVAL_MS)
      }
      timer.current = window.setTimeout(() => void poll(), PROVIDER_POPUP_POLL_INTERVAL_MS)
    } catch (failure) {
      setBusy(false)
      setError(failure instanceof Error && failure.message === 'popup_blocked' ? 'Trình duyệt đã chặn cửa sổ bật lên. Hãy cho phép rồi thử lại.' : 'Không thể kết nối Vercel.')
    }
  }

  const disconnect = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.disconnect(workspaceId)
      setConnection(null)
      setDeployment(null)
    } catch { setError('Không thể ngắt kết nối Vercel.') } finally { setBusy(false) }
  }

  const pollDeployment = async (deploymentId: string): Promise<void> => {
    try {
      const current = await api.get(projectId, workspaceId, deploymentId)
      setDeployment(current)
      if (current.status === 'queued' || current.status === 'uploading' || current.status === 'building') {
        timer.current = window.setTimeout(() => void pollDeployment(deploymentId), 250)
      } else {
        setBusy(false)
      }
    } catch {
      setBusy(false)
      setError('Không thể cập nhật trạng thái triển khai.')
    }
  }

  const deploy = async (): Promise<void> => {
    if (submitting.current || busy || !revisionId || !confirmed || connection?.status !== 'connected') return
    submitting.current = true
    setConfirmed(false)
    setBusy(true)
    setError('')
    try {
      const created = await api.create(projectId, {
        workspaceId, revisionId, requestId: crypto.randomUUID(), target, confirmed: true,
      })
      setLeadFormsDisabled(false)
      setDeployment(created)
      await pollDeployment(created.id)
    } catch {
      setBusy(false)
      setError('Không thể bắt đầu triển khai.')
    } finally {
      submitting.current = false
    }
  }

  const disableLeadForms = async (): Promise<void> => {
    if (!deployment?.leadFormsLive || busy) return
    setBusy(true)
    setError('')
    try {
      setDeployment(await api.disableLeadForms(
        projectId,
        workspaceId,
        deployment.id,
      ))
      setLeadFormsDisabled(true)
    } catch {
      setError('Không thể tắt nhận khách hàng.')
    } finally {
      setBusy(false)
    }
  }

  const inProgress = deployment?.status === 'queued' || deployment?.status === 'uploading' || deployment?.status === 'building'

  return (
    <section className="deploy-panel" aria-label="Triển khai qua Vercel">
      <button type="button" aria-expanded={open} onClick={() => void show()}>Triển khai</button>
      {open && (
        <div className="deploy-popover">
          <h2>Triển khai phiên bản</h2>
          {!enabled ? <p role="status">Triển khai Vercel chưa được cấu hình cho môi trường này.</p> : null}
          {enabled && loadingConnection ? <p role="status">Đang tải kết nối Vercel...</p> : null}
          {enabled && !loadingConnection && connection?.status === 'connected' ? (
            <>
              <p role="status">Vercel đã kết nối</p>
              <button type="button" disabled={busy || inProgress} onClick={() => void disconnect()}>Ngắt kết nối Vercel</button>
            </>
          ) : enabled && !loadingConnection ? (
            <>
              <p>Kết nối Vercel để triển khai một phiên bản.</p>
              <button type="button" disabled={busy} onClick={() => void connect()}>Kết nối Vercel</button>
            </>
          ) : null}

          {enabled && (revisions.length === 0 ? <p>Hãy tạo một phiên bản trước khi triển khai.</p> : (
            <>
              <label>
                Phiên bản
                <select aria-label="Phiên bản triển khai" value={revisionId} disabled={busy} onChange={event => setRevisionId(event.target.value)}>
                  {revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.summary}</option>)}
                </select>
              </label>
              <label>
                Môi trường triển khai
                <select aria-label="Môi trường triển khai" value={target} disabled={busy} onChange={event => {
                  setTarget(event.target.value as 'preview' | 'production')
                  setConfirmed(false)
                }}>
                  <option value="preview">Xem thử</option>
                  <option value="production">Chính thức</option>
                </select>
              </label>
              <label>
                <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
                Tôi xác nhận triển khai phiên bản bất biến này
              </label>
              <button type="button" disabled={busy || !confirmed || connection?.status !== 'connected'} onClick={() => void deploy()}>
                Bắt đầu triển khai
              </button>
            </>
          ))}

          {deployment?.status === 'queued' && <p role="status">Đang chờ triển khai</p>}
          {deployment?.status === 'uploading' && <p role="status">Đang tải tệp bất biến lên</p>}
          {deployment?.status === 'building' && <p role="status">Vercel đang dựng website</p>}
          {deployment?.status === 'ready' && deployment.url && (
            <div>
              <p role="status">Triển khai đã sẵn sàng</p>
              <a href={deployment.url} target="_blank" rel="noreferrer">Mở website đã triển khai</a>
              {deployment.leadFormsLive ? (
                <div>
                  <p>Lead Form đang gửi thông tin về Customer Leads. Dữ liệu được lưu tối đa 90 ngày.</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void disableLeadForms()}
                  >
                    {busy ? 'Đang tắt nhận khách hàng...' : 'Tắt nhận khách hàng'}
                  </button>
                </div>
              ) : leadFormsDisabled ? (
                <p role="status">Đã tắt nhận khách hàng cho lần triển khai này.</p>
              ) : null}
            </div>
          )}
          {deployment?.status === 'failed' && deployment.errorCode && <p role="alert">{deploymentErrorLabel(deployment.errorCode)}</p>}
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </section>
  )
}
