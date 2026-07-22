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
  createValidDesignFixture,
  type ComponentType,
  type DesignDocument,
  type DesignNode,
  type NodeStyle,
} from '@zenui/design-schema'
import {
  createAutosaveState,
  createEditorState,
  DRAFT_STORAGE_KEY,
  executeCommands,
  loadDraft,
  planInsert,
  planMove,
  queueAutosave,
  redo,
  resolveAutosave,
  saveDraft,
  selectNode,
  startAutosave,
  undo,
  type AutosaveResolution,
  type AutosaveState,
  type EditorState,
} from '@zenui/editor-core'
import { compileStandaloneHtml, resolveNodeTag } from '@zenui/html-compiler'
import {
  createElement,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import type { DesignCommand } from '@zenui/design-commands'

interface EditorAction {
  type: 'set'
  state: EditorState
}

export interface RevisionSummary {
  id: string
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
  workspaceId?: string
  initialDocument?: DesignDocument
  initialVersion?: number
  api?: EditorApi
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

const styleMap: Partial<Record<keyof NodeStyle, keyof CSSProperties>> = {
  display: 'display',
  flexDirection: 'flexDirection',
  justifyContent: 'justifyContent',
  alignItems: 'alignItems',
  gap: 'gap',
  width: 'width',
  maxWidth: 'maxWidth',
  paddingTop: 'paddingTop',
  paddingRight: 'paddingRight',
  paddingBottom: 'paddingBottom',
  paddingLeft: 'paddingLeft',
  marginTop: 'marginTop',
  marginRight: 'marginRight',
  marginBottom: 'marginBottom',
  marginLeft: 'marginLeft',
  fontFamily: 'fontFamily',
  fontSize: 'fontSize',
  fontWeight: 'fontWeight',
  lineHeight: 'lineHeight',
  textAlign: 'textAlign',
  color: 'color',
  backgroundColor: 'backgroundColor',
  borderColor: 'borderColor',
  borderWidth: 'borderWidth',
  borderRadius: 'borderRadius',
  opacity: 'opacity',
}

type Viewport = 'desktop' | 'tablet' | 'mobile'

function styleForViewport(node: DesignNode, viewport: Viewport): NodeStyle {
  return viewport === 'desktop'
    ? node.style
    : { ...node.style, ...(node.responsive[viewport] ?? {}) }
}

function toReactStyle(style: NodeStyle): CSSProperties {
  const result: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(style) as [keyof NodeStyle, NodeStyle[keyof NodeStyle]][]) {
    const cssKey = styleMap[key]
    if (!cssKey || value === undefined) continue
    result[cssKey] = value === 'full' ? '100%' : value
  }
  return result
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return action.type === 'set' ? action.state : state
}

function nodeLabel(node: DesignNode): string {
  if ('text' in node.props) return String(node.props.text)
  return componentRegistry[node.type].displayName
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
      <button type="button" aria-label={`Add ${componentRegistry[type].displayName}`} onClick={onAdd}>
        {componentRegistry[type].displayName}
      </button>
      <button
        ref={element => setDraggableNodeRef(element)}
        type="button"
        className="drag-handle"
        aria-label={`Drag ${componentRegistry[type].displayName}`}
        {...listeners}
        {...attributes}
      >
        ⋮⋮
      </button>
    </div>
  )
}

interface CanvasNodeProps {
  document: DesignDocument
  nodeId: string
  selectedNodeId: string | null
  viewport: Viewport
  onSelect: (nodeId: string) => void
  onMove: (nodeId: string, direction: -1 | 1) => void
}

function CanvasNode({ document, nodeId, selectedNodeId, viewport, onSelect, onMove }: CanvasNodeProps) {
  const node = document.nodes[nodeId]!
  const { setNodeRef: setDroppableNodeRef, isOver } = useDroppable({
    id: `node:${node.id}`,
    data: { kind: 'node', nodeId: node.id },
  })
  const { attributes, listeners, setNodeRef: setDraggableNodeRef, transform } = useDraggable({
    id: `move:${node.id}`,
    disabled: node.parentId === null,
    data: { kind: 'move', nodeId: node.id },
  })
  const setRef = (element: HTMLElement | null): void => {
    setDroppableNodeRef(element)
    setDraggableNodeRef(element)
  }
  const tag = resolveNodeTag(node)
  const visualProps: Record<string, unknown> = { style: toReactStyle(styleForViewport(node, viewport)) }
  let children: ReactNode
  if (node.type === 'image' && 'src' in node.props && 'alt' in node.props) {
    visualProps.src = node.props.src
    visualProps.alt = node.props.alt
    children = null
  } else if (node.type === 'button' && 'href' in node.props && 'text' in node.props) {
    visualProps.href = node.props.href
    children = node.props.text
  } else if ((node.type === 'heading' || node.type === 'paragraph') && 'text' in node.props) {
    children = node.props.text
  } else {
    children = node.children.map(childId => (
      <CanvasNode
        key={childId}
        document={document}
        nodeId={childId}
        selectedNodeId={selectedNodeId}
        viewport={viewport}
        onSelect={onSelect}
        onMove={onMove}
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
      <div className="node-actions" data-selected={selectedNodeId === node.id}>
        <button
          type="button"
          className="node-select"
          aria-label={`Select ${nodeLabel(node)}`}
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
          {componentRegistry[node.type].displayName}
        </button>
        {node.parentId && (
          <>
            <button type="button" className="drag-handle" aria-label={`Drag ${nodeLabel(node)}`} {...listeners} {...attributes}>⋮⋮</button>
            <button type="button" aria-label={`Move ${nodeLabel(node)} up`} onClick={event => { event.stopPropagation(); onMove(node.id, -1) }}>↑</button>
            <button type="button" aria-label={`Move ${nodeLabel(node)} down`} onClick={event => { event.stopPropagation(); onMove(node.id, 1) }}>↓</button>
          </>
        )}
      </div>
      <div
        className="node-visual"
        role="presentation"
        onClick={event => {
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
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}

function flattenNodeIds(document: DesignDocument, nodeId: string): string[] {
  const node = document.nodes[nodeId]
  return node ? [nodeId, ...node.children.flatMap(childId => flattenNodeIds(document, childId))] : []
}

function layerLabel(node: DesignNode): string {
  return `${componentRegistry[node.type].displayName}: ${nodeLabel(node)}`
}

function Layers({ document: design, selectedNodeId, onSelect }: LayersProps) {
  const rootNodeId = design.pages[0]!.rootNodeId
  const orderedIds = flattenNodeIds(design, rootNodeId)
  const focusRelative = (nodeId: string, offset: -1 | 1): void => {
    const nextId = orderedIds[orderedIds.indexOf(nodeId) + offset]
    if (nextId) globalThis.document.querySelector<HTMLElement>(`[data-layer-id="${nextId}"]`)?.focus()
  }
  const renderLayer = (nodeId: string, level: number): ReactNode => {
    const node = design.nodes[nodeId]!
    return (
      <li key={node.id} role="none">
        <button
          type="button"
          role="treeitem"
          aria-label={layerLabel(node)}
          aria-level={level}
          aria-selected={selectedNodeId === node.id}
          data-layer-id={node.id}
          tabIndex={selectedNodeId === node.id || (!selectedNodeId && node.id === rootNodeId) ? 0 : -1}
          onClick={() => onSelect(node.id)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(node.id)
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusRelative(node.id, 1)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusRelative(node.id, -1)
            }
          }}
        >
          {layerLabel(node)}
        </button>
        {node.children.length > 0 && (
          <ul role="group">{node.children.map(childId => renderLayer(childId, level + 1))}</ul>
        )}
      </li>
    )
  }

  return <ul role="tree" aria-label="Layers">{renderLayer(rootNodeId, 1)}</ul>
}

function Inspector({ state, viewport, execute }: InspectorProps) {
  const node = state.selectedNodeId ? state.document.nodes[state.selectedNodeId] : undefined
  const [text, setText] = useState<string>('')
  const [fontSize, setFontSize] = useState('')
  const [gap, setGap] = useState('')
  const [error, setError] = useState<string | null>(null)
  const currentStyle = node ? styleForViewport(node, viewport) : {}

  useEffect(() => {
    setText(node && 'text' in node.props ? String(node.props.text) : '')
    setFontSize(currentStyle.fontSize === undefined ? '' : String(currentStyle.fontSize))
    setGap(currentStyle.gap === undefined ? '' : String(currentStyle.gap))
    setError(null)
  }, [currentStyle.fontSize, currentStyle.gap, node])
  if (!node) return <p>Select a component to edit it.</p>

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
      setError('Font size must be between 10 and 160')
      return
    }
    if (key === 'gap' && (!Number.isInteger(number) || number < 0 || number > 200)) {
      setError('Gap must be between 0 and 200')
      return
    }
    updateStyle(key, number)
  }

  return (
    <div className="inspector-fields">
      <h2>{componentRegistry[node.type].displayName}</h2>
      {'text' in node.props && (
        <label>
          Text
          <input
            aria-label="Text"
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
        </label>
      )}
      <label>
        Font size
        <input
          aria-label="Font size"
          inputMode="numeric"
          value={fontSize}
          onChange={event => setFontSize(event.target.value)}
          onBlur={() => commitNumber('fontSize', fontSize)}
        />
      </label>
      <label>
        Gap
        <input
          aria-label="Gap"
          inputMode="numeric"
          value={gap}
          onChange={event => setGap(event.target.value)}
          onBlur={() => commitNumber('gap', gap)}
        />
      </label>
      <label>
        Color
        <input
          aria-label="Color"
          type="color"
          value={currentStyle.color ?? '#0f172a'}
          onChange={event => updateStyle('color', event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

function EditorSurface({ projectId, workspaceId, initialDocument, initialVersion, api }: Required<EditorAppProps>) {
  const [state, dispatch] = useReducer(editorReducer, initialDocument, createEditorState)
  const [announcement, setAnnouncement] = useState('Editor ready')
  const [hydrated, setHydrated] = useState(false)
  const [recoveryRequired, setRecoveryRequired] = useState(false)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [autosave, setAutosave] = useState<AutosaveState>(() => createAutosaveState(initialVersion))
  const [revisions, setRevisions] = useState<RevisionSummary[]>([])
  const [revisionSummary, setRevisionSummary] = useState('')
  const [revisionError, setRevisionError] = useState('')
  const idCounter = useRef(0)
  const stateRef = useRef(state)
  const autosaveRef = useRef(autosave)
  stateRef.current = state
  autosaveRef.current = autosave
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor))
  const defaultParentId = state.selectedNodeId ?? 'container-1'
  const isFixture = projectId === 'project-1'
  const recoveryKey = `zenui:recovery:${projectId}`

  useEffect(() => {
    if (isFixture) {
      const loaded = loadDraft(window.localStorage)
      if (loaded.success && loaded.document) dispatch({ type: 'set', state: createEditorState(loaded.document) })
      else if (!loaded.success) {
        setAnnouncement(`Draft recovery required: ${loaded.code}`)
        setRecoveryRequired(true)
      }
    } else {
      const loaded = loadDraft(window.localStorage, recoveryKey)
      if (loaded.success && loaded.document && loaded.document.version > initialVersion) {
        setAnnouncement('Unsynced recovery copy is available')
        setRecoveryRequired(true)
      } else if (!loaded.success) {
        setAnnouncement(`Draft recovery required: ${loaded.code}`)
        setRecoveryRequired(true)
      }
      void api.listRevisions(projectId, workspaceId)
        .then(setRevisions)
        .catch(() => setRevisionError('Unable to load revisions'))
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
    if (autosave.status === 'saved') setAnnouncement('Saved')
    if (autosave.status === 'conflict') setAnnouncement('Conflict: local work is preserved')
    if (autosave.status === 'offline') setAnnouncement('Offline: local recovery is preserved')
    if (autosave.status === 'error') setAnnouncement('Autosave failed: local recovery is preserved')
  }, [autosave.status])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      const current = stateRef.current
      dispatch({ type: 'set', state: event.shiftKey ? redo(current) : undo(current) })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const setState = (next: EditorState): void => dispatch({ type: 'set', state: next })
  const resetLocalDraft = (): void => {
    window.localStorage.removeItem(isFixture ? DRAFT_STORAGE_KEY : recoveryKey)
    setRecoveryRequired(false)
    setAnnouncement('Local draft reset')
  }
  const applyCommands = (commands: DesignCommand[], selection?: string): void => {
    const next = executeCommands(stateRef.current, commands)
    const selected = selection ? selectNode(next, selection) : next
    setState(selected)
    if (!next.error && !isFixture) setAutosave(current => queueAutosave(current, commands))
    setAnnouncement(next.error?.message ?? 'Change applied')
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
      setAnnouncement(plan.message)
      return
    }
    applyCommands([plan.command], plan.command.node.id)
    setAnnouncement(`${componentRegistry[type].displayName} added`)
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
    if (!plan.accepted) return setAnnouncement(plan.message)
    applyCommands([plan.command])
  }
  const handleDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over) return setAnnouncement('Drag cancelled')
    const targetId = String(over.id).replace('node:', '')
    if (active.data.current?.kind === 'palette') add(active.data.current.type as ComponentType, targetId)
    if (active.data.current?.kind === 'move') {
      const target = state.document.nodes[targetId]
      const parentId = target && componentRegistry[target.type].isContainer ? target.id : target?.parentId
      if (!parentId) return setAnnouncement('Target parent does not exist')
      const parent = state.document.nodes[parentId]!
      const targetIndex = target && target.parentId === parentId
        ? parent.children.indexOf(target.id)
        : parent.children.length
      const plan = planMove(state.document, active.data.current.nodeId as string, parentId, targetIndex)
      if (!plan.accepted) return setAnnouncement(plan.message)
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
  const exportHtml = (): void => {
    const compiled = compileStandaloneHtml(state.document)
    if (!compiled.success) return setAnnouncement(compiled.message)
    downloadContent(compiled.html, 'zenui-export.html', 'text/html;charset=utf-8')
    setAnnouncement('Export ready')
  }
  const downloadRecovery = (): void => {
    downloadContent(JSON.stringify(state.document, null, 2), 'zenui-recovery.json', 'application/json')
    setAnnouncement('Recovery copy downloaded')
  }
  const reloadServer = async (): Promise<void> => {
    const loaded = await api.loadDocument(projectId, workspaceId)
    setState(createEditorState(loaded.document))
    setAutosave(createAutosaveState(loaded.version))
    window.localStorage.removeItem(recoveryKey)
    setRecoveryRequired(false)
    setAnnouncement('Server version reloaded')
  }
  const createRevision = async (): Promise<void> => {
    const summary = revisionSummary.trim()
    if (!summary || summary.length > 200) {
      setRevisionError('Revision summary is required and must be at most 200 characters')
      return
    }
    try {
      const revision = await api.createRevision(projectId, workspaceId, summary)
      setRevisions(current => [revision, ...current])
      setRevisionSummary('')
      setRevisionError('')
    } catch {
      setRevisionError('Unable to create revision')
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
    setAnnouncement('Revision restored')
    setRevisions(await api.listRevisions(projectId, workspaceId))
  }

  const palette = useMemo(() => COMPONENT_TYPES.filter(type => type !== 'page'), [])

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <main className="editor-shell">
        <header className="editor-toolbar">
          <strong>ZenUI</strong>
          <button type="button" aria-label="Undo" disabled={state.undoStack.length === 0} onClick={() => setState(undo(state))}>Undo</button>
          <button type="button" aria-label="Redo" disabled={state.redoStack.length === 0} onClick={() => setState(redo(state))}>Redo</button>
          <label>
            Viewport
            <select aria-label="Viewport" value={viewport} onChange={event => setViewport(event.target.value as Viewport)}>
              <option value="desktop">Desktop</option>
              <option value="tablet">Tablet</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>
          <button type="button" onClick={exportHtml}>Export HTML</button>
          <span>Document v{state.document.version}</span>
        </header>
        <aside className="palette-panel">
          <h1>Components</h1>
          {palette.map(type => <PaletteItem key={type} type={type} onAdd={() => add(type)} />)}
          <p className="hint">Select a container, then add a component. Items also support pointer and keyboard drag.</p>
          <h2>Layers</h2>
          <Layers
            document={state.document}
            selectedNodeId={state.selectedNodeId}
            onSelect={nodeId => setState(selectNode(state, nodeId))}
          />
        </aside>
        <section className="canvas-panel" aria-label="Canvas">
          <CanvasNode
            document={state.document}
            nodeId={state.document.pages[0]!.rootNodeId}
            selectedNodeId={state.selectedNodeId}
            viewport={viewport}
            onSelect={nodeId => setState(selectNode(state, nodeId))}
            onMove={move}
          />
        </section>
        <aside className="inspector-panel" aria-label="Inspector">
          <h1>Design</h1>
          <Inspector state={state} viewport={viewport} execute={execute} />
          {!isFixture && (
            <section className="revision-panel" aria-labelledby="revisions-heading">
              <h2 id="revisions-heading">Revisions</h2>
              <label>
                Revision summary
                <input aria-label="Revision summary" value={revisionSummary} maxLength={200} onChange={event => setRevisionSummary(event.target.value)} />
              </label>
              <button type="button" disabled={autosave.status === 'dirty' || autosave.status === 'saving' || autosave.status === 'conflict'} onClick={() => void createRevision()}>Create revision</button>
              {revisionError && <p role="alert">{revisionError}</p>}
              {revisions.length === 0 ? <p>No revisions yet.</p> : (
                <ul>
                  {revisions.map(revision => (
                    <li key={revision.id}>
                      <span>{revision.summary}</span>
                      <button type="button" aria-label={`Restore ${revision.summary}`} disabled={autosave.status === 'dirty' || autosave.status === 'saving'} onClick={() => void restoreRevision(revision.id)}>Restore</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </aside>
        <footer className="status-bar" role="status" aria-live="polite">
          <span>{announcement}</span>
          {autosave.status === 'conflict' && (
            <>
              <button type="button" onClick={downloadRecovery}>Download recovery copy</button>
              <button type="button" onClick={() => void reloadServer()}>Reload server version</button>
            </>
          )}
          {recoveryRequired && <button type="button" onClick={resetLocalDraft}>Reset local draft</button>}
        </footer>
      </main>
    </DndContext>
  )
}

export function EditorApp({
  projectId = 'project-1',
  workspaceId = 'workspace-1',
  initialDocument = createValidDesignFixture(),
  initialVersion = initialDocument.version,
  api = browserEditorApi,
}: EditorAppProps = {}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
    ? <EditorSurface projectId={projectId} workspaceId={workspaceId} initialDocument={initialDocument} initialVersion={initialVersion} api={api} />
    : <main className="editor-loading" role="status">Loading ZenUI editor...</main>
}
