'use client'

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { componentRegistry, COMPONENT_TYPES } from '@zenui/component-registry'
import {
  createAutosaveState,
  createEditorState,
  DRAFT_STORAGE_KEY,
  executeCommands,
  findContainingSectionId,
  getPageStory,
  loadDraft,
  planInsert,
  planMove,
  planNodeDelete,
  planNodeDuplicate,
  planPageCreate,
  planPageDelete,
  planPageDuplicate,
  planSectionDelete,
  planSectionDuplicate,
  planSectionMove,
  queueAutosave,
  redo,
  resolveAutosave,
  saveDraft,
  selectNode,
  selectPage,
  startAutosave,
  undo,
  type AutosaveResolution,
  type AutosaveState,
  type EditorState,
} from '@zenui/editor-core'
import { nodeToBrowserStyle, resolveNodeStyle, resolveNodeTag } from '@zenui/html-compiler'
import {
  createElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import { createVietnameseStarterDocument } from '../../lib/starter-document'
import { commandErrorLabel, componentLabel, newComponentProps, viewportLabel } from '../../lib/ui-copy'

import {
  browserAiProposalApi,
  ContextualAi,
  type AiProposalApi,
  type AiProposalSummary,
} from './ai-proposal-review'
import {
  AssetLibraryPanel,
  createBrowserAssetLibraryApi,
  type AssetLibraryApi,
} from './asset-library-panel'
import { BrandKitPanel, createBrowserBrandKitApi } from './brand-kit-panel'
import { DeployPanel } from './deploy-panel'
import { ExportPanel } from './export-panel'
import { PageManagerPanel } from './page-manager-panel'
import { PublishPanel } from './publish-panel'
import { SecurePreview } from './secure-preview'
import { SharePanel } from './share-panel'
import { SiteIntelligencePanel, browserSiteIntelligenceApi } from './site-intelligence-panel'

import type { WebsiteBrief } from '@zenui/ai-core'
import type { DesignCommand } from '@zenui/design-commands'
import type { ComponentType, DesignDocument, DesignNode } from '@zenui/design-schema'

interface EditorAction {
  type: 'set'
  state: EditorState
}

export interface RevisionSummary {
  id: string
  documentVersion: number
  summary: string
  source: string
  createdAt: string
}

export interface EditorApi {
  saveCommands(
    projectId: string,
    workspaceId: string,
    expectedVersion: number,
    commands: DesignCommand[],
  ): Promise<
    | { accepted: true; version: number }
    | { accepted: false; code: 'stale_document_version' | 'offline' | 'unauthorized' | 'forbidden' | 'validation_error' | 'server_error'; currentVersion?: number }
  >
  loadDocument(projectId: string, workspaceId: string): Promise<{ version: number; document: DesignDocument }>
  listRevisions(projectId: string, workspaceId: string): Promise<RevisionSummary[]>
  createRevision(projectId: string, workspaceId: string, summary: string): Promise<RevisionSummary>
  restoreRevision(
    projectId: string,
    workspaceId: string,
    revisionId: string,
    expectedVersion: number,
  ): Promise<
    | { accepted: true; version: number; document: DesignDocument }
    | { accepted: false; code: 'stale_document_version' | 'not_found'; currentVersion?: number }
  >
}

interface EditorAppProps {
  projectId?: string
  projectName?: string
  workspaceId?: string
  role?: 'owner' | 'editor' | 'viewer'
  initialDocument?: DesignDocument
  initialVersion?: number
  api?: EditorApi
  editorOrigin?: string
  previewOrigin?: string
  assetOrigin?: string
  deploymentEnabled?: boolean
  assistantStyleEnabled?: boolean
  assistantLayoutEnabled?: boolean
  assistantCompositionEnabled?: boolean
  initialMode?: 'simple' | 'advanced'
  proposalApi?: AiProposalApi
  assetApi?: AssetLibraryApi
  brief?: WebsiteBrief | null
}

async function parseApiResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as { data?: T; error?: { code: string; details?: { message: string }[] } }
  if (!response.ok || body.data === undefined) {
    const code = body.error?.code ?? (response.status === 0 ? 'offline' : 'server_error')
    throw Object.assign(new Error(code), { code, currentVersion: body.error?.details?.[0]?.message.match(/\d+/)?.[0] })
  }
  return body.data
}

const browserEditorApi: EditorApi = {
  async saveCommands(projectId, workspaceId, expectedVersion, commands) {
    try {
      const data = await parseApiResponse<{ version: number }>(await fetch(`/api/v1/projects/${projectId}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId, expectedVersion, commands }),
      }))
      return { accepted: true, version: data.version }
    } catch (error) {
      const value = error as { code?: string; currentVersion?: string }
      const code = value.code === 'stale_document_version' ? 'stale_document_version' : value.code === 'unauthorized' || value.code === 'forbidden' || value.code === 'validation_error' ? value.code : navigator.onLine ? 'server_error' : 'offline'
      return { accepted: false, code, ...(value.currentVersion ? { currentVersion: Number(value.currentVersion) } : {}) }
    }
  },
  async loadDocument(projectId, workspaceId) {
    return parseApiResponse(await fetch(`/api/v1/projects/${projectId}/document?workspaceId=${encodeURIComponent(workspaceId)}`))
  },
  async listRevisions(projectId, workspaceId) {
    return parseApiResponse(await fetch(`/api/v1/projects/${projectId}/revisions?workspaceId=${encodeURIComponent(workspaceId)}`))
  },
  async createRevision(projectId, workspaceId, summary) {
    return parseApiResponse(await fetch(`/api/v1/projects/${projectId}/revisions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, summary }),
    }))
  },
  restoreRevision: async (projectId, workspaceId, revisionId, expectedVersion) => {
    try {
      const data = await parseApiResponse<{ version: number; document: DesignDocument }>(await fetch(`/api/v1/projects/${projectId}/revisions/${revisionId}/restore`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, expectedVersion }),
      }))
      return { accepted: true, ...data }
    } catch (error) {
      const code = (error as { code?: string }).code === 'not_found' ? 'not_found' : 'stale_document_version'
      return { accepted: false, code }
    }
  },
}

const editorIconGlyphs = { 'arrow-right': '→', check: '✓', menu: '☰', star: '★' } as const

type Viewport = 'desktop' | 'tablet' | 'mobile'

const canvasViewportWidths: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return action.type === 'set' ? action.state : state
}

function nodeLabel(node: DesignNode): string {
  if ('text' in node.props) return String(node.props.text)
  return componentLabel(node.type)
}

function isHeroImageSlot(document: DesignDocument, node: DesignNode | undefined): node is DesignNode & { type: 'feature-card' } {
  if (!node || node.type !== 'feature-card') return false
  if ('mediaSlot' in node.props && node.props.mediaSlot === 'hero-image') return true
  return node.id === 'hero-product-card' && node.parentId === 'hero-visual' && document.nodes[node.parentId]?.type === 'column'
}

function PaletteItem({ type, onAdd }: { type: ComponentType; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${type}`,
    data: { kind: 'palette', type },
  })
  return (
    <div
      className="palette-item"
      style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, opacity: isDragging ? 0.5 : 1 }}
    >
      <button type="button" aria-label={`Thêm ${componentLabel(type)}`} onClick={onAdd}>
        {componentLabel(type)}
      </button>
      <button
        ref={element => setDraggableNodeRef(element)}
        type="button"
        className="drag-handle"
        aria-label={`Kéo ${componentLabel(type)}`}
        {...listeners}
        {...attributes}
      >
        ⋮⋮
      </button>
    </div>
  )
}

interface SelectionActions {
  targetId: string
  label: string
  canDrag: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  canDuplicate: boolean
  canDelete: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onDelete: () => void
}

interface CanvasNodeProps {
  document: DesignDocument
  nodeId: string
  selectedNodeId: string | null
  viewport: Viewport
  onSelect: (nodeId: string) => void
  onChooseImage: (nodeId: string) => void
  canMutate: boolean
  assetOrigin: string
  selectionActions: SelectionActions | null
}

interface SelectionActionToolbarProps extends Omit<SelectionActions, 'targetId' | 'canDrag'> {
  dragHandle: ReactNode
  onSelect: () => void
}

function SelectionActionToolbar({
  label,
  dragHandle,
  canMoveUp,
  canMoveDown,
  canDuplicate,
  canDelete,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: SelectionActionToolbarProps) {
  return (
    <>
      <button type="button" className="node-select selection-action-label" aria-label={`Chọn ${label}`} data-selected="true" onClick={onSelect}>{label}</button>
      {dragHandle}
      <button type="button" aria-label={`Di chuyển ${label} lên`} disabled={!canMoveUp} onClick={onMoveUp}>↑</button>
      <button type="button" aria-label={`Di chuyển ${label} xuống`} disabled={!canMoveDown} onClick={onMoveDown}>↓</button>
      <button type="button" aria-label={`Nhân bản ${label}`} disabled={!canDuplicate} onClick={onDuplicate}>Nhân bản</button>
      <button type="button" aria-label={`Xóa ${label}`} disabled={!canDelete} onClick={onDelete}>Xóa</button>
    </>
  )
}

function CanvasNode({
  document,
  nodeId,
  selectedNodeId,
  viewport,
  onSelect,
  onChooseImage,
  canMutate,
  assetOrigin,
  selectionActions,
}: CanvasNodeProps) {
  const node = document.nodes[nodeId]!
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
  })
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform } = useDraggable({
    id: `move:${node.id}`,
    disabled: node.parentId === null || !canMutate,
    data: { kind: 'move', nodeId: node.id },
  })
  const setRef = (element: HTMLElement | null): void => {
    setDroppableNodeRef(element)
    setDraggableNodeRef(element)
  }
  const tag = resolveNodeTag(node)
  const browserStyle = nodeToBrowserStyle(node, viewport)
  const visualProps: Record<string, unknown> = {
    style: browserStyle,
    'data-node-type': node.type,
  }
  let children: ReactNode
  if (node.type === 'image' && 'alt' in node.props) {
    visualProps.src = 'src' in node.props
      ? node.props.src
      : `${new URL(assetOrigin).origin}/a/${node.props.assetId}`
    visualProps.alt = node.props.alt
    visualProps.loading = 'lazy'
    visualProps.referrerPolicy = 'no-referrer'
    children = null
  } else if (node.type === 'divider') {
    children = null
  } else if ((node.type === 'button' || node.type === 'link') && 'href' in node.props && 'text' in node.props) {
    visualProps.href = node.props.href
    if (/^https?:/i.test(node.props.href)) visualProps.rel = 'noreferrer noopener'
    children = node.type === 'link' && 'logoAssetId' in node.props && node.props.logoAssetId && node.props.logoAlt
      ? createElement('img', {
          src: `${new URL(assetOrigin).origin}/a/${node.props.logoAssetId}`,
          alt: node.props.logoAlt,
          loading: 'eager',
          referrerPolicy: 'no-referrer',
          'data-node-type': 'brand-logo',
        })
      : node.props.text
  } else if ((node.type === 'heading' || node.type === 'paragraph' || node.type === 'badge') && 'text' in node.props) {
    children = node.props.text
  } else if (node.type === 'icon' && 'name' in node.props) {
    children = editorIconGlyphs[node.props.name]
  } else {
    children = node.children.map(childId => (
      <CanvasNode
        key={childId}
        document={document}
        nodeId={childId}
        selectedNodeId={selectedNodeId}
        viewport={viewport}
        onSelect={onSelect}
        onChooseImage={onChooseImage}
        canMutate={canMutate}
        assetOrigin={assetOrigin}
        selectionActions={selectionActions}
      />
    ))
  }

  return (
    <div
      ref={setRef}
      className={`canvas-node${selectedNodeId === node.id ? ' is-selected' : ''}${isOver ? ' is-over' : ''}`}
      style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined }}
      data-node-id={node.id}
    >
      <div
        className={`node-actions${selectionActions?.targetId === node.id ? ' has-selection-actions' : ''}`}
        data-selected={selectedNodeId === node.id}
        onClick={event => event.stopPropagation()}
      >
        {selectionActions?.targetId === node.id ? (
          <SelectionActionToolbar
            {...selectionActions}
            onSelect={() => onSelect(node.id)}
            dragHandle={(
              <button
                type="button"
                className="drag-handle"
                aria-label={`Kéo ${selectionActions.label}`}
                disabled={!selectionActions.canDrag}
                {...listeners}
                {...attributes}
              >⋮⋮</button>
            )}
          />
        ) : (
          <button
            type="button"
            className="node-select"
            aria-label={`Chọn ${nodeLabel(node)}`}
            data-selected={selectedNodeId === node.id}
            onClick={event => {
              event.stopPropagation()
              onSelect(node.id)
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(node.id)
              }
            }}
          >
            {componentLabel(node.type)}
          </button>
        )}
      </div>
      {canMutate && node.type === 'image' && (
        <button
          type="button"
          className="canvas-image-action"
          aria-label="Thay ảnh"
          onClick={event => {
            event.stopPropagation()
            onChooseImage(node.id)
          }}
        >Thay ảnh</button>
      )}
      {canMutate && isHeroImageSlot(document, node) && (
        <button
          type="button"
          className="canvas-image-action canvas-image-placeholder-action"
          aria-label="Thêm ảnh Hero"
          onClick={event => {
            event.stopPropagation()
            onChooseImage(node.id)
          }}
        >Thêm ảnh Hero</button>
      )}
      <div
        className="node-visual"
        role="presentation"
        style={node.type === 'page' ? {
          backgroundColor: browserStyle.backgroundColor,
          color: document.theme.colors.text,
          fontFamily: `${document.theme.fonts.body}, sans-serif`,
        } : undefined}
        onClick={event => {
          event.preventDefault()
          event.stopPropagation()
          onSelect(node.id)
        }}
      >
        {createElement(tag, visualProps, children)}
      </div>
    </div>
  )
}

interface InspectorProps {
  state: EditorState
  viewport: Viewport
  execute: (command: DesignCommand) => void
}

interface LayersProps {
  document: DesignDocument
  rootNodeId: string
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}

function layerDescription(node: DesignNode): string {
  const props = node.props as Record<string, unknown>
  const value = ['text', 'label', 'brand', 'title', 'alt', 'name']
    .map(key => props[key])
    .find(candidate => typeof candidate === 'string' && candidate.trim())
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : componentLabel(node.type)
}

function layerSnippet(node: DesignNode): string {
  const description = layerDescription(node)
  return description.length > 54 ? `${description.slice(0, 51)}…` : description
}

function layerLabel(node: DesignNode): string {
  return `${componentLabel(node.type)}: ${layerDescription(node)}`
}

function expandableNodeIds(document: DesignDocument): Set<string> {
  return new Set(Object.values(document.nodes).filter(node => node.children.length > 0).map(node => node.id))
}

function selectionAncestors(document: DesignDocument, nodeId: string | null): string[] {
  const ids: string[] = []
  const selected = nodeId ? document.nodes[nodeId] : undefined
  let node = selected?.parentId ? document.nodes[selected.parentId] : undefined
  while (node) {
    if (node.children.length > 0) ids.push(node.id)
    node = node.parentId ? document.nodes[node.parentId] : undefined
  }
  return ids
}

function Layers({ document: design, rootNodeId, selectedNodeId, onSelect }: LayersProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => expandableNodeIds(design))
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const visibleIds = useMemo(() => {
    const collect = (nodeId: string): string[] => {
      const node = design.nodes[nodeId]
      if (!node) return []
      return [nodeId, ...(expandedIds.has(nodeId) ? node.children.flatMap(collect) : [])]
    }
    return collect(rootNodeId)
  }, [design, expandedIds, rootNodeId])

  useEffect(() => {
    const ancestors = selectionAncestors(design, selectedNodeId)
    if (ancestors.length === 0) return
    setExpandedIds(current => {
      if (ancestors.every(id => current.has(id))) return current
      return new Set([...current, ...ancestors])
    })
  }, [design, selectedNodeId])

  useEffect(() => {
    const selected = selectedNodeId ? itemRefs.current.get(selectedNodeId) : undefined
    selected?.scrollIntoView?.({ block: 'nearest' })
  }, [expandedIds, selectedNodeId])

  const focusItem = (nodeId: string | undefined): void => {
    if (nodeId) itemRefs.current.get(nodeId)?.focus()
  }
  const focusRelative = (nodeId: string, offset: -1 | 1): void => {
    focusItem(visibleIds[visibleIds.indexOf(nodeId) + offset])
  }
  const setExpanded = (nodeId: string, expanded: boolean): void => {
    setExpandedIds(current => {
      const next = new Set(current)
      if (expanded) next.add(nodeId)
      else next.delete(nodeId)
      return next
    })
  }
  const renderLayer = (nodeId: string, level: number): ReactNode => {
    const node = design.nodes[nodeId]!
    const hasChildren = node.children.length > 0
    const expanded = hasChildren && expandedIds.has(node.id)
    return (
      <li key={node.id} role="none">
        <button
          ref={element => {
            if (element) itemRefs.current.set(node.id, element)
            else itemRefs.current.delete(node.id)
          }}
          type="button"
          role="treeitem"
          aria-label={layerLabel(node)}
          aria-level={level}
          aria-selected={selectedNodeId === node.id}
          {...(hasChildren ? { 'aria-expanded': expanded } : {})}
          data-layer-id={node.id}
          tabIndex={selectedNodeId === node.id || (!selectedNodeId && node.id === rootNodeId) ? 0 : -1}
          style={{ paddingLeft: `${8 + Math.min(level - 1, 6) * 14}px` }}
          onClick={() => onSelect(node.id)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(node.id)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusRelative(node.id, 1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusRelative(node.id, -1)
            } else if (event.key === 'ArrowRight' && hasChildren) {
              event.preventDefault()
              if (!expanded) setExpanded(node.id, true)
              else focusItem(node.children[0])
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault()
              if (expanded) setExpanded(node.id, false)
              else focusItem(node.parentId ?? undefined)
            }
          }}
        >
          <span className="layer-chevron" aria-hidden="true">{hasChildren ? expanded ? '▾' : '▸' : '·'}</span>
          <span className="layer-type" aria-hidden="true">{componentLabel(node.type)}</span>
          <span className="layer-snippet">{layerSnippet(node)}</span>
        </button>
        {expanded && (
          <ul role="group">{node.children.map(childId => renderLayer(childId, level + 1))}</ul>
        )}
      </li>
    )
  }

  return <ul className="layers-tree" role="tree" aria-label="Lớp">{renderLayer(rootNodeId, 1)}</ul>
}

function Inspector({ state, viewport, execute }: InspectorProps) {
  const node = state.selectedNodeId ? state.document.nodes[state.selectedNodeId] : undefined
  const [text, setText] = useState<string>('')
  const [fontSize, setFontSize] = useState('')
  const [gap, setGap] = useState('')
  const [error, setError] = useState<string | null>(null)
  const currentStyle = node ? resolveNodeStyle(node, viewport) : {}

  useEffect(() => {
    setText(node && 'text' in node.props ? String(node.props.text) : '')
    setFontSize(currentStyle.fontSize === undefined ? '' : String(currentStyle.fontSize))
    setGap(currentStyle.gap === undefined ? '' : String(currentStyle.gap))
    setError(null)
  }, [currentStyle.fontSize, currentStyle.gap, node])
  if (!node) return <p>Chọn một thành phần để chỉnh sửa.</p>

  const updateStyle = (key: 'fontSize' | 'gap' | 'color', value: number | string): void => {
    setError(null)
    execute(viewport === 'desktop'
      ? {
          commandId: `${key}-${node.id}`,
          documentVersion: state.document.version,
          source: 'user',
          type: 'UPDATE_STYLE',
          nodeId: node.id,
          patch: { [key]: value },
        }
      : {
          commandId: `${viewport}-${key}-${node.id}`,
          documentVersion: state.document.version,
          source: 'user',
          type: 'UPDATE_RESPONSIVE_STYLE',
          nodeId: node.id,
          breakpoint: viewport,
          patch: { [key]: value },
        })
  }
  const commitNumber = (key: 'fontSize' | 'gap', value: string): void => {
    const number = Number(value)
    if (key === 'fontSize' && (!Number.isInteger(number) || number < 10 || number > 160)) {
      setError('Cỡ chữ phải từ 10 đến 160')
      return
    }
    if (key === 'gap' && (!Number.isInteger(number) || number < 0 || number > 200)) {
      setError('Khoảng cách phải từ 0 đến 200')
      return
    }
    updateStyle(key, number)
  }

  const PRESET_COLORS = ['#ffffff', '#f8fafc', '#e2e8f0', '#0f172a', '#4f46e5', '#a855f7', '#ec4899', '#10b981', '#f59e0b']

  return (
    <div className="inspector-pro-panel">
      <div className="inspector-header">
        <h2>{componentLabel(node.type)}</h2>
      </div>

      {'text' in node.props && (
        <div className="inspector-field-group">
          <label>Nội dung</label>
          <textarea
            aria-label="Nội dung"
            className="pro-input"
            rows={3}
            value={text}
            onChange={event => {
              const next = event.target.value
              setText(next)
              if (!next) return
              execute({
                commandId: `text-${node.id}`,
                documentVersion: state.document.version,
                source: 'user',
                type: 'UPDATE_PROPS',
                nodeId: node.id,
                patch: { text: next },
              })
            }}
          />
        </div>
      )}

      <div className="inspector-field-group">
        <label>Cỡ chữ</label>
        <div className="pro-slider-group">
          <input
            type="range"
            aria-label="Điều chỉnh cỡ chữ"
            min="10"
            max="160"
            value={fontSize || 16}
            onChange={event => {
              setFontSize(event.target.value)
              updateStyle('fontSize', Number(event.target.value))
            }}
          />
          <input
            aria-label="Cỡ chữ"
            inputMode="numeric"
            className="pro-input pro-input-small"
            value={fontSize}
            onChange={event => setFontSize(event.target.value)}
            onBlur={() => commitNumber('fontSize', fontSize)}
          />
        </div>
      </div>

      <div className="inspector-field-group">
        <label>Khoảng cách</label>
        <div className="pro-slider-group">
          <input
            type="range"
            aria-label="Điều chỉnh khoảng cách"
            min="0"
            max="200"
            value={gap || 0}
            onChange={event => {
              setGap(event.target.value)
              updateStyle('gap', Number(event.target.value))
            }}
          />
          <input
            aria-label="Khoảng cách"
            inputMode="numeric"
            className="pro-input pro-input-small"
            value={gap}
            onChange={event => setGap(event.target.value)}
            onBlur={() => commitNumber('gap', gap)}
          />
        </div>
      </div>

      <div className="inspector-field-group">
        <label>Màu sắc</label>
        <div className="pro-color-swatches">
          {PRESET_COLORS.map(color => (
            <button
              key={color}
              className={`color-swatch ${currentStyle.color === color ? 'active' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => updateStyle('color', color)}
              title={color}
              aria-label={`Chọn màu ${color}`}
            />
          ))}
          <div className="color-picker-wrapper">
            <input
              aria-label="Tùy chỉnh màu chữ"
              type="color"
              value={currentStyle.color ?? '#0f172a'}
              onChange={event => updateStyle('color', event.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <p role="alert" className="inspector-error">{error}</p>}
    </div>
  )
}

interface RevisionPanelProps {
  revisions: RevisionSummary[]
  summary: string
  error: string
  canManage: boolean
  canCreate: boolean
  canRestore: boolean
  onSummaryChange: (summary: string) => void
  onCreate: () => void
  onRestore: (revisionId: string) => void
}

function RevisionPanel({
  revisions,
  summary,
  error,
  canManage,
  canCreate,
  canRestore,
  onSummaryChange,
  onCreate,
  onRestore,
}: RevisionPanelProps) {
  return (
    <section className="revision-panel" aria-labelledby="revisions-heading">
      <h2 id="revisions-heading">Phiên bản</h2>
      {canManage && (
        <>
          <label>
            Tên phiên bản
            <input aria-label="Tên phiên bản" value={summary} maxLength={200} onChange={event => onSummaryChange(event.target.value)} />
          </label>
          <button type="button" disabled={!canCreate} onClick={onCreate}>Tạo phiên bản</button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {revisions.length === 0 ? <p>Chưa có phiên bản nào.</p> : (
        <ul>
          {revisions.map(revision => (
            <li key={revision.id}>
              <span>{revision.summary}</span>
              {canManage && (
                <button type="button" aria-label={`Khôi phục ${revision.summary}`} disabled={!canRestore} onClick={() => onRestore(revision.id)}>Khôi phục</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EditorSurface({ projectId, projectName, workspaceId, role, initialDocument, initialVersion, api, editorOrigin, previewOrigin, assetOrigin, deploymentEnabled, assistantStyleEnabled, assistantLayoutEnabled, assistantCompositionEnabled, initialMode, proposalApi, assetApi: suppliedAssetApi, brief }: Required<Omit<EditorAppProps, 'brief' | 'assetApi'>> & { assetApi?: AssetLibraryApi; brief: WebsiteBrief | null }) {
  const [state, dispatch] = useReducer(editorReducer, initialDocument, createEditorState)
  const [announcement, setAnnouncement] = useState('Trình chỉnh sửa đã sẵn sàng')
  const [hydrated, setHydrated] = useState(false)
  const [recoveryRequired, setRecoveryRequired] = useState(false)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [mode, setMode] = useState<'simple' | 'advanced'>(initialMode)
  const [advancedPanel, setAdvancedPanel] = useState<'layers' | 'components'>('layers')
  const [dialog, setDialog] = useState<'advanced' | 'delete-section' | 'delete-node' | null>(null)
  const [sheet, setSheet] = useState<'story' | 'edit' | 'ask' | 'more' | null>(null)
  const [isPageManagerOpen, setPageManagerOpen] = useState(false)
  const [proposalPrompt, setProposalPrompt] = useState('')
  const [proposalIntent, setProposalIntent] = useState<'standard' | 'remix-section'>('standard')
  const [activeProposal, setActiveProposal] = useState<AiProposalSummary | null>(null)
  const assetPanelRef = useRef<HTMLElement | null>(null)
  const sheetOpenerRef = useRef<HTMLButtonElement | null>(null)
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null)
  const closeSheet = (): void => {
    const opener = sheetOpenerRef.current
    setSheet(null)
    window.setTimeout(() => opener?.focus())
  }
  const [autosave, setAutosave] = useState<AutosaveState>(() => createAutosaveState(initialVersion))
  const [revisions, setRevisions] = useState<RevisionSummary[]>([])
  const [revisionSummary, setRevisionSummary] = useState('')
  const [revisionError, setRevisionError] = useState('')
  const idCounter = useRef(0)
  const stateRef = useRef(state)
  const autosaveRef = useRef(autosave)
  const revisionsRef = useRef(revisions)
  const revisionPromiseRef = useRef<Promise<RevisionSummary> | null>(null)
  stateRef.current = state
  autosaveRef.current = autosave
  revisionsRef.current = revisions
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const activePage = state.document.pages.find(page => page.id === state.activePageId)
    ?? state.document.pages.find(page => page.slug === '/')
    ?? state.document.pages[0]!
  const activeRoot = state.document.nodes[activePage.rootNodeId]!
  const defaultParentId = state.selectedNodeId ?? activeRoot.children
    .map(nodeId => state.document.nodes[nodeId])
    .find(node => node?.type === 'section')?.children
    .map(nodeId => state.document.nodes[nodeId])
    .find(node => node?.type === 'container')?.id
    ?? activePage.rootNodeId
  const isFixture = projectId === 'project-1'
  const recoveryKey = `zenui:recovery:${projectId}`

  useEffect(() => {
    if (isFixture) {
      const loaded = loadDraft(window.localStorage)
      if (loaded.success && loaded.document) dispatch({ type: 'set', state: createEditorState(loaded.document) })
      else if (!loaded.success) {
        setAnnouncement('Bản nháp cục bộ cần được khôi phục')
        setRecoveryRequired(true)
      }
    } else {
      const loaded = loadDraft(window.localStorage, recoveryKey)
      if (loaded.success && loaded.document && loaded.document.version > initialVersion) {
        setAnnouncement('Có bản sao khôi phục chưa được đồng bộ')
        setRecoveryRequired(true)
      } else if (!loaded.success) {
        setAnnouncement('Bản nháp cục bộ cần được khôi phục')
        setRecoveryRequired(true)
      }
      void api.listRevisions(projectId, workspaceId)
        .then(setRevisions)
        .catch(() => setRevisionError('Không thể tải danh sách phiên bản.'))
    }
    setHydrated(true)
  }, [api, initialVersion, isFixture, projectId, recoveryKey, workspaceId])

  useEffect(() => {
    if (isFixture && hydrated && !recoveryRequired) saveDraft(window.localStorage, state.document)
  }, [hydrated, isFixture, recoveryRequired, state.document])

  useEffect(() => {
    if (isFixture || autosave.status !== 'dirty') return
    const timer = window.setTimeout(() => {
      const started = startAutosave(autosaveRef.current)
      if (!started.request) return
      setAutosave(started.state)
      void api.saveCommands(projectId, workspaceId, started.request.expectedVersion, started.request.commands)
        .then(result => {
          const resolution: AutosaveResolution = result.accepted
            ? { requestId: started.request!.requestId, accepted: true, version: result.version }
            : { requestId: started.request!.requestId, accepted: false, code: result.code, ...(result.currentVersion ? { currentVersion: result.currentVersion } : {}) }
          setAutosave(current => resolveAutosave(current, resolution))
        })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [api, autosave.status, isFixture, projectId, workspaceId])

  useEffect(() => {
    if (isFixture) return
    if (autosave.recoveryRequired) saveDraft(window.localStorage, state.document, recoveryKey)
    else if (autosave.status === 'saved') window.localStorage.removeItem(recoveryKey)
  }, [autosave.recoveryRequired, autosave.status, isFixture, recoveryKey, state.document])

  useEffect(() => {
    if (autosave.status === 'saved') setAnnouncement('Đã lưu')
    if (autosave.status === 'conflict') setAnnouncement('Có xung đột: thay đổi cục bộ vẫn được giữ')
    if (autosave.status === 'offline') setAnnouncement('Đang ngoại tuyến: bản khôi phục cục bộ vẫn được giữ')
    if (autosave.status === 'error') setAnnouncement('Tự động lưu thất bại: bản khôi phục cục bộ vẫn được giữ')
  }, [autosave.status])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      const target = event.target
      if (event.key === 'Escape') {
        if (sheet) {
          closeSheet()
        } else if (dialog) {
          setDialog(null)
        } else if (mode === 'simple' && stateRef.current.selectedNodeId) {
          dispatch({ type: 'set', state: selectNode(stateRef.current, null) })
        }
        return
      }
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      const current = stateRef.current
      dispatch({ type: 'set', state: event.shiftKey ? redo(current) : undo(current) })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialog, mode, sheet])

  useEffect(() => {
    if (sheet) sheetCloseRef.current?.focus()
  }, [sheet])

  const setState = (next: EditorState): void => dispatch({ type: 'set', state: next })
  const selectEditorNode = (nodeId: string): void => {
    setState(selectNode(stateRef.current, nodeId))
  }
  const resetLocalDraft = (): void => {
    window.localStorage.removeItem(isFixture ? DRAFT_STORAGE_KEY : recoveryKey)
    setRecoveryRequired(false)
    setAnnouncement('Đã đặt lại bản nháp cục bộ')
  }
  const applyCommands = (commands: DesignCommand[], selection?: string): void => {
    const next = executeCommands(stateRef.current, commands)
    const selected = selection ? selectNode(next, selection) : next
    setState(selected)
    if (!next.error && !isFixture) setAutosave(current => queueAutosave(current, commands))
    setAnnouncement(next.error ? commandErrorLabel(next.error.code) : 'Đã áp dụng thay đổi')
  }
  const execute = (command: DesignCommand): void => applyCommands([command])
  const add = (type: ComponentType, parentId = defaultParentId): void => {
    const parent = state.document.nodes[parentId]
    const plan = planInsert(
      state.document,
      type,
      parentId,
      parent?.children.length ?? 0,
      () => `${type}-${Date.now()}-${idCounter.current++}`,
    )
    if (!plan.accepted) {
      setAnnouncement(commandErrorLabel(plan.code))
      return
    }
    const props = newComponentProps(type)
    const command = props ? { ...plan.command, node: { ...plan.command.node, props } } : plan.command
    applyCommands([command], command.node.id)
    setAnnouncement(`Đã thêm ${componentLabel(type)}`)
  }
  const move = (nodeId: string, direction: -1 | 1): void => {
    const currentState = stateRef.current
    const node = currentState.document.nodes[nodeId]
    if (!node?.parentId) return
    const parent = currentState.document.nodes[node.parentId]!
    const currentIndex = parent.children.indexOf(nodeId)
    const targetIndex = Math.max(0, Math.min(parent.children.length - 1, currentIndex + direction))
    if (targetIndex === currentIndex) return
    const plan = planMove(currentState.document, nodeId, parent.id, targetIndex)
    if (!plan.accepted) return setAnnouncement(commandErrorLabel(plan.code))
    applyCommands([plan.command])
  }
  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over) return setAnnouncement('Đã hủy thao tác kéo')
    const targetId = String(over.id).replace('node:', '')
    if (active.data.current?.kind === 'palette') add(active.data.current.type as ComponentType, targetId)
    if (active.data.current?.kind === 'move') {
      const target = state.document.nodes[targetId]
      const parentId = target && componentRegistry[target.type].isContainer ? target.id : target?.parentId
      if (!parentId) return setAnnouncement('Không tìm thấy vị trí đích')
      const parent = state.document.nodes[parentId]!
      const targetIndex = target && target.parentId === parentId
        ? parent.children.indexOf(target.id)
        : parent.children.length
      const plan = planMove(state.document, active.data.current.nodeId as string, parentId, targetIndex)
      if (!plan.accepted) return setAnnouncement(commandErrorLabel(plan.code))
      execute(plan.command)
    }
  }
  const downloadContent = (content: string, filename: string, type: string): void => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }
  const downloadRecovery = (): void => {
    downloadContent(JSON.stringify(state.document, null, 2), 'zenui-recovery.json', 'application/json')
    setAnnouncement('Đã tải bản sao khôi phục')
  }
  const reloadServer = async (): Promise<void> => {
    const loaded = await api.loadDocument(projectId, workspaceId)
    setState(createEditorState(loaded.document))
    setAutosave(createAutosaveState(loaded.version))
    window.localStorage.removeItem(recoveryKey)
    setRecoveryRequired(false)
    setAnnouncement('Đã tải lại phiên bản trên máy chủ')
  }
  const ensureLatestSavedRevision = async (): Promise<RevisionSummary> => {
    const currentAutosave = autosaveRef.current
    if (currentAutosave.status !== 'idle' && currentAutosave.status !== 'saved') {
      throw new Error('saved_website_unavailable')
    }
    const existing = revisionsRef.current.find(revision => revision.documentVersion === currentAutosave.serverVersion)
    if (existing) return existing
    if (revisionPromiseRef.current) return revisionPromiseRef.current
    const expectedVersion = currentAutosave.serverVersion
    revisionPromiseRef.current = api.createRevision(projectId, workspaceId, 'Website đã lưu để chia sẻ và xuất bản')
      .then(revision => {
        if (autosaveRef.current.serverVersion !== expectedVersion) throw new Error('saved_website_changed')
        setRevisions(current => [revision, ...current.filter(item => item.id !== revision.id)])
        return revision
      })
      .finally(() => { revisionPromiseRef.current = null })
    return revisionPromiseRef.current
  }
  const createRevision = async (): Promise<void> => {
    const summary = revisionSummary.trim()
    if (!summary || summary.length > 200) {
      setRevisionError('Tên phiên bản là bắt buộc và không được dài quá 200 ký tự')
      return
    }
    try {
      const revision = await api.createRevision(projectId, workspaceId, summary)
      setRevisions(current => [revision, ...current])
      setRevisionSummary('')
      setRevisionError('')
    } catch {
      setRevisionError('Không thể tạo phiên bản.')
    }
  }
  const restoreRevision = async (revisionId: string): Promise<void> => {
    const restored = await api.restoreRevision(projectId, workspaceId, revisionId, autosave.serverVersion)
    if (!restored.accepted) {
      setAutosave(current => ({ ...current, status: 'conflict', recoveryRequired: true }))
      return
    }
    setState(createEditorState(restored.document))
    setAutosave(createAutosaveState(restored.version))
    window.localStorage.removeItem(recoveryKey)
    setAnnouncement('Đã khôi phục phiên bản')
    setRevisions(await api.listRevisions(projectId, workspaceId))
  }
  const applyAcceptedProposal = async (result: {
    version: number
    revisionId: string
    document: DesignDocument
  }): Promise<void> => {
    setState(createEditorState(result.document))
    setAutosave(createAutosaveState(result.version))
    window.localStorage.removeItem(recoveryKey)
    setRecoveryRequired(false)
    setRevisions(await api.listRevisions(projectId, workspaceId))
    setAnnouncement('Đã chấp nhận và lưu thay đổi AI')
  }
  const palette = useMemo(() => COMPONENT_TYPES.filter(type => type !== 'page'), [])
  const story = useMemo(() => getPageStory(state.document, state.activePageId), [state.activePageId, state.document])
  const browserAssetApi = useMemo(() => createBrowserAssetLibraryApi(projectId, workspaceId), [projectId, workspaceId])
  const assetApi = suppliedAssetApi ?? browserAssetApi
  const brandApi = useMemo(() => createBrowserBrandKitApi(projectId, workspaceId), [projectId, workspaceId])
  const intelligenceApi = useMemo(() => browserSiteIntelligenceApi(projectId, workspaceId), [projectId, workspaceId])
  const selectedAssetTarget = state.selectedNodeId
    ? state.document.nodes[state.selectedNodeId]
    : undefined
  const selectedImageId = selectedAssetTarget?.type === 'image' ? selectedAssetTarget.id : null
  const selectedHeroSlotId = isHeroImageSlot(state.document, selectedAssetTarget)
    ? selectedAssetTarget.id
    : null
  const assetTargetLabel = selectedImageId ? 'image' as const : selectedHeroSlotId ? 'hero-image' as const : null
  const selectedSectionId = findContainingSectionId(state.document, state.selectedNodeId, state.activePageId)
    ?? story[0]?.nodeId
    ?? null
  const selectedStory = story.find(item => item.nodeId === selectedSectionId)
  const exactProposalTarget = state.selectedNodeId ? state.document.nodes[state.selectedNodeId] : undefined
  const contextualMediaTarget = Boolean(
    exactProposalTarget?.type === 'image'
    || (exactProposalTarget?.type === 'feature-card' && 'mediaSlot' in exactProposalTarget.props && exactProposalTarget.props.mediaSlot),
  )
  const contextualProposalTargetId = state.selectedNodeId ?? selectedSectionId
  const contextualTarget = contextualProposalTargetId ? state.document.nodes[contextualProposalTargetId] : undefined
  const contextualProposalIntent = contextualMediaTarget ? 'replace-media' as const : proposalIntent
  const proposalScopeLabel = contextualTarget && contextualProposalTargetId !== selectedSectionId
    ? contextualMediaTarget ? nodeLabel(contextualTarget) : layerLabel(contextualTarget)
    : `Phần ${selectedStory?.label ?? 'website'}`
  const canMutate = role !== 'viewer'
  const proposalCanSubmit = canMutate && (autosave.status === 'idle' || autosave.status === 'saved')
  const duplicateSectionId = (sourceId: string): string => {
    let candidate = `${sourceId}-copy-${idCounter.current++}`
    while (stateRef.current.document.nodes[candidate]) candidate = `${sourceId}-copy-${idCounter.current++}`
    return candidate
  }
  const applySectionPlan = (
    plan: ReturnType<typeof planSectionMove>
      | ReturnType<typeof planSectionDuplicate>
      | ReturnType<typeof planSectionDelete>,
    success: string,
    selection = selectedSectionId ?? undefined,
  ): void => {
    if (!canMutate) return
    if (!plan.accepted) return setAnnouncement(commandErrorLabel(plan.code))
    applyCommands([plan.command], selection)
    setAnnouncement(success)
  }
  const selectSection = (nodeId: string): void => {
    selectEditorNode(nodeId)
  }
  const chooseImageTarget = (nodeId: string): void => {
    if (!canMutate) return
    selectEditorNode(nodeId)
    setAnnouncement(stateRef.current.document.nodes[nodeId]?.type === 'image'
      ? 'Đã chọn ảnh cần thay'
      : 'Đã chọn vị trí thêm ảnh Hero')
    window.setTimeout(() => {
      assetPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      assetPanelRef.current?.querySelector<HTMLElement>('[data-target]')?.focus()
    })
  }
  const prepareIntelligenceSuggestion = (prompt: string, sectionNodeId: string): void => {
    selectSection(sectionNodeId)
    setProposalIntent('standard')
    setProposalPrompt(prompt)
    setAnnouncement('Đã chuẩn bị gợi ý. Hãy kiểm tra phạm vi trước khi tạo đề xuất.')
    window.setTimeout(() => globalThis.document.querySelector<HTMLTextAreaElement>('[aria-label="Bạn muốn cải thiện điều gì?"]')?.focus())
  }
  const prepareIntelligenceRemix = (sectionNodeId: string): void => {
    selectSection(sectionNodeId)
    setProposalIntent('remix-section')
    setProposalPrompt('Thử cách trình bày khác cho section này, giữ nguyên nội dung, hành động chính và thương hiệu')
    setAnnouncement('Đã chuẩn bị Remix giữ nguyên ràng buộc. Hãy kiểm tra rồi tạo đề xuất.')
  }
  const enterAdvanced = (): void => {
    setMode('advanced')
    setDialog(null)
    setAnnouncement('Đã mở chỉnh sửa chuyên sâu')
  }
  const returnToSimple = (): void => {
    const sectionId = findContainingSectionId(stateRef.current.document, stateRef.current.selectedNodeId, stateRef.current.activePageId)
      ?? getPageStory(stateRef.current.document, stateRef.current.activePageId)[0]?.nodeId
      ?? null
    setState(selectNode(stateRef.current, sectionId))
    setMode('simple')
    setAnnouncement('Đã quay lại thiết kế trực quan')
  }
  const pageIds = (prefix: string): string => `${prefix}-${Date.now()}-${idCounter.current++}`
  const createPage = (input: { name: string; slug: string }): void => {
    const plan = planPageCreate(stateRef.current.document, input, () => pageIds('page'), () => pageIds('page-root'))
    if (!plan.accepted) return setAnnouncement(plan.message)
    const next = executeCommands(stateRef.current, [plan.command])
    setState(selectPage(next, plan.command.page.id))
    if (!next.error && !isFixture) setAutosave(current => queueAutosave(current, [plan.command]))
    setAnnouncement(`Đã thêm trang ${plan.command.page.name}`)
  }
  const renamePage = (pageId: string, input: { name: string; slug: string }): void => {
    applyCommands([{
      commandId: `update-page-${pageId}-${Date.now()}`,
      documentVersion: stateRef.current.document.version,
      source: 'user',
      type: 'UPDATE_PAGE',
      pageId,
      patch: input,
    }])
  }
  const movePage = (pageId: string, direction: -1 | 1): void => {
    const index = stateRef.current.document.pages.findIndex(page => page.id === pageId)
    const newIndex = index + direction
    if (index < 0 || newIndex < 0 || newIndex >= stateRef.current.document.pages.length) return
    applyCommands([{
      commandId: `move-page-${pageId}-${Date.now()}`,
      documentVersion: stateRef.current.document.version,
      source: 'user',
      type: 'MOVE_PAGE',
      pageId,
      newIndex,
    }])
  }
  const duplicatePage = (pageId: string): void => {
    const source = stateRef.current.document.pages.find(page => page.id === pageId)
    if (!source) return
    const plan = planPageDuplicate(
      stateRef.current.document,
      pageId,
      { name: `${source.name} bản sao`, slug: `${source.slug === '/' ? '/home' : source.slug}-copy-${idCounter.current++}` },
      sourceId => pageIds(`copy-${sourceId}`),
    )
    if (!plan.accepted) return setAnnouncement(plan.message)
    const next = executeCommands(stateRef.current, [plan.command])
    setState(selectPage(next, plan.command.page.id))
    if (!next.error && !isFixture) setAutosave(current => queueAutosave(current, [plan.command]))
    setAnnouncement('Đã nhân bản trang')
  }
  const deletePage = (pageId: string): void => {
    const plan = planPageDelete(stateRef.current.document, pageId)
    if (!plan.accepted) return setAnnouncement(plan.message)
    applyCommands([plan.command])
    setAnnouncement('Đã xóa trang')
  }
  const updateNavigation = (items: { pageId: string; label: string }[]): void => {
    applyCommands([{
      commandId: `navigation-${Date.now()}`,
      documentVersion: stateRef.current.document.version,
      source: 'user',
      type: 'UPDATE_NAVIGATION',
      items,
    }])
  }
  const confirmDelete = (): void => {
    if (dialog === 'delete-section') {
      if (!selectedSectionId) return
      applySectionPlan(
        planSectionDelete(stateRef.current.document, selectedSectionId),
        'Đã xóa section',
        getPageStory(stateRef.current.document, stateRef.current.activePageId).find(item => item.nodeId !== selectedSectionId)?.nodeId,
      )
    } else if (dialog === 'delete-node') {
      const nodeId = stateRef.current.selectedNodeId
      if (!nodeId) return
      const node = stateRef.current.document.nodes[nodeId]
      const parent = node?.parentId ? stateRef.current.document.nodes[node.parentId] : undefined
      const index = parent?.children.indexOf(nodeId) ?? -1
      const nextSelection = parent
        ? parent.children[index + 1] ?? parent.children[index - 1] ?? parent.id
        : undefined
      const plan = planNodeDelete(stateRef.current.document, nodeId)
      if (!plan.accepted) setAnnouncement(commandErrorLabel(plan.code))
      else {
        applyCommands([plan.command], nextSelection)
        setAnnouncement('Đã xóa thành phần')
      }
    }
    setDialog(null)
  }
  const selectedSectionIndex = story.findIndex(item => item.nodeId === selectedSectionId)
  const exactSelectedNode = state.selectedNodeId ? state.document.nodes[state.selectedNodeId] : undefined
  const explicitSectionSelection = Boolean(exactSelectedNode && exactSelectedNode.id === selectedSectionId)
  const actionTargetId = exactSelectedNode?.id ?? selectedSectionId
  const actionTarget = actionTargetId ? state.document.nodes[actionTargetId] : undefined
  const actionParent = actionTarget?.parentId ? state.document.nodes[actionTarget.parentId] : undefined
  const actionIndex = actionParent?.children.indexOf(actionTargetId ?? '') ?? -1
  const actionIsTopLevelSection = mode === 'simple' && actionTargetId === selectedSectionId
  const actionLabel = actionIsTopLevelSection && explicitSectionSelection
    ? selectedStory?.label ?? componentLabel(actionTarget?.type ?? 'section')
    : exactSelectedNode
      ? nodeLabel(exactSelectedNode)
      : selectedStory?.label ?? (actionTarget ? componentLabel(actionTarget.type) : '')
  const selectionActions: SelectionActions | null = actionTargetId && actionTarget ? {
    targetId: actionTargetId,
    label: actionLabel,
    canDrag: canMutate && Boolean(actionTarget.parentId),
    canMoveUp: canMutate && (actionIsTopLevelSection ? selectedSectionIndex > 0 : actionIndex > 0),
    canMoveDown: canMutate && (actionIsTopLevelSection
      ? selectedSectionIndex >= 0 && selectedSectionIndex < story.length - 1
      : actionIndex >= 0 && actionIndex < (actionParent?.children.length ?? 0) - 1),
    canDuplicate: canMutate && Boolean(actionTarget.parentId),
    canDelete: canMutate && Boolean(actionTarget.parentId) && (!actionIsTopLevelSection || story.length > 1),
    onMoveUp: () => {
      if (actionIsTopLevelSection) applySectionPlan(planSectionMove(stateRef.current.document, actionTargetId, -1), 'Đã di chuyển section')
      else move(actionTargetId, -1)
    },
    onMoveDown: () => {
      if (actionIsTopLevelSection) applySectionPlan(planSectionMove(stateRef.current.document, actionTargetId, 1), 'Đã di chuyển section')
      else move(actionTargetId, 1)
    },
    onDuplicate: () => {
      if (actionIsTopLevelSection) {
        const plan = planSectionDuplicate(stateRef.current.document, actionTargetId, duplicateSectionId)
        applySectionPlan(plan, 'Đã nhân bản section', plan.accepted ? plan.command.rootNodeId : undefined)
        return
      }
      const plan = planNodeDuplicate(stateRef.current.document, actionTargetId, duplicateSectionId)
      if (!plan.accepted) return setAnnouncement(commandErrorLabel(plan.code))
      applyCommands([plan.command], plan.rootNodeId)
      setAnnouncement('Đã nhân bản thành phần')
    },
    onDelete: () => setDialog(actionIsTopLevelSection ? 'delete-section' : 'delete-node'),
  } : null

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <main className="editor-shell">
        <header className="editor-toolbar">
          <strong>ZenUI</strong>
          {mode === 'simple' && (
            <button type="button" onClick={() => setPageManagerOpen(true)}>Quản lý trang</button>
          )}
          {mode === 'simple' ? (
            <button type="button" onClick={() => setDialog('advanced')}>Mở chỉnh sửa chuyên sâu</button>
          ) : (
            <button type="button" onClick={returnToSimple}>Quay lại thiết kế trực quan</button>
          )}
          <button type="button" aria-label="Hoàn tác" disabled={state.undoStack.length === 0} onClick={() => setState(undo(state))}>Hoàn tác</button>
          <button type="button" aria-label="Làm lại" disabled={state.redoStack.length === 0} onClick={() => setState(redo(state))}>Làm lại</button>
          <label>
            Thiết bị xem trước
            <select aria-label="Thiết bị xem trước" value={viewport} onChange={event => setViewport(event.target.value as Viewport)}>
              {(['desktop', 'tablet', 'mobile'] as const).map(value => <option key={value} value={value}>{viewportLabel(value)}</option>)}
            </select>
          </label>
          {isFixture ? <span>Cần xuất tệp từ máy chủ</span> : mode === 'advanced' ? (
            <ExportPanel
              projectId={projectId}
              workspaceId={workspaceId}
              expectedVersion={autosave.serverVersion}
              canExport={autosave.status === 'idle' || autosave.status === 'saved'}
            />
          ) : null}
          {!isFixture && (
            <SecurePreview
              previewOrigin={previewOrigin}
              editorOrigin={editorOrigin}
              document={state.document}
              route={activePage.slug}
              viewport={viewport}
              selectedNodeId={state.selectedNodeId}
              presentation={mode}
              saveStatus={autosave.status}
              onSelect={selectEditorNode}
            />
          )}
          {!isFixture && role === 'owner' && (mode === 'simple' ? (
            <>
              <SharePanel
                projectId={projectId}
                workspaceId={workspaceId}
                revisions={revisions}
                presentation="simple"
                canShare={autosave.status === 'idle' || autosave.status === 'saved'}
                ensureLatestSavedRevision={ensureLatestSavedRevision}
              />
              <PublishPanel
                projectId={projectId}
                workspaceId={workspaceId}
                projectName={projectName}
                primaryAction={brief?.cta ?? ''}
                canPublish={autosave.status === 'idle' || autosave.status === 'saved'}
                enabled={deploymentEnabled}
                ensureLatestSavedRevision={ensureLatestSavedRevision}
              />
            </>
          ) : (
            <>
              <SharePanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} />
              <DeployPanel projectId={projectId} workspaceId={workspaceId} revisions={revisions} enabled={deploymentEnabled} />
            </>
          ))}
          <span>{mode === 'simple'
            ? autosave.status === 'dirty' || autosave.status === 'saving'
              ? 'Đang lưu chỉnh sửa'
              : autosave.status === 'offline'
                ? 'Đang ngoại tuyến'
                : autosave.status === 'conflict'
                  ? 'Cần xem lại bản đã lưu'
                  : autosave.status === 'error'
                    ? 'Chưa thể lưu chỉnh sửa'
                    : 'Đã lưu'
            : `Tài liệu v${state.document.version}`}</span>
        </header>
        {mode === 'simple' && isPageManagerOpen && (
          <PageManagerPanel
            document={state.document}
            activePageId={state.activePageId}
            canMutate={canMutate}
            onClose={() => setPageManagerOpen(false)}
            onSelect={pageId => {
              setState(selectPage(stateRef.current, pageId))
              setAnnouncement(`Đang chỉnh trang ${stateRef.current.document.pages.find(page => page.id === pageId)?.name ?? ''}`)
            }}
            onCreate={createPage}
            onRename={renamePage}
            onMove={movePage}
            onDuplicate={duplicatePage}
            onDelete={deletePage}
            onNavigation={updateNavigation}
          />
        )}
        {mode === 'simple' ? (
          <nav className="page-story-pro" aria-label="Câu chuyện trang">
            <div className="story-header">
              <h1>Câu chuyện trang</h1>
              <p>Chọn từng phần để sắp xếp câu chuyện của website.</p>
            </div>
            <ol className="story-layer-tree">
              {story.map(item => (
                <li key={item.nodeId}>
                  <button
                    type="button"
                    className={`story-layer-item ${selectedSectionId === item.nodeId ? 'active' : ''}`}
                    aria-label={`Chọn ${item.label} — ${item.purpose}`}
                    aria-current={selectedSectionId === item.nodeId ? 'true' : undefined}
                    onClick={() => selectSection(item.nodeId)}
                  >
                    <div className="layer-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    </div>
                    <div className="layer-content">
                      <strong>{item.label}</strong>
                      <span>{item.purpose}</span>
                    </div>
                    {item.hidden && <span className="layer-badge">Đã ẩn</span>}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <aside className="palette-panel advanced-sidebar" aria-label="Chỉnh sửa chuyên sâu">
            <div className="advanced-sidebar-tabs" role="tablist" aria-label="Chọn bảng điều khiển">
              <button
                type="button"
                role="tab"
                id="advanced-layers-tab"
                aria-controls="advanced-layers-panel"
                aria-selected={advancedPanel === 'layers'}
                tabIndex={advancedPanel === 'layers' ? 0 : -1}
                onClick={() => setAdvancedPanel('layers')}
              >Lớp</button>
              <button
                type="button"
                role="tab"
                id="advanced-components-tab"
                aria-controls="advanced-components-panel"
                aria-selected={advancedPanel === 'components'}
                tabIndex={advancedPanel === 'components' ? 0 : -1}
                onClick={() => setAdvancedPanel('components')}
              >Thành phần</button>
            </div>
            {advancedPanel === 'layers' ? (
              <section
                id="advanced-layers-panel"
                className="advanced-sidebar-panel layers-panel"
                role="tabpanel"
                aria-labelledby="advanced-layers-tab"
              >
                <h1>Lớp</h1>
                <p className="hint">Chọn một lớp hoặc bấm trực tiếp vào nội dung trên khung thiết kế.</p>
                <Layers
                  document={state.document}
                  rootNodeId={activePage.rootNodeId}
                  selectedNodeId={state.selectedNodeId}
                  onSelect={selectEditorNode}
                />
              </section>
            ) : (
              <section
                id="advanced-components-panel"
                className="advanced-sidebar-panel components-panel"
                role="tabpanel"
                aria-labelledby="advanced-components-tab"
              >
                <h1>Thành phần</h1>
                {palette.map(type => <PaletteItem key={type} type={type} onAdd={() => add(type)} />)}
                <p className="hint">Chọn một khung chứa rồi thêm thành phần. Bạn cũng có thể kéo bằng chuột hoặc bàn phím.</p>
              </section>
            )}
          </aside>
        )}
        {mode === 'simple' && (
          <div className="simple-narrow-toolbar" aria-label="Điều hướng trên màn hình nhỏ">
            <button
              type="button"
              aria-expanded={sheet === 'story'}
              onClick={event => {
                sheetOpenerRef.current = event.currentTarget
                setSheet(current => current === 'story' ? null : 'story')
              }}
            >Câu chuyện</button>
            <button
              type="button"
              aria-expanded={sheet === 'edit'}
              disabled={!canMutate}
              onClick={event => {
                sheetOpenerRef.current = event.currentTarget
                setSheet(current => current === 'edit' ? null : 'edit')
              }}
            >Chỉnh sửa</button>
            <button
              type="button"
              aria-expanded={sheet === 'ask'}
              disabled={!canMutate}
              onClick={event => {
                sheetOpenerRef.current = event.currentTarget
                setSheet(current => current === 'ask' ? null : 'ask')
              }}
            >Hỏi AI</button>
            <button
              type="button"
              aria-expanded={sheet === 'more'}
              onClick={event => {
                sheetOpenerRef.current = event.currentTarget
                setSheet(current => current === 'more' ? null : 'more')
              }}
            >Thêm thao tác</button>
          </div>
        )}
        <section className="canvas-panel" aria-label="Khung thiết kế" data-viewport={viewport}>
          <div className="canvas-viewport" style={{ width: canvasViewportWidths[viewport] }}>
            <CanvasNode
              document={state.document}
              nodeId={activePage.rootNodeId}
              selectedNodeId={state.selectedNodeId ?? (mode === 'simple' ? selectedSectionId : null)}
              viewport={viewport}
              onSelect={selectEditorNode}
              onChooseImage={chooseImageTarget}
              canMutate={canMutate}
              assetOrigin={assetOrigin}
              selectionActions={selectionActions}
            />
          </div>
        </section>
        {mode === 'simple' ? (
          <aside className="section-guide" aria-label="Chỉnh sửa section">
            {isFixture ? (
              <>
                <h1>{selectedStory?.label ?? 'Section'}</h1>
                <p>{selectedStory?.purpose ?? 'Chọn một section từ Câu chuyện trang.'}</p>
                <p className="hint">AI đề xuất thay đổi trước khi áp dụng.</p>
              </>
            ) : !canMutate ? (
              <>
                <h1>{selectedStory?.label ?? 'Section'}</h1>
                <p>{selectedStory?.purpose ?? 'Chọn một section từ Câu chuyện trang.'}</p>
                <p className="hint">Bạn đang xem ở chế độ chỉ đọc.</p>
                <RevisionPanel
                  revisions={revisions}
                  summary={revisionSummary}
                  error={revisionError}
                  canManage={false}
                  canCreate={false}
                  canRestore={false}
                  onSummaryChange={setRevisionSummary}
                  onCreate={() => void createRevision()}
                  onRestore={revisionId => void restoreRevision(revisionId)}
                />
              </>
            ) : (
              <>
                <section className="simple-manual-editor" role="region" aria-label="Chỉnh sửa trực tiếp">
                  <h1>Thiết kế</h1>
                  <p>Chọn trực tiếp nội dung trên khung thiết kế để tự chỉnh sửa.</p>
                  <Inspector state={state} viewport={viewport} execute={execute} />
                </section>
                <ContextualAi
                  projectId={projectId}
                  workspaceId={workspaceId}
                  expectedVersion={autosave.serverVersion}
                  selectedNodeId={contextualProposalTargetId}
                  styleTargetNodeId={exactProposalTarget?.id ?? null}
                  scopeLabel={proposalScopeLabel}
                  acceptedDocument={state.document}
                  viewport={viewport}
                  assetOrigin={assetOrigin}
                  canSubmit={proposalCanSubmit}
                  api={proposalApi}
                  initialPrompt={proposalPrompt}
                  initialIntent={contextualProposalIntent}
                  styleEnabled={assistantStyleEnabled && Boolean(exactProposalTarget) && !contextualMediaTarget}
                  layoutEnabled={assistantLayoutEnabled && contextualTarget?.type !== 'image' && contextualProposalTargetId === selectedSectionId}
                  compositionEnabled={assistantCompositionEnabled && contextualTarget?.type === 'section' && contextualProposalTargetId === selectedSectionId}
                  initialAllowedChanges={[]}
                  onAccepted={applyAcceptedProposal}
                  onStateChange={setActiveProposal}
                />
                {brief && (
                  <SiteIntelligencePanel
                    projectId={projectId}
                    workspaceId={workspaceId}
                    document={state.document}
                    brief={brief}
                    selectedNodeId={selectedSectionId}
                    canMutate={proposalCanSubmit && !activeProposal}
                    api={intelligenceApi}
                    onFocusEvidence={selectSection}
                    onSuggestion={prepareIntelligenceSuggestion}
                    onRemix={prepareIntelligenceRemix}
                  />
                )}
                <RevisionPanel
                  revisions={revisions}
                  summary={revisionSummary}
                  error={revisionError}
                  canManage={canMutate}
                  canCreate={autosave.status === 'idle' || autosave.status === 'saved'}
                  canRestore={autosave.status !== 'dirty' && autosave.status !== 'saving' && autosave.status !== 'conflict'}
                  onSummaryChange={setRevisionSummary}
                  onCreate={() => void createRevision()}
                  onRestore={revisionId => void restoreRevision(revisionId)}
                />
              </>
            )}
          </aside>
        ) : (
          <aside className="inspector-panel" aria-label="Thuộc tính">
            <h1>Thiết kế</h1>
            <Inspector state={state} viewport={viewport} execute={execute} />
            {!isFixture && (
              <>
                {canMutate && (
                  <ContextualAi
                    projectId={projectId}
                    workspaceId={workspaceId}
                    expectedVersion={autosave.serverVersion}
                    selectedNodeId={state.selectedNodeId}
                    styleTargetNodeId={exactSelectedNode?.id ?? null}
                    scopeLabel={proposalScopeLabel}
                    acceptedDocument={state.document}
                    viewport={viewport}
                    assetOrigin={assetOrigin}
                    canSubmit={proposalCanSubmit}
                    api={proposalApi}
                    styleEnabled={assistantStyleEnabled && Boolean(exactSelectedNode)}
                    layoutEnabled={assistantLayoutEnabled && exactSelectedNode?.id === selectedSectionId}
                    compositionEnabled={assistantCompositionEnabled && exactSelectedNode?.type === 'section' && exactSelectedNode.id === selectedSectionId}
                    onAccepted={applyAcceptedProposal}
                    onStateChange={setActiveProposal}
                  />
                )}
                <RevisionPanel
                  revisions={revisions}
                  summary={revisionSummary}
                  error={revisionError}
                  canManage={canMutate}
                  canCreate={autosave.status === 'idle' || autosave.status === 'saved'}
                  canRestore={autosave.status !== 'dirty' && autosave.status !== 'saving' && autosave.status !== 'conflict'}
                  onSummaryChange={setRevisionSummary}
                  onCreate={() => void createRevision()}
                  onRestore={revisionId => void restoreRevision(revisionId)}
                />
              </>
            )}
          </aside>
        )}
        {!isFixture && (
          <aside ref={assetPanelRef} className="asset-brand-panel" aria-label="Ảnh và thương hiệu">
            <AssetLibraryPanel
              projectId={projectId}
              workspaceId={workspaceId}
              assetOrigin={assetOrigin}
              canManageAssets={canMutate}
              canApply={canMutate && Boolean(selectedImageId || selectedHeroSlotId)}
              targetLabel={assetTargetLabel}
              api={assetApi}
              onApply={props => {
                if (selectedImageId) {
                  execute({
                    commandId: `asset-${selectedImageId}-${Date.now()}`,
                    documentVersion: stateRef.current.document.version,
                    source: 'user',
                    type: 'UPDATE_PROPS',
                    nodeId: selectedImageId,
                    patch: { ...props, src: null },
                  })
                  return
                }
                if (!selectedHeroSlotId) return
                const target = stateRef.current.document.nodes[selectedHeroSlotId]
                if (!target?.parentId) return
                const imageId = `hero-image-${Date.now()}-${idCounter.current++}`
                applyCommands([{
                  commandId: `asset-${selectedHeroSlotId}-${Date.now()}`,
                  documentVersion: stateRef.current.document.version,
                  source: 'user',
                  type: 'REPLACE_SUBTREE',
                  nodeId: selectedHeroSlotId,
                  rootNodeId: imageId,
                  nodes: [{
                    id: imageId,
                    type: 'image',
                    parentId: target.parentId,
                    children: [],
                    props,
                    style: {
                      width: 'full', aspectRatio: 'wide', objectFit: 'cover', objectPosition: 'center',
                      borderRadius: stateRef.current.document.theme.radius.md, shadow: 'md', backgroundColor: '#eef2ff',
                    },
                    responsive: { tablet: { aspectRatio: 'landscape' }, mobile: { aspectRatio: 'landscape', objectPosition: 'top' } },
                  }],
                }], imageId)
              }}
            />
            {role === 'owner' && (
              <BrandKitPanel
                projectId={projectId}
                workspaceId={workspaceId}
                expectedDocumentVersion={autosave.serverVersion}
                canManage={autosave.status === 'idle' || autosave.status === 'saved'}
                api={brandApi}
                onApplied={result => {
                  setState(createEditorState(result.document))
                  setAutosave(createAutosaveState(result.version))
                  window.localStorage.removeItem(recoveryKey)
                  setAnnouncement('Đã áp dụng Brand Kit cho website')
                }}
              />
            )}
          </aside>
        )}
        <footer className="status-bar" role="status" aria-live="polite">
          <span>{announcement}</span>
          {autosave.status === 'conflict' && (
            <>
              <button type="button" onClick={downloadRecovery}>Tải bản sao khôi phục</button>
              <button type="button" onClick={() => void reloadServer()}>Tải lại phiên bản máy chủ</button>
            </>
          )}
          {recoveryRequired && <button type="button" onClick={resetLocalDraft}>Đặt lại bản nháp cục bộ</button>}
        </footer>
        {sheet && mode === 'simple' && (
          <div className="section-sheet-backdrop">
            <section role="dialog" aria-modal="true" aria-label={sheet === 'story' ? 'Câu chuyện trang' : sheet === 'edit' ? 'Chỉnh sửa trực tiếp' : sheet === 'ask' ? 'Trợ lý thiết kế AI' : 'Thêm thao tác'} className="section-sheet">
              <header>
                <h2>{sheet === 'story' ? 'Câu chuyện trang' : sheet === 'edit' ? 'Chỉnh sửa trực tiếp' : sheet === 'ask' ? 'Trợ lý thiết kế AI' : 'Thêm thao tác'}</h2>
                <button
                  ref={sheetCloseRef}
                  type="button"
                  aria-label="Đóng bảng"
                  onClick={closeSheet}
                >Đóng</button>
              </header>
              {sheet === 'story' ? (
                <ol>
                  {story.map(item => (
                    <li key={item.nodeId}>
                      <button type="button" onClick={() => { selectSection(item.nodeId); setSheet(null) }}>
                        {item.label} — {item.purpose}{item.hidden ? ' — Đã ẩn' : ''}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : sheet === 'edit' ? (
                <div className="simple-manual-editor-sheet">
                  <p>Chọn trực tiếp nội dung trên khung thiết kế để tự chỉnh sửa.</p>
                  <Inspector state={state} viewport={viewport} execute={execute} />
                </div>
              ) : sheet === 'ask' ? (
                <ContextualAi
                  projectId={projectId}
                  workspaceId={workspaceId}
                  expectedVersion={autosave.serverVersion}
                  selectedNodeId={contextualProposalTargetId}
                  styleTargetNodeId={exactProposalTarget?.id ?? null}
                  scopeLabel={proposalScopeLabel}
                  acceptedDocument={state.document}
                  viewport={viewport}
                  assetOrigin={assetOrigin}
                  canSubmit={proposalCanSubmit}
                  api={proposalApi}
                  initialPrompt={proposalPrompt}
                  initialIntent={contextualProposalIntent}
                  styleEnabled={assistantStyleEnabled && Boolean(exactProposalTarget) && !contextualMediaTarget}
                  layoutEnabled={assistantLayoutEnabled && contextualProposalTargetId === selectedSectionId}
                  compositionEnabled={assistantCompositionEnabled && contextualTarget?.type === 'section' && contextualProposalTargetId === selectedSectionId}
                  onAccepted={applyAcceptedProposal}
                  onStateChange={setActiveProposal}
                />
              ) : (
                <div className="section-sheet-actions">
                  <button
                    type="button"
                    disabled={!canMutate}
                    onClick={() => {
                      const plan = planSectionDuplicate(stateRef.current.document, selectedSectionId!, duplicateSectionId)
                      applySectionPlan(plan, 'Đã nhân bản section', plan.accepted ? plan.command.rootNodeId : undefined)
                      setSheet(null)
                    }}
                  >Nhân bản section</button>
                  <button type="button" disabled={!canMutate || story.length <= 1} onClick={() => { setSheet(null); setDialog('delete-section') }}>Xóa section</button>
                </div>
              )}
            </section>
          </div>
        )}
        {dialog === 'advanced' && (
          <div className="editor-dialog-backdrop">
            <section role="dialog" aria-modal="true" aria-labelledby="advanced-dialog-heading" className="editor-dialog">
              <h2 id="advanced-dialog-heading">Mở chỉnh sửa chuyên sâu?</h2>
              <p>Chỉnh sửa chuyên sâu hiển thị cây lớp, thành phần và các kiểm soát kỹ thuật chi tiết hơn. Website sẽ không bị thay đổi khi chuyển cách làm việc.</p>
              <div>
                <button type="button" onClick={() => setDialog(null)}>Ở lại thiết kế trực quan</button>
                <button type="button" autoFocus onClick={enterAdvanced}>Mở chỉnh sửa chuyên sâu</button>
              </div>
            </section>
          </div>
        )}
        {(dialog === 'delete-section' || dialog === 'delete-node') && (
          <div className="editor-dialog-backdrop">
            <section role="dialog" aria-modal="true" aria-labelledby="delete-dialog-heading" className="editor-dialog">
              <h2 id="delete-dialog-heading">{dialog === 'delete-section' ? 'Xóa section?' : 'Xóa thành phần?'}</h2>
              <p>Bạn có thể hoàn tác ngay sau khi xóa.</p>
              <div>
                <button type="button" onClick={() => setDialog(null)}>Hủy</button>
                <button type="button" autoFocus onClick={confirmDelete}>
                  {dialog === 'delete-section' ? 'Xác nhận xóa section' : 'Xác nhận xóa thành phần'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </DndContext>
  )
}

export function EditorApp({
  projectId = 'project-1',
  projectName = 'Website của tôi',
  workspaceId = 'workspace-1',
  role = 'owner',
  initialDocument = createVietnameseStarterDocument(),
  initialVersion = initialDocument.version,
  api = browserEditorApi,
  editorOrigin = 'http://localhost:3000',
  previewOrigin = 'http://127.0.0.1:3001',
  assetOrigin = 'http://127.0.0.1:3002',
  deploymentEnabled = true,
  assistantStyleEnabled = false,
  assistantLayoutEnabled = false,
  assistantCompositionEnabled = false,
  initialMode = projectId === 'project-1' ? 'advanced' : 'simple',
  proposalApi = browserAiProposalApi,
  assetApi,
  brief = null,
}: EditorAppProps = {}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
    ? <EditorSurface projectId={projectId} projectName={projectName} workspaceId={workspaceId} role={role} initialDocument={initialDocument} initialVersion={initialVersion} api={api} editorOrigin={editorOrigin} previewOrigin={previewOrigin} assetOrigin={assetOrigin} deploymentEnabled={deploymentEnabled} assistantStyleEnabled={assistantStyleEnabled} assistantLayoutEnabled={assistantLayoutEnabled} assistantCompositionEnabled={assistantCompositionEnabled} initialMode={initialMode} proposalApi={proposalApi} {...(assetApi ? { assetApi } : {})} brief={brief} />
    : <main className="editor-loading" role="status">Đang tải trình chỉnh sửa ZenUI...</main>
}
