'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { roleLabel } from '../lib/ui-copy'

type Role = 'owner' | 'editor' | 'viewer'

interface SessionContext {
  userId: string
  workspaceId: string
  role: Role
}

interface ProjectSummary {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  version: number
}

interface SuccessEnvelope<T> { data: T }
interface ErrorEnvelope { error: { code: string; message: string } }

interface DashboardProps {
  localAuth?: boolean
  signOutAction?: () => Promise<void>
}

type LoadState = 'loading' | 'ready' | 'error'

function requestError(code?: string): string {
  switch (code) {
    case 'unauthorized': return 'Vui lòng đăng nhập để tiếp tục.'
    case 'forbidden': return 'Bạn không có quyền thực hiện thao tác này.'
    case 'not_found': return 'Không tìm thấy dữ liệu được yêu cầu.'
    case 'validation_error': return 'Thông tin gửi lên chưa hợp lệ.'
    default: return 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.'
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as SuccessEnvelope<T> | ErrorEnvelope
  if (!response.ok || !('data' in body)) {
    throw new Error('error' in body ? requestError(body.error.code) : requestError())
  }
  return body.data
}

export function Dashboard({ localAuth = false, signOutAction }: DashboardProps = {}) {
  const [session, setSession] = useState<SessionContext | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    setError('')
    try {
      const current = await readResponse<SessionContext>(await fetch('/api/v1/session'))
      const list = await readResponse<ProjectSummary[]>(
        await fetch(`/api/v1/projects?workspaceId=${encodeURIComponent(current.workspaceId)}`),
      )
      setSession(current)
      setProjects(list)
      setLoadState('ready')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách dự án.')
      setLoadState('error')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const createProject = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || !name.trim()) return
    setPending(true)
    setError('')
    try {
      const created = await readResponse<ProjectSummary>(await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: session.workspaceId, name: name.trim() }),
      }))
      setProjects(current => [...current, created])
      setName('')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Không thể tạo dự án.')
    } finally {
      setPending(false)
    }
  }

  const renameProject = async (projectId: string) => {
    if (!session || !renameName.trim()) return
    setPending(true)
    try {
      const updated = await readResponse<ProjectSummary>(await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: session.workspaceId, name: renameName.trim() }),
      }))
      setProjects(current => current.map(project => project.id === updated.id ? updated : project))
      setRenameId(null)
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Không thể đổi tên dự án.')
    } finally {
      setPending(false)
    }
  }

  const archiveProject = async (projectId: string) => {
    if (!session) return
    setPending(true)
    try {
      const archived = await readResponse<ProjectSummary>(await fetch(`/api/v1/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: session.workspaceId }),
      }))
      setProjects(current => current.filter(project => project.id !== archived.id))
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Không thể xóa dự án.')
    } finally {
      setPending(false)
    }
  }

  if (loadState === 'loading') return <main className="dashboard-state" role="status">Đang tải dự án...</main>
  if (loadState === 'error') {
    return (
      <main className="dashboard-state">
        <p role="alert">{error}</p>
        {error === 'Vui lòng đăng nhập để tiếp tục.' ? (
          <Link href="/login?callbackUrl=%2Fdashboard">Đăng nhập lại</Link>
        ) : (
          <button type="button" onClick={() => void load()}>Thử lại</button>
        )}
      </main>
    )
  }

  const canManage = session?.role === 'owner'
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><Link href="/" className="dashboard-brand">ZenUI</Link><p>Dự án trong không gian làm việc</p></div>
        <div className="dashboard-account">
          {session ? <span>{roleLabel(session.role)}</span> : null}
          {localAuth ? (
            <form action="/api/local/session/logout" method="post">
              <button type="submit">Đăng xuất</button>
            </form>
          ) : signOutAction ? (
            <form action={signOutAction}>
              <button type="submit">Đăng xuất</button>
            </form>
          ) : null}
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {canManage && (
        <form className="project-create" onSubmit={event => void createProject(event)}>
          <label>Tên dự án<input aria-label="Tên dự án" value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label>
          <button type="submit" disabled={pending || !name.trim()}>Tạo dự án</button>
        </form>
      )}
      {projects.length === 0 ? (
        <section className="empty-state"><h1>Chưa có dự án</h1><p>Tạo một dự án để bắt đầu thiết kế.</p></section>
      ) : (
        <section aria-labelledby="projects-heading">
          <h1 id="projects-heading">Dự án</h1>
          <ul className="project-list">
            {projects.map(project => (
              <li key={project.id}>
                {renameId === project.id ? (
                  <form onSubmit={event => { event.preventDefault(); void renameProject(project.id) }}>
                    <label>Đổi tên dự án<input aria-label="Đổi tên dự án" value={renameName} onChange={event => setRenameName(event.target.value)} /></label>
                    <button type="submit" disabled={pending}>Lưu tên dự án</button>
                  </form>
                ) : (
                  <>
                    <Link href={`/projects/${project.id}`} aria-label={`Mở ${project.name}`}><strong>{project.name}</strong><span>Phiên bản {project.version}</span></Link>
                    {canManage && <div className="project-actions">
                      <button type="button" aria-label={`Đổi tên ${project.name}`} onClick={() => { setRenameId(project.id); setRenameName(project.name) }}>Đổi tên</button>
                      <button type="button" aria-label={`Xóa ${project.name}`} onClick={() => void archiveProject(project.id)}>Xóa</button>
                    </div>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
