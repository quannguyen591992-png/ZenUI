'use client'

import { websiteBriefSchema, type WebsiteBrief } from '@zenui/ai-core'
import { createRemoteImagePolicy, validateDesignDocument, type DesignDocument } from '@zenui/design-schema'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EditorApp } from '../../editor/editor-app'

import { GuidedOnboarding } from './onboarding/guided-onboarding'

interface ProjectEditorProps {
  projectId: string
  editorOrigin: string
  previewOrigin: string
  assetOrigin: string
  remoteImageHostAllowlist: string
  deploymentEnabled: boolean
  assistantStyleEnabled?: boolean
  assistantLayoutEnabled?: boolean
  assistantCompositionEnabled?: boolean
}

interface SessionContext { workspaceId: string; role: 'owner' | 'editor' | 'viewer' }
interface LoadedProject {
  workspaceId: string
  role: SessionContext['role']
  name: string
  creationState: 'onboarding' | 'accepted'
  version: number
  document: DesignDocument
  brief: WebsiteBrief | null
}

function projectErrorLabel(code?: string): string {
  switch (code) {
    case 'unauthorized': return 'Vui lòng đăng nhập để mở dự án.'
    case 'forbidden': return 'Bạn không có quyền mở dự án này.'
    case 'not_found': return 'Không tìm thấy dự án.'
    default: return 'Không thể tải dự án. Vui lòng thử lại.'
  }
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: { code?: string } }
  if (!response.ok || body.data === undefined) throw new Error(projectErrorLabel(body.error?.code))
  return body.data
}

export function ProjectEditor({ projectId, editorOrigin, previewOrigin, assetOrigin, remoteImageHostAllowlist, deploymentEnabled, assistantStyleEnabled, assistantLayoutEnabled, assistantCompositionEnabled }: ProjectEditorProps) {
  const [loaded, setLoaded] = useState<LoadedProject | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const load = async () => {
      setError('')
      try {
        const session = await readData<SessionContext>(await fetch('/api/v1/session'))
        const project = await readData<{ name: string; creationState?: 'onboarding' | 'accepted'; version: number; document: unknown }>(
          await fetch(`/api/v1/projects/${projectId}?workspaceId=${encodeURIComponent(session.workspaceId)}`),
        )
        const validation = validateDesignDocument(project.document, {
          imagePolicy: createRemoteImagePolicy(remoteImageHostAllowlist),
        })
        if (!validation.success) throw new Error('Tài liệu của dự án chưa hợp lệ.')
        const briefResponse = await fetch(`/api/v1/projects/${projectId}/brief?workspaceId=${encodeURIComponent(session.workspaceId)}`)
        const briefBody = briefResponse.ok
          ? await briefResponse.json() as { data?: unknown }
          : {}
        const brief = websiteBriefSchema.safeParse(briefBody.data)
        if (active) setLoaded({
          workspaceId: session.workspaceId,
          role: session.role,
          name: project.name,
          creationState: project.creationState ?? 'accepted',
          version: project.version,
          document: validation.data,
          brief: brief.success ? brief.data : null,
        })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Không tìm thấy dự án.')
      }
    }
    void load()
    return () => { active = false }
  }, [attempt, projectId, remoteImageHostAllowlist])

  if (error) {
    return (
      <main className="dashboard-state">
        <h1>Không thể mở dự án</h1>
        <p role="alert">{error}</p>
        {error === 'Vui lòng đăng nhập để mở dự án.' ? (
          <Link href={`/login?callbackUrl=${encodeURIComponent(`/projects/${projectId}`)}`}>Đăng nhập lại</Link>
        ) : (
          <button type="button" onClick={() => setAttempt(value => value + 1)}>Thử tải lại</button>
        )}
      </main>
    )
  }
  if (!loaded) return <main className="editor-loading" role="status">Đang tải trình chỉnh sửa dự án...</main>
  if (loaded.creationState === 'onboarding') {
    if (loaded.role === 'viewer') {
      return <main className="dashboard-state"><p role="alert">Bạn cần quyền chỉnh sửa để chuẩn bị website này.</p></main>
    }
    return (
      <GuidedOnboarding
        projectId={projectId}
        workspaceId={loaded.workspaceId}
        expectedVersion={loaded.version}
        assetOrigin={assetOrigin}
        onAccepted={result => setLoaded(current => current ? {
          ...current,
          creationState: 'accepted',
          version: result.version,
          document: result.document,
          brief: result.brief,
        } : current)}
      />
    )
  }
  return (
    <EditorApp
      projectId={projectId}
      projectName={loaded.name}
      workspaceId={loaded.workspaceId}
      role={loaded.role}
      initialDocument={loaded.document}
      initialVersion={loaded.version}
      editorOrigin={editorOrigin}
      previewOrigin={previewOrigin}
      assetOrigin={assetOrigin}
      deploymentEnabled={deploymentEnabled}
      assistantStyleEnabled={assistantStyleEnabled ?? false}
      assistantLayoutEnabled={assistantLayoutEnabled ?? false}
      assistantCompositionEnabled={assistantCompositionEnabled ?? false}
      brief={loaded.brief}
    />
  )
}
