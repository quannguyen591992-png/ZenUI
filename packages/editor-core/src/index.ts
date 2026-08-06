export {
  createAutosaveState,
  queueAutosave,
  resolveAutosave,
  startAutosave,
  type AutosaveRequest,
  type AutosaveResolution,
  type AutosaveState,
  type AutosaveStatus,
} from './autosave'

import { componentRegistry, isAllowedChild } from '@zenui/component-registry'
import {
  applyCommandTransaction,
  type CommandError,
  type DesignCommand,
} from '@zenui/design-commands'
import {
  DESIGN_LIMITS,
  normalizePageSlug,
  parseDesignDocument,
  validateDesignDocument,
  type ComponentType,
  type DesignDocument,
  type DesignDocumentV2,
  type DesignNode,
  type NodeStyle,
} from '@zenui/design-schema'
import { z } from 'zod'

export const DRAFT_STORAGE_KEY = 'zenui:draft:project-1'

export interface HistoryEntry {
  forward: DesignCommand[]
  inverse: DesignCommand[]
}

export interface EditorState {
  document: DesignDocument
  activePageId: string
  selectedNodeId: string | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  error: CommandError | null
}

export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type DropPlan<TCommand extends DesignCommand = DesignCommand> =
  | { accepted: true; command: TCommand }
  | { accepted: false; code: CommandError['code']; message: string }

type InsertCommand = Extract<DesignCommand, { type: 'INSERT_NODE' }>
type MoveCommand = Extract<DesignCommand, { type: 'MOVE_NODE' }>
type RemoveCommand = Extract<DesignCommand, { type: 'REMOVE_NODE' }>
type DuplicateNodeCommand = Extract<DesignCommand, { type: 'DUPLICATE_NODE' }>
type ReplaceSubtreeCommand = Extract<DesignCommand, { type: 'REPLACE_SUBTREE' }>
type UpdatePropsCommand = Extract<DesignCommand, { type: 'UPDATE_PROPS' }>

const SECTION_TYPES = new Set<ComponentType>(['navbar', 'hero', 'section'])

export type PageStoryPurpose =
  | 'Giới thiệu'
  | 'Xây dựng niềm tin'
  | 'Giải thích giá trị'
  | 'Giải đáp câu hỏi'
  | 'Mời hành động'

export interface PageStoryItem {
  nodeId: string
  label: string
  purpose: PageStoryPurpose
  hidden: boolean
}

const SECTION_LAYOUT_PRESETS: Record<'navbar' | 'hero' | 'section', readonly NodeStyle[]> = {
  navbar: [
    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 },
    { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 32 },
  ],
  hero: [
    { paddingTop: 96, paddingBottom: 96, textAlign: 'left' },
    { paddingTop: 72, paddingBottom: 72, textAlign: 'center' },
  ],
  section: [
    { paddingTop: 96, paddingBottom: 96 },
    { paddingTop: 64, paddingBottom: 64, backgroundColor: '#f8fafc' },
    { paddingTop: 80, paddingBottom: 80, textAlign: 'center' },
  ],
}

const LAYOUT_STYLE_KEYS = new Set<keyof NodeStyle>([
  'display',
  'flexDirection',
  'justifyContent',
  'alignItems',
  'gap',
  'gridColumns',
  'width',
  'maxWidth',
  'minHeight',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'textAlign',
  'backgroundColor',
])

const draftEnvelopeSchema = z.object({
  storageVersion: z.literal(1),
  document: z.unknown(),
}).strict()

function withVersion(commands: readonly DesignCommand[], version: number): DesignCommand[] {
  return commands.map(command => ({ ...command, documentVersion: version }))
}

function descendants(document: DesignDocument, nodeId: string): Set<string> {
  const result = new Set<string>()
  const visit = (id: string): void => {
    const node = document.nodes[id]
    if (!node) return
    for (const childId of node.children) {
      result.add(childId)
      visit(childId)
    }
  }
  visit(nodeId)
  return result
}

export function createEditorState(document: DesignDocument): EditorState {
  const validation = parseDesignDocument(document)
  if (!validation.success) throw new Error('Editor state requires a valid Design Document')
  return {
    document: validation.data,
    activePageId: validation.data.pages.find(page => page.slug === '/')?.id ?? validation.data.pages[0]!.id,
    selectedNodeId: null,
    undoStack: [],
    redoStack: [],
    error: null,
  }
}

function reconcilePageState(
  state: EditorState,
  document: DesignDocument,
): Pick<EditorState, 'activePageId' | 'selectedNodeId'> {
  const active = document.pages.find(page => page.id === state.activePageId)
    ?? document.pages.find(page => page.slug === '/')
    ?? document.pages[0]!
  const roots = new Set(document.pages.map(page => page.rootNodeId))
  let selectedNodeId = state.selectedNodeId
  if (selectedNodeId) {
    let current = document.nodes[selectedNodeId]
    const visited = new Set<string>()
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id)
      current = document.nodes[current.parentId]
    }
    if (!current || !roots.has(current.id) || current.id !== active.rootNodeId) selectedNodeId = null
  }
  return { activePageId: active.id, selectedNodeId }
}

export function executeCommands(state: EditorState, commands: readonly DesignCommand[]): EditorState {
  const forward = withVersion(commands, state.document.version)
  const result = applyCommandTransaction(state.document, state.document.version, forward)
  if (!result.accepted) return { ...state, error: result.error }
  return {
    ...state,
    ...reconcilePageState(state, result.document),
    document: result.document,
    undoStack: [...state.undoStack, { forward, inverse: result.inverseCommands }],
    redoStack: [],
    error: null,
  }
}

export function undo(state: EditorState): EditorState {
  const entry = state.undoStack.at(-1)
  if (!entry) return state
  const result = applyCommandTransaction(
    state.document,
    state.document.version,
    withVersion(entry.inverse, state.document.version),
  )
  if (!result.accepted) return { ...state, error: result.error }
  return {
    ...state,
    ...reconcilePageState(state, result.document),
    document: result.document,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, entry],
    error: null,
  }
}

export function redo(state: EditorState): EditorState {
  const entry = state.redoStack.at(-1)
  if (!entry) return state
  const forward = withVersion(entry.forward, state.document.version)
  const result = applyCommandTransaction(state.document, state.document.version, forward)
  if (!result.accepted) return { ...state, error: result.error }
  return {
    ...state,
    ...reconcilePageState(state, result.document),
    document: result.document,
    undoStack: [...state.undoStack, { forward, inverse: result.inverseCommands }],
    redoStack: state.redoStack.slice(0, -1),
    error: null,
  }
}

export function selectNode(state: EditorState, nodeId: string | null): EditorState {
  const candidate = nodeId && state.document.nodes[nodeId] ? nodeId : null
  return {
    ...state,
    selectedNodeId: reconcilePageState({ ...state, selectedNodeId: candidate }, state.document).selectedNodeId,
  }
}

export function selectPage(state: EditorState, pageId: string): EditorState {
  if (!state.document.pages.some(page => page.id === pageId)) return state
  return { ...state, activePageId: pageId, selectedNodeId: null }
}

type CreatePageCommand = Extract<DesignCommand, { type: 'CREATE_PAGE' }>
type DuplicatePageCommand = Extract<DesignCommand, { type: 'DUPLICATE_PAGE' }>
type RemovePageCommand = Extract<DesignCommand, { type: 'REMOVE_PAGE' }>

function v2Document(document: DesignDocument): DesignDocumentV2 | null {
  return document.schemaVersion === 2 ? document : null
}

export function planPageCreate(
  document: DesignDocument,
  input: { name: string; slug: string },
  createPageId: () => string,
  createRootNodeId: () => string,
): DropPlan<CreatePageCommand> {
  const v2 = v2Document(document)
  if (!v2) return { accepted: false, code: 'document_invalid', message: 'Page creation requires Design Document v2' }
  if (v2.pages.length >= DESIGN_LIMITS.maxPages) return { accepted: false, code: 'document_invalid', message: 'The website reached its page limit' }
  const normalized = normalizePageSlug(input.slug)
  if (!normalized.success || normalized.slug === '/') return { accepted: false, code: 'document_invalid', message: 'Page route is invalid' }
  if (v2.pages.some(page => page.slug === normalized.slug)) return { accepted: false, code: 'document_invalid', message: 'Page route already exists' }
  const id = createPageId()
  const rootNodeId = createRootNodeId()
  if (!id || !rootNodeId || v2.pages.some(page => page.id === id) || v2.nodes[rootNodeId]) {
    return { accepted: false, code: 'invalid_command', message: 'Generated page IDs must be unique' }
  }
  return {
    accepted: true,
    command: {
      commandId: `create-page-${id}`,
      documentVersion: document.version,
      source: 'user',
      type: 'CREATE_PAGE',
      index: v2.pages.length,
      page: { id, name: input.name.trim(), slug: normalized.slug, rootNodeId },
      nodes: [{ id: rootNodeId, type: 'page', parentId: null, children: [], props: {}, style: {}, responsive: {} }],
    },
  }
}

export function planPageDuplicate(
  document: DesignDocument,
  sourcePageId: string,
  input: { name: string; slug: string },
  createId: (sourceId: string) => string,
): DropPlan<DuplicatePageCommand> {
  const v2 = v2Document(document)
  const source = v2?.pages.find(page => page.id === sourcePageId)
  if (!v2 || !source) return { accepted: false, code: 'node_not_found', message: 'Source page does not exist' }
  if (v2.pages.length >= DESIGN_LIMITS.maxPages) return { accepted: false, code: 'document_invalid', message: 'The website reached its page limit' }
  const normalized = normalizePageSlug(input.slug)
  if (!normalized.success || normalized.slug === '/' || v2.pages.some(page => page.slug === normalized.slug)) {
    return { accepted: false, code: 'document_invalid', message: 'Duplicate page route is invalid or already used' }
  }
  const sourceNodes = collectSubtree(v2, source.rootNodeId)
  if (Object.keys(v2.nodes).length + sourceNodes.length > DESIGN_LIMITS.maxNodes) {
    return { accepted: false, code: 'document_invalid', message: 'Duplicating this page exceeds the document limit' }
  }
  const idMap = new Map<string, string>()
  for (const node of sourceNodes) {
    const id = createId(node.id)
    if (!id || v2.nodes[id] || [...idMap.values()].includes(id)) return { accepted: false, code: 'invalid_command', message: 'Generated duplicate IDs must be unique' }
    idMap.set(node.id, id)
  }
  const pageId = createId(source.id)
  if (!pageId || v2.pages.some(page => page.id === pageId) || [...idMap.values()].includes(pageId)) {
    return { accepted: false, code: 'invalid_command', message: 'Generated page ID must be unique' }
  }
  const nodes = sourceNodes.map(node => ({
    ...node,
    id: idMap.get(node.id)!,
    parentId: node.parentId ? idMap.get(node.parentId)! : null,
    children: node.children.map(childId => idMap.get(childId)!),
  }))
  return {
    accepted: true,
    command: {
      commandId: `duplicate-page-${source.id}`,
      documentVersion: document.version,
      source: 'user',
      type: 'DUPLICATE_PAGE',
      sourcePageId,
      index: v2.pages.indexOf(source) + 1,
      page: { id: pageId, name: input.name.trim(), slug: normalized.slug, rootNodeId: idMap.get(source.rootNodeId)! },
      nodes,
    },
  }
}

export type PageDeletePlan = DropPlan<RemovePageCommand> | {
  accepted: false
  code: CommandError['code']
  message: string
  impact: { navigationItems: number; internalLinks: number }
}

export function planPageDelete(document: DesignDocument, pageId: string): PageDeletePlan {
  const v2 = v2Document(document)
  const page = v2?.pages.find(item => item.id === pageId)
  if (!v2 || !page) return { accepted: false, code: 'node_not_found', message: 'Page does not exist' }
  if (page.slug === '/') return { accepted: false, code: 'root_operation_forbidden', message: 'Home page cannot be deleted' }
  const impact = {
    navigationItems: v2.navigation.items.filter(item => item.pageId === pageId).length,
    internalLinks: Object.values(v2.nodes).filter(node => (
      (node.type === 'button' || node.type === 'link') && 'pageId' in node.props && node.props.pageId === pageId
    )).length,
  }
  if (impact.navigationItems || impact.internalLinks) {
    return { accepted: false, code: 'document_invalid', message: 'Resolve page references before deletion', impact }
  }
  return {
    accepted: true,
    command: {
      commandId: `remove-page-${pageId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REMOVE_PAGE',
      pageId,
    },
  }
}

export function planInsert(
  document: DesignDocument,
  type: ComponentType,
  parentId: string,
  index: number,
  createId: () => string,
): DropPlan<InsertCommand> {
  const parent = document.nodes[parentId]
  if (!parent) return { accepted: false, code: 'parent_not_found', message: 'Target parent does not exist' }
  if (!isAllowedChild(parent.type, type)) {
    return { accepted: false, code: 'invalid_parent_child', message: `${type} is not allowed inside ${parent.type}` }
  }
  if (index < 0 || index > parent.children.length) {
    return { accepted: false, code: 'index_out_of_bounds', message: 'Drop index is out of bounds' }
  }
  const id = createId()
  if (document.nodes[id]) return { accepted: false, code: 'invalid_command', message: 'Generated node ID already exists' }
  const definition = componentRegistry[type]
  return {
    accepted: true,
    command: {
      commandId: `insert-${id}`,
      documentVersion: document.version,
      source: 'user',
      type: 'INSERT_NODE',
      parentId,
      index,
      node: {
        id,
        type,
        parentId,
        children: [],
        props: structuredClone(definition.defaultProps),
        style: structuredClone(definition.defaultStyle),
        responsive: {},
      },
    },
  }
}

export function planMove(
  document: DesignDocument,
  nodeId: string,
  newParentId: string,
  newIndex: number,
): DropPlan<MoveCommand> {
  const node = document.nodes[nodeId]
  const parent = document.nodes[newParentId]
  if (!node) return { accepted: false, code: 'node_not_found', message: 'Node does not exist' }
  if (!parent) return { accepted: false, code: 'parent_not_found', message: 'Target parent does not exist' }
  if (node.parentId === null) return { accepted: false, code: 'root_operation_forbidden', message: 'Root cannot be moved' }
  if (node.id === parent.id || descendants(document, node.id).has(parent.id)) {
    return { accepted: false, code: 'cycle_detected', message: 'Move would create a cycle' }
  }
  if (!isAllowedChild(parent.type, node.type)) {
    return { accepted: false, code: 'invalid_parent_child', message: `${node.type} is not allowed inside ${parent.type}` }
  }
  if (newIndex < 0 || newIndex > parent.children.length) {
    return { accepted: false, code: 'index_out_of_bounds', message: 'Drop index is out of bounds' }
  }
  return {
    accepted: true,
    command: {
      commandId: `move-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'MOVE_NODE',
      nodeId,
      newParentId,
      newIndex,
    },
  }
}

export function getActivePage(document: DesignDocument, pageId?: string): DesignDocument['pages'][number] {
  return document.pages.find(page => page.id === pageId)
    ?? document.pages.find(page => page.slug === '/')
    ?? document.pages[0]!
}

function pageRoot(document: DesignDocument, pageId?: string): DesignNode | undefined {
  const rootNodeId = getActivePage(document, pageId).rootNodeId
  return document.nodes[rootNodeId]
}

function isSectionNode(node: DesignNode | undefined): node is DesignNode & {
  type: 'navbar' | 'hero' | 'section'
} {
  return Boolean(node && SECTION_TYPES.has(node.type))
}

function sectionLabel(node: DesignNode): string {
  if (node.type === 'navbar' && 'brand' in node.props) return node.props.brand
  if ((node.type === 'hero' || node.type === 'section') && 'label' in node.props && node.props.label) {
    return node.props.label
  }
  if (node.type === 'hero') return 'Mở đầu'
  if (node.type === 'navbar') return 'Thanh điều hướng'
  return 'Nội dung'
}

function sectionPurpose(node: DesignNode, label: string): PageStoryPurpose {
  const key = `${node.id} ${label}`.toLocaleLowerCase('en-US')
  if (node.type === 'navbar' || node.type === 'hero' || /hero|intro|welcome|announcement/.test(key)) {
    return 'Giới thiệu'
  }
  if (/testimonial|customer|logo|trust|review|proof|result|stat/.test(key)) {
    return 'Xây dựng niềm tin'
  }
  if (/faq|question|objection|frequently/.test(key)) return 'Giải đáp câu hỏi'
  if (/cta|contact|footer|start|signup|sign-up|action/.test(key)) return 'Mời hành động'
  return 'Giải thích giá trị'
}

export function getPageStory(document: DesignDocument, pageId?: string): PageStoryItem[] {
  const root = pageRoot(document, pageId)
  if (!root || root.type !== 'page') return []
  return root.children.flatMap(nodeId => {
    const node = document.nodes[nodeId]
    if (!isSectionNode(node)) return []
    const label = sectionLabel(node)
    return [{
      nodeId,
      label,
      purpose: sectionPurpose(node, label),
      hidden: 'hidden' in node.props && node.props.hidden === true,
    }]
  })
}

export function findContainingSectionId(
  document: DesignDocument,
  nodeId: string | null,
  pageId?: string,
): string | null {
  let currentId = nodeId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const node = document.nodes[currentId]
    if (!node) return null
    if (isSectionNode(node) && node.parentId === pageRoot(document, pageId)?.id) return node.id
    currentId = node.parentId
  }
  return null
}

function rejectSection(
  code: CommandError['code'],
  message: string,
): DropPlan<never> {
  return { accepted: false, code, message }
}

function pageIdForNode(document: DesignDocument, nodeId: string): string | undefined {
  let current = document.nodes[nodeId]
  const visited = new Set<string>()
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id)
    current = document.nodes[current.parentId]
  }
  return document.pages.find(page => page.rootNodeId === current?.id)?.id
}

function topLevelSection(
  document: DesignDocument,
  nodeId: string,
): { node: DesignNode & { type: 'navbar' | 'hero' | 'section' }; root: DesignNode; index: number }
  | DropPlan<never> {
  const node = document.nodes[nodeId]
  if (!node) return rejectSection('node_not_found', 'Section does not exist')
  const root = pageRoot(document, pageIdForNode(document, nodeId))
  if (!root || root.type !== 'page' || !isSectionNode(node) || node.parentId !== root.id) {
    return rejectSection('invalid_command', 'Action requires a top-level section')
  }
  const index = root.children.indexOf(nodeId)
  if (index < 0) return rejectSection('document_invalid', 'Section is missing from the page order')
  return { node, root, index }
}

export function planSectionMove(
  document: DesignDocument,
  nodeId: string,
  direction: -1 | 1,
): DropPlan<MoveCommand> {
  const section = topLevelSection(document, nodeId)
  if ('accepted' in section) return section
  const nextIndex = section.index + direction
  if (nextIndex < 0 || nextIndex >= section.root.children.length) {
    return rejectSection('index_out_of_bounds', 'Section is already at the page boundary')
  }
  return planMove(document, nodeId, section.root.id, nextIndex)
}

function collectSubtree(document: DesignDocument, nodeId: string): DesignNode[] {
  return [nodeId, ...descendants(document, nodeId)].map(id => structuredClone(document.nodes[id]!))
}

type NodeDuplicatePlan =
  | { accepted: true; command: DuplicateNodeCommand | ReplaceSubtreeCommand; rootNodeId: string }
  | { accepted: false; code: CommandError['code']; message: string }

export function planNodeDuplicate(
  document: DesignDocument,
  nodeId: string,
  createId: (sourceId: string) => string,
): NodeDuplicatePlan {
  const node = document.nodes[nodeId]
  if (!node) return { accepted: false, code: 'node_not_found', message: 'Node does not exist' }
  if (!node.parentId) return { accepted: false, code: 'root_operation_forbidden', message: 'Root cannot be duplicated' }
  const parent = document.nodes[node.parentId]
  if (!parent) return { accepted: false, code: 'document_invalid', message: 'Parent is missing' }
  const index = parent.children.indexOf(nodeId)
  if (index < 0) return { accepted: false, code: 'document_invalid', message: 'Node is missing from its parent' }
  const sourceNodes = collectSubtree(document, nodeId)
  if (Object.keys(document.nodes).length + sourceNodes.length > DESIGN_LIMITS.maxNodes) {
    return { accepted: false, code: 'document_invalid', message: 'Duplicating this node exceeds the document limit' }
  }

  const idMap = new Map<string, string>()
  for (const source of sourceNodes) {
    const duplicateId = createId(source.id)
    if (!duplicateId || document.nodes[duplicateId] || [...idMap.values()].includes(duplicateId)) {
      return { accepted: false, code: 'invalid_command', message: 'Generated duplicate IDs must be unique' }
    }
    idMap.set(source.id, duplicateId)
  }
  const rootNodeId = idMap.get(nodeId)!
  if (node.children.length === 0) {
    return {
      accepted: true,
      rootNodeId,
      command: {
        commandId: `duplicate-node-${nodeId}`,
        documentVersion: document.version,
        source: 'user',
        type: 'DUPLICATE_NODE',
        nodeId,
        newNodeId: rootNodeId,
        targetParentId: parent.id,
        index: index + 1,
      },
    }
  }

  const nodes = sourceNodes.map(source => ({
    ...source,
    id: idMap.get(source.id)!,
    parentId: source.id === nodeId ? parent.id : idMap.get(source.parentId ?? '') ?? null,
    children: source.children.map(childId => idMap.get(childId)!),
  })) as DesignNode[]
  return {
    accepted: true,
    rootNodeId,
    command: {
      commandId: `duplicate-node-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REPLACE_SUBTREE',
      nodeId: rootNodeId,
      rootNodeId,
      nodes,
      index: index + 1,
    },
  }
}

export function planNodeDelete(document: DesignDocument, nodeId: string): DropPlan<RemoveCommand> {
  const node = document.nodes[nodeId]
  if (!node) return { accepted: false, code: 'node_not_found', message: 'Node does not exist' }
  if (!node.parentId) return { accepted: false, code: 'root_operation_forbidden', message: 'Root cannot be deleted' }
  return {
    accepted: true,
    command: {
      commandId: `delete-node-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REMOVE_NODE',
      nodeId,
    },
  }
}

export function planSectionDuplicate(
  document: DesignDocument,
  nodeId: string,
  createId: (sourceId: string) => string,
): DropPlan<ReplaceSubtreeCommand> {
  const section = topLevelSection(document, nodeId)
  if ('accepted' in section) return section
  const sourceNodes = collectSubtree(document, nodeId)
  if (Object.keys(document.nodes).length + sourceNodes.length > DESIGN_LIMITS.maxNodes) {
    return rejectSection('document_invalid', 'Duplicating this section exceeds the document limit')
  }

  const idMap = new Map<string, string>()
  for (const source of sourceNodes) {
    const duplicateId = createId(source.id)
    if (!duplicateId || document.nodes[duplicateId] || [...idMap.values()].includes(duplicateId)) {
      return rejectSection('invalid_command', 'Generated duplicate IDs must be unique')
    }
    idMap.set(source.id, duplicateId)
  }

  const nodes = sourceNodes.map(source => ({
    ...source,
    id: idMap.get(source.id)!,
    parentId: source.id === nodeId ? section.root.id : idMap.get(source.parentId ?? '') ?? null,
    children: source.children.map(childId => idMap.get(childId)!),
  })) as DesignNode[]
  const rootNodeId = idMap.get(nodeId)!
  return {
    accepted: true,
    command: {
      commandId: `duplicate-section-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REPLACE_SUBTREE',
      nodeId: rootNodeId,
      rootNodeId,
      nodes,
      index: section.index + 1,
    },
  }
}

export function planSectionVisibility(
  document: DesignDocument,
  nodeId: string,
  hidden: boolean,
): DropPlan<UpdatePropsCommand> {
  const section = topLevelSection(document, nodeId)
  if ('accepted' in section) return section
  return {
    accepted: true,
    command: {
      commandId: `${hidden ? 'hide' : 'show'}-section-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'UPDATE_PROPS',
      nodeId,
      patch: { hidden },
    },
  }
}

export function planSectionDelete(
  document: DesignDocument,
  nodeId: string,
): DropPlan<RemoveCommand> {
  const section = topLevelSection(document, nodeId)
  if ('accepted' in section) return section
  const pageId = pageIdForNode(document, nodeId)
  if (getPageStory(document, pageId).length <= 1) {
    return rejectSection('invalid_command', 'The page must keep at least one section')
  }
  return {
    accepted: true,
    command: {
      commandId: `delete-section-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REMOVE_NODE',
      nodeId,
    },
  }
}

function samePreset(style: NodeStyle, preset: NodeStyle): boolean {
  return Object.entries(preset).every(([key, value]) => style[key as keyof NodeStyle] === value)
}

function replaceLayoutStyle(style: NodeStyle, preset: NodeStyle): NodeStyle {
  const next = Object.fromEntries(
    Object.entries(style).filter(([key]) => !LAYOUT_STYLE_KEYS.has(key as keyof NodeStyle)),
  ) as NodeStyle
  return { ...next, ...preset }
}

export function planSectionLayoutReplacement(
  document: DesignDocument,
  nodeId: string,
): DropPlan<ReplaceSubtreeCommand> {
  const section = topLevelSection(document, nodeId)
  if ('accepted' in section) return section
  const presets = SECTION_LAYOUT_PRESETS[section.node.type]
  const currentIndex = presets.findIndex(preset => samePreset(section.node.style, preset))
  const nextPreset = presets[(currentIndex + 1) % presets.length]!
  const nodes = collectSubtree(document, nodeId)
  const root = nodes.find(node => node.id === nodeId)!
  root.style = replaceLayoutStyle(root.style, nextPreset)
  return {
    accepted: true,
    command: {
      commandId: `replace-section-layout-${nodeId}`,
      documentVersion: document.version,
      source: 'user',
      type: 'REPLACE_SUBTREE',
      nodeId,
      rootNodeId: nodeId,
      nodes,
    },
  }
}

export function saveDraft(
  storage: DraftStorage,
  document: DesignDocument,
  key = DRAFT_STORAGE_KEY,
): { success: true } | { success: false; code: 'storage_failed' } {
  const validation = validateDesignDocument(document)
  if (!validation.success) return { success: false, code: 'storage_failed' }
  try {
    storage.setItem(key, JSON.stringify({ storageVersion: 1, document: validation.data }))
    return { success: true }
  } catch {
    return { success: false, code: 'storage_failed' }
  }
}

export function loadDraft(
  storage: DraftStorage,
  key = DRAFT_STORAGE_KEY,
):
  | { success: true; document: DesignDocument | null }
  | { success: false; code: 'invalid_json' | 'unsupported_version' | 'invalid_document' | 'storage_failed' } {
  let value: string | null
  try {
    value = storage.getItem(key)
  } catch {
    return { success: false, code: 'storage_failed' }
  }
  if (value === null) return { success: true, document: null }

  let input: unknown
  try {
    input = JSON.parse(value)
  } catch {
    return { success: false, code: 'invalid_json' }
  }
  const envelope = draftEnvelopeSchema.safeParse(input)
  if (!envelope.success) {
    const version = typeof input === 'object' && input !== null && 'storageVersion' in input
      ? (input as { storageVersion?: unknown }).storageVersion
      : undefined
    return { success: false, code: version !== 1 ? 'unsupported_version' : 'invalid_document' }
  }
  const validation = validateDesignDocument(envelope.data.document)
  return validation.success
    ? { success: true, document: validation.data }
    : { success: false, code: 'invalid_document' }
}
