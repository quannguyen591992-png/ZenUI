'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  acceptPrototypeProposal,
  createDirectionSet,
  createPrototypeProposal,
  documentFingerprint,
  initialBrief,
  sectionLabel,
  storyPurpose,
  type PrototypeBrief,
  type PrototypeDirection,
  type PrototypeProposal,
} from './prototype-fixtures'
import { PrototypeRenderer } from './prototype-renderer'

import type { DesignDocument } from '@zenui/design-schema'
import type { RenderViewport } from '@zenui/html-compiler/render'

type PrototypeScreen = 'brief' | 'directions' | 'editor' | 'review'
type PrototypeMode = 'simple' | 'advanced'
type PrototypeDialog = 'direction-preview' | 'preview' | 'share' | 'publish' | 'story' | 'ask' | null
type ReviewState =
  | 'happy'
  | 'brief-invalid'
  | 'brief-failed'
  | 'directions-loading'
  | 'directions-failed'
  | 'directions-replacing'
  | 'proposal-failed'
  | 'proposal-stale'
  | 'save-unsaved'
  | 'save-offline'
  | 'publish-progress'
  | 'publish-failed'

const reviewStates: { value: ReviewState; label: string }[] = [
  { value: 'happy', label: 'Luồng thuận lợi' },
  { value: 'brief-invalid', label: 'Bản mô tả · chưa hợp lệ' },
  { value: 'brief-failed', label: 'Bản mô tả · thất bại' },
  { value: 'directions-loading', label: 'Hướng thiết kế · đang tải' },
  { value: 'directions-failed', label: 'Hướng thiết kế · thất bại' },
  { value: 'directions-replacing', label: 'Hướng thiết kế · đang thay' },
  { value: 'proposal-failed', label: 'Đề xuất · thất bại' },
  { value: 'proposal-stale', label: 'Đề xuất · đã cũ' },
  { value: 'save-unsaved', label: 'Lưu · chưa xong' },
  { value: 'save-offline', label: 'Lưu · ngoại tuyến' },
  { value: 'publish-progress', label: 'Xuất bản · đang xử lý' },
  { value: 'publish-failed', label: 'Xuất bản · thất bại' },
]

const requiredBriefFields: (keyof Pick<PrototypeBrief, 'offer' | 'audience' | 'goal' | 'cta' | 'style'>)[] = [
  'offer', 'audience', 'goal', 'cta', 'style',
]

function topLevelSections(document: DesignDocument): string[] {
  return document.nodes[document.pages[0]!.rootNodeId]?.children ?? []
}

function firstBenefitsSection(document: DesignDocument): string {
  return topLevelSections(document).find(id => id.includes('features')) ?? topLevelSections(document)[0]!
}

function ReviewToolbar({ value, onChange, onReset }: { value: ReviewState; onChange: (state: ReviewState) => void; onReset: () => void }) {
  return (
    <aside className="prototype-review-toolbar" aria-label="Điều khiển kiểm tra prototype">
      <strong>Prototype xác định trước</strong>
      <span>Không gọi AI hoặc dịch vụ xuất bản bên ngoài</span>
      <label>
        Trạng thái kiểm tra
        <select aria-label="Trạng thái kiểm tra" value={value} onChange={event => onChange(event.target.value as ReviewState)}>
          {reviewStates.map(state => <option key={state.value} value={state.value}>{state.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={onReset}>Đặt lại prototype</button>
    </aside>
  )
}

function ReviewStateBanner({ state }: { state: ReviewState }) {
  if (state === 'happy') return null
  const content: Partial<Record<ReviewState, { kind: 'status' | 'alert'; text: string }>> = {
    'brief-invalid': { kind: 'alert', text: 'Một chi tiết trong bản mô tả cần được kiểm tra. Các câu trả lời khác vẫn được giữ.' },
    'brief-failed': { kind: 'alert', text: 'Không thể chuẩn bị hướng thiết kế. Bản mô tả của bạn vẫn an toàn.' },
    'directions-loading': { kind: 'status', text: 'Đang tạo ba hướng thiết kế từ bản mô tả…' },
    'directions-failed': { kind: 'alert', text: 'Không thể chuẩn bị đủ các hướng thiết kế. Chưa có website nào được tạo.' },
    'directions-replacing': { kind: 'status', text: 'Đang chuẩn bị ba lựa chọn khác. Các hướng hiện tại vẫn được giữ.' },
    'proposal-failed': { kind: 'alert', text: 'Không thể chuẩn bị thay đổi này. Website của bạn vẫn giữ nguyên.' },
    'proposal-stale': { kind: 'alert', text: 'Website đã thay đổi trong khi bản xem trước mở. Hãy xem một đề xuất mới trước khi chấp nhận.' },
    'save-unsaved': { kind: 'status', text: 'Các chỉnh sửa mới nhất vẫn đang được lưu. Chia sẻ và Xuất bản tạm thời chưa khả dụng.' },
    'save-offline': { kind: 'alert', text: 'Bạn đang ngoại tuyến. Hãy kết nối lại để lưu và xuất bản; các chỉnh sửa prototype vẫn được giữ.' },
    'publish-progress': { kind: 'status', text: 'Đang xuất bản website prototype đã lưu gần nhất…' },
    'publish-failed': { kind: 'alert', text: 'Không thể xuất bản prototype này. Website đã lưu của bạn vẫn giữ nguyên.' },
  }
  const message = content[state]
  if (!message) return null
  return <p className={`prototype-state-banner is-${message.kind}`} role={message.kind}>{message.text}</p>
}

function GuidedBrief({
  brief,
  errors,
  onField,
  onSections,
  onSubmit,
}: {
  brief: PrototypeBrief
  errors: Partial<Record<keyof PrototypeBrief, string>>
  onField: (field: keyof PrototypeBrief, value: string) => void
  onSections: (section: string) => void
  onSubmit: () => void
}) {
  const ready = requiredBriefFields.filter(field => brief[field].trim()).length + (brief.sections.length > 0 ? 1 : 0) + (brief.brandDetails.trim() ? 1 : 0)
  const fields: { key: keyof PrototypeBrief; label: string; optional?: boolean }[] = [
    { key: 'offer', label: 'Bạn cung cấp sản phẩm hoặc dịch vụ gì?' },
    { key: 'audience', label: 'Website dành cho ai?' },
    { key: 'goal', label: 'Website cần đạt mục tiêu gì?' },
    { key: 'cta', label: 'Khách truy cập nên làm gì tiếp theo?' },
    { key: 'style', label: 'Website nên mang cảm giác như thế nào?' },
    { key: 'brandDetails', label: 'Chi tiết thương hiệu', optional: true },
  ]
  const availableSections = ['Giới thiệu', 'Lợi ích', 'Tin cậy', 'Bảng giá', 'Câu hỏi', 'Liên hệ']

  return (
    <main className="prototype-brief-shell" aria-labelledby="prototype-brief-heading">
      <header className="prototype-step-heading">
        <span>Bước 1/3</span>
        <h1 id="prototype-brief-heading">Hãy cho chúng tôi biết website bạn muốn tạo</h1>
        <p>Bắt đầu bằng một câu, sau đó kiểm tra từng chi tiết trước khi website được tạo.</p>
      </header>
      <section className="prototype-description-card" aria-labelledby="idea-heading">
        <h2 id="idea-heading">Mô tả doanh nghiệp hoặc ý tưởng của bạn</h2>
        <textarea
          aria-label="Mô tả doanh nghiệp hoặc ý tưởng của bạn"
          value={brief.description}
          onChange={event => onField('description', event.target.value)}
          rows={3}
        />
        <button type="button">Dùng mô tả của tôi</button>
      </section>
      <section className="prototype-brief-card" aria-labelledby="brief-details-heading">
        <div className="prototype-section-heading">
          <h2 id="brief-details-heading">Bản mô tả website</h2>
          <span>{ready}/7 chi tiết đã sẵn sàng</span>
        </div>
        <div className="prototype-brief-grid">
          {fields.map(field => (
            <label key={field.key}>
              {field.label}{field.optional ? <span>Không bắt buộc</span> : null}
              <input
                aria-label={field.label}
                value={String(brief[field.key])}
                aria-invalid={Boolean(errors[field.key])}
                aria-describedby={errors[field.key] ? `${field.key}-error` : undefined}
                onChange={event => onField(field.key, event.target.value)}
              />
              {errors[field.key] ? <small id={`${field.key}-error`} className="prototype-field-error">{errors[field.key]}</small> : null}
            </label>
          ))}
        </div>
        <fieldset className="prototype-section-choices">
          <legend>Website nhất định phải có nội dung nào?</legend>
          {availableSections.map(section => (
            <label key={section}>
              <input type="checkbox" checked={brief.sections.includes(section)} onChange={() => onSections(section)} />
              {section}
            </label>
          ))}
          {errors.sections ? <small className="prototype-field-error">{errors.sections}</small> : null}
        </fieldset>
      </section>
      {Object.keys(errors).length > 0 ? <p role="alert" className="prototype-form-summary">Hoàn thành các chi tiết được đánh dấu trước khi tiếp tục.</p> : null}
      <div className="prototype-primary-actions">
        <button type="button" className="prototype-primary-button" onClick={onSubmit}>Tạo 3 hướng thiết kế</button>
      </div>
    </main>
  )
}

function DirectionGallery({
  directions,
  viewport,
  onViewport,
  onChoose,
  onAdjust,
  onReplace,
  onPreview,
}: {
  directions: PrototypeDirection[]
  viewport: RenderViewport
  onViewport: (viewport: RenderViewport) => void
  onChoose: (direction: PrototypeDirection) => void
  onAdjust: () => void
  onReplace: () => void
  onPreview: (direction: PrototypeDirection, opener: HTMLButtonElement) => void
}) {
  return (
    <main className="prototype-directions-shell" aria-labelledby="directions-heading">
      <header className="prototype-step-heading">
        <span>Bước 2/3</span>
        <h1 id="directions-heading">Chọn một hướng thiết kế</h1>
        <p>Cả ba hướng đều giữ nguyên đối tượng, mục tiêu, hành động chính và các phần bắt buộc.</p>
      </header>
      <div className="prototype-gallery-toolbar">
        <button type="button" onClick={onAdjust}>Chỉnh bản mô tả</button>
        <fieldset>
          <legend>Kích thước xem trước</legend>
          <button type="button" aria-pressed={viewport === 'desktop'} onClick={() => onViewport('desktop')}>Máy tính</button>
          <button type="button" aria-pressed={viewport === 'mobile'} onClick={() => onViewport('mobile')}>Điện thoại</button>
        </fieldset>
      </div>
      <section className="prototype-direction-grid" aria-label="Các hướng thiết kế">
        {directions.map(direction => (
          <article key={direction.id} className="prototype-direction-card" data-testid="direction-card">
            <div className="prototype-direction-title">
              <div><span>{direction.character}</span><h2>{direction.name}</h2></div>
              <strong>{direction.document.nodes['navbar-cta'] && 'text' in direction.document.nodes['navbar-cta'].props ? direction.document.nodes['navbar-cta'].props.text : 'Đặt lịch tư vấn'}</strong>
            </div>
            <div className="prototype-direction-preview">
              <PrototypeRenderer document={direction.document} viewport={viewport} compact ariaLabel={`Bản xem trước ${direction.name}`} />
            </div>
            <p>{direction.rationale}</p>
            <div className="prototype-card-actions">
              <button type="button" onClick={event => onPreview(direction, event.currentTarget)}>Xem lớn hơn</button>
              <button type="button" className="prototype-primary-button" onClick={() => onChoose(direction)}>Chọn hướng này</button>
            </div>
          </article>
        ))}
      </section>
      <div className="prototype-primary-actions">
        <span>Chưa có hướng nào phù hợp?</span>
        <button type="button" onClick={onReplace}>Thử ba hướng khác</button>
      </div>
    </main>
  )
}

function PageStory({ document, selectedSectionId, onSelect }: { document: DesignDocument; selectedSectionId: string; onSelect: (id: string) => void }) {
  return (
    <nav className="prototype-story" aria-labelledby="page-story-heading">
      <h2 id="page-story-heading">Câu chuyện trang</h2>
      <p>Theo dõi mục đích của từng phần.</p>
      <ol>
        {topLevelSections(document).map(nodeId => (
          <li key={nodeId}>
            <button type="button" aria-current={selectedSectionId === nodeId ? 'true' : undefined} onClick={() => onSelect(nodeId)}>
              <span>{storyPurpose(nodeId)}</span>
              <strong>{sectionLabel(document, nodeId)}</strong>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function CoDesign({ scope, prompt, onPrompt, onPropose }: { scope: string; prompt: string; onPrompt: (value: string) => void; onPropose: () => void }) {
  const suggestions = ['Ngắn gọn hơn', 'Cao cấp hơn', 'Cải thiện hành động chính']
  return (
    <aside className="prototype-co-design" aria-labelledby="co-design-heading">
      <h2 id="co-design-heading">Cùng thiết kế</h2>
      <p>Đang chỉnh: <strong>{scope}</strong></p>
      <label>
        Bạn muốn cải thiện điều gì?
        <textarea value={prompt} onChange={event => onPrompt(event.target.value)} rows={5} />
      </label>
      <div className="prototype-suggestions" aria-label="Gợi ý">
        {suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => onPrompt(suggestion)}>{suggestion}</button>)}
      </div>
      <button type="button" className="prototype-primary-button" onClick={onPropose}>Đề xuất thay đổi</button>
      <small>Không có thay đổi nào được áp dụng trước khi bạn kiểm tra.</small>
    </aside>
  )
}

function SimpleEditor({
  document,
  selectedSectionId,
  viewport,
  saveStatus,
  prompt,
  onSelect,
  onViewport,
  onPrompt,
  onPropose,
  onAdvanced,
  onDialog,
}: {
  document: DesignDocument
  selectedSectionId: string
  viewport: RenderViewport
  saveStatus: string
  prompt: string
  onSelect: (id: string) => void
  onViewport: (viewport: RenderViewport) => void
  onPrompt: (value: string) => void
  onPropose: () => void
  onAdvanced: () => void
  onDialog: (dialog: Exclude<PrototypeDialog, 'direction-preview'>, opener: HTMLButtonElement) => void
}) {
  const scope = `Phần ${sectionLabel(document, selectedSectionId)}`
  const deviceLabels = { desktop: 'Máy tính', tablet: 'Máy tính bảng', mobile: 'Điện thoại' } as const
  return (
    <main className="prototype-editor" aria-label="Trình chỉnh sửa theo phần">
      <header className="prototype-editor-toolbar">
        <div><strong>NovaFlow</strong><span>{saveStatus}</span></div>
        <div className="prototype-history-actions"><button type="button">Hoàn tác</button><button type="button">Làm lại</button></div>
        <fieldset><legend>Thiết bị xem trước</legend>{(['desktop', 'tablet', 'mobile'] as const).map(size => <button type="button" key={size} aria-pressed={viewport === size} onClick={() => onViewport(size)}>{deviceLabels[size]}</button>)}</fieldset>
        <div className="prototype-publish-actions">
          <button type="button" onClick={event => onDialog('preview', event.currentTarget)}>Xem trước</button>
          <button type="button" onClick={event => onDialog('share', event.currentTarget)}>Chia sẻ</button>
          <button type="button" className="prototype-primary-button" onClick={event => onDialog('publish', event.currentTarget)}>Xuất bản</button>
        </div>
        <button type="button" onClick={onAdvanced}>Mở chỉnh sửa chuyên sâu</button>
      </header>
      <div className="prototype-narrow-toolbar">
        <button type="button" onClick={event => onDialog('story', event.currentTarget)}>Câu chuyện</button>
        <span>Xem trước trên {deviceLabels[viewport].toLowerCase()}</span>
        <button type="button" onClick={event => onDialog('ask', event.currentTarget)}>Hỏi AI</button>
      </div>
      <div className="prototype-editor-layout">
        <PageStory document={document} selectedSectionId={selectedSectionId} onSelect={onSelect} />
        <section className="prototype-canvas" aria-label="Khung website">
          <PrototypeRenderer document={document} viewport={viewport} selectedSectionId={selectedSectionId} onSelectSection={onSelect} />
        </section>
        <CoDesign scope={scope} prompt={prompt} onPrompt={onPrompt} onPropose={onPropose} />
      </div>
      <footer className="prototype-section-actions" aria-label={`Hành động cho ${scope}`}>
        <strong>{scope}</strong>
        <button type="button" onClick={() => { onPrompt('Viết lại phần này ngắn gọn và rõ ràng hơn'); onPropose() }}>Viết lại</button>
        <button type="button" onClick={() => { onPrompt('Thử bố cục khác nhưng vẫn giữ nguyên thông điệp'); onPropose() }}>Thử bố cục khác</button>
        <button type="button">Di chuyển</button>
        <button type="button">Ẩn</button>
        <button type="button">Thêm</button>
      </footer>
    </main>
  )
}

function AdvancedEditor({ document, viewport, onReturn }: { document: DesignDocument; viewport: RenderViewport; onReturn: () => void }) {
  return (
    <main className="prototype-advanced" aria-labelledby="advanced-heading">
      <header><div><span>Chỉnh sửa chuyên sâu</span><h1 id="advanced-heading">Kiểm soát thiết kế chi tiết</h1></div><button type="button" onClick={onReturn}>Quay lại thiết kế trực quan</button></header>
      <div className="prototype-advanced-layout">
        <aside><h2>Thành phần</h2><button type="button">Phần nội dung</button><button type="button">Khung chứa</button><button type="button">Tiêu đề</button><h2>Lớp</h2><p>Trang › Phần mở đầu › Nội dung</p></aside>
        <section aria-label="Khung thiết kế nâng cao"><PrototypeRenderer document={document} viewport={viewport} /></section>
        <aside><h2>Thuộc tính</h2><label>Bố cục<input value="Tự động" readOnly /></label><label>Điều chỉnh theo thiết bị<input value="Không có" readOnly /></label><h2>Lịch sử website</h2><p>Website đã lưu gần nhất</p></aside>
      </div>
    </main>
  )
}

function ProposalReview({
  accepted,
  proposal,
  viewport,
  state,
  onAccept,
  onDiscard,
  onTryAnother,
}: {
  accepted: DesignDocument
  proposal: PrototypeProposal
  viewport: RenderViewport
  state: ReviewState
  onAccept: () => void
  onDiscard: () => void
  onTryAnother: () => void
}) {
  const blocked = state === 'proposal-stale'
  return (
    <main className="prototype-proposal" aria-labelledby="proposal-heading">
      <header>
        <div><span>Phạm vi: {proposal.scopeLabel}</span><h1 id="proposal-heading">Kiểm tra thay đổi được đề xuất</h1></div>
        <fieldset><legend>Kích thước xem trước</legend><span>{viewport === 'desktop' ? 'Máy tính' : viewport === 'tablet' ? 'Máy tính bảng' : 'Điện thoại'}</span></fieldset>
      </header>
      <p className="prototype-preserved"><strong>Được giữ nguyên:</strong> {proposal.preserved.join(', ')}</p>
      <div className="prototype-comparison">
        <section aria-labelledby="current-heading"><h2 id="current-heading">Hiện tại</h2><PrototypeRenderer document={accepted} viewport={viewport} compact ariaLabel="Website hiện tại" /></section>
        <section aria-labelledby="proposed-heading"><h2 id="proposed-heading">Đề xuất</h2><PrototypeRenderer document={proposal.document} viewport={viewport} compact proposed ariaLabel="Website được đề xuất" /></section>
      </div>
      <p><strong>Đã thay đổi:</strong> {proposal.summary}</p>
      {state === 'proposal-failed' ? <p role="alert">Không thể chuẩn bị thay đổi này. Website của bạn vẫn giữ nguyên.</p> : null}
      {blocked ? <p role="alert">Website đã thay đổi trong khi bản xem trước mở. Hãy xem một đề xuất mới trước khi chấp nhận.</p> : null}
      <footer>
        <button type="button" onClick={onDiscard}>Bỏ đề xuất</button>
        <button type="button" onClick={onTryAnother}>Thử phương án khác</button>
        <button type="button" onClick={onTryAnother}>Tinh chỉnh</button>
        <button type="button" className="prototype-primary-button" disabled={blocked || state === 'proposal-failed'} onClick={onAccept}>Chấp nhận thay đổi</button>
      </footer>
    </main>
  )
}

function PrototypeDialogSurface({
  dialog,
  document,
  direction,
  viewport,
  published,
  shareReady,
  publishConfirmed,
  onPublishConfirmed,
  onShare,
  onPublish,
  onClose,
  story,
  coDesign,
}: {
  dialog: Exclude<PrototypeDialog, null>
  document: DesignDocument | null
  direction: PrototypeDirection | null
  viewport: RenderViewport
  published: boolean
  shareReady: boolean
  publishConfirmed: boolean
  onPublishConfirmed: (value: boolean) => void
  onShare: () => void
  onPublish: () => void
  onClose: () => void
  story: ReactNode
  coDesign: ReactNode
}) {
  let title = 'Hộp thoại prototype'
  let content: React.ReactNode = null
  if (dialog === 'direction-preview' && direction) {
    title = `Bản xem trước lớn của ${direction.name}`
    content = <PrototypeRenderer document={direction.document} viewport={viewport} ariaLabel={title} />
  } else if (dialog === 'preview' && document) {
    title = 'Xem trước website của bạn'
    content = <><p>Đang hiển thị website prototype đã lưu gần nhất.</p><PrototypeRenderer document={document} viewport={viewport} ariaLabel="Bản xem trước website đã lưu gần nhất" /></>
  } else if (dialog === 'share') {
    title = 'Chia sẻ website của bạn'
    content = <>
      <p>Bất kỳ ai có liên kết prototype đều có thể xem website đã lưu gần nhất này. Không có dữ liệu nào được tải lên.</p>
      {!shareReady ? <button type="button" className="prototype-primary-button" onClick={onShare}>Tạo liên kết chia sẻ</button> : <div className="prototype-result"><strong>Liên kết prototype đã sẵn sàng</strong><span>prototype.local/share/novaflow</span><button type="button">Sao chép</button></div>}
    </>
  } else if (dialog === 'publish') {
    title = published ? 'Website prototype của bạn đã hoạt động' : 'Xuất bản website của bạn'
    content = published ? <div className="prototype-result"><p>Đây là mô phỏng cục bộ. Không có nội dung nào được xuất bản ra bên ngoài.</p><span>prototype.local/live/novaflow</span><button type="button">Mở website</button></div> : <>
      <p>Thao tác này mô phỏng việc công khai website đã lưu gần nhất. Prototype sẽ không liên hệ dịch vụ xuất bản.</p>
      <dl><div><dt>Dự án</dt><dd>NovaFlow</dd></div><div><dt>Hành động chính</dt><dd>Đặt lịch tư vấn</dd></div><div><dt>Đích đến</dt><dd>Website prototype công khai</dd></div></dl>
      <label className="prototype-confirm"><input type="checkbox" checked={publishConfirmed} onChange={event => onPublishConfirmed(event.target.checked)} />Tôi hiểu website này sẽ được công khai.</label>
      <button type="button" className="prototype-primary-button" disabled={!publishConfirmed} onClick={onPublish}>Xuất bản website</button>
    </>
  } else if (dialog === 'story') {
    title = 'Câu chuyện trang'
    content = story
  } else if (dialog === 'ask') {
    title = 'Cùng thiết kế'
    content = coDesign
  }
  const closeLabel = dialog === 'share' ? 'Đóng chia sẻ' : dialog === 'publish' ? 'Đóng xuất bản' : `Đóng ${title}`
  return (
    <div className="prototype-dialog-backdrop">
      <section className="prototype-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button type="button" aria-label={closeLabel} onClick={onClose}>Đóng</button></header>
        <div className="prototype-dialog-body">{content}</div>
      </section>
    </div>
  )
}

export function NonCoderPrototype() {
  const [screen, setScreen] = useState<PrototypeScreen>('brief')
  const [mode, setMode] = useState<PrototypeMode>('simple')
  const [brief, setBrief] = useState<PrototypeBrief>(() => structuredClone(initialBrief))
  const [briefErrors, setBriefErrors] = useState<Partial<Record<keyof PrototypeBrief, string>>>({})
  const [directions, setDirections] = useState<PrototypeDirection[]>([])
  const [directionRound, setDirectionRound] = useState(0)
  const [accepted, setAccepted] = useState<DesignDocument | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState('features-section')
  const [proposal, setProposal] = useState<PrototypeProposal | null>(null)
  const [proposalVariant, setProposalVariant] = useState(0)
  const [viewport, setViewport] = useState<RenderViewport>('desktop')
  const [prompt, setPrompt] = useState('Làm phần này rõ ràng và thuyết phục hơn')
  const [saveStatus, setSaveStatus] = useState('Đã lưu')
  const [reviewState, setReviewState] = useState<ReviewState>('happy')
  const [dialog, setDialog] = useState<PrototypeDialog>(null)
  const [dialogDirection, setDialogDirection] = useState<PrototypeDirection | null>(null)
  const [shareReady, setShareReady] = useState(false)
  const [publishConfirmed, setPublishConfirmed] = useState(false)
  const [published, setPublished] = useState(false)
  const openerRef = useRef<HTMLButtonElement | null>(null)

  const reset = () => {
    setScreen('brief'); setMode('simple'); setBrief(structuredClone(initialBrief)); setBriefErrors({}); setDirections([])
    setDirectionRound(0); setAccepted(null); setSelectedSectionId('features-section'); setProposal(null); setProposalVariant(0)
    setViewport('desktop'); setPrompt('Làm phần này rõ ràng và thuyết phục hơn'); setSaveStatus('Đã lưu'); setReviewState('happy')
    setDialog(null); setDialogDirection(null); setShareReady(false); setPublishConfirmed(false); setPublished(false)
  }

  const closeDialog = () => {
    setDialog(null)
    setDialogDirection(null)
    queueMicrotask(() => openerRef.current?.focus())
  }

  useEffect(() => {
    if (!dialog) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [dialog])

  const openDialog = (next: Exclude<PrototypeDialog, 'direction-preview'>, opener: HTMLButtonElement) => {
    openerRef.current = opener
    setDialog(next)
  }

  const updateBrief = (field: keyof PrototypeBrief, value: string) => {
    setBrief(current => ({ ...current, [field]: value }))
    setBriefErrors(current => ({ ...current, [field]: undefined }))
  }

  const toggleSection = (section: string) => {
    setBrief(current => ({ ...current, sections: current.sections.includes(section) ? current.sections.filter(item => item !== section) : [...current.sections, section] }))
    setBriefErrors(current => {
      const next = { ...current }
      delete next.sections
      return next
    })
  }

  const submitBrief = () => {
    const errors: Partial<Record<keyof PrototypeBrief, string>> = {}
    if (!brief.offer.trim()) errors.offer = 'Hãy cho biết bạn cung cấp sản phẩm hoặc dịch vụ gì'
    if (!brief.audience.trim()) errors.audience = 'Hãy cho biết website này dành cho ai'
    if (!brief.goal.trim()) errors.goal = 'Hãy chọn mục tiêu chính của website'
    if (!brief.cta.trim()) errors.cta = 'Hãy thêm hành động chính cho khách truy cập'
    if (!brief.style.trim()) errors.style = 'Hãy mô tả cảm giác mà website nên mang lại'
    if (brief.sections.length === 0) errors.sections = 'Hãy chọn ít nhất một phần nội dung bắt buộc'
    setBriefErrors(errors)
    if (Object.keys(errors).length > 0) return
    setDirections(createDirectionSet(brief, directionRound))
    setScreen('directions')
    setReviewState('happy')
  }

  const chooseDirection = (direction: PrototypeDirection) => {
    setAccepted(direction.document)
    setSelectedSectionId(firstBenefitsSection(direction.document))
    setScreen('editor')
    setMode('simple')
    setSaveStatus('Đã lưu')
  }

  const replaceDirections = () => {
    const nextRound = directionRound + 1
    setDirectionRound(nextRound)
    setDirections(createDirectionSet(brief, nextRound))
    setReviewState('directions-replacing')
  }

  const propose = () => {
    if (!accepted) return
    setProposal(createPrototypeProposal(accepted, selectedSectionId, proposalVariant))
    setScreen('review')
    if (reviewState !== 'proposal-failed' && reviewState !== 'proposal-stale') setReviewState('happy')
  }

  const tryAnother = () => {
    if (!accepted) return
    const nextVariant = proposalVariant + 1
    setProposalVariant(nextVariant)
    setProposal(createPrototypeProposal(accepted, selectedSectionId, nextVariant))
  }

  const acceptProposal = () => {
    if (!accepted || !proposal) return
    setAccepted(acceptPrototypeProposal(accepted, proposal))
    setProposal(null)
    setSaveStatus('Đã lưu')
    setReviewState('happy')
    setScreen('editor')
  }

  const changeReviewState = (state: ReviewState) => {
    setReviewState(state)
    if (state.startsWith('directions-')) {
      if (directions.length === 0) setDirections(createDirectionSet(brief, directionRound))
      setScreen('directions')
    } else if (state.startsWith('proposal-')) {
      const base = accepted ?? createDirectionSet(brief, 0)[0]!.document
      if (!accepted) setAccepted(base)
      const section = firstBenefitsSection(base)
      setSelectedSectionId(section)
      setProposal(createPrototypeProposal(base, section, proposalVariant))
      setScreen('review')
    } else if (state.startsWith('save-') || state.startsWith('publish-')) {
      const base = accepted ?? createDirectionSet(brief, 0)[0]!.document
      if (!accepted) setAccepted(base)
      setSelectedSectionId(firstBenefitsSection(base))
      setSaveStatus(state === 'save-offline' ? 'Ngoại tuyến' : state === 'save-unsaved' ? 'Đang lưu…' : 'Đã lưu')
      setScreen('editor')
    } else if (state.startsWith('brief-')) {
      setScreen('brief')
    }
  }

  const selectedDirection = dialogDirection ?? directions[0] ?? null
  const story = accepted ? <PageStory document={accepted} selectedSectionId={selectedSectionId} onSelect={id => { setSelectedSectionId(id); closeDialog() }} /> : null
  const coDesign = accepted ? <CoDesign scope={`Phần ${sectionLabel(accepted, selectedSectionId)}`} prompt={prompt} onPrompt={setPrompt} onPropose={() => { closeDialog(); propose() }} /> : null
  const fingerprint = accepted ? documentFingerprint(accepted) : 'no-accepted-document'

  return (
    <div className="non-coder-prototype">
      <ReviewToolbar value={reviewState} onChange={changeReviewState} onReset={reset} />
      <ReviewStateBanner state={reviewState} />
      {screen === 'brief' ? (
        <GuidedBrief brief={brief} errors={briefErrors} onField={updateBrief} onSections={toggleSection} onSubmit={submitBrief} />
      ) : null}
      {screen === 'directions' ? (
        <DirectionGallery
          directions={directions}
          viewport={viewport}
          onViewport={setViewport}
          onChoose={chooseDirection}
          onAdjust={() => setScreen('brief')}
          onReplace={replaceDirections}
          onPreview={(direction, opener) => { openerRef.current = opener; setDialogDirection(direction); setDialog('direction-preview') }}
        />
      ) : null}
      {screen === 'editor' && accepted && mode === 'simple' ? (
        <SimpleEditor
          document={accepted}
          selectedSectionId={selectedSectionId}
          viewport={viewport}
          saveStatus={saveStatus}
          prompt={prompt}
          onSelect={setSelectedSectionId}
          onViewport={setViewport}
          onPrompt={setPrompt}
          onPropose={propose}
          onAdvanced={() => setMode('advanced')}
          onDialog={openDialog}
        />
      ) : null}
      {screen === 'editor' && accepted && mode === 'advanced' ? <AdvancedEditor document={accepted} viewport={viewport} onReturn={() => setMode('simple')} /> : null}
      {screen === 'review' && accepted && proposal ? (
        <ProposalReview
          accepted={accepted}
          proposal={proposal}
          viewport={viewport}
          state={reviewState}
          onAccept={acceptProposal}
          onDiscard={() => { setProposal(null); setReviewState('happy'); setScreen('editor') }}
          onTryAnother={tryAnother}
        />
      ) : null}
      <span className="prototype-visually-hidden" data-testid="accepted-document-fingerprint">{fingerprint}</span>
      {dialog && (
        <PrototypeDialogSurface
          dialog={dialog}
          document={accepted}
          direction={selectedDirection}
          viewport={viewport}
          published={published}
          shareReady={shareReady}
          publishConfirmed={publishConfirmed}
          onPublishConfirmed={setPublishConfirmed}
          onShare={() => setShareReady(true)}
          onPublish={() => { setPublished(true); setPublishConfirmed(false) }}
          onClose={closeDialog}
          story={story}
          coDesign={coDesign}
        />
      )}
    </div>
  )
}
