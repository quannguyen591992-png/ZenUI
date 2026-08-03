'use client'

import {
  deploymentPublicSchema,
  providerConnectionPublicSchema,
  type DeploymentPublic,
  type ProviderConnectionPublic,
} from '@zenui/deployment-core'
import { useEffect, useRef, useState } from 'react'

import type { RevisionSummary } from './editor-app'

export interface PublishApi {
  getConnection(workspaceId: string): Promise<ProviderConnectionPublic | null>
  authorize(input: { workspaceId: string; returnPath: string }): Promise<{ url: string }>
  list(projectId: string, workspaceId: string): Promise<DeploymentPublic[]>
  create(projectId: string, input: {
    workspaceId: string
    revisionId: string
    requestId: string
    target: 'production'
    confirmed: true
  }): Promise<DeploymentPublic>
  get(projectId: string, workspaceId: string, deploymentId: string): Promise<DeploymentPublic>
}

async function data<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('publish_request_failed')
  return body.data
}

export const browserPublishApi: PublishApi = {
  async getConnection(workspaceId) {
    const result = await data<unknown>(await fetch(`/api/v1/provider-connections/vercel?workspaceId=${encodeURIComponent(workspaceId)}`))
    return result === null ? null : providerConnectionPublicSchema.parse(result)
  },
  async authorize(input) {
    return data(await fetch('/api/v1/provider-connections/vercel/authorize', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }))
  },
  async list(projectId, workspaceId) {
    const result = await data<unknown[]>(await fetch(`/api/v1/projects/${projectId}/deployments?workspaceId=${encodeURIComponent(workspaceId)}`))
    return result.map(item => deploymentPublicSchema.parse(item))
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
}

interface PublishPanelProps {
  projectId: string
  workspaceId: string
  projectName: string
  primaryAction: string
  canPublish: boolean
  enabled: boolean
  ensureLatestSavedRevision: () => Promise<RevisionSummary>
  api?: PublishApi
}

export function PublishPanel({
  projectId,
  workspaceId,
  projectName,
  primaryAction,
  canPublish,
  enabled,
  ensureLatestSavedRevision,
  api = browserPublishApi,
}: PublishPanelProps) {
  const [open, setOpen] = useState(false)
  const [connection, setConnection] = useState<ProviderConnectionPublic | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [deployment, setDeployment] = useState<DeploymentPublic | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<number | null>(null)
  const popup = useRef<Window | null>(null)
  const submitting = useRef(false)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    popup.current?.close()
  }, [])

  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const [currentConnection, deployments] = await Promise.all([
        api.getConnection(workspaceId),
        api.list(projectId, workspaceId),
      ])
      setConnection(currentConnection)
      setDeployment(deployments.find(item => item.target === 'production' && item.status === 'ready') ?? null)
    } catch {
      setError('Không thể tải trạng thái xuất bản. Hãy thử lại.')
    } finally {
      setLoading(false)
    }
  }

  const show = (): void => {
    setOpen(current => !current)
    if (!open) void load()
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.authorize({ workspaceId, returnPath: `/projects/${projectId}` })
      popup.current = window.open(result.url, 'zenui-publishing-connect', 'popup,width=720,height=720')
      if (!popup.current) throw new Error('popup_blocked')
      const poll = async (): Promise<void> => {
        try {
          const current = await api.getConnection(workspaceId)
          setConnection(current)
          if (current?.status === 'connected') {
            setBusy(false)
            popup.current?.close()
            return
          }
        } catch {
          // Callback có thể vẫn đang hoàn tất; tiếp tục vòng kiểm tra có giới hạn bởi popup.
        }
        if (popup.current?.closed) {
          setBusy(false)
          return
        }
        timer.current = window.setTimeout(() => void poll(), 250)
      }
      timer.current = window.setTimeout(() => void poll(), 250)
    } catch (failure) {
      setBusy(false)
      setError(failure instanceof Error && failure.message === 'popup_blocked'
        ? 'Trình duyệt đã chặn cửa sổ kết nối. Hãy cho phép rồi thử lại.'
        : 'Không thể kết nối dịch vụ xuất bản. Hãy thử lại.')
    }
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
      setError('Chưa thể cập nhật kết quả xuất bản. Hãy kiểm tra lại sau.')
    }
  }

  const publish = async (): Promise<void> => {
    if (submitting.current || busy || !canPublish || !confirmed || connection?.status !== 'connected') return
    submitting.current = true
    setBusy(true)
    setConfirmed(false)
    setError('')
    try {
      const revision = await ensureLatestSavedRevision()
      const created = await api.create(projectId, {
        workspaceId,
        revisionId: revision.id,
        requestId: crypto.randomUUID(),
        target: 'production',
        confirmed: true,
      })
      setDeployment(created)
      await pollDeployment(created.id)
    } catch {
      setBusy(false)
      setError('Không thể bắt đầu xuất bản. Hãy thử lại.')
    } finally {
      submitting.current = false
    }
  }

  const copy = async (): Promise<void> => {
    if (!deployment?.url) return
    try {
      await navigator.clipboard.writeText(deployment.url)
    } catch {
      setError('Không thể sao chép địa chỉ website.')
    }
  }

  const connected = connection?.status === 'connected'
  const inProgress = deployment?.status === 'queued' || deployment?.status === 'uploading' || deployment?.status === 'building'

  return (
    <section className="publish-panel" aria-label="Xuất bản website">
      <button type="button" aria-expanded={open} onClick={show}>Xuất bản</button>
      {open && (
        <div className="publish-popover" role="dialog" aria-modal="false" aria-label="Xuất bản website">
          <h2>Xuất bản website</h2>
          <p>Hành động này sẽ đưa website đã lưu mới nhất lên mạng.</p>
          <dl>
            <div><dt>Dự án</dt><dd>{projectName}</dd></div>
            <div><dt>Hành động chính</dt><dd>{primaryAction || 'Chưa có thông tin'}</dd></div>
            <div><dt>Đích đến</dt><dd>Website công khai</dd></div>
          </dl>

          {!enabled ? <p role="status">Dịch vụ xuất bản chưa được cấu hình cho môi trường này.</p> : null}
          {enabled && loading ? <p role="status">Đang kiểm tra khả năng xuất bản...</p> : null}
          {enabled && !loading && !connected ? (
            <>
              <p>Kết nối dịch vụ xuất bản để đưa website lên mạng.</p>
              <button type="button" disabled={busy} onClick={() => void connect()}>Kết nối dịch vụ xuất bản</button>
            </>
          ) : null}
          {enabled && !loading && connected ? <p role="status">Dịch vụ xuất bản đã sẵn sàng</p> : null}
          {!canPublish && <p role="status">Hãy đợi website lưu xong trước khi xuất bản.</p>}

          {enabled && connected && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || !canPublish}
                  onChange={event => setConfirmed(event.target.checked)}
                />
                Tôi hiểu website này sẽ trở thành công khai
              </label>
              <button type="button" disabled={busy || !canPublish || !confirmed} onClick={() => void publish()}>Xuất bản website</button>
            </>
          )}

          {inProgress && <p role="status">Đang chuẩn bị website công khai...</p>}
          {deployment?.status === 'ready' && deployment.url && (
            <div className="publish-ready">
              <p role="status">Website của bạn đã được xuất bản</p>
              <a href={deployment.url} target="_blank" rel="noreferrer">Mở website</a>
              <button type="button" onClick={() => void copy()}>Sao chép địa chỉ</button>
            </div>
          )}
          {deployment?.status === 'failed' && <p role="alert">Không thể hoàn tất xuất bản. Website của bạn chưa được công khai; hãy thử lại.</p>}
          {error && <p role="alert">{error}</p>}

          <details>
            <summary>Chi tiết nâng cao</summary>
            <dl>
              <div><dt>Provider</dt><dd>Vercel</dd></div>
              <div><dt>Target</dt><dd>production</dd></div>
              {deployment && <div><dt>Revision</dt><dd>{deployment.revisionId}</dd></div>}
              {deployment && <div><dt>Trạng thái kỹ thuật</dt><dd>{deployment.status}</dd></div>}
            </dl>
          </details>
        </div>
      )}
    </section>
  )
}
