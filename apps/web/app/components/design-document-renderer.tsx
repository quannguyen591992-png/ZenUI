import { isNodeHidden, nodeToBrowserStyle, resolveNodeTag, type RenderViewport } from '@zenui/html-compiler/render'
import { createElement, type ReactNode } from 'react'

import type { DesignDocument, DesignNode } from '@zenui/design-schema'

const iconGlyphs = { 'arrow-right': '→', check: '✓', menu: '☰', star: '★' } as const

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
  if (node.type === 'icon' && 'name' in node.props) return iconGlyphs[node.props.name]
  return children
}

function RenderNode({ document, nodeId, viewport, assetOrigin }: {
  document: DesignDocument
  nodeId: string
  viewport: RenderViewport
  assetOrigin?: string | undefined
}) {
  const node = document.nodes[nodeId]!
  if (isNodeHidden(node)) return null
  const attributes: Record<string, unknown> = {
    style: nodeToBrowserStyle(node, viewport),
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
  if ((node.type === 'button' || node.type === 'link') && 'href' in node.props) {
    attributes.href = node.props.href
    attributes.onClick = (event: { preventDefault(): void }) => event.preventDefault()
  }
  if (node.type === 'icon' && 'label' in node.props) attributes['aria-label'] = node.props.label
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
    <div
      className={`design-document-renderer${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      data-viewport={viewport}
      data-render-root-id={renderRootId}
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
  )
}
