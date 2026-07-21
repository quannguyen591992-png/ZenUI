import { isAllowedChild } from '@zenui/component-registry'
import {
  designNodeSchema,
  validateDesignDocument,
  type DesignDocument,
} from '@zenui/design-schema'
import { z } from 'zod'

const metadata = {
  commandId: z.string().min(1).max(100),
  documentVersion: z.number().int().positive(),
  source: z.enum(['user', 'ai', 'restore', 'system']),
} as const

const recordPatch = z.record(z.string(), z.unknown())

export const designCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...metadata, type: z.literal('INSERT_NODE'), parentId: z.string(), index: z.number().int().nonnegative(), node: designNodeSchema }).strict(),
  z.object({ ...metadata, type: z.literal('MOVE_NODE'), nodeId: z.string(), newParentId: z.string(), newIndex: z.number().int().nonnegative() }).strict(),
  z.object({ ...metadata, type: z.literal('REMOVE_NODE'), nodeId: z.string() }).strict(),
  z.object({ ...metadata, type: z.literal('DUPLICATE_NODE'), nodeId: z.string(), newNodeId: z.string(), targetParentId: z.string(), index: z.number().int().nonnegative() }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_PROPS'), nodeId: z.string(), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_STYLE'), nodeId: z.string(), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_RESPONSIVE_STYLE'), nodeId: z.string(), breakpoint: z.enum(['tablet', 'mobile']), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_THEME'), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('REPLACE_SUBTREE'), nodeId: z.string(), nodes: z.array(designNodeSchema).min(1), rootNodeId: z.string() }).strict(),
])

export type DesignCommand = z.infer<typeof designCommandSchema>

export type CommandErrorCode =
  | 'invalid_command'
  | 'stale_document_version'
  | 'node_not_found'
  | 'parent_not_found'
  | 'invalid_parent_child'
  | 'cycle_detected'
  | 'index_out_of_bounds'
  | 'root_operation_forbidden'
  | 'document_invalid'

export interface CommandError {
  code: CommandErrorCode
  path: string
  message: string
}

export type CommandTransactionResult =
  | { accepted: true; document: DesignDocument; version: number; inverseCommands: DesignCommand[] }
  | { accepted: false; error: CommandError }

function reject(code: CommandErrorCode, path: string, message: string): CommandTransactionResult {
  return { accepted: false, error: { code, path, message } }
}

function findDescendants(document: DesignDocument, nodeId: string): string[] {
  const result: string[] = []
  const visit = (id: string): void => {
    const node = document.nodes[id]
    if (!node) return
    for (const childId of node.children) {
      result.push(childId)
      visit(childId)
    }
  }
  visit(nodeId)
  return result
}

function insertAt(children: string[], index: number, nodeId: string): boolean {
  if (index > children.length) return false
  children.splice(index, 0, nodeId)
  return true
}

function cloneCommandMetadata(command: DesignCommand, type: DesignCommand['type']): Pick<DesignCommand, 'commandId' | 'documentVersion' | 'source'> & { type: DesignCommand['type'] } {
  return {
    commandId: `inverse-${command.commandId}`,
    documentVersion: command.documentVersion + 1,
    source: 'system',
    type,
  }
}

function applyOne(document: DesignDocument, command: DesignCommand): { inverse: DesignCommand } | CommandError {
  switch (command.type) {
    case 'INSERT_NODE': {
      const parent = document.nodes[command.parentId]
      if (!parent) return { code: 'parent_not_found', path: 'parentId', message: 'Parent does not exist' }
      if (document.nodes[command.node.id]) return { code: 'invalid_command', path: 'node.id', message: 'Node ID already exists' }
      if (command.node.parentId !== parent.id || !isAllowedChild(parent.type, command.node.type)) return { code: 'invalid_parent_child', path: 'node', message: 'Node cannot be inserted into this parent' }
      if (!insertAt(parent.children, command.index, command.node.id)) return { code: 'index_out_of_bounds', path: 'index', message: 'Insert index is out of bounds' }
      document.nodes[command.node.id] = structuredClone(command.node)
      return { inverse: { ...cloneCommandMetadata(command, 'REMOVE_NODE'), type: 'REMOVE_NODE', nodeId: command.node.id } }
    }
    case 'MOVE_NODE': {
      const node = document.nodes[command.nodeId]
      const parent = document.nodes[command.newParentId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      if (!parent) return { code: 'parent_not_found', path: 'newParentId', message: 'Parent does not exist' }
      if (node.parentId === null) return { code: 'root_operation_forbidden', path: 'nodeId', message: 'Root cannot be moved' }
      if (node.id === parent.id || findDescendants(document, node.id).includes(parent.id)) return { code: 'cycle_detected', path: 'newParentId', message: 'Move would create a cycle' }
      if (!isAllowedChild(parent.type, node.type)) return { code: 'invalid_parent_child', path: 'newParentId', message: 'Node type is not allowed in target parent' }
      const oldParent = document.nodes[node.parentId]
      if (!oldParent) return { code: 'document_invalid', path: 'nodeId', message: 'Current parent is missing' }
      const oldIndex = oldParent.children.indexOf(node.id)
      oldParent.children.splice(oldIndex, 1)
      if (!insertAt(parent.children, command.newIndex, node.id)) return { code: 'index_out_of_bounds', path: 'newIndex', message: 'Move index is out of bounds' }
      const oldParentId = node.parentId
      node.parentId = parent.id
      return { inverse: { ...cloneCommandMetadata(command, 'MOVE_NODE'), type: 'MOVE_NODE', nodeId: node.id, newParentId: oldParentId, newIndex: oldIndex } }
    }
    case 'REMOVE_NODE': {
      const node = document.nodes[command.nodeId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      if (node.parentId === null) return { code: 'root_operation_forbidden', path: 'nodeId', message: 'Root cannot be removed' }
      if (node.children.length > 0) return { code: 'invalid_command', path: 'nodeId', message: 'Phase 0 contract removes leaf nodes only' }
      const parent = document.nodes[node.parentId]
      if (!parent) return { code: 'document_invalid', path: 'nodeId', message: 'Parent is missing' }
      const index = parent.children.indexOf(node.id)
      parent.children.splice(index, 1)
      delete document.nodes[node.id]
      return { inverse: { ...cloneCommandMetadata(command, 'INSERT_NODE'), type: 'INSERT_NODE', parentId: parent.id, index, node } }
    }
    case 'DUPLICATE_NODE': {
      const node = document.nodes[command.nodeId]
      const parent = document.nodes[command.targetParentId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      if (!parent) return { code: 'parent_not_found', path: 'targetParentId', message: 'Parent does not exist' }
      if (node.children.length > 0) return { code: 'invalid_command', path: 'nodeId', message: 'Phase 0 contract duplicates leaf nodes only' }
      if (document.nodes[command.newNodeId]) return { code: 'invalid_command', path: 'newNodeId', message: 'New node ID already exists' }
      if (!isAllowedChild(parent.type, node.type)) return { code: 'invalid_parent_child', path: 'targetParentId', message: 'Node cannot be duplicated into this parent' }
      const duplicate = { ...structuredClone(node), id: command.newNodeId, parentId: parent.id }
      if (!insertAt(parent.children, command.index, duplicate.id)) return { code: 'index_out_of_bounds', path: 'index', message: 'Duplicate index is out of bounds' }
      document.nodes[duplicate.id] = duplicate
      return { inverse: { ...cloneCommandMetadata(command, 'REMOVE_NODE'), type: 'REMOVE_NODE', nodeId: duplicate.id } }
    }
    case 'UPDATE_PROPS':
    case 'UPDATE_STYLE': {
      const node = document.nodes[command.nodeId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      const key = command.type === 'UPDATE_PROPS' ? 'props' : 'style'
      const previous = structuredClone(node[key])
      Object.assign(node[key], command.patch)
      return { inverse: { ...cloneCommandMetadata(command, command.type), type: command.type, nodeId: node.id, patch: previous } as DesignCommand }
    }
    case 'UPDATE_RESPONSIVE_STYLE': {
      const node = document.nodes[command.nodeId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      const previous = structuredClone(node.responsive[command.breakpoint] ?? {})
      node.responsive[command.breakpoint] = { ...(node.responsive[command.breakpoint] ?? {}), ...command.patch }
      return { inverse: { ...cloneCommandMetadata(command, 'UPDATE_RESPONSIVE_STYLE'), type: 'UPDATE_RESPONSIVE_STYLE', nodeId: node.id, breakpoint: command.breakpoint, patch: previous } }
    }
    case 'UPDATE_THEME': {
      const previous = structuredClone(document.theme)
      document.theme = { ...document.theme, ...command.patch }
      return { inverse: { ...cloneCommandMetadata(command, 'UPDATE_THEME'), type: 'UPDATE_THEME', patch: previous } }
    }
    case 'REPLACE_SUBTREE':
      return { code: 'invalid_command', path: 'type', message: 'REPLACE_SUBTREE execution is deferred to Phase 1; contract parsing is available' }
  }
}

export function applyCommandTransaction(input: DesignDocument, currentVersion: number, commands: readonly DesignCommand[]): CommandTransactionResult {
  const parsedCommands = z.array(designCommandSchema).min(1).safeParse(commands)
  if (!parsedCommands.success) return reject('invalid_command', '', parsedCommands.error.message)
  const stale = parsedCommands.data.find(command => command.documentVersion !== currentVersion)
  if (stale) return reject('stale_document_version', 'documentVersion', `Expected document version ${currentVersion}`)

  const document = structuredClone(input)
  const inverseCommands: DesignCommand[] = []
  for (const command of parsedCommands.data) {
    const outcome = applyOne(document, command)
    if ('code' in outcome) return { accepted: false, error: outcome }
    inverseCommands.unshift(outcome.inverse)
  }

  document.version = currentVersion + 1
  const validation = validateDesignDocument(document)
  if (!validation.success) {
    const cycle = validation.issues.find(issue => issue.code === 'cycle_detected')
    return reject(cycle ? 'cycle_detected' : 'document_invalid', validation.issues[0]?.path ?? '', validation.issues[0]?.message ?? 'Document is invalid')
  }

  return { accepted: true, document: validation.data, version: document.version, inverseCommands }
}
