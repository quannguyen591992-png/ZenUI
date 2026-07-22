'use client'

import { validateDesignDocument, type DesignDocument } from '@zenui/design-schema'
import { useEffect, useState } from 'react'

import { EditorApp } from '../../editor/editor-app'

interface ProjectEditorProps { projectId: string }

interface SessionContext { workspaceId: string }

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: { message: string } }
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? 'Project not found')
  return body.data
}

export function ProjectEditor({ projectId }: ProjectEditorProps) {
  const [loaded, setLoaded] = useState<{ workspaceId: string; version: number; document: DesignDocument } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setError('')
      try {
        const session = await readData<SessionContext>(await fetch('/api/v1/session'))
        const result = await readData<{ version: number; document: unknown }>(
          await fetch(`/api/v1/projects/${projectId}/document?workspaceId=${encodeURIComponent(session.workspaceId)}`),
        )
        const validation = validateDesignDocument(result.document)
        if (!validation.success) throw new Error('Project document is invalid')
        if (active) setLoaded({ workspaceId: session.workspaceId, version: result.version, document: validation.data })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Project not found')
      }
    }
    void load()
    return () => { active = false }
  }, [attempt, projectId])

  if (error) {
    return (
      <main className="dashboard-state">
        <h1>Project not found</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry editor</button>
      </main>
    )
  }
  if (!loaded) return <main className="editor-loading" role="status">Loading project editor...</main>
  return <EditorApp projectId={projectId} workspaceId={loaded.workspaceId} initialDocument={loaded.document} initialVersion={loaded.version} />
}
