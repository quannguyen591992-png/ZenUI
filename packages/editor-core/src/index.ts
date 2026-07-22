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
  validateDesignDocument,
  type ComponentType,
  type DesignDocument,
} from '@zenui/design-schema'
import { z } from 'zod'

export const DRAFT_STORAGE_KEY = 'zenui:draft:project-1'

export interface HistoryEntry {
  forward: DesignCommand[]
  inverse: DesignCommand[]
}

export interface EditorState {
  document: DesignDocument
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
  const validation = validateDesignDocument(document)
  if (!validation.success) throw new Error('Editor state requires a valid Design Document')
  return {
    document: validation.data,
    selectedNodeId: null,
    undoStack: [],
    redoStack: [],
    error: null,
  }
}

export function executeCommands(state: EditorState, commands: readonly DesignCommand[]): EditorState {
  const forward = withVersion(commands, state.document.version)
  const result = applyCommandTransaction(state.document, state.document.version, forward)
  if (!result.accepted) return { ...state, error: result.error }
  return {
    ...state,
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
    document: result.document,
    undoStack: [...state.undoStack, { forward, inverse: result.inverseCommands }],
    redoStack: state.redoStack.slice(0, -1),
    error: null,
  }
}

export function selectNode(state: EditorState, nodeId: string | null): EditorState {
  return {
    ...state,
    selectedNodeId: nodeId && state.document.nodes[nodeId] ? nodeId : null,
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
