'use client'

import {
  usageReportSchema,
  type UsageReport,
} from '@zenui/usage-core'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

interface UsageDashboardProps {
  workspaceId: string
  timezone: string
}

interface ProjectOption {
  id: string
  workspaceId: string
  name: string
}

type RequestState = 'loading' | 'error' | 'ready'

async function readEnvelope(response: Response): Promise<unknown> {
  const body = await response.json() as {
    data?: unknown
    error?: { code?: string }
  }
  if (!response.ok || body.data === undefined) {
    throw new Error(body.error?.code ?? 'request_failed')
  }
  return body.data
}

function numberLabel(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value)
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

const VND_PER_USD = 26_000n
const MICRO_USD_PER_USD = 1_000_000n

function vndLabel(microUsd: number): string {
  const roundedVnd = (
    BigInt(microUsd) * VND_PER_USD + MICRO_USD_PER_USD / 2n
  ) / MICRO_USD_PER_USD
  return `${new Intl.NumberFormat('vi-VN').format(roundedVnd)}₫`
}

function imageCountLabel(count: number): string {
  return `${numberLabel(count)} ảnh`
}

function incompletePricingLabel(
  reason: UsageReport['items'][number]['pricing'] extends infer Pricing
    ? Pricing extends { reason: infer Reason }
      ? Reason
      : never
    : never,
): string {
  switch (reason) {
    case 'unsupported_media_cost':
      return 'Chưa có giá ảnh'
    case 'missing_image_input_usage':
      return 'Chi phí ảnh chưa đầy đủ'
    case 'unknown_image_model':
      return 'Chưa có giá model ảnh'
    case 'heterogeneous_image_usage':
      return 'Nhiều model ảnh chưa thể gộp giá'
    default:
      return 'Chưa có giá văn bản'
  }
}

function UsageChart({ series }: {
  series: UsageReport['series']
}) {
  const width = 760
  const height = 240
  const inset = 24
  const maximum = Math.max(
    1,
    ...series.flatMap(day => [
      day.inputTokens,
      day.outputTokens,
    ]),
  )
  const points = (kind: 'inputTokens' | 'outputTokens') =>
    series.map((day, index) => {
      const x = series.length <= 1
        ? inset
        : inset + index * (width - inset * 2)
          / (series.length - 1)
      const y = height - inset
        - day[kind] / maximum * (height - inset * 2)
      return `${x},${y}`
    }).join(' ')

  return (
    <section className="usage-chart-card" aria-labelledby="usage-chart-heading">
      <header>
        <div>
          <span>Xu hướng token</span>
          <h2 id="usage-chart-heading">Token theo ngày</h2>
        </div>
        <div className="usage-chart-legend" aria-hidden="true">
          <span className="is-input">Input</span>
          <span className="is-output">Output</span>
        </div>
      </header>
      {series.length === 0
        ? <p>Chưa có dữ liệu biểu đồ.</p>
        : (
            <>
              <svg
                className="usage-chart"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="Biểu đồ token AI theo ngày"
              >
                <line
                  x1={inset}
                  y1={height - inset}
                  x2={width - inset}
                  y2={height - inset}
                />
                <polyline
                  className="usage-chart-input"
                  points={points('inputTokens')}
                />
                <polyline
                  className="usage-chart-output"
                  points={points('outputTokens')}
                />
              </svg>
              <table className="usage-chart-summary">
                <caption>Dữ liệu token theo ngày</caption>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Input</th>
                    <th>Output</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map(day => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{day.inputTokens}</td>
                      <td>{day.outputTokens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
    </section>
  )
}

export function UsageDashboard({
  workspaceId,
  timezone,
}: UsageDashboardProps) {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [state, setState] = useState<RequestState>('loading')
  const [days, setDays] = useState('30')
  const [projectId, setProjectId] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const requestId = useRef(0)
  const projectRequest = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = requestId.current + 1
    requestId.current = currentRequest
    setState('loading')
    const parameters = new URLSearchParams({
      days,
      page: String(page),
      pageSize: '25',
      timezone,
    })
    if (projectId) parameters.set('projectId', projectId)
    if (provider.trim()) parameters.set('provider', provider.trim())
    if (model.trim()) parameters.set('model', model.trim())
    if (search.trim()) parameters.set('search', search.trim())
    try {
      const data = usageReportSchema.parse(await readEnvelope(
        await fetch(
          `/api/v1/workspaces/${workspaceId}/ai-usage?${parameters.toString()}`,
        ),
      ))
      if (requestId.current !== currentRequest) return
      setReport(data)
      setState('ready')
    } catch {
      if (requestId.current !== currentRequest) return
      setReport(null)
      setState('error')
    }
  }, [
    days,
    model,
    page,
    projectId,
    provider,
    search,
    timezone,
    workspaceId,
  ])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const currentRequest = projectRequest.current + 1
    projectRequest.current = currentRequest
    void (async () => {
      try {
        const data = await readEnvelope(await fetch(
          `/api/v1/projects?workspaceId=${encodeURIComponent(workspaceId)}`,
        ))
        if (projectRequest.current === currentRequest && Array.isArray(data)) {
          setProjects(data.filter((project: unknown): project is ProjectOption => (
            typeof project === 'object'
            && project !== null
            && 'id' in project
            && typeof project.id === 'string'
            && 'workspaceId' in project
            && typeof project.workspaceId === 'string'
            && 'name' in project
            && typeof project.name === 'string'
            && project.workspaceId === workspaceId
          )))
        }
      } catch {
        // Usage reporting remains available without project labels.
      }
    })()
    return () => {
      if (projectRequest.current === currentRequest) {
        projectRequest.current += 1
      }
    }
  }, [workspaceId])

  const resetPage = () => setPage(1)
  const rangeDays = report?.range.days ?? Number(days)

  return (
    <main className="usage-dashboard">
      <header className="usage-dashboard-heading">
        <div>
          <span>AI Accounting</span>
          <h1>Sử dụng AI</h1>
          <p>
            Token và chi phí ước tính của riêng tài khoản này.
          </p>
        </div>
      </header>

      <section className="usage-filters" aria-label="Bộ lọc sử dụng AI">
        <label>
          Khoảng thời gian
          <select
            value={days}
            onChange={event => {
              setDays(event.target.value)
              resetPage()
            }}
          >
            <option value="7">7 ngày</option>
            <option value="30">30 ngày</option>
            <option value="90">90 ngày</option>
          </select>
        </label>
        <label>
          Dự án
          <select
            value={projectId}
            onChange={event => {
              setProjectId(event.target.value)
              resetPage()
            }}
          >
            <option value="">Tất cả dự án</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Provider
          <input
            value={provider}
            maxLength={100}
            onChange={event => {
              setProvider(event.target.value)
              resetPage()
            }}
            placeholder="google-gemini"
          />
        </label>
        <label>
          Model
          <input
            value={model}
            maxLength={200}
            onChange={event => {
              setModel(event.target.value)
              resetPage()
            }}
            placeholder="gemini-2.5-flash"
          />
        </label>
        <label className="usage-search-label">
          Tìm theo dự án hoặc model
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={event => {
              setSearch(event.target.value)
              resetPage()
            }}
            placeholder="Nhập tên dự án hoặc model"
          />
        </label>
      </section>

      {state === 'loading' && (
        <p className="usage-state" role="status">
          Đang tải dữ liệu sử dụng AI...
        </p>
      )}
      {state === 'error' && (
        <section className="usage-state">
          <p role="alert">Không thể tải dữ liệu sử dụng AI.</p>
          <button type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </section>
      )}
      {state === 'ready' && report && (
        <>
          <section className="usage-kpis" aria-label="Tổng quan sử dụng AI">
            <article>
              <span>Token hôm nay</span>
              <strong>{numberLabel(report.totals.todayTokens)}</strong>
            </article>
            <article>
              <span>Input token {rangeDays} ngày</span>
              <strong>{numberLabel(report.totals.inputTokens)}</strong>
            </article>
            <article>
              <span>Output token {rangeDays} ngày</span>
              <strong>{numberLabel(report.totals.outputTokens)}</strong>
            </article>
            <article>
              <span>Chi phí ước tính {rangeDays} ngày</span>
              <strong>{vndLabel(
                report.totals.pricedEstimatedMicroUsd,
              )}</strong>
            </article>
          </section>

          <p className="usage-exchange-rate-note">
            Quy đổi ước tính theo tỷ giá 1 USD = 26.000₫
          </p>

          {report.totals.unpricedCount > 0 && (
            <p className="usage-pricing-warning" role="alert">
              {numberLabel(report.totals.unpricedCount)} lượt có chi phí chưa đầy đủ.
              {' '}Tổng phía trên chỉ gồm phần chi phí đã xác định;
              {' '}giá ảnh hoặc bảng giá chưa hỗ trợ chưa được tính.
            </p>
          )}

          <UsageChart series={report.series} />

          <section className="usage-calls" aria-labelledby="usage-calls-heading">
            <header>
              <div>
                <span>Chi tiết</span>
                <h2 id="usage-calls-heading">Lượt gọi AI</h2>
              </div>
              <p>{numberLabel(report.total)} lượt</p>
            </header>
            {report.items.length === 0
              ? (
                  <p className="usage-empty">
                    Chưa có lượt sử dụng AI trong khoảng thời gian này.
                  </p>
                )
              : (
                  <div className="usage-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Dự án</th>
                          <th>Model</th>
                          <th>Input</th>
                          <th>Output</th>
                          <th>Tổng token</th>
                          <th>Chi phí ước tính</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.items.map(item => (
                          <tr key={item.id}>
                            <td>{dateLabel(item.createdAt)}</td>
                            <td>{item.projectName}</td>
                            <td>
                              {item.text && (
                                <strong>Văn bản: {item.text.model}</strong>
                              )}
                              {item.image && (
                                <strong>
                                  Ảnh: {item.image.model}
                                  {' · '}{item.image.imageSize}
                                  {' · '}{imageCountLabel(item.image.imageCount)}
                                </strong>
                              )}
                            </td>
                            <td>{numberLabel(item.inputTokens)}</td>
                            <td>{numberLabel(item.outputTokens)}</td>
                            <td>{numberLabel(item.totalTokens)}</td>
                            <td>
                              {item.pricing.status === 'unpriced'
                                ? (
                                    <span className="usage-unpriced">
                                      {incompletePricingLabel(item.pricing.reason)}
                                    </span>
                                  )
                                : vndLabel(item.pricing.totalEstimatedMicroUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            <nav className="usage-pagination" aria-label="Phân trang lượt gọi AI">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                Trang trước
              </button>
              <span>Trang {page} / {Math.max(report.totalPages, 1)}</span>
              <button
                type="button"
                disabled={page >= report.totalPages}
                onClick={() => setPage(current => current + 1)}
              >
                Trang sau
              </button>
            </nav>
          </section>
        </>
      )}
    </main>
  )
}
