'use client'

import { parseDesignDocument, type DesignDocument } from '@zenui/design-schema'
import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { DesignDocumentRenderer } from './components/design-document-renderer'

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

function ProjectThumbnail({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const [doc, setDoc] = useState<DesignDocument | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const response = await fetch(`/api/v1/projects/${projectId}?workspaceId=${workspaceId}`)
        const project = await readResponse<{ document: unknown }>(response)
        const document = parseDesignDocument(project.document)
        if (!mounted) return
        if (document.success) setDoc(document.data)
        else setError(true)
      } catch {
        if (mounted) setError(true)
      }
    })()
    return () => { mounted = false }
  }, [projectId, workspaceId])

  if (error) return (
    <div className="thumbnail-fallback">
      <span></span>
    </div>
  )

  if (!doc) return (
    <div className="thumbnail-loading">
      <div className="thumbnail-spinner"></div>
    </div>
  )

  return (
    <div className="thumbnail-render-wrapper">
      <DesignDocumentRenderer document={doc} viewport="desktop" compact={true} />
    </div>
  )
}

export function Dashboard() {
  const [session, setSession] = useState<SessionContext | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [pending, setPending] = useState(false)

  // New UI states
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'archived'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

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

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.project-context-menu')) {
        setActiveDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loadState === 'loading') {
    return (
      <main className="dashboard-state" role="status">
        <div className="loader">Đang tải dự án...</div>
      </main>
    )
  }
  if (loadState === 'error') {
    return (
      <main className="dashboard-state">
        <div className="error-card">
          <p role="alert">{error}</p>
          {error === 'Vui lòng đăng nhập để tiếp tục.' ? (
            <Link href="/login?callbackUrl=%2Fdashboard" className="btn-primary">Đăng nhập lại</Link>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void load()}>Thử lại</button>
          )}
        </div>
      </main>
    )
  }

  const canManage = session?.role === 'owner'

  // Filter projects
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTab = activeTab === 'all' || p.status === activeTab
    return matchesSearch && matchesTab
  })


  return (
    <main className="dashboard-main">
        {/* Top Header */}
        <header className="main-header">
          <div className="search-bar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input
              type="text"
              placeholder="Tìm kiếm dự án..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="header-actions">
            {canManage && (
              <form className="create-form" onSubmit={event => void createProject(event)}>
                <input
                  aria-label="Tên dự án"
                  placeholder="Tên dự án mới..."
                  value={name}
                  onChange={event => setName(event.target.value)}
                  maxLength={100}
                />
                <button type="submit" className="btn-primary" disabled={pending || !name.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Tạo dự án
                </button>
              </form>
            )}
          </div>
        </header>

        {error && <div className="error-banner" role="alert"><p>{error}</p></div>}

        <div className="dashboard-content">
          {projects.length === 0 ? (
            <section className="empty-state">
              <div className="empty-illustration">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
              </div>
              <h1>Chào mừng đến với ZenUI</h1>
              <p>Không gian làm việc của bạn hiện đang trống. Hãy tạo một dự án mới để bắt đầu thiết kế.</p>
            </section>
          ) : (
            <>
              {/* Toolbar: Tabs & View Toggle */}
              <div className="content-toolbar">
                <div className="tabs">
                  <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Tất cả</button>
                  <button className={activeTab === 'active' ? 'active' : ''} onClick={() => setActiveTab('active')}>Hoạt động</button>
                  <button className={activeTab === 'archived' ? 'active' : ''} onClick={() => setActiveTab('archived')}>Đã lưu trữ</button>
                </div>

                <div className="view-toggle">
                  <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')} aria-label="Grid view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  </button>
                  <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} aria-label="List view">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  </button>
                </div>
              </div>

              {filteredProjects.length === 0 ? (
                <div className="empty-search">Không tìm thấy dự án nào phù hợp.</div>
              ) : (
                <div className={`project-${viewMode}`}>
                  {filteredProjects.map(project => (
                    <div key={project.id} className="project-card">
                      {renameId === project.id ? (
                        <form className="rename-form" onSubmit={event => { event.preventDefault(); void renameProject(project.id) }}>
                          <div className="thumbnail">
                            <ProjectThumbnail projectId={project.id} workspaceId={project.workspaceId} />
                          </div>
                          <div className="rename-inputs">
                            <input autoFocus aria-label="Đổi tên dự án" value={renameName} onChange={event => setRenameName(event.target.value)} />
                            <button type="submit" className="btn-primary" disabled={pending}>Lưu</button>
                            <button type="button" className="btn-ghost" onClick={() => setRenameId(null)}>Hủy</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="project-link" style={{ position: 'relative' }}>
                            <Link href={`/projects/${project.id}`} aria-label={`Mở ${project.name}`} style={{ position: 'absolute', inset: 0, zIndex: 10 }} />
                            <div className="thumbnail">
                              <ProjectThumbnail projectId={project.id} workspaceId={project.workspaceId} />
                              <div className="thumbnail-overlay">Mở dự án</div>
                            </div>
                            <div className="project-info">
                              <h3>{project.name}</h3>
                              <span className="version">Phiên bản {project.version}</span>
                            </div>
                          </div>

                          {canManage && (
                            <div className="project-context-menu">
                              <button
                                className="btn-more"
                                aria-label={`Tùy chọn cho ${project.name}`}
                                aria-expanded={activeDropdown === project.id}
                                aria-haspopup="menu"
                                onClick={() => setActiveDropdown(activeDropdown === project.id ? null : project.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                              </button>

                              {activeDropdown === project.id && (
                                <div className="dropdown-menu" role="menu">
                                  <button role="menuitem" aria-label={`Đổi tên ${project.name}`} onClick={() => { setRenameId(project.id); setRenameName(project.name); setActiveDropdown(null) }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    Đổi tên
                                  </button>
                                  <div className="divider"></div>
                                  <button role="menuitem" aria-label={`Xóa ${project.name}`} className="text-danger" onClick={() => { void archiveProject(project.id); setActiveDropdown(null) }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Xóa dự án
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
    </main>
  )
}
