'use client'

import {
  prefillWebsiteBrief,
  websiteBriefSchema,
  WEBSITE_BRIEF_SECTION_IDS,
  type MaterializedDesignDirection,
  type WebsiteBrief,
  type WebsiteBriefSection,
} from '@zenui/ai-core'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { DesignDocumentRenderer } from '../../../components/design-document-renderer'

import type { DesignDocument } from '@zenui/design-schema'
import type { RenderViewport } from '@zenui/html-compiler/render'

export interface GuidedOnboardingRun {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'superseded' | 'accepted'
  round: number
  errorCode: string | null
  directions: MaterializedDesignDirection[] | null
}

export interface GuidedOnboardingApi {
  loadBrief: () => Promise<WebsiteBrief | null>
  saveBrief: (brief: WebsiteBrief) => Promise<WebsiteBrief>
  createRun: (brief: WebsiteBrief, round: number) => Promise<GuidedOnboardingRun>
  subscribe: (runId: string, onEvent: (run: GuidedOnboardingRun) => void, onError?: () => void) => () => void
  cancelRun: (runId: string) => Promise<void>
  chooseDirection: (runId: string, directionId: string) => Promise<{
    version: number
    directionId: string
    document: DesignDocument
  }>
}

interface GuidedOnboardingProps {
  projectId: string
  workspaceId: string
  expectedVersion: number
  assetOrigin: string
  api?: GuidedOnboardingApi
  onAccepted: (result: {
    version: number
    directionId: string
    document: DesignDocument
    brief: WebsiteBrief
  }) => void
}

const emptyBrief: WebsiteBrief = {
  description: '',
  offer: '',
  audience: '',
  primaryGoal: '',
  cta: '',
  tone: '',
  brandDetails: '',
  mustHaveSections: ['introduction', 'benefits', 'contact'],
}

const fieldLabels: Record<Exclude<keyof WebsiteBrief, 'description' | 'mustHaveSections'>, string> = {
  offer: 'Bạn cung cấp sản phẩm hoặc dịch vụ gì?',
  audience: 'Website này dành cho ai?',
  primaryGoal: 'Website này cần đạt được điều gì?',
  cta: 'Khách truy cập nên làm gì tiếp theo?',
  tone: 'Website nên mang lại cảm giác như thế nào?',
  brandDetails: 'Bạn đã có chi tiết thương hiệu nào?',
}

const sectionLabels: Record<WebsiteBriefSection, string> = {
  introduction: 'Giới thiệu',
  benefits: 'Lợi ích',
  trust: 'Bằng chứng tin cậy',
  pricing: 'Bảng giá',
  faq: 'Câu hỏi thường gặp',
  contact: 'Liên hệ và hành động chính',
}

async function readData<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T }
  if (!response.ok || body.data === undefined) throw new Error('request_failed')
  return body.data
}

function browserApi(projectId: string, workspaceId: string, expectedVersion: number): GuidedOnboardingApi {
  return {
    loadBrief: async () => readData(await fetch(`/api/v1/projects/${projectId}/brief?workspaceId=${encodeURIComponent(workspaceId)}`)),
    saveBrief: async brief => readData(await fetch(`/api/v1/projects/${projectId}/brief`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, brief }),
    })),
    createRun: async (brief, round) => readData(await fetch(`/api/v1/projects/${projectId}/design-direction-runs`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, requestId: crypto.randomUUID(), expectedVersion, brief, round }),
    })),
    subscribe(runId, onEvent, onError) {
      const source = new EventSource(`/api/v1/projects/${projectId}/design-direction-runs/${runId}/events?workspaceId=${encodeURIComponent(workspaceId)}`)
      source.addEventListener('status', event => {
        try {
          onEvent(JSON.parse((event as MessageEvent<string>).data) as GuidedOnboardingRun)
        } catch {
          onError?.()
        }
      })
      source.addEventListener('error', () => onError?.())
      return () => source.close()
    },
    cancelRun: async runId => {
      await readData(await fetch(`/api/v1/projects/${projectId}/design-direction-runs/${runId}`, {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }),
      }))
    },
    chooseDirection: async (runId, directionId) => readData(await fetch(`/api/v1/projects/${projectId}/design-direction-runs/${runId}/choose`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, directionId }),
    })),
  }
}

function errorsFor(brief: WebsiteBrief): Partial<Record<keyof WebsiteBrief, string>> {
  const result: Partial<Record<keyof WebsiteBrief, string>> = {}
  if (!brief.offer.trim()) result.offer = 'Hãy cho biết bạn cung cấp sản phẩm hoặc dịch vụ gì'
  if (!brief.audience.trim()) result.audience = 'Hãy cho biết website này dành cho ai'
  if (!brief.primaryGoal.trim()) result.primaryGoal = 'Hãy cho biết mục tiêu chính của website'
  if (!brief.cta.trim()) result.cta = 'Hãy thêm hành động chính cho khách truy cập'
  if (!brief.tone.trim()) result.tone = 'Hãy mô tả cảm giác mà website nên mang lại'
  if (!brief.mustHaveSections.includes('introduction') || !brief.mustHaveSections.includes('contact')) {
    result.mustHaveSections = 'Website cần có phần giới thiệu và một nơi để thực hiện hành động chính'
  }
  return result
}

export function GuidedOnboarding({ projectId, workspaceId, expectedVersion, assetOrigin, api, onAccepted }: GuidedOnboardingProps) {
  const suppliedApi = api
  const client = useMemo(
    () => suppliedApi ?? browserApi(projectId, workspaceId, expectedVersion),
    [suppliedApi, expectedVersion, projectId, workspaceId],
  )
  const [brief, setBrief] = useState<WebsiteBrief>(emptyBrief)
  const [errors, setErrors] = useState<Partial<Record<keyof WebsiteBrief, string>>>({})
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<'brief' | 'gallery'>('brief')
  const [status, setStatus] = useState<'idle' | 'preparing' | 'replacing' | 'failed' | 'choosing'>('idle')
  const [run, setRun] = useState<GuidedOnboardingRun | null>(null)
  const [directions, setDirections] = useState<MaterializedDesignDirection[]>([])
  const [viewport, setViewport] = useState<RenderViewport>('desktop')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [preview, setPreview] = useState<MaterializedDesignDirection | null>(null)
  const closeSubscription = useRef<(() => void) | null>(null)
  const previewOpener = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let active = true
    void client.loadBrief()
      .then(saved => { if (active && saved) setBrief(saved) })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; closeSubscription.current?.() }
  }, [client])

  useEffect(() => {
    if (!preview) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPreview(null)
      queueMicrotask(() => previewOpener.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  const update = (field: keyof WebsiteBrief, value: string) => {
    setBrief(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }
  const toggleSection = (section: WebsiteBriefSection) => {
    setBrief(current => ({
      ...current,
      mustHaveSections: current.mustHaveSections.includes(section)
        ? current.mustHaveSections.filter(value => value !== section)
        : [...current.mustHaveSections, section],
    }))
    setErrors(current => Object.fromEntries(
      Object.entries(current).filter(([field]) => field !== 'mustHaveSections'),
    ))
  }
  const useDescription = () => {
    const values = prefillWebsiteBrief(brief.description)
    setBrief(current => ({ ...current, ...values }))
    setErrors({})
  }

  const start = async (round: number, replacing: boolean) => {
    const nextErrors = errorsFor(brief)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || !websiteBriefSchema.safeParse(brief).success) return
    setStatus(replacing ? 'replacing' : 'preparing')
    setConfirmReplace(false)
    if (!replacing) setScreen('gallery')
    try {
      await client.saveBrief(brief)
      const nextRun = await client.createRun(brief, round)
      setRun(nextRun)
      closeSubscription.current?.()
      closeSubscription.current = client.subscribe(nextRun.id, event => {
        setRun(event)
        if (event.status === 'completed' && event.directions?.length === 3) {
          setDirections(event.directions)
          setStatus('idle')
          closeSubscription.current?.()
        }
        if (event.status === 'failed' || event.status === 'cancelled') {
          setStatus('failed')
          closeSubscription.current?.()
        }
      }, () => setStatus('failed'))
    } catch {
      setStatus('failed')
    }
  }

  const cancel = async () => {
    if (run) await client.cancelRun(run.id).catch(() => undefined)
    closeSubscription.current?.()
    setStatus('idle')
    setScreen('brief')
  }

  const choose = async (direction: MaterializedDesignDirection) => {
    if (!run || status !== 'idle') return
    setStatus('choosing')
    try {
      onAccepted({
        ...await client.chooseDirection(run.id, direction.id),
        brief,
      })
    } catch {
      setStatus('failed')
    }
  }

  if (loading) return <main className="guided-onboarding-state" role="status">Đang tải bản mô tả website...</main>

  if (screen === 'brief') {
    const ready = ['offer', 'audience', 'primaryGoal', 'cta', 'tone'].filter(field => brief[field as keyof WebsiteBrief]).length + (brief.brandDetails ? 1 : 0) + (brief.mustHaveSections.length > 0 ? 1 : 0)
    return (
      <main className="guided-onboarding guided-brief-shell" aria-labelledby="guided-brief-heading">
        <header className="guided-header"><strong>ZenUI</strong><span>Bước 1/3</span></header>
        <section className="guided-intro">
          <h1 id="guided-brief-heading">Hãy cho chúng tôi biết website bạn muốn tạo</h1>
          <p>Bắt đầu bằng một câu. Bạn có thể xem lại và sửa mọi chi tiết trước khi website được tạo.</p>
        </section>
        <section className="guided-description-card">
          <label>
            Mô tả doanh nghiệp hoặc ý tưởng
            <textarea aria-label="Mô tả doanh nghiệp hoặc ý tưởng" value={brief.description} maxLength={2000} rows={4} onChange={event => update('description', event.target.value)} />
          </label>
          <button type="button" onClick={useDescription} disabled={!brief.description.trim()}>Dùng mô tả của tôi</button>
        </section>
        <form className="guided-brief-card" onSubmit={(event: FormEvent) => { event.preventDefault(); void start(0, false) }}>
          <div className="guided-section-heading"><h2>Bản mô tả website</h2><span>{ready}/7 chi tiết đã sẵn sàng</span></div>
          {Object.keys(errors).length > 0 && <p className="guided-form-summary" role="alert">Hãy kiểm tra các chi tiết còn thiếu. Thông tin bạn đã nhập vẫn được giữ.</p>}
          <div className="guided-brief-grid">
            {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]).map(field => (
              <label key={field}>
                {fieldLabels[field]}
                <input
                  aria-label={fieldLabels[field]}
                  value={brief[field]}
                  maxLength={field === 'brandDetails' ? 500 : field === 'cta' ? 120 : 500}
                  aria-invalid={Boolean(errors[field])}
                  onChange={event => update(field, event.target.value)}
                />
                {errors[field] && <span className="guided-field-error">{errors[field]}</span>}
              </label>
            ))}
          </div>
          <fieldset className="guided-section-choices">
            <legend>Website cần có những phần nào?</legend>
            {WEBSITE_BRIEF_SECTION_IDS.map(section => (
              <label key={section}><input type="checkbox" checked={brief.mustHaveSections.includes(section)} onChange={() => toggleSection(section)} />{sectionLabels[section]}</label>
            ))}
            {errors.mustHaveSections && <span className="guided-field-error">{errors.mustHaveSections}</span>}
          </fieldset>
          <div className="guided-primary-actions"><button className="guided-primary-button" type="submit">Tạo 3 hướng thiết kế</button></div>
        </form>
      </main>
    )
  }

  return (
    <main className="guided-onboarding guided-gallery-shell" aria-labelledby="guided-gallery-heading">
      <header className="guided-header"><strong>ZenUI</strong><button type="button" onClick={() => setScreen('brief')}>Điều chỉnh bản mô tả</button></header>
      <section className="guided-intro">
        <span>Bước 2/3</span>
        <h1 id="guided-gallery-heading">Chọn một hướng thiết kế</h1>
        <p>Cả ba hướng đều giữ nguyên đối tượng, mục tiêu, hành động chính và nội dung bắt buộc.</p>
      </section>
      <div className="guided-gallery-toolbar">
        <fieldset><legend>Thiết bị xem trước</legend>
          <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>Máy tính</button>
          <button type="button" aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>Điện thoại</button>
        </fieldset>
      </div>
      {(status === 'preparing' || directions.length === 0) && status !== 'failed' ? (
        <div className="guided-preparation-panel" role="group" aria-label="Đang chuẩn bị hướng thiết kế">
          <section className="guided-direction-loading" role="status">Đang tạo ba hướng thiết kế từ bản mô tả...</section>
          <button type="button" onClick={() => void cancel()}>Hủy chuẩn bị</button>
        </div>
      ) : (
        <section className="guided-direction-grid" aria-label="Các hướng thiết kế">
          {directions.map(direction => (
            <article key={direction.id} className="guided-direction-card" data-testid="production-direction-card">
              <span>{direction.character}</span><h2>{direction.name}</h2>
              <div className="guided-direction-preview" aria-hidden="true" inert>
                <DesignDocumentRenderer document={direction.document} viewport={viewport} assetOrigin={assetOrigin} compact ariaLabel={`Bản xem trước ${direction.name}`} />
              </div>
              {!direction.document.nodes['hero-image'] && (
                <p className="guided-image-fallback">Chưa tìm được ảnh phù hợp — bạn có thể thêm ảnh của mình sau.</p>
              )}
              <p>{direction.rationale}</p>
              <div className="guided-card-actions">
                <button type="button" onClick={event => { previewOpener.current = event.currentTarget; setPreview(direction) }}>Xem lớn hơn</button>
                <button type="button" className="guided-primary-button" disabled={status !== 'idle'} onClick={() => void choose(direction)}>Chọn hướng này</button>
              </div>
            </article>
          ))}
        </section>
      )}
      {status === 'failed' && <p role="alert" className="guided-error">Không thể chuẩn bị hướng thiết kế. Bản mô tả của bạn vẫn an toàn.</p>}
      {status === 'replacing' && directions.length > 0 && (
        <div className="guided-preparation-panel" role="group" aria-label="Đang chuẩn bị hướng thiết kế">
          <section className="guided-direction-loading" role="status">Đang tạo ba hướng thiết kế mới...</section>
          <button type="button" onClick={() => void cancel()}>Hủy chuẩn bị</button>
        </div>
      )}
      {directions.length > 0 && (
        <footer className="guided-gallery-footer">
          <button type="button" onClick={() => setScreen('brief')}>Điều chỉnh bản mô tả</button>
          {!confirmReplace ? <button type="button" onClick={() => setConfirmReplace(true)}>Thử 3 hướng khác</button> : (
            <div role="group" aria-label="Xác nhận thay hướng">
              <span>Ba hướng hiện tại sẽ được thay sau khi bộ mới sẵn sàng.</span>
              <button type="button" onClick={() => setConfirmReplace(false)}>Giữ các hướng hiện tại</button>
              <button type="button" onClick={() => void start((run?.round ?? 0) + 1, true)}>Xác nhận thay 3 hướng</button>
            </div>
          )}
        </footer>
      )}
      {preview && (
        <div className="guided-dialog-backdrop" role="presentation">
          <section className="guided-dialog" role="dialog" aria-modal="true" aria-labelledby="guided-preview-title">
            <header><h2 id="guided-preview-title">Bản xem trước lớn của {preview.name}</h2><button type="button" onClick={() => { setPreview(null); queueMicrotask(() => previewOpener.current?.focus()) }}>Đóng</button></header>
            <DesignDocumentRenderer document={preview.document} viewport={viewport} assetOrigin={assetOrigin} ariaLabel={`Bản xem trước lớn của ${preview.name}`} />
          </section>
        </div>
      )}
    </main>
  )
}
