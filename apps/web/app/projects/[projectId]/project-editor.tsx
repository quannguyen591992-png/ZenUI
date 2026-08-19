'use client'

import { websiteBriefSchema, type WebsiteBrief } from '@zenui/ai-core'
import { createRemoteImagePolicy, validateDesignDocument, type DesignDocument } from '@zenui/design-schema'
import { leadCountSchema } from '@zenui/lead-core'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

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
  const [newLeadCount, setNewLeadCount] = useState(0)
  const [leadAnnouncement, setLeadAnnouncement] = useState('')
  const previousLeadCount = useRef<number | null>(null)
  const canManageLeads = loaded?.role === 'owner'
    || loaded?.role === 'editor'

  const refreshLeadCount = useCallback(async () => {
    if (!loaded || !canManageLeads) return
    try {
      const count = await readData(
        await fetch(
          `/api/v1/projects/${projectId}/leads/count?workspaceId=${encodeURIComponent(loaded.workspaceId)}`,
        ),
      )
      const parsed = leadCountSchema.parse(count)
      if (
        previousLeadCount.current !== null
        && parsed.newCount > previousLeadCount.current
      ) {
        setLeadAnnouncement(
          `${parsed.newCount} khách hàng mới`,
        )
      }
      previousLeadCount.current = parsed.newCount
      setNewLeadCount(parsed.newCount)
    } catch {
      // The editor remains usable when the lightweight badge refresh fails.
    }
  }, [canManageLeads, loaded, projectId])

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

  useEffect(() => {
    if (!canManageLeads || !loaded) return
    void refreshLeadCount()
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshLeadCount()
      }
    }
    const interval = window.setInterval(refreshWhenVisible, 30_000)
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      )
    }
  }, [canManageLeads, loaded?.workspaceId, refreshLeadCount])

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
  const editor = (
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
  if (!canManageLeads) return editor

  return (
    <div className="project-workspace-shell">
      <nav className="project-surface-tabs" aria-label="Khu vực dự án">
        <span aria-current="page">Thiết kế</span>
        <Link href={`/dashboard/customers?projectId=${projectId}`}>
          Khách hàng
          {newLeadCount > 0 && (
            <span className="project-lead-badge" aria-label={`${newLeadCount} khách hàng mới`}>
              {newLeadCount}
            </span>
          )}
        </Link>
      </nav>
      <p className="project-lead-announcement" aria-live="polite">
        {leadAnnouncement}
      </p>
      {editor}
    </div>
  )
}
