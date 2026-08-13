'use client'

import {
  GUIDED_RADIUS_PRESET_IDS,
  GUIDED_SPACING_PRESET_IDS,
  GUIDED_TYPOGRAPHY_PRESET_IDS,
  guidedDesignSystemWarnings,
  normalizeWebsiteBrief,
  prefillWebsiteBrief,
  websiteBriefSchema,
  WEBSITE_BRIEF_SECTION_IDS,
  type MaterializedDesignDirection,
  type WebsiteBrief,
  type WebsiteBriefSection,
} from '@zenui/ai-core'
import { FONT_ALLOWLIST } from '@zenui/design-schema'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { generationErrorLabel } from '../../../../lib/ui-copy'
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

type GuidedBrief = WebsiteBrief & {
  conversionGoal: NonNullable<WebsiteBrief['conversionGoal']>
  designSystem: NonNullable<WebsiteBrief['designSystem']>
}

const emptyBrief: GuidedBrief = {
  description: '',
  offer: '',
  audience: '',
  primaryGoal: '',
  cta: '',
  tone: '',
  brandDetails: '',
  conversionGoal: { type: 'lead_form' },
  designSystem: { mode: 'zenui' },
  mustHaveSections: ['introduction', 'benefits', 'contact'],
}

type CustomDesignSystem = Extract<NonNullable<WebsiteBrief['designSystem']>, { mode: 'custom' }>
type DesignSystemField = 'primary' | 'background' | 'text' | 'designSystem'
type FormErrors = Partial<Record<keyof WebsiteBrief | DesignSystemField, string>>

const customDesignSystem: CustomDesignSystem = {
  mode: 'custom',
  colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
  fonts: { heading: 'Manrope', body: 'Arial' },
  typography: 'balanced',
  spacing: 'balanced',
  radius: 'balanced',
}

const fieldLabels: Record<Exclude<keyof WebsiteBrief, 'description' | 'mustHaveSections' | 'conversionGoal' | 'designSystem'>, string> = {
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
  const body = await response.json() as { data?: T; error?: { code?: string } }
  if (!response.ok || body.data === undefined) {
    throw Object.assign(new Error('request_failed'), {
      code: body.error?.code ?? 'internal_error',
      status: response.status,
    })
  }
  return body.data
}

function requestErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return 'internal_error'
  return typeof error.code === 'string' ? error.code : 'internal_error'
}

function chooseErrorLabel(code: string): string {
  switch (code) {
    case 'stale_document_version':
      return 'Website đã thay đổi. Hãy tải lại phiên bản mới nhất trước khi chọn hướng.'
    case 'direction_not_found':
    case 'run_not_selectable':
      return 'Bộ hướng này không còn có thể chọn. Hãy chuẩn bị ba hướng mới.'
    case 'invalid_design_document':
      return 'Hướng đã chọn không thể được áp dụng an toàn. Hãy chọn hướng khác.'
    case 'unauthorized':
      return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại trước khi chọn hướng.'
    case 'forbidden':
      return 'Bạn không có quyền áp dụng hướng thiết kế này.'
    case 'not_found':
      return 'Không tìm thấy bộ hướng thiết kế này. Hãy tải lại dự án.'
    default:
      return 'Không thể áp dụng hướng đã chọn. Vui lòng thử lại.'
  }
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

function errorsFor(brief: WebsiteBrief): FormErrors {
  const result: FormErrors = {}
  const parsed = websiteBriefSchema.safeParse(brief)
  if (parsed.success) return result

  for (const issue of parsed.error.issues) {
    const path = issue.path.join('.')
    if (path === 'offer') result.offer = 'Hãy cho biết bạn cung cấp sản phẩm hoặc dịch vụ gì'
    else if (path === 'audience') result.audience = 'Hãy cho biết website này dành cho ai'
    else if (path === 'primaryGoal') result.primaryGoal = 'Hãy cho biết mục tiêu chính của website'
    else if (path === 'cta') result.cta = 'Hãy thêm hành động chính cho khách truy cập'
    else if (path === 'tone') result.tone = 'Hãy mô tả cảm giác mà website nên mang lại'
    else if (path === 'brandDetails') result.brandDetails = 'Chi tiết thương hiệu không được vượt quá 500 ký tự'
    else if (path === 'description') result.description = 'Mô tả không được vượt quá 2000 ký tự'
    else if (path === 'mustHaveSections') {
      result.mustHaveSections = 'Website cần có phần giới thiệu và một nơi để thực hiện hành động chính'
    } else if (path === 'designSystem.colors.primary') {
      result.primary = 'Hãy nhập mã màu HEX gồm 6 ký tự'
    } else if (path === 'designSystem.colors.background') {
      result.background = 'Hãy nhập mã màu HEX gồm 6 ký tự'
    } else if (path === 'designSystem.colors.text') {
      result.text = 'Hãy nhập mã màu HEX gồm 6 ký tự'
    } else if (path.startsWith('designSystem')) {
      result.designSystem = 'Hệ thống thiết kế có lựa chọn không hợp lệ'
    }
  }

  return result
}

export function GuidedOnboarding({ projectId, workspaceId, expectedVersion, assetOrigin, api, onAccepted }: GuidedOnboardingProps) {
  const suppliedApi = api
  const client = useMemo(
    () => suppliedApi ?? browserApi(projectId, workspaceId, expectedVersion),
    [suppliedApi, expectedVersion, projectId, workspaceId],
  )
  const [brief, setBrief] = useState<GuidedBrief>(emptyBrief)
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<'brief' | 'gallery'>('brief')
  const [status, setStatus] = useState<'idle' | 'preparing' | 'replacing' | 'failed' | 'choosing'>('idle')
  const [run, setRun] = useState<GuidedOnboardingRun | null>(null)
  const [directions, setDirections] = useState<MaterializedDesignDirection[]>([])
  const [chooseErrorCode, setChooseErrorCode] = useState<string | null>(null)
  const [viewport, setViewport] = useState<RenderViewport>('desktop')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [preview, setPreview] = useState<MaterializedDesignDirection | null>(null)
  const closeSubscription = useRef<(() => void) | null>(null)
  const previewOpener = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    let active = true
    void client.loadBrief()
      .then(saved => {
        const parsed = websiteBriefSchema.safeParse(saved)
        if (active && parsed.success) setBrief(normalizeWebsiteBrief(parsed.data))
      })
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

  const update = <Field extends Exclude<keyof WebsiteBrief, 'conversionGoal' | 'designSystem' | 'mustHaveSections'>>(field: Field, value: WebsiteBrief[Field]) => {
    setBrief(current => ({ ...current, [field]: value }))
    setErrors(current => ({ ...current, [field]: undefined }))
  }
  const selectDesignSystemMode = (mode: 'zenui' | 'custom') => {
    setBrief(current => ({
      ...current,
      designSystem: mode === 'custom' ? customDesignSystem : { mode: 'zenui' },
    }))
    setErrors({})
  }
  const updateCustomDesignSystem = (patch: {
    colors?: Partial<CustomDesignSystem['colors']>
    fonts?: Partial<CustomDesignSystem['fonts']>
    typography?: CustomDesignSystem['typography']
    spacing?: CustomDesignSystem['spacing']
    radius?: CustomDesignSystem['radius']
  }) => {
    setBrief(current => current.designSystem.mode === 'custom' ? {
      ...current,
      designSystem: {
        ...current.designSystem,
        ...patch,
        colors: { ...current.designSystem.colors, ...(patch.colors ?? {}) },
        fonts: { ...current.designSystem.fonts, ...(patch.fonts ?? {}) },
      },
    } : current)
    setErrors(current => Object.fromEntries(
      Object.entries(current).filter(([field]) => (
        field !== 'designSystem'
        && !Object.hasOwn(patch.colors ?? {}, field)
      )),
    ))
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
    setBrief(current => ({
      ...current,
      ...values,
      conversionGoal: current.conversionGoal,
      designSystem: current.designSystem,
    }))
    setErrors({})
  }

  const start = async (round: number, replacing: boolean) => {
    const nextErrors = errorsFor(brief)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    setStatus(replacing ? 'replacing' : 'preparing')
    setChooseErrorCode(null)
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
    setChooseErrorCode(null)
    try {
      const accepted = await client.chooseDirection(run.id, direction.id)
      onAccepted({ ...accepted, brief })
    } catch (error) {
      setChooseErrorCode(requestErrorCode(error))
      setStatus('idle')
    }
  }

  const designSystemWarnings = guidedDesignSystemWarnings(brief.designSystem)
  const previewRadius = brief.designSystem.mode === 'custom'
    ? brief.designSystem.radius === 'sharp' ? 8 : brief.designSystem.radius === 'balanced' ? 12 : 20
    : 12
  const previewPadding = brief.designSystem.mode === 'custom'
    ? brief.designSystem.spacing === 'compact' ? 16 : brief.designSystem.spacing === 'balanced' ? 24 : 32
    : 24
  const previewGap = brief.designSystem.mode === 'custom'
    ? brief.designSystem.spacing === 'compact' ? 8 : brief.designSystem.spacing === 'balanced' ? 12 : 16
    : 12
  const previewH3 = brief.designSystem.mode === 'custom'
    ? brief.designSystem.typography === 'compact' ? 18 : brief.designSystem.typography === 'balanced' ? 22 : 26
    : 22
  const previewP = brief.designSystem.mode === 'custom'
    ? brief.designSystem.typography === 'compact' ? 14 : brief.designSystem.typography === 'balanced' ? 15 : 16
    : 15

  if (loading) return <main className="guided-onboarding-state" role="status">Đang tải bản mô tả website...</main>

  if (screen === 'brief') {
    return (
      <main className="guided-onboarding guided-onboarding-pro guided-brief-shell" aria-labelledby="guided-brief-heading">
        <header className="guided-header">
          <div className="logo-badge">ZenUI</div>
          <div className="step-badge">Bước 1/3</div>
        </header>
        <section className="guided-intro">
          <h1 id="guided-brief-heading">Hãy cho chúng tôi biết website bạn muốn tạo</h1>
          <p>Bắt đầu bằng một câu. Bạn có thể xem lại và sửa mọi chi tiết trước khi website được tạo.</p>
        </section>
        <section className="guided-description-card pro-card">
          <div className="ai-input-wrapper">
            <label htmlFor="ai-desc">Mô tả doanh nghiệp hoặc ý tưởng</label>
            <div className="textarea-container">
              <textarea id="ai-desc" aria-label="Mô tả doanh nghiệp hoặc ý tưởng" aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'description-error' : undefined} placeholder="Ví dụ: Một trang web bán cà phê rang xay tự nhiên, có phong cách vintage..." value={brief.description} maxLength={2000} rows={4} onChange={event => update('description', event.target.value)} />
              <button className="btn-ai-generate" type="button" onClick={useDescription} disabled={!brief.description.trim()}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2z"/></svg>
                Tạo tự động
              </button>
            </div>
            {errors.description && <span id="description-error" className="guided-field-error">{errors.description}</span>}
          </div>
        </section>
        <form className="guided-brief-card pro-card" onSubmit={(event: FormEvent) => { event.preventDefault(); void start(0, false) }}>
          <div className="guided-section-heading"><h2>Bản mô tả website</h2></div>
          {Object.values(errors).some(Boolean) && <p className="guided-form-summary" role="alert">Hãy kiểm tra các chi tiết chưa hợp lệ. Thông tin bạn đã nhập vẫn được giữ.</p>}
          <div className="guided-brief-grid">
            {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]).map(field => (
              <label key={field}>
                <span>{fieldLabels[field]} {field !== 'brandDetails' && <span className="required-star" style={{color: '#ef4444'}}>*</span>}</span>
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
          <fieldset className="guided-conversion-choice">
            <legend>Hành động chuyển đổi chính</legend>
            <p>Chọn cách khách truy cập hoàn thành mục tiêu chính của website.</p>
            <label>
              <input
                type="radio"
                name="conversion-goal"
                checked={brief.conversionGoal.type === 'lead_form'}
                onChange={() => setBrief(current => ({ ...current, conversionGoal: { type: 'lead_form' } }))}
              />
              Thu thập nhu cầu bằng biểu mẫu
            </label>
            <label>
              <input
                type="radio"
                name="conversion-goal"
                checked={brief.conversionGoal.type === 'internal_page'}
                onChange={() => setBrief(current => ({ ...current, conversionGoal: { type: 'internal_page' } }))}
              />
              Điều hướng tới nội dung trong website
            </label>
          </fieldset>
          <fieldset className="guided-design-system-choice">
            <legend>Thiết kế website</legend>
            <p>Chọn để ZenUI đề xuất giao diện hoặc dùng quy chuẩn thương hiệu của bạn ngay từ khi tạo website.</p>
            <label><input type="radio" name="design-system-mode" checked={brief.designSystem.mode === 'zenui'} onChange={() => selectDesignSystemMode('zenui')} /> Để ZenUI đề xuất thiết kế</label>
            <label><input type="radio" name="design-system-mode" checked={brief.designSystem.mode === 'custom'} onChange={() => selectDesignSystemMode('custom')} /> Dùng thiết kế riêng</label>
            {brief.designSystem.mode === 'custom' && (
              <div className="guided-custom-design-system">
                <p>Mọi hướng thiết kế sẽ dùng cùng màu sắc, kiểu chữ, khoảng cách và bo góc bạn đã chọn.</p>
                <div className="guided-brief-grid">
                  <label>
                    <span>Màu chính</span>
                    <div className="color-picker-input">
                      <input type="color" aria-label="Bộ chọn màu chính" value={brief.designSystem.colors.primary} onChange={event => updateCustomDesignSystem({ colors: { primary: event.target.value } })} />
                      <input aria-label="Mã màu chính" aria-invalid={Boolean(errors.primary)} aria-describedby={errors.primary ? 'primary-color-error' : undefined} value={brief.designSystem.colors.primary} onChange={event => updateCustomDesignSystem({ colors: { primary: event.target.value } })} />
                    </div>
                    {errors.primary && <span id="primary-color-error" className="guided-field-error">{errors.primary}</span>}
                  </label>
                  <label>
                    <span>Màu nền</span>
                    <div className="color-picker-input">
                      <input type="color" aria-label="Bộ chọn màu nền" value={brief.designSystem.colors.background} onChange={event => updateCustomDesignSystem({ colors: { background: event.target.value } })} />
                      <input aria-label="Mã màu nền" aria-invalid={Boolean(errors.background)} aria-describedby={errors.background ? 'background-color-error' : undefined} value={brief.designSystem.colors.background} onChange={event => updateCustomDesignSystem({ colors: { background: event.target.value } })} />
                    </div>
                    {errors.background && <span id="background-color-error" className="guided-field-error">{errors.background}</span>}
                  </label>
                  <label>
                    <span>Màu chữ</span>
                    <div className="color-picker-input">
                      <input type="color" aria-label="Bộ chọn màu chữ" value={brief.designSystem.colors.text} onChange={event => updateCustomDesignSystem({ colors: { text: event.target.value } })} />
                      <input aria-label="Mã màu chữ" aria-invalid={Boolean(errors.text)} aria-describedby={errors.text ? 'text-color-error' : undefined} value={brief.designSystem.colors.text} onChange={event => updateCustomDesignSystem({ colors: { text: event.target.value } })} />
                    </div>
                    {errors.text && <span id="text-color-error" className="guided-field-error">{errors.text}</span>}
                  </label>
                  <label><span>Font tiêu đề</span><select aria-label="Font tiêu đề" value={brief.designSystem.fonts.heading} onChange={event => updateCustomDesignSystem({ fonts: { heading: event.target.value as typeof brief.designSystem.fonts.heading } })}>{FONT_ALLOWLIST.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
                  <label><span>Font nội dung</span><select aria-label="Font nội dung" value={brief.designSystem.fonts.body} onChange={event => updateCustomDesignSystem({ fonts: { body: event.target.value as typeof brief.designSystem.fonts.body } })}>{FONT_ALLOWLIST.map(font => <option key={font} value={font}>{font}</option>)}</select></label>
                  <label><span>Cỡ chữ</span><select aria-label="Cỡ chữ" value={brief.designSystem.typography} onChange={event => updateCustomDesignSystem({ typography: event.target.value as typeof brief.designSystem.typography })}>{GUIDED_TYPOGRAPHY_PRESET_IDS.map(value => <option key={value} value={value}>{value === 'compact' ? 'Gọn gàng' : value === 'balanced' ? 'Cân bằng' : 'Ấn tượng'}</option>)}</select></label>
                  <label><span>Mật độ bố cục</span><select aria-label="Mật độ bố cục" value={brief.designSystem.spacing} onChange={event => updateCustomDesignSystem({ spacing: event.target.value as typeof brief.designSystem.spacing })}>{GUIDED_SPACING_PRESET_IDS.map(value => <option key={value} value={value}>{value === 'compact' ? 'Gọn' : value === 'balanced' ? 'Cân bằng' : 'Thoáng'}</option>)}</select></label>
                  <label><span>Bo góc thành phần</span><select aria-label="Bo góc thành phần" value={brief.designSystem.radius} onChange={event => updateCustomDesignSystem({ radius: event.target.value as typeof brief.designSystem.radius })}>{GUIDED_RADIUS_PRESET_IDS.map(value => <option key={value} value={value}>{value === 'sharp' ? 'Vuông gọn' : value === 'balanced' ? 'Mềm vừa' : 'Bo tròn'}</option>)}</select></label>
                </div>
                {errors.designSystem && <p className="guided-field-error">{errors.designSystem}</p>}
                {designSystemWarnings.length > 0 && (
                  <aside className="guided-design-system-warning" role="status" aria-label="Cảnh báo độ tương phản màu">
                    <strong>Lưu ý về khả năng đọc</strong>
                    <p>Một số cặp màu có độ tương phản thấp và có thể khó đọc. ZenUI vẫn giữ nguyên màu bạn chọn trong cả ba hướng thiết kế.</p>
                  </aside>
                )}
                <article
                  aria-label="Xem trước hệ thống thiết kế"
                  className="guided-design-system-preview"
                  style={{
                    backgroundColor: brief.designSystem.colors.background,
                    color: brief.designSystem.colors.text,
                    fontFamily: brief.designSystem.fonts.body,
                    borderRadius: `${previewRadius}px`,
                    padding: `${previewPadding}px`,
                    gap: `${previewGap}px`,
                  }}
                >
                  <h3 style={{ fontFamily: brief.designSystem.fonts.heading, fontSize: `${previewH3}px`, transition: 'font-size 0.2s ease' }}>Thiết kế nhất quán từ đầu</h3>
                  <p style={{ fontSize: `${previewP}px`, transition: 'font-size 0.2s ease' }}>Kiểu chữ, màu sắc và khoảng cách sẽ được áp dụng cho website được tạo.</p>
                  <button type="button" style={{ backgroundColor: brief.designSystem.colors.primary, borderRadius: `${previewRadius}px`, padding: `${previewGap}px ${previewPadding}px`, fontSize: `${previewP}px`, transition: 'all 0.2s ease' }}>Hành động chính</button>
                </article>
              </div>
            )}
          </fieldset>
          <fieldset className="guided-section-choices">
            <legend>Website cần có những phần nào?</legend>
            <div className="guided-chips">
              {WEBSITE_BRIEF_SECTION_IDS.map(section => {
                const isChecked = brief.mustHaveSections.includes(section)
                return (
                  <button
                    key={section}
                    type="button"
                    className={`chip ${isChecked ? 'active' : ''}`}
                    onClick={() => toggleSection(section)}
                    aria-pressed={isChecked}
                  >
                    {isChecked && <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    {sectionLabels[section]}
                  </button>
                )
              })}
            </div>
            {errors.mustHaveSections && <span className="guided-field-error">{errors.mustHaveSections}</span>}
          </fieldset>
          <div className="guided-primary-actions"><button className="guided-primary-button" type="submit">Tạo 3 hướng thiết kế</button></div>
        </form>
      </main>
    )
  }

  return (
    <main className="guided-onboarding guided-onboarding-pro guided-gallery-shell" aria-labelledby="guided-gallery-heading">
      <header className="guided-header">
        <div className="logo-badge">ZenUI</div>
        <div className="header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="step-badge">Bước 2/3</div>
          <button type="button" className="btn-ghost-pro" onClick={() => setScreen('brief')}>Điều chỉnh bản mô tả</button>
        </div>
      </header>
      <section className="guided-intro">
        <h1 id="guided-gallery-heading">Chọn một hướng thiết kế</h1>
        <p>Cả ba hướng đều giữ nguyên đối tượng, mục tiêu, hành động chính và nội dung bắt buộc.</p>
      </section>
      <div className="guided-gallery-toolbar" style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
        <fieldset className="viewport-toggle">
          <legend className="sr-only" style={{ display: 'none' }}>Thiết bị xem trước</legend>
          <button type="button" className={`toggle-btn ${viewport === 'desktop' ? 'active' : ''}`} aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>Máy tính</button>
          <button type="button" className={`toggle-btn ${viewport === 'mobile' ? 'active' : ''}`} aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>Điện thoại</button>
        </fieldset>
      </div>
      {(status === 'preparing' || directions.length === 0) && status !== 'failed' ? (
        <div className="guided-preparation-panel pro-card loading-card" role="group" aria-label="Đang chuẩn bị hướng thiết kế">
          <div className="loading-spinner"></div>
          <section className="guided-direction-loading" role="status">Đang tạo ba hướng thiết kế từ bản mô tả...</section>
          <button type="button" className="btn-ghost-pro" onClick={() => void cancel()}>Hủy chuẩn bị</button>
        </div>
      ) : (
        <section className="guided-direction-grid" aria-label="Các hướng thiết kế">
          {directions.map(direction => (
            <article key={direction.id} className="guided-direction-card-pro" data-testid="production-direction-card">
              <div className="card-badge">{direction.character}</div>
              <h2>{direction.name}</h2>
              <div className="guided-direction-preview" aria-hidden="true" inert>
                <DesignDocumentRenderer document={direction.document} viewport={viewport} assetOrigin={assetOrigin} compact ariaLabel={`Bản xem trước ${direction.name}`} />
              </div>
              {!direction.document.nodes['hero-image'] && (
                <p className="guided-image-fallback">Chưa tìm được ảnh phù hợp — bạn có thể thêm ảnh của mình sau.</p>
              )}
              <p>{direction.rationale}</p>
              <div className="guided-card-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <button type="button" className="btn-ghost-pro" onClick={event => { previewOpener.current = event.currentTarget; setPreview(direction) }}>Xem lớn hơn</button>
                <button type="button" className="guided-primary-button" style={{ padding: '10px 20px', fontSize: '14px' }} disabled={status !== 'idle'} onClick={() => void choose(direction)}>Chọn hướng này</button>
              </div>
            </article>
          ))}
        </section>
      )}
      {status === 'failed' && (
        <p role="alert" className="guided-error">
          {run?.errorCode ? generationErrorLabel(run.errorCode) : 'Không thể chuẩn bị hướng thiết kế.'} Bản mô tả của bạn vẫn an toàn.
        </p>
      )}
      {chooseErrorCode && (
        <p role="alert" className="guided-error">
          {chooseErrorLabel(chooseErrorCode)} Ba hướng thiết kế và bản mô tả của bạn vẫn an toàn.
        </p>
      )}
      {status === 'replacing' && directions.length > 0 && (
        <div className="guided-preparation-panel" role="group" aria-label="Đang chuẩn bị hướng thiết kế">
          <section className="guided-direction-loading" role="status">Đang tạo ba hướng thiết kế mới...</section>
          <button type="button" onClick={() => void cancel()}>Hủy chuẩn bị</button>
        </div>
      )}
      {directions.length > 0 && (
        <footer className="guided-gallery-footer-pro">
          <button type="button" className="btn-ghost-pro" onClick={() => setScreen('brief')}>Điều chỉnh bản mô tả</button>
          {!confirmReplace ? <button type="button" className="guided-primary-button" style={{ padding: '10px 20px', fontSize: '14px' }} onClick={() => setConfirmReplace(true)}>Thử 3 hướng khác</button> : (
            <div role="group" aria-label="Xác nhận thay hướng" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', color: '#64748b' }}>Ba hướng hiện tại sẽ được thay sau khi bộ mới sẵn sàng.</span>
              <button type="button" className="btn-ghost-pro" onClick={() => setConfirmReplace(false)}>Giữ các hướng hiện tại</button>
              <button type="button" className="guided-primary-button" style={{ padding: '10px 20px', fontSize: '14px' }} onClick={() => void start((run?.round ?? 0) + 1, true)}>Xác nhận thay 3 hướng</button>
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
