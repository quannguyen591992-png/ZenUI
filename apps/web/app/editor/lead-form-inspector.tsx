'use client'

import {
  conversionActionSchema,
  DESIGN_LIMITS,
  leadFormLayoutPatch,
  leadFormPropsSchema,
  type ConversionAction,
  type DesignDocument,
  type DesignNode,
  type LeadFormField,
  type LeadFormLayout,
  type LeadFormProps,
} from '@zenui/design-schema'
import { useEffect, useRef, useState } from 'react'

import type { DesignCommand } from '@zenui/design-commands'

const fieldTypeLabels: Record<LeadFormField['type'], string> = {
  text: 'Văn bản',
  email: 'Email',
  tel: 'Điện thoại',
  textarea: 'Đoạn văn dài',
  select: 'Danh sách chọn',
}

function leadFormError(path: PropertyKey[]): string {
  const last = path.at(-1)
  if (last === 'key') return 'Khóa trường chỉ dùng chữ cái ASCII, số, gạch ngang hoặc gạch dưới và phải bắt đầu bằng chữ cái.'
  if (last === 'title') return `Tiêu đề biểu mẫu là bắt buộc và không quá ${DESIGN_LIMITS.maxLeadFormTitleLength} ký tự.`
  if (last === 'label') return 'Nhãn không được để trống hoặc vượt quá giới hạn.'
  if (last === 'options') return 'Danh sách chọn cần lựa chọn hợp lệ và các giá trị không trùng nhau.'
  if (last === 'fields') return `Biểu mẫu cần từ 1 đến ${DESIGN_LIMITS.maxLeadFormFields} trường với khóa không trùng nhau.`
  return 'Biểu mẫu chưa hợp lệ. Hãy kiểm tra lại các nội dung đã nhập.'
}

function defaultField(index: number): LeadFormField {
  return {
    key: `field${index}`,
    type: 'text',
    label: `Trường ${index}`,
    required: false,
    placeholder: '',
  }
}

function fieldWithType(field: LeadFormField, type: LeadFormField['type']): LeadFormField {
  const base = {
    key: field.key,
    type,
    label: field.label,
    required: field.required,
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
  }
  return type === 'select'
    ? { ...base, type, options: [{ label: 'Lựa chọn 1', value: 'option-1' }] }
    : base as LeadFormField
}

type Viewport = 'desktop' | 'tablet' | 'mobile'

interface LeadFormInspectorProps {
  nodeId: string
  documentVersion: number
  props: LeadFormProps
  viewport: Viewport
  execute: (command: DesignCommand) => void
}

const leadFormLayouts: readonly { layout: LeadFormLayout; label: string }[] = [
  { layout: 'left', label: 'Canh trái' },
  { layout: 'center', label: 'Canh giữa' },
  { layout: 'right', label: 'Canh phải' },
  { layout: 'full', label: 'Toàn chiều rộng' },
]

export function LeadFormInspector({ nodeId, documentVersion, props, viewport, execute }: LeadFormInspectorProps) {
  const [draft, setDraft] = useState<LeadFormProps>(() => structuredClone(props))
  const [fieldIds, setFieldIds] = useState(() => props.fields.map((field, index) => `${nodeId}:${field.key}:${index}`))
  const [error, setError] = useState<string | null>(null)
  const fieldCounter = useRef(props.fields.length)

  useEffect(() => {
    setDraft(structuredClone(props))
    setFieldIds(props.fields.map((field, index) => `${nodeId}:${field.key}:${index}`))
    fieldCounter.current = props.fields.length
    setError(null)
  }, [nodeId, props])

  const updateField = (index: number, field: LeadFormField): void => {
    setDraft(current => ({
      ...current,
      fields: current.fields.map((candidate, candidateIndex) => candidateIndex === index ? field : candidate),
    }))
  }
  const moveField = (index: number, offset: -1 | 1): void => {
    const target = index + offset
    if (target < 0 || target >= draft.fields.length) return
    setDraft(current => {
      const fields = [...current.fields]
      const [field] = fields.splice(index, 1)
      fields.splice(target, 0, field!)
      return { ...current, fields }
    })
    setFieldIds(current => {
      const ids = [...current]
      const [id] = ids.splice(index, 1)
      ids.splice(target, 0, id!)
      return ids
    })
  }
  const removeField = (index: number): void => {
    if (draft.fields.length <= 1) return
    setDraft(current => ({ ...current, fields: current.fields.filter((_, candidateIndex) => candidateIndex !== index) }))
    setFieldIds(current => current.filter((_, candidateIndex) => candidateIndex !== index))
  }
  const addField = (): void => {
    if (draft.fields.length >= DESIGN_LIMITS.maxLeadFormFields) return
    fieldCounter.current += 1
    const nextIndex = fieldCounter.current
    setDraft(current => ({ ...current, fields: [...current.fields, defaultField(nextIndex)] }))
    setFieldIds(current => [...current, `${nodeId}:new:${nextIndex}`])
  }
  const save = (): void => {
    const parsed = leadFormPropsSchema.safeParse(draft)
    if (!parsed.success) {
      setError(leadFormError(parsed.error.issues[0]?.path ?? []))
      return
    }
    setError(null)
    execute({
      commandId: `lead-form-${nodeId}-${Date.now()}`,
      documentVersion,
      source: 'user',
      type: 'UPDATE_PROPS',
      nodeId,
      patch: parsed.data,
    })
  }
  const updateLayout = (layout: LeadFormLayout): void => {
    const command = {
      commandId: `lead-form-layout-${viewport}-${nodeId}-${Date.now()}`,
      documentVersion,
      source: 'user' as const,
      nodeId,
      patch: { ...leadFormLayoutPatch(layout) },
    }
    execute(viewport === 'desktop'
      ? { ...command, type: 'UPDATE_STYLE' }
      : { ...command, type: 'UPDATE_RESPONSIVE_STYLE', breakpoint: viewport })
  }

  return (
    <section className="lead-form-builder" aria-label="Trình tạo biểu mẫu khách hàng">
      <fieldset className="lead-form-layout-card" aria-label="Bố cục biểu mẫu">
        <legend>Bố cục biểu mẫu</legend>
        <p>Kéo chỉ dùng để đổi thứ tự. Dùng các nút dưới đây để canh ngang biểu mẫu.</p>
        <div className="lead-form-layout-actions">
          {leadFormLayouts.map(({ layout, label }) => (
            <button
              key={layout}
              type="button"
              className="lead-form-button lead-form-button-secondary"
              onClick={() => updateLayout(layout)}
            >{label}</button>
          ))}
        </div>
      </fieldset>

      <section className="lead-form-copy-card" aria-label="Nội dung biểu mẫu">
        <h3>Nội dung biểu mẫu</h3>
        <div className="lead-form-copy-fields">
          <label className="inspector-field-group">
            <span>Tiêu đề biểu mẫu</span>
            <input
              className="pro-input"
              aria-label="Tiêu đề biểu mẫu"
              value={draft.title}
              maxLength={DESIGN_LIMITS.maxLeadFormTitleLength}
              onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="inspector-field-group">
            <span>Mô tả biểu mẫu</span>
            <textarea
              className="pro-input"
              aria-label="Mô tả biểu mẫu"
              value={draft.description}
              maxLength={DESIGN_LIMITS.maxLeadFormCopyLength}
              onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="inspector-field-group">
            <span>Nhãn nút gửi</span>
            <input
              className="pro-input"
              aria-label="Nhãn nút gửi"
              value={draft.submitLabel}
              maxLength={DESIGN_LIMITS.maxLeadFieldLabelLength}
              onChange={event => setDraft(current => ({ ...current, submitLabel: event.target.value }))}
            />
          </label>
          <label className="inspector-field-group">
            <span>Nội dung cảm ơn</span>
            <textarea
              className="pro-input"
              aria-label="Nội dung cảm ơn"
              value={draft.successCopy}
              maxLength={DESIGN_LIMITS.maxLeadFormCopyLength}
              onChange={event => setDraft(current => ({ ...current, successCopy: event.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="lead-form-fields" aria-label="Các trường thông tin">
        <div className="lead-form-section-heading">
          <h3>Trường thông tin</h3>
          <span>{draft.fields.length}/{DESIGN_LIMITS.maxLeadFormFields}</span>
        </div>
        {draft.fields.map((field, index) => (
          <fieldset key={fieldIds[index]} className="lead-form-field-card" aria-label={`Trường ${index + 1}`}>
            <legend>Trường {index + 1}</legend>
            <div className="lead-form-field-grid">
              <label className="inspector-field-group">
                <span>Khóa trường</span>
                <input
                  className="pro-input"
                  aria-label="Khóa trường"
                  value={field.key}
                  maxLength={DESIGN_LIMITS.maxLeadFieldKeyLength}
                  onChange={event => updateField(index, { ...field, key: event.target.value })}
                />
              </label>
              <label className="inspector-field-group">
                <span>Nhãn trường</span>
                <input
                  className="pro-input"
                  aria-label="Nhãn trường"
                  value={field.label}
                  maxLength={DESIGN_LIMITS.maxLeadFieldLabelLength}
                  onChange={event => updateField(index, { ...field, label: event.target.value })}
                />
              </label>
              <label className="inspector-field-group">
                <span>Loại trường</span>
                <select
                  className="pro-input"
                  aria-label="Loại trường"
                  value={field.type}
                  onChange={event => updateField(index, fieldWithType(field, event.target.value as LeadFormField['type']))}
                >
                  {Object.entries(fieldTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                </select>
              </label>
              <label className="inspector-field-group">
                <span>Gợi ý nhập</span>
                <input
                  className="pro-input"
                  aria-label="Gợi ý nhập"
                  value={field.placeholder ?? ''}
                  maxLength={DESIGN_LIMITS.maxLeadFieldPlaceholderLength}
                  onChange={event => updateField(index, { ...field, placeholder: event.target.value })}
                />
              </label>
              <label className="lead-form-checkbox">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={event => updateField(index, { ...field, required: event.target.checked })}
                />
                <span>Bắt buộc</span>
              </label>
            </div>
            {field.type === 'select' ? (
              <div className="lead-form-options" aria-label="Các lựa chọn">
                <h4>Các lựa chọn</h4>
                {field.options.map((option, optionIndex) => (
                  <div className="lead-form-option-card" key={`${fieldIds[index]}:option:${optionIndex}`}>
                    <label className="inspector-field-group">
                      <span>Nhãn lựa chọn {optionIndex + 1}</span>
                      <input
                        className="pro-input"
                        aria-label={`Nhãn lựa chọn ${optionIndex + 1}`}
                        value={option.label}
                        maxLength={DESIGN_LIMITS.maxLeadSelectOptionLength}
                        onChange={event => updateField(index, {
                          ...field,
                          options: field.options.map((candidate, candidateIndex) => candidateIndex === optionIndex
                            ? { ...candidate, label: event.target.value }
                            : candidate),
                        })}
                      />
                    </label>
                    <label className="inspector-field-group">
                      <span>Giá trị lựa chọn {optionIndex + 1}</span>
                      <input
                        className="pro-input"
                        aria-label={`Giá trị lựa chọn ${optionIndex + 1}`}
                        value={option.value}
                        maxLength={DESIGN_LIMITS.maxLeadSelectOptionLength}
                        onChange={event => updateField(index, {
                          ...field,
                          options: field.options.map((candidate, candidateIndex) => candidateIndex === optionIndex
                            ? { ...candidate, value: event.target.value }
                            : candidate),
                        })}
                      />
                    </label>
                    <button
                      type="button"
                      className="lead-form-button lead-form-button-danger"
                      aria-label={`Xóa lựa chọn ${optionIndex + 1}`}
                      disabled={field.options.length <= 1}
                      onClick={() => updateField(index, { ...field, options: field.options.filter((_, candidateIndex) => candidateIndex !== optionIndex) })}
                    >Xóa lựa chọn</button>
                  </div>
                ))}
                <button
                  type="button"
                  className="lead-form-button lead-form-button-tertiary"
                  disabled={field.options.length >= DESIGN_LIMITS.maxLeadSelectOptions}
                  onClick={() => updateField(index, {
                    ...field,
                    options: [...field.options, { label: `Lựa chọn ${field.options.length + 1}`, value: `option-${field.options.length + 1}` }],
                  })}
                >Thêm lựa chọn</button>
              </div>
            ) : null}
            <div className="lead-form-field-actions">
              <button className="lead-form-button lead-form-button-secondary" type="button" aria-label={`Đưa trường ${index + 1} lên`} disabled={index === 0} onClick={() => moveField(index, -1)}>Đưa lên</button>
              <button className="lead-form-button lead-form-button-secondary" type="button" aria-label={`Đưa trường ${index + 1} xuống`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}>Đưa xuống</button>
              <button className="lead-form-button lead-form-button-danger" type="button" aria-label={`Xóa trường ${index + 1}`} disabled={draft.fields.length <= 1} onClick={() => removeField(index)}>Xóa trường</button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="lead-form-button lead-form-button-tertiary lead-form-add-field"
          disabled={draft.fields.length >= DESIGN_LIMITS.maxLeadFormFields}
          onClick={addField}
        >Thêm trường</button>
      </section>

      <section className="lead-form-consent" aria-label="Đồng ý liên hệ">
        <h3>Đồng ý liên hệ</h3>
        <label className="lead-form-checkbox">
          <input
            type="checkbox"
            checked={Boolean(draft.consent)}
            onChange={event => setDraft(current => event.target.checked
              ? { ...current, consent: { label: 'Tôi đồng ý để ZenUI liên hệ', required: false } }
              : {
                  title: current.title,
                  description: current.description,
                  submitLabel: current.submitLabel,
                  successCopy: current.successCopy,
                  fields: current.fields,
                })}
          />
          <span>Hiển thị đồng ý liên hệ</span>
        </label>
        {draft.consent ? (
          <div className="lead-form-consent-fields">
            <label className="inspector-field-group">
              <span>Nội dung đồng ý</span>
              <textarea
                className="pro-input"
                aria-label="Nội dung đồng ý"
                value={draft.consent.label}
                maxLength={DESIGN_LIMITS.maxLeadFormCopyLength}
                onChange={event => setDraft(current => current.consent
                  ? { ...current, consent: { ...current.consent, label: event.target.value } }
                  : current)}
              />
            </label>
            <label className="lead-form-checkbox">
              <input
                type="checkbox"
                checked={draft.consent.required}
                onChange={event => setDraft(current => current.consent
                  ? { ...current, consent: { ...current.consent, required: event.target.checked } }
                  : current)}
              />
              <span>Bắt buộc đồng ý</span>
            </label>
          </div>
        ) : null}
      </section>

      <div className="lead-form-save-bar" role="group" aria-label="Hành động biểu mẫu">
        {error ? <p role="alert" className="inspector-error">{error}</p> : null}
        <button type="button" className="lead-form-button lead-form-button-primary" onClick={save}>Lưu biểu mẫu</button>
      </div>
    </section>
  )
}

function initialAction(node: DesignNode): { action: ConversionAction; legacyExternalValue: string } {
  if ((node.type === 'button' || node.type === 'link') && 'action' in node.props) {
    return { action: structuredClone(node.props.action), legacyExternalValue: '' }
  }
  if ((node.type === 'button' || node.type === 'link') && 'pageId' in node.props) {
    return {
      action: { type: 'internal_page', pageId: node.props.pageId, ...(node.props.fragment ? { fragment: node.props.fragment } : {}) },
      legacyExternalValue: '',
    }
  }
  const href = (node.type === 'button' || node.type === 'link') && 'href' in node.props ? node.props.href : 'https://example.com'
  return { action: { type: 'external_url', url: href }, legacyExternalValue: href }
}

interface ConversionActionInspectorProps {
  node: DesignNode
  document: DesignDocument
  execute: (command: DesignCommand) => void
}

export function ConversionActionInspector({ node, document, execute }: ConversionActionInspectorProps) {
  const initial = initialAction(node)
  const [action, setAction] = useState<ConversionAction>(initial.action)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAction(initialAction(node).action)
    setError(null)
  }, [node])

  if (node.type !== 'button' && node.type !== 'link') return null
  const text = (node.props as { text: string }).text
  const forms = Object.values(document.nodes).filter(candidate => candidate.type === 'lead-form')
  const setType = (type: ConversionAction['type']): void => {
    if (type === 'lead_form') setAction({ type, formNodeId: forms[0]?.id ?? '' })
    if (type === 'internal_page') setAction({ type, pageId: document.pages[0]?.id ?? '' })
    if (type === 'external_url') setAction({ type, url: initialAction(node).legacyExternalValue || 'https://example.com' })
    if (type === 'email') setAction({ type, address: 'hello@example.com' })
    if (type === 'phone') setAction({ type, number: '+84 123 456 789' })
  }
  const save = (): void => {
    const parsed = conversionActionSchema.safeParse(action)
    if (!parsed.success) {
      setError('Hành động chưa hợp lệ. Hãy kiểm tra lại thông tin đích.')
      return
    }
    setError(null)
    execute({
      commandId: `conversion-action-${node.id}-${Date.now()}`,
      documentVersion: document.version,
      source: 'user',
      type: 'UPDATE_PROPS',
      nodeId: node.id,
      patch: {
        text,
        href: null,
        pageId: null,
        fragment: null,
        action: parsed.data,
      },
    })
  }

  return (
    <section className="conversion-action-builder" aria-label="Hành động chuyển đổi">
      <label>
        Loại hành động
        <select aria-label="Loại hành động" value={action.type} onChange={event => setType(event.target.value as ConversionAction['type'])}>
          <option value="lead_form">Đi tới biểu mẫu</option>
          <option value="internal_page">Đi tới trang</option>
          <option value="external_url">Liên kết ngoài</option>
          <option value="email">Gửi email</option>
          <option value="phone">Gọi điện</option>
        </select>
      </label>
      {action.type === 'lead_form' ? (
        <label>
          Biểu mẫu đích
          <select aria-label="Biểu mẫu đích" value={action.formNodeId} onChange={event => setAction({ type: 'lead_form', formNodeId: event.target.value })}>
            {forms.map(form => <option key={form.id} value={form.id}>{'title' in form.props ? form.props.title : form.id}</option>)}
          </select>
        </label>
      ) : action.type === 'internal_page' ? (
        <>
          <label>
            Trang đích
            <select aria-label="Trang đích" value={action.pageId} onChange={event => setAction({ ...action, pageId: event.target.value })}>
              {document.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
            </select>
          </label>
          <label>
            Mục trong trang
            <input aria-label="Mục trong trang" value={action.fragment ?? ''} onChange={event => setAction({ ...action, fragment: event.target.value || undefined })} />
          </label>
        </>
      ) : action.type === 'external_url' ? (
        <label>
          Liên kết ngoài
          <input aria-label="Liên kết ngoài" value={action.url} onChange={event => setAction({ type: 'external_url', url: event.target.value })} />
        </label>
      ) : action.type === 'email' ? (
        <label>
          Địa chỉ email
          <input aria-label="Địa chỉ email" type="email" value={action.address} onChange={event => setAction({ type: 'email', address: event.target.value })} />
        </label>
      ) : (
        <label>
          Số điện thoại
          <input aria-label="Số điện thoại" type="tel" value={action.number} onChange={event => setAction({ type: 'phone', number: event.target.value })} />
        </label>
      )}
      {error ? <p role="alert" className="inspector-error">{error}</p> : null}
      <button type="button" onClick={save}>Lưu hành động</button>
    </section>
  )
}
