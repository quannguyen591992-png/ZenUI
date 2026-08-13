import { nodeToBrowserStyle, resolveNodeTag, type RenderViewport } from '@zenui/html-compiler/render'
import { createElement, type ReactNode } from 'react'

import { DesignIcon } from '../../components/design-icon'

import type { DesignDocument, DesignNode } from '@zenui/design-schema'


interface PrototypeRendererProps {
  document: DesignDocument
  viewport: RenderViewport
  compact?: boolean
  selectedSectionId?: string | null | undefined
  proposed?: boolean | undefined
  onSelectSection?: ((nodeId: string) => void) | undefined
  rootNodeId?: string | undefined
  ariaLabel?: string | undefined
}

function visualContent(node: DesignNode, children: ReactNode): ReactNode {
  if (node.type === 'image') return null
  if (node.type === 'divider') return null
  if ('text' in node.props && typeof node.props.text === 'string') return node.props.text
  if (node.type === 'icon' && 'name' in node.props) return <DesignIcon name={node.props.name} />
  return children
}

function sectionAncestor(document: DesignDocument, nodeId: string): string | null {
  let current = document.nodes[nodeId]
  while (current) {
    if (current.parentId === 'page-root') return current.id
    current = current.parentId ? document.nodes[current.parentId] : undefined
  }
  return null
}

function RenderNode({
  document,
  nodeId,
  viewport,
  selectedSectionId,
  proposed,
  onSelectSection,
}: Omit<PrototypeRendererProps, 'compact' | 'rootNodeId' | 'ariaLabel'> & { nodeId: string }) {
  const node = document.nodes[nodeId]!
  const tag = resolveNodeTag(node)
  const sectionId = sectionAncestor(document, node.id)
  const isSectionRoot = sectionId === node.id
  const attributes: Record<string, unknown> = {
    style: nodeToBrowserStyle(node, viewport),
    'data-node-type': node.type,
    'data-prototype-section': isSectionRoot ? node.id : undefined,
    'data-selected-section': isSectionRoot && selectedSectionId === node.id ? 'true' : undefined,
    'data-proposed-section': isSectionRoot && proposed ? 'true' : undefined,
    onClick: isSectionRoot && onSelectSection
      ? (event: { stopPropagation(): void }) => {
          event.stopPropagation()
          onSelectSection(node.id)
        }
      : undefined,
  }

  if (node.type === 'image' && 'src' in node.props && 'alt' in node.props) {
    attributes.src = node.props.src
    attributes.alt = node.props.alt
    attributes.loading = 'lazy'
    attributes.referrerPolicy = 'no-referrer'
  }
  if ((node.type === 'button' || node.type === 'link') && 'href' in node.props) {
    attributes.href = node.props.href
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
      selectedSectionId={selectedSectionId}
      proposed={proposed}
      onSelectSection={onSelectSection}
    />
  ))

  return createElement(tag, attributes, visualContent(node, children))
}

export function PrototypeRenderer({
  document,
  viewport,
  compact = false,
  selectedSectionId = null,
  proposed = false,
  onSelectSection,
  rootNodeId = document.pages[0]!.rootNodeId,
  ariaLabel = 'Bản xem trước website',
}: PrototypeRendererProps) {
  return (
    <div
      className={`prototype-renderer${compact ? ' is-compact' : ''}`}
      data-viewport={viewport}
      aria-label={ariaLabel}
    >
      <RenderNode
        document={document}
        nodeId={rootNodeId}
        viewport={viewport}
        selectedSectionId={selectedSectionId}
        proposed={proposed}
        onSelectSection={onSelectSection}
      />
    </div>
  )
}
