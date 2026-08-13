'use client'

import { shareLinkPublicSchema, type ShareLinkPublic } from '@zenui/share-core'
import { useEffect, useRef, useState } from 'react'

import type { RevisionSummary } from './editor-app'

export interface ShareApi {
  list(projectId: string, workspaceId: string): Promise<ShareLinkPublic[]>
  create(projectId: string, input: { workspaceId: string; revisionId: string; requestId: string }): Promise<ShareLinkPublic>
  disable(projectId: string, workspaceId: string, shareLinkId: string): Promise<ShareLinkPublic>
}

async function data<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('share_request_failed')
  return body.data
}

export const browserShareApi: ShareApi = {
  async list(projectId, workspaceId) {
    const value = await data<unknown[]>(await fetch(`/api/v1/projects/${projectId}/share-links?workspaceId=${encodeURIComponent(workspaceId)}`))
    return value.map(item => shareLinkPublicSchema.parse(item))
  },
  async create(projectId, input) {
    const value = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/share-links`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }))
    return shareLinkPublicSchema.parse(value)
  },
  async disable(projectId, workspaceId, shareLinkId) {
    const value = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/share-links/${shareLinkId}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
    }))
    return shareLinkPublicSchema.parse(value)
  },
}

interface SharePanelProps {
  projectId: string
  workspaceId: string
  revisions: RevisionSummary[]
  presentation?: 'simple' | 'advanced'
  canShare?: boolean
  ensureLatestSavedRevision?: () => Promise<RevisionSummary>
  api?: ShareApi
}

export function SharePanel({
  projectId,
  workspaceId,
  revisions,
  presentation = 'advanced',
  canShare = true,
  ensureLatestSavedRevision,
  api = browserShareApi,
}: SharePanelProps) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [links, setLinks] = useState<ShareLinkPublic[]>([])
  const [revisionId, setRevisionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [confirming, setConfirming] = useState<ShareLinkPublic | null>(null)
  const opener = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || loaded) return
    let active = true
    setError('')
    void api.list(projectId, workspaceId)
      .then(items => { if (active) { setLinks(items); setLoaded(true) } })
      .catch(() => { if (active) { setError('Không thể tải liên kết chia sẻ.'); setLoaded(true) } })
    return () => { active = false }
  }, [api, loaded, open, projectId, workspaceId])

  useEffect(() => {
    if (!revisionId && revisions[0]) setRevisionId(revisions[0].id)
  }, [revisionId, revisions])

  const create = async (): Promise<void> => {
    if (busy || !canShare) return
    setBusy(true)
    setError('')
    try {
      const revision = presentation === 'simple'
        ? await ensureLatestSavedRevision?.()
        : revisions.find(item => item.id === revisionId)
      if (!revision) throw new Error('saved_website_unavailable')
      const link = await api.create(projectId, { workspaceId, revisionId: revision.id, requestId: crypto.randomUUID() })
      setLinks(current => [link, ...current.filter(item => item.id !== link.id)])
      setAnnouncement('Đã tạo liên kết chia sẻ')
    } catch {
      setError('Không thể tạo liên kết chia sẻ. Hãy thử lại.')
    } finally {
      setBusy(false)
    }
  }

  const disable = async (link: ShareLinkPublic): Promise<void> => {
    if (busy || link.status !== 'active') return
    setBusy(true)
    setError('')
    try {
      const disabled = await api.disable(projectId, workspaceId, link.id)
      setLinks(current => current.map(item => item.id === disabled.id ? disabled : item))
      setAnnouncement('Đã tắt liên kết chia sẻ')
      setConfirming(null)
      window.setTimeout(() => opener.current?.focus())
    } catch {
      setError('Không thể tắt liên kết chia sẻ.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (link: ShareLinkPublic): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link.url)
      setAnnouncement('Đã sao chép liên kết chia sẻ')
    } catch {
      setError('Không thể sao chép liên kết chia sẻ.')
    }
  }

  const revisionName = (id: string): string => revisions.find(revision => revision.id === id)?.summary ?? 'Website đã lưu'
  const statusLabel = (status: ShareLinkPublic['status']): string => status === 'active' ? 'Đang hoạt động' : status === 'disabled' ? 'Đã tắt' : 'Đã hết hạn'

  return (
    <section className="share-panel" aria-label="Chia sẻ công khai">
      <button ref={opener} type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>Chia sẻ</button>
      {open && (
        <div className="share-popover" role="dialog" aria-modal="false" aria-label="Chia sẻ website">
          <h2>{presentation === 'simple'
            ? links.some(link => link.leadFormsLive)
              ? 'Chia sẻ website để nhận khách hàng'
              : 'Chia sẻ website'
            : 'Chia sẻ phiên bản'}</h2>
          {presentation === 'simple' ? (
            <>
              <p>Ai có liên kết đều có thể xem website đã lưu mới nhất.</p>
              {links.some(link => link.leadFormsLive) && (
                <p>Thông tin khách hàng được lưu tối đa 90 ngày.</p>
              )}
              <p>Công cụ tìm kiếm được yêu cầu không lập chỉ mục liên kết này.</p>
              {!canShare && <p role="status">Hãy đợi website lưu xong trước khi tạo liên kết mới.</p>}
            </>
          ) : revisions.length === 0 ? <p>Hãy tạo một phiên bản trước khi chia sẻ.</p> : (
            <label>
              Phiên bản
              <select aria-label="Phiên bản để chia sẻ" value={revisionId} onChange={event => setRevisionId(event.target.value)}>
                {revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.summary}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={busy || !canShare || (presentation === 'advanced' && !revisionId)} onClick={() => void create()}>Tạo liên kết chia sẻ</button>
          {!loaded ? <p role="status">Đang tải liên kết chia sẻ...</p> : null}
          {loaded && links.length === 0 && !error ? <p>Chưa có liên kết chia sẻ.</p> : null}
          {links.length > 0 && (
            <ul>
              {links.map(link => {
                const name = revisionName(link.revisionId)
                return (
                  <li key={link.id}>
                    <span>{presentation === 'simple'
                      ? link.leadFormsLive
                        ? 'Website nhận khách hàng'
                        : 'Website được chia sẻ'
                      : name}</span>
                    <strong>{statusLabel(link.status)}</strong>
                    {link.status === 'active' && <a href={link.url} target="_blank" rel="noreferrer" aria-label={presentation === 'simple' ? 'Mở website được chia sẻ' : `Mở ${name}`}>Mở</a>}
                    <button type="button" disabled={busy} aria-label={presentation === 'simple' ? 'Sao chép liên kết chia sẻ' : `Sao chép liên kết ${name}`} onClick={() => void copy(link)}>Sao chép</button>
                    <button
                      type="button"
                      disabled={busy || link.status !== 'active'}
                      aria-label={presentation === 'simple' ? 'Tắt liên kết chia sẻ' : `Tắt liên kết ${name}`}
                      onClick={() => presentation === 'simple' ? setConfirming(link) : void disable(link)}
                    >Tắt</button>
                    {presentation === 'simple' && (
                      <details>
                        <summary>Chi tiết nâng cao</summary>
                        <p>Revision {link.revisionId}</p>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {error && <p role="alert">{error}</p>}
          {announcement && <p role="status" aria-live="polite">{announcement}</p>}
        </div>
      )}
      {confirming && (
        <div className="editor-dialog-backdrop">
          <section role="dialog" aria-modal="true" aria-label="Tắt liên kết chia sẻ?" className="editor-dialog">
            <h2>Tắt liên kết chia sẻ?</h2>
            <p>Người đang có liên kết sẽ không thể tiếp tục mở website này.</p>
            <div>
              <button type="button" onClick={() => setConfirming(null)}>Giữ liên kết</button>
              <button type="button" autoFocus disabled={busy} onClick={() => void disable(confirming)}>Xác nhận tắt liên kết</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
