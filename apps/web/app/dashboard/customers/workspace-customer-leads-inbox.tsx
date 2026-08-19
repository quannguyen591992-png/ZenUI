'use client'

import {
  leadDetailSchema,
  leadSummarySchema,
  workspaceLeadListResponseSchema,
  type LeadDetail,
  type WorkspaceLeadSummary,
} from '@zenui/lead-core'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { z } from 'zod'

interface WorkspaceCustomerLeadsInboxProps {
  workspaceId: string
  initialProjectId?: string
}

interface ProjectFilterOption {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  version: number
}

type RequestState = 'idle' | 'loading' | 'error' | 'ready'
type LeadStatusFilter = '' | 'new' | 'contacted'

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = await response.json() as {
    data?: unknown
    error?: { code?: string }
  }
  if (!response.ok || body.data === undefined) {
    throw new Error(body.error?.code ?? 'request_failed')
  }
  return body.data as T
}

async function readData<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const body = await response.json() as {
    data?: unknown
    error?: { code?: string }
  }
  if (!response.ok || body.data === undefined) {
    throw new Error(body.error?.code ?? 'request_failed')
  }
  return schema.parse(body.data)
}

function receivedLabel(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function WorkspaceCustomerLeadsInbox({
  workspaceId,
  initialProjectId = '',
}: WorkspaceCustomerLeadsInboxProps) {
  const [leads, setLeads] = useState<WorkspaceLeadSummary[]>([])
  const [listState, setListState] = useState<RequestState>('loading')
  const [projectId, setProjectId] = useState(initialProjectId)
  const [status, setStatus] = useState<LeadStatusFilter>('')
  const [projects, setProjects] = useState<ProjectFilterOption[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [selected, setSelected] = useState<WorkspaceLeadSummary | null>(null)
  const [detail, setDetail] = useState<LeadDetail | null>(null)
  const [detailState, setDetailState] = useState<RequestState>('idle')
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState('')
  const detailRequest = useRef(0)
  const listRequest = useRef(0)
  const knownProjects = useRef(new Map<string, string>())

  const loadList = useCallback(async () => {
    const requestId = listRequest.current + 1
    listRequest.current = requestId
    setListState('loading')
    try {
      const search = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      })
      if (projectId) search.set('projectId', projectId)
      if (status) search.set('status', status)
      const data = await readData(
        await fetch(
          `/api/v1/workspaces/${workspaceId}/leads?${search.toString()}`,
        ),
        workspaceLeadListResponseSchema,
      )
      if (listRequest.current !== requestId) return
      for (const lead of data.items) {
        knownProjects.current.set(lead.projectId, lead.projectName)
      }
      setLeads(data.items)
      setTotalPages(data.totalPages)
      setListState('ready')
    } catch {
      if (listRequest.current !== requestId) return
      setLeads([])
      setTotalPages(0)
      setListState('error')
    }
  }, [page, projectId, status, workspaceId])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await readEnvelope<ProjectFilterOption[]>(
          await fetch(
            `/api/v1/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
          ),
        )
        if (active) {
          setProjects(data.filter(project => project.workspaceId === workspaceId))
        }
      } catch {
        // Lead rows still provide safe project labels if this filter request fails.
      }
    })()
    return () => { active = false }
  }, [workspaceId])

  const selectLead = useCallback(async (lead: WorkspaceLeadSummary) => {
    const requestId = detailRequest.current + 1
    detailRequest.current = requestId
    setSelected(lead)
    setDetail(null)
    setDetailState('loading')
    setMarkError('')
    try {
      const data = await readData(
        await fetch(
          `/api/v1/projects/${lead.projectId}/leads/${lead.id}?workspaceId=${encodeURIComponent(workspaceId)}`,
        ),
        leadDetailSchema,
      )
      if (detailRequest.current === requestId) {
        setDetail(data)
        setDetailState('ready')
      }
    } catch {
      if (detailRequest.current === requestId) {
        setDetail(null)
        setDetailState('error')
      }
    }
  }, [workspaceId])

  const markContacted = useCallback(async () => {
    if (!detail || detail.status !== 'new' || !selected) return
    setMarking(true)
    setMarkError('')
    try {
      const updated = await readData(
        await fetch(
          `/api/v1/projects/${selected.projectId}/leads/${detail.id}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              expectedVersion: detail.version,
            }),
          },
        ),
        leadSummarySchema,
      )
      setLeads(current => current.map(lead => (
        lead.id === updated.id ? { ...lead, ...updated } : lead
      )))
      setSelected(current => current?.id === updated.id
        ? { ...current, ...updated }
        : current)
      setDetail(current => current?.id === updated.id
        ? { ...current, ...updated }
        : current)
    } catch {
      setMarkError('Không thể cập nhật trạng thái. Vui lòng thử lại.')
    } finally {
      setMarking(false)
    }
  }, [detail, selected, workspaceId])

  const projectOptions = new Map(
    projects.map(project => [project.id, project.name]),
  )
  for (const [id, name] of knownProjects.current) {
    projectOptions.set(id, name)
  }
  const sortedProjects = [...projectOptions.entries()]
    .sort((left, right) => left[1].localeCompare(right[1], 'vi'))

  return (
    <main className="customer-leads-inbox dashboard-customer-leads">
      <header>
        <div>
          <span>Customer Leads</span>
          <h1>Khách hàng</h1>
          <p>Thông tin được lưu tối đa 90 ngày.</p>
        </div>
      </header>

      <section className="customer-leads-filters" aria-label="Bộ lọc khách hàng">
        <label>
          Dự án
          <select
            value={projectId}
            onChange={event => {
              setProjectId(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Tất cả dự án</option>
            {initialProjectId && !projectOptions.has(initialProjectId) && (
              <option value={initialProjectId}>Dự án đã chọn</option>
            )}
            {sortedProjects.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select
            value={status}
            onChange={event => {
              setStatus(event.target.value as LeadStatusFilter)
              setPage(1)
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="new">Khách hàng mới</option>
            <option value="contacted">Đã liên hệ</option>
          </select>
        </label>
      </section>

      {listState === 'loading' && (
        <p role="status">Đang tải danh sách khách hàng...</p>
      )}
      {listState === 'error' && (
        <section className="customer-leads-state">
          <p role="alert">Không thể tải danh sách khách hàng.</p>
          <button type="button" onClick={() => void loadList()}>
            Thử lại
          </button>
        </section>
      )}
      {listState === 'ready' && leads.length === 0 && (
        <section className="customer-leads-state">
          <h2>Chưa có khách hàng phù hợp</h2>
          <p>Chưa có khách hàng nào gửi biểu mẫu.</p>
        </section>
      )}
      {listState === 'ready' && leads.length > 0 && (
        <div className="customer-leads-layout">
          <section aria-labelledby="customer-leads-list-heading">
            <h2 id="customer-leads-list-heading">Danh sách khách hàng</h2>
            <ul className="customer-leads-list">
              {leads.map(lead => (
                <li key={lead.id}>
                  <button
                    type="button"
                    aria-current={selected?.id === lead.id ? 'true' : undefined}
                    onClick={() => void selectLead(lead)}
                  >
                    <strong>{lead.formTitle}</strong>
                    <span>{lead.projectName}</span>
                    <span>{receivedLabel(lead.receivedAt)}</span>
                    <span className={`lead-status is-${lead.status}`}>
                      {lead.status === 'new' ? 'Khách hàng mới' : 'Đã liên hệ'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <nav className="customer-leads-pagination" aria-label="Phân trang khách hàng">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                Trang trước
              </button>
              <span>Trang {page} / {Math.max(totalPages, 1)}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(current => current + 1)}
              >
                Trang sau
              </button>
            </nav>
          </section>

          <section className="customer-lead-detail" aria-labelledby="customer-lead-detail-heading">
            <h2 id="customer-lead-detail-heading">Chi tiết khách hàng</h2>
            {detailState === 'idle' && <p>Chọn một khách hàng để xem thông tin.</p>}
            {detailState === 'loading' && <p role="status">Đang tải thông tin khách hàng...</p>}
            {detailState === 'error' && selected && (
              <div>
                <p role="alert">Không thể tải thông tin khách hàng.</p>
                <button type="button" onClick={() => void selectLead(selected)}>
                  Thử lại
                </button>
              </div>
            )}
            {detailState === 'ready' && detail && (
              <article>
                <header>
                  <h3>{detail.formTitle}</h3>
                  <span className={`lead-status is-${detail.status}`}>
                    {detail.status === 'new' ? 'Khách hàng mới' : 'Đã liên hệ'}
                  </span>
                </header>
                <dl>
                  {detail.fields.map(field => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ))}
                </dl>
                {detail.status === 'new' && (
                  <button
                    type="button"
                    disabled={marking}
                    onClick={() => void markContacted()}
                  >
                    {marking ? 'Đang cập nhật...' : 'Đánh dấu đã liên hệ'}
                  </button>
                )}
                {markError && <p role="alert">{markError}</p>}
              </article>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
