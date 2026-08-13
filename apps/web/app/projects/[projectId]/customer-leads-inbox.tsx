'use client'

import {
  leadDetailSchema,
  leadSummarySchema,
  type LeadDetail,
  type LeadSummary,
} from '@zenui/lead-core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'

interface CustomerLeadsInboxProps {
  projectId: string
  workspaceId: string
  onLeadContacted: () => void
}

const summaryListSchema = z.array(leadSummarySchema).max(100)

type RequestState = 'idle' | 'loading' | 'error' | 'ready'

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

function query(workspaceId: string): string {
  return `workspaceId=${encodeURIComponent(workspaceId)}`
}

function receivedLabel(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function CustomerLeadsInbox({
  projectId,
  workspaceId,
  onLeadContacted,
}: CustomerLeadsInboxProps) {
  const [leads, setLeads] = useState<LeadSummary[]>([])
  const [listState, setListState] = useState<RequestState>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<LeadDetail | null>(null)
  const [detailState, setDetailState] = useState<RequestState>('idle')
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState('')
  const detailRequest = useRef(0)

  const loadList = useCallback(async () => {
    setListState('loading')
    try {
      const data = await readData(
        await fetch(
          `/api/v1/projects/${projectId}/leads?${query(workspaceId)}`,
        ),
        summaryListSchema,
      )
      setLeads(data)
      setListState('ready')
    } catch {
      setLeads([])
      setListState('error')
    }
  }, [projectId, workspaceId])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const selectLead = useCallback(async (leadId: string) => {
    const requestId = detailRequest.current + 1
    detailRequest.current = requestId
    setSelectedId(leadId)
    setDetail(null)
    setDetailState('loading')
    setMarkError('')
    try {
      const data = await readData(
        await fetch(
          `/api/v1/projects/${projectId}/leads/${leadId}?${query(workspaceId)}`,
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
  }, [projectId, workspaceId])

  const markContacted = useCallback(async () => {
    if (!detail || detail.status !== 'new') return
    setMarking(true)
    setMarkError('')
    try {
      const updated = await readData(
        await fetch(
          `/api/v1/projects/${projectId}/leads/${detail.id}`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              workspaceId,
              expectedVersion: detail.version,
            }),
          },
        ),
        leadSummarySchema,
      )
      setLeads(current => current.map(lead => (
        lead.id === updated.id ? updated : lead
      )))
      setDetail(current => current?.id === updated.id
        ? { ...current, ...updated }
        : current)
      onLeadContacted()
    } catch {
      setMarkError(
        'Không thể cập nhật trạng thái. Vui lòng thử lại.',
      )
    } finally {
      setMarking(false)
    }
  }, [detail, onLeadContacted, projectId, workspaceId])

  return (
    <main className="customer-leads-inbox">
      <header>
        <div>
          <span>Customer Leads</span>
          <h1>Khách hàng</h1>
          <p>Thông tin được lưu tối đa 90 ngày.</p>
        </div>
      </header>

      {listState === 'loading' && (
        <p role="status">Đang tải danh sách khách hàng...</p>
      )}
      {listState === 'error' && (
        <section className="customer-leads-state">
          <p role="alert">
            Không thể tải danh sách khách hàng.
          </p>
          <button type="button" onClick={() => void loadList()}>
            Thử lại
          </button>
        </section>
      )}
      {listState === 'ready' && leads.length === 0 && (
        <section className="customer-leads-state">
          <h2>Chưa có khách hàng mới</h2>
          <p>Chưa có khách hàng nào gửi biểu mẫu.</p>
        </section>
      )}
      {listState === 'ready' && leads.length > 0 && (
        <div className="customer-leads-layout">
          <section aria-labelledby="customer-leads-list-heading">
            <h2 id="customer-leads-list-heading">
              Danh sách khách hàng
            </h2>
            <ul className="customer-leads-list">
              {leads.map(lead => (
                <li key={lead.id}>
                  <button
                    type="button"
                    aria-current={selectedId === lead.id
                      ? 'true'
                      : undefined}
                    onClick={() => void selectLead(lead.id)}
                  >
                    <strong>{lead.formTitle}</strong>
                    <span>{receivedLabel(lead.receivedAt)}</span>
                    <span className={`lead-status is-${lead.status}`}>
                      {lead.status === 'new'
                        ? 'Khách hàng mới'
                        : 'Đã liên hệ'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="customer-lead-detail"
            aria-labelledby="customer-lead-detail-heading"
          >
            <h2 id="customer-lead-detail-heading">
              Chi tiết khách hàng
            </h2>
            {detailState === 'idle' && (
              <p>Chọn một khách hàng để xem thông tin.</p>
            )}
            {detailState === 'loading' && (
              <p role="status">Đang tải thông tin khách hàng...</p>
            )}
            {detailState === 'error' && selectedId && (
              <div>
                <p role="alert">
                  Không thể tải thông tin khách hàng.
                </p>
                <button
                  type="button"
                  onClick={() => void selectLead(selectedId)}
                >
                  Thử lại
                </button>
              </div>
            )}
            {detailState === 'ready' && detail && (
              <article>
                <header>
                  <h3>{detail.formTitle}</h3>
                  <span className={`lead-status is-${detail.status}`}>
                    {detail.status === 'new'
                      ? 'Khách hàng mới'
                      : 'Đã liên hệ'}
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
                    {marking
                      ? 'Đang cập nhật...'
                      : 'Đánh dấu đã liên hệ'}
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
