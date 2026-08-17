import { fontFaceCss, themeFontFamily } from '@zenui/font-library'
import {
  conversionActionHref,
  isNodeHidden,
  nodeToBrowserStyle,
  rendererPresentationCss,
  resolveNodeTag,
  resolvePresentationProfile,
  type RenderViewport,
} from '@zenui/html-compiler/render'
import { createElement, type FormEvent, type ReactNode } from 'react'

import { DesignIcon } from './design-icon'

import type { DesignDocument, DesignNode } from '@zenui/design-schema'


interface DesignDocumentRendererProps {
  document: DesignDocument
  viewport: RenderViewport
  pageId?: string
  rootNodeId?: string
  assetOrigin?: string | undefined
  compact?: boolean
  ariaLabel?: string
  className?: string
}

function visualContent(node: DesignNode, children: ReactNode): ReactNode {
  if (node.type === 'image' || node.type === 'divider') return null
  if ('text' in node.props && typeof node.props.text === 'string') return node.props.text
  if (node.type === 'icon' && 'name' in node.props) return <DesignIcon name={node.props.name} />
  return children
}

function rendererFontCss(
  document: DesignDocument,
  assetOrigin: string | undefined,
): string {
  if (!assetOrigin) return ''
  let origin: string
  try {
    origin = new URL(assetOrigin).origin
  } catch {
    return ''
  }
  return [
    fontFaceCss(document.theme, fontId => ({
      latin: `${origin}/f/${fontId}/latin.woff2`,
      vietnamese: `${origin}/f/${fontId}/vietnamese.woff2`,
    })),
    `[data-zenui-render-root]{font-family:${themeFontFamily(document.theme.fonts.body)}}`,
    `[data-zenui-render-root] [data-node-type="heading"]{font-family:${themeFontFamily(document.theme.fonts.heading)}}`,
  ].join('')
}

function LeadForm({ node, viewport }: { node: DesignNode; viewport: RenderViewport }) {
  if (node.type !== 'lead-form' || !('fields' in node.props)) return null
  const titleId = `${node.id}-title`
  const descriptionId = `${node.id}-description`
  const noticeId = `${node.id}-preview-notice`
  const describedBy = [node.props.description ? descriptionId : null, noticeId].filter(Boolean).join(' ')
  const preventSubmit = (event: FormEvent<HTMLFormElement>): void => event.preventDefault()

  return (
    <form
      id={node.id}
      style={nodeToBrowserStyle(node, viewport)}
      data-node-type="lead-form"
      data-node-id={node.id}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onSubmit={preventSubmit}
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

function RenderNode({ document, nodeId, viewport, assetOrigin }: {
  document: DesignDocument
  nodeId: string
  viewport: RenderViewport
  assetOrigin?: string | undefined
}) {
  const node = document.nodes[nodeId]!
  if (isNodeHidden(node)) return null
  if (node.type === 'lead-form') return <LeadForm node={node} viewport={viewport} />
  const attributes: Record<string, unknown> = {
    id: node.id,
    style: nodeToBrowserStyle(node, viewport),
    'data-node-id': node.id,
    'data-node-type': node.type,
  }
  if (node.type === 'image' && 'alt' in node.props) {
    if ('src' in node.props) attributes.src = node.props.src
    if ('assetId' in node.props && assetOrigin) {
      attributes.src = `${new URL(assetOrigin).origin}/a/${node.props.assetId}`
    }
    attributes.alt = node.props.alt
    attributes.loading = 'lazy'
    attributes.referrerPolicy = 'no-referrer'
  }
  if (node.type === 'button' || node.type === 'link') {
    if ('href' in node.props) attributes.href = node.props.href
    else if ('pageId' in node.props) {
      const pageId = node.props.pageId
      const fragment = node.props.fragment
      const page = document.pages.find(candidate => candidate.id === pageId)
      if (page) attributes.href = fragment ? `${page.slug}#${fragment}` : page.slug
    } else if ('action' in node.props) {
      const href = conversionActionHref(document, node.props.action)
      if (href) attributes.href = href
    }
    attributes.onClick = (event: { preventDefault(): void }) => event.preventDefault()
  }
  if (node.type === 'icon' && 'label' in node.props) {
    attributes.role = 'img'
    attributes['aria-label'] = node.props.label
  }
  if (node.type === 'spacer') attributes['aria-hidden'] = 'true'
  const children = node.children.map(childId => (
    <RenderNode
      key={childId}
      document={document}
      nodeId={childId}
      viewport={viewport}
      assetOrigin={assetOrigin}
    />
  ))
  return createElement(resolveNodeTag(node), attributes, visualContent(node, children))
}

export function DesignDocumentRenderer({
  document,
  viewport,
  pageId,
  rootNodeId,
  assetOrigin,
  compact = false,
  ariaLabel = 'Bản xem trước website',
  className = '',
}: DesignDocumentRendererProps) {
  const page = document.pages.find(candidate => candidate.id === pageId)
    ?? document.pages.find(candidate => candidate.slug === '/')
    ?? document.pages[0]!
  const renderRootId = rootNodeId && document.nodes[rootNodeId] ? rootNodeId : page.rootNodeId
  return (
    <>
      <style data-zenui-render-style="">{
        rendererFontCss(document, assetOrigin) + rendererPresentationCss(document)
      }</style>
      <div
        className={`design-document-renderer${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
        data-viewport={viewport}
        data-render-root-id={renderRootId}
        data-zenui-render-root=""
        data-visual-profile={resolvePresentationProfile(document)}
        role="region"
        aria-label={ariaLabel}
      >
        <RenderNode
          document={document}
          nodeId={renderRootId}
          viewport={viewport}
          assetOrigin={assetOrigin}
        />
      </div>
    </>
  )
}
