'use client'

import { exportRunPublicSchema, type ExportRunPublic } from '@zenui/export-core'
import { useEffect, useRef, useState } from 'react'

import { exportErrorLabel } from '../../lib/ui-copy'

export interface ExportApi {
  create(projectId: string, input: { workspaceId: string; requestId: string; expectedVersion: number }): Promise<ExportRunPublic>
  get(projectId: string, workspaceId: string, exportId: string): Promise<ExportRunPublic>
}

async function data<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('export_request_failed')
  return body.data
}

export const browserExportApi: ExportApi = {
  async create(projectId, input) {
    const result = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/exports`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }))
    return exportRunPublicSchema.parse(result)
  },
  async get(projectId, workspaceId, exportId) {
    const result = await data<unknown>(await fetch(`/api/v1/projects/${projectId}/exports/${exportId}?workspaceId=${encodeURIComponent(workspaceId)}`))
    return exportRunPublicSchema.parse(result)
  },
}

interface ExportPanelProps {
  projectId: string
  workspaceId: string
  expectedVersion: number
  canExport: boolean
  api?: ExportApi
}

export function ExportPanel({ projectId, workspaceId, expectedVersion, canExport, api = browserExportApi }: ExportPanelProps) {
  const [run, setRun] = useState<ExportRunPublic | null>(null)
  const [error, setError] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const poll = async (exportId: string): Promise<void> => {
    try {
      const current = await api.get(projectId, workspaceId, exportId)
      setRun(current)
      if (current.status === 'queued' || current.status === 'running') {
        timer.current = window.setTimeout(() => void poll(exportId), 250)
      }
    } catch {
      setError('Không thể cập nhật trạng thái xuất tệp.')
    }
  }

  const create = async (): Promise<void> => {
    setError('')
    try {
      const created = await api.create(projectId, {
        workspaceId,
        requestId: crypto.randomUUID(),
        expectedVersion,
      })
      setRun(created)
      await poll(created.id)
    } catch {
      setError('Không thể bắt đầu xuất tệp.')
    }
  }

  return (
    <section className="export-panel" aria-label="Xuất website">
      <button type="button" disabled={!canExport || run?.status === 'queued' || run?.status === 'running'} onClick={() => void create()}>
        Xuất website
      </button>
      {run?.status === 'queued' || run?.status === 'running' ? <p role="status">Đang chuẩn bị tệp xuất...</p> : null}
      {run?.status === 'completed' && run.artifact && (
        <div>
          <p role="status">Tệp xuất đã sẵn sàng</p>
          <p>{run.artifact.routeCount} trang · {new Intl.NumberFormat('vi-VN').format(run.artifact.bytes)} byte · SHA-256 {run.artifact.checksum.slice(0, 12)}…</p>
          <a href={`/api/v1/projects/${projectId}/exports/${run.id}/download?workspaceId=${encodeURIComponent(workspaceId)}`}>Tải website ZIP</a>
        </div>
      )}
      {run?.status === 'failed' && run.errorCode && <p role="alert">{exportErrorLabel(run.errorCode)}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
