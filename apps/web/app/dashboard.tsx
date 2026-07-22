'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

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

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as SuccessEnvelope<T> | ErrorEnvelope
  if (!response.ok || !('data' in body)) {
    throw new Error('error' in body ? body.error.message : 'Request failed')
  }
  return body.data
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
      setError(loadError instanceof Error ? loadError.message : 'Unable to load projects')
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
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to create project')
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
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to rename project')
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
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to archive project')
    } finally {
      setPending(false)
    }
  }

  if (loadState === 'loading') return <main className="dashboard-state" role="status">Loading projects...</main>
  if (loadState === 'error') {
    return (
      <main className="dashboard-state">
        <p role="alert">{error}</p>
        <button type="button" onClick={() => void load()}>Retry</button>
      </main>
    )
  }

  const canManage = session?.role === 'owner'
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><strong>ZenUI</strong><p>Workspace projects</p></div>
        <span>{session?.role}</span>
      </header>
      {error && <p role="alert">{error}</p>}
      {canManage && (
        <form className="project-create" onSubmit={event => void createProject(event)}>
          <label>Project name<input aria-label="Project name" value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label>
          <button type="submit" disabled={pending || !name.trim()}>Create project</button>
        </form>
      )}
      {projects.length === 0 ? (
        <section className="empty-state"><h1>No projects yet</h1><p>Create a project to start designing.</p></section>
      ) : (
        <section aria-labelledby="projects-heading">
          <h1 id="projects-heading">Projects</h1>
          <ul className="project-list">
            {projects.map(project => (
              <li key={project.id}>
                {renameId === project.id ? (
                  <form onSubmit={event => { event.preventDefault(); void renameProject(project.id) }}>
                    <label>Rename project<input aria-label="Rename project" value={renameName} onChange={event => setRenameName(event.target.value)} /></label>
                    <button type="submit" disabled={pending}>Save project name</button>
                  </form>
                ) : (
                  <>
                    <Link href={`/projects/${project.id}`} aria-label={`Open ${project.name}`}><strong>{project.name}</strong><span>Version {project.version}</span></Link>
                    {canManage && <div className="project-actions">
                      <button type="button" aria-label={`Rename ${project.name}`} onClick={() => { setRenameId(project.id); setRenameName(project.name) }}>Rename</button>
                      <button type="button" aria-label={`Archive ${project.name}`} onClick={() => void archiveProject(project.id)}>Archive</button>
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
