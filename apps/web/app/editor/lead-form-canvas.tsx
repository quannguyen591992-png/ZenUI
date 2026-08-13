import { nodeToBrowserStyle } from '@zenui/html-compiler'

import type { DesignNode } from '@zenui/design-schema'
import type { RenderViewport } from '@zenui/html-compiler'
import type { FormEvent } from 'react'

export function LeadFormCanvas({ node, viewport }: { node: DesignNode; viewport: RenderViewport }) {
  if (node.type !== 'lead-form' || !('fields' in node.props)) return null
  const titleId = `${node.id}-title`
  const descriptionId = `${node.id}-description`
  const noticeId = `${node.id}-preview-notice`
  const describedBy = [node.props.description ? descriptionId : null, noticeId].filter(Boolean).join(' ')

  return (
    <form
      style={nodeToBrowserStyle(node, viewport)}
      data-node-type="lead-form"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
    >
      <h2 id={titleId}>{node.props.title}</h2>
      {node.props.description ? <p id={descriptionId}>{node.props.description}</p> : null}
      {node.props.fields.map(field => {
        const id = `${node.id}-${field.key}`
        return (
          <div key={field.key} data-lead-form-field={field.key}>
            <label htmlFor={id}>{field.label}</label>
            {field.type === 'textarea' ? (
              <textarea id={id} name={field.key} required={field.required} placeholder={field.placeholder} />
            ) : field.type === 'select' ? (
              <select id={id} name={field.key} required={field.required} defaultValue={field.options[0]?.value}>
                {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input id={id} name={field.key} type={field.type} required={field.required} placeholder={field.placeholder} />
            )}
          </div>
        )
      })}
      {node.props.consent ? (
        <div data-lead-form-consent="">
          <input id={`${node.id}-consent`} name="consent" type="checkbox" required={node.props.consent.required} />
          <label htmlFor={`${node.id}-consent`}>{node.props.consent.label}</label>
        </div>
      ) : null}
      <button type="submit">{node.props.submitLabel}</button>
      <p id={noticeId} data-lead-form-notice="preview">Bản xem trước — chưa gửi dữ liệu</p>
    </form>
  )
}
