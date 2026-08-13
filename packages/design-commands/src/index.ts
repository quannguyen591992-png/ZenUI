import { isAllowedChild } from '@zenui/component-registry'
import {
  designNodeSchema,
  parseDesignDocument,
  validateDesignDocument,
  type DesignDocument,
  type DesignDocumentV2,
} from '@zenui/design-schema'
import { z } from 'zod'

const metadata = {
  commandId: z.string().min(1).max(100),
  documentVersion: z.number().int().positive(),
  source: z.enum(['user', 'ai', 'restore', 'system']),
} as const

const recordPatch = z.record(z.string(), z.unknown())
const pageSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  slug: z.string().min(1).max(80),
  rootNodeId: z.string().min(1).max(100),
}).strict()
const navigationItemSchema = z.object({
  pageId: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(100),
}).strict()

export const designCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...metadata, type: z.literal('INSERT_NODE'), parentId: z.string(), index: z.number().int().nonnegative(), node: designNodeSchema }).strict(),
  z.object({ ...metadata, type: z.literal('MOVE_NODE'), nodeId: z.string(), newParentId: z.string(), newIndex: z.number().int().nonnegative() }).strict(),
  z.object({ ...metadata, type: z.literal('REMOVE_NODE'), nodeId: z.string() }).strict(),
  z.object({ ...metadata, type: z.literal('DUPLICATE_NODE'), nodeId: z.string(), newNodeId: z.string(), targetParentId: z.string(), index: z.number().int().nonnegative() }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_PROPS'), nodeId: z.string(), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_STYLE'), nodeId: z.string(), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_RESPONSIVE_STYLE'), nodeId: z.string(), breakpoint: z.enum(['tablet', 'mobile']), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_THEME'), patch: recordPatch }).strict(),
  z.object({ ...metadata, type: z.literal('REPLACE_SUBTREE'), nodeId: z.string(), nodes: z.array(designNodeSchema).min(1), rootNodeId: z.string(), index: z.number().int().nonnegative().optional() }).strict(),
  z.object({ ...metadata, type: z.literal('REPLACE_DOCUMENT'), document: z.unknown() }).strict(),
  z.object({ ...metadata, type: z.literal('CREATE_PAGE'), index: z.number().int().nonnegative(), page: pageSchema, nodes: z.array(designNodeSchema).min(1) }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_PAGE'), pageId: z.string().min(1).max(100), patch: z.object({ name: z.string().trim().min(1).max(100).optional(), slug: z.string().min(1).max(80).optional() }).strict() }).strict(),
  z.object({ ...metadata, type: z.literal('MOVE_PAGE'), pageId: z.string().min(1).max(100), newIndex: z.number().int().nonnegative() }).strict(),
  z.object({ ...metadata, type: z.literal('DUPLICATE_PAGE'), sourcePageId: z.string().min(1).max(100), index: z.number().int().nonnegative(), page: pageSchema, nodes: z.array(designNodeSchema).min(1) }).strict(),
  z.object({ ...metadata, type: z.literal('REMOVE_PAGE'), pageId: z.string().min(1).max(100) }).strict(),
  z.object({ ...metadata, type: z.literal('UPDATE_NAVIGATION'), items: z.array(navigationItemSchema).max(20) }).strict(),
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

function subtreeNodes(document: DesignDocument, nodeId: string): DesignDocument['nodes'][string][] {
  return [nodeId, ...findDescendants(document, nodeId)].map(id => structuredClone(document.nodes[id]!))
}

function inversePatch(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.keys(patch).map(key => [key, previous[key]]))
}

function applyPatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete target[key]
    else target[key] = value
  }
}

function insertAt(children: string[], index: number, nodeId: string): boolean {
  if (index > children.length) return false
  children.splice(index, 0, nodeId)
  return true
}

function requireV2(document: DesignDocument): DesignDocumentV2 | null {
  return document.schemaVersion === 2 ? document : null
}

function pageSubtreeNodes(document: DesignDocument, rootNodeId: string): DesignDocument['nodes'][string][] {
  return subtreeNodes(document, rootNodeId)
}

function validPageNodes(document: DesignDocument, page: { rootNodeId: string }, nodes: readonly DesignDocument['nodes'][string][]): boolean {
  const ids = new Set(nodes.map(node => node.id))
  const root = nodes.find(node => node.id === page.rootNodeId)
  return Boolean(
    root
    && root.type === 'page'
    && root.parentId === null
    && ids.size === nodes.length
    && nodes.every(node => !document.nodes[node.id])
    && nodes.every(node => node.children.every(childId => ids.has(childId)))
    && nodes.every(node => node.parentId === null ? node.id === page.rootNodeId : ids.has(node.parentId)),
  )
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
      const parent = document.nodes[node.parentId]
      if (!parent) return { code: 'document_invalid', path: 'nodeId', message: 'Parent is missing' }
      const index = parent.children.indexOf(node.id)
      const nodes = subtreeNodes(document, node.id)
      parent.children.splice(index, 1)
      for (const subtreeNode of nodes) delete document.nodes[subtreeNode.id]
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'REPLACE_SUBTREE'),
          type: 'REPLACE_SUBTREE',
          nodeId: node.id,
          rootNodeId: node.id,
          nodes,
          index,
        },
      }
    }
    case 'DUPLICATE_NODE': {
      const node = document.nodes[command.nodeId]
      const parent = document.nodes[command.targetParentId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      if (!parent) return { code: 'parent_not_found', path: 'targetParentId', message: 'Parent does not exist' }
      if (node.children.length > 0) return { code: 'invalid_command', path: 'nodeId', message: 'Only leaf nodes can be duplicated with DUPLICATE_NODE' }
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
      const previous = structuredClone(node[key]) as Record<string, unknown>
      applyPatch(node[key], command.patch)
      return {
        inverse: {
          ...cloneCommandMetadata(command, command.type),
          type: command.type,
          nodeId: node.id,
          patch: inversePatch(previous, command.patch),
        } as DesignCommand,
      }
    }
    case 'UPDATE_RESPONSIVE_STYLE': {
      const node = document.nodes[command.nodeId]
      if (!node) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
      const previous = structuredClone(node.responsive[command.breakpoint] ?? {}) as Record<string, unknown>
      const next = { ...(node.responsive[command.breakpoint] ?? {}) }
      applyPatch(next, command.patch)
      node.responsive[command.breakpoint] = next
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'UPDATE_RESPONSIVE_STYLE'),
          type: 'UPDATE_RESPONSIVE_STYLE',
          nodeId: node.id,
          breakpoint: command.breakpoint,
          patch: inversePatch(previous, command.patch),
        },
      }
    }
    case 'UPDATE_THEME': {
      const previous = structuredClone(document.theme) as unknown as Record<string, unknown>
      const next = structuredClone(document.theme) as unknown as Record<string, unknown>
      applyPatch(next, command.patch)
      document.theme = next as unknown as DesignDocument['theme']
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'UPDATE_THEME'),
          type: 'UPDATE_THEME',
          patch: inversePatch(previous, command.patch),
        },
      }
    }
    case 'CREATE_PAGE': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      if (command.index > v2.pages.length) return { code: 'index_out_of_bounds', path: 'index', message: 'Page index is out of bounds' }
      if (v2.pages.some(page => page.id === command.page.id)) return { code: 'invalid_command', path: 'page.id', message: 'Page ID already exists' }
      if (!validPageNodes(document, command.page, command.nodes)) return { code: 'invalid_command', path: 'nodes', message: 'Page nodes must form one unique subtree' }
      v2.pages.splice(command.index, 0, structuredClone(command.page))
      for (const node of command.nodes) v2.nodes[node.id] = structuredClone(node)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'REMOVE_PAGE'),
          type: 'REMOVE_PAGE',
          pageId: command.page.id,
        },
      }
    }
    case 'UPDATE_PAGE': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      const page = v2.pages.find(item => item.id === command.pageId)
      if (!page) return { code: 'invalid_command', path: 'pageId', message: 'Page does not exist' }
      if (page.slug === '/' && command.patch.slug && command.patch.slug !== '/') {
        return { code: 'root_operation_forbidden', path: 'patch.slug', message: 'Home route cannot be changed' }
      }
      const previous = { name: page.name, slug: page.slug }
      if (command.patch.name !== undefined) page.name = command.patch.name
      if (command.patch.slug !== undefined) page.slug = command.patch.slug
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'UPDATE_PAGE'),
          type: 'UPDATE_PAGE',
          pageId: page.id,
          patch: Object.fromEntries(Object.keys(command.patch).map(key => [key, previous[key as keyof typeof previous]])),
        },
      }
    }
    case 'MOVE_PAGE': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      const index = v2.pages.findIndex(page => page.id === command.pageId)
      if (index < 0) return { code: 'invalid_command', path: 'pageId', message: 'Page does not exist' }
      if (command.newIndex >= v2.pages.length) return { code: 'index_out_of_bounds', path: 'newIndex', message: 'Page index is out of bounds' }
      const [page] = v2.pages.splice(index, 1)
      v2.pages.splice(command.newIndex, 0, page!)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'MOVE_PAGE'),
          type: 'MOVE_PAGE',
          pageId: command.pageId,
          newIndex: index,
        },
      }
    }
    case 'DUPLICATE_PAGE': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      if (!v2.pages.some(page => page.id === command.sourcePageId)) return { code: 'invalid_command', path: 'sourcePageId', message: 'Source page does not exist' }
      if (command.index > v2.pages.length) return { code: 'index_out_of_bounds', path: 'index', message: 'Page index is out of bounds' }
      if (v2.pages.some(page => page.id === command.page.id)) return { code: 'invalid_command', path: 'page.id', message: 'Page ID already exists' }
      if (!validPageNodes(document, command.page, command.nodes)) return { code: 'invalid_command', path: 'nodes', message: 'Duplicate nodes must form one unique subtree' }
      v2.pages.splice(command.index, 0, structuredClone(command.page))
      for (const node of command.nodes) v2.nodes[node.id] = structuredClone(node)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'REMOVE_PAGE'),
          type: 'REMOVE_PAGE',
          pageId: command.page.id,
        },
      }
    }
    case 'REMOVE_PAGE': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      const index = v2.pages.findIndex(page => page.id === command.pageId)
      if (index < 0) return { code: 'invalid_command', path: 'pageId', message: 'Page does not exist' }
      const page = v2.pages[index]!
      if (page.slug === '/') return { code: 'root_operation_forbidden', path: 'pageId', message: 'Home page cannot be removed' }
      if (v2.navigation.items.some(item => item.pageId === page.id)) return { code: 'document_invalid', path: 'pageId', message: 'Remove the page from navigation first' }
      const linked = Object.values(v2.nodes).some(node => {
        if (node.type !== 'button' && node.type !== 'link') return false
        if ('pageId' in node.props) return node.props.pageId === page.id
        return 'action' in node.props
          && node.props.action.type === 'internal_page'
          && node.props.action.pageId === page.id
      })
      if (linked) return { code: 'document_invalid', path: 'pageId', message: 'Remove internal links to the page first' }
      const nodes = pageSubtreeNodes(v2, page.rootNodeId)
      v2.pages.splice(index, 1)
      for (const node of nodes) delete v2.nodes[node.id]
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'CREATE_PAGE'),
          type: 'CREATE_PAGE',
          index,
          page: structuredClone(page),
          nodes,
        },
      }
    }
    case 'UPDATE_NAVIGATION': {
      const v2 = requireV2(document)
      if (!v2) return { code: 'document_invalid', path: 'schemaVersion', message: 'Page commands require Design Document v2' }
      const previous = structuredClone(v2.navigation.items)
      v2.navigation.items = structuredClone(command.items)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'UPDATE_NAVIGATION'),
          type: 'UPDATE_NAVIGATION',
          items: previous,
        },
      }
    }
    case 'REPLACE_DOCUMENT': {
      if (typeof command.document !== 'object' || command.document === null) {
        return { code: 'document_invalid', path: 'document', message: 'Replacement document is invalid' }
      }
      const candidate = structuredClone(command.document) as Record<string, unknown>
      candidate.projectId = document.projectId
      candidate.version = document.version
      const validation = parseDesignDocument(candidate)
      if (!validation.success) {
        return {
          code: 'document_invalid',
          path: validation.issues[0]?.path ?? 'document',
          message: validation.issues[0]?.message ?? 'Replacement document is invalid',
        }
      }
      const previous = structuredClone(document)
      Object.assign(document, validation.data)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'REPLACE_DOCUMENT'),
          type: 'REPLACE_DOCUMENT',
          document: previous,
        },
      }
    }
    case 'REPLACE_SUBTREE': {
      const target = document.nodes[command.nodeId]
      const replacementRoot = command.nodes.find(node => node.id === command.rootNodeId)
      if (!replacementRoot) return { code: 'invalid_command', path: 'rootNodeId', message: 'Replacement root is missing' }

      if (!target) {
        if (command.index === undefined) return { code: 'node_not_found', path: 'nodeId', message: 'Node does not exist' }
        const parent = replacementRoot.parentId ? document.nodes[replacementRoot.parentId] : undefined
        if (!parent) return { code: 'parent_not_found', path: 'nodes', message: 'Replacement parent does not exist' }
        if (!isAllowedChild(parent.type, replacementRoot.type)) return { code: 'invalid_parent_child', path: 'nodes', message: 'Replacement root cannot be inserted into this parent' }
        const ids = new Set(command.nodes.map(node => node.id))
        if (ids.size !== command.nodes.length || command.nodes.some(node => document.nodes[node.id])) {
          return { code: 'invalid_command', path: 'nodes', message: 'Replacement node IDs must be unique' }
        }
        if (!insertAt(parent.children, command.index, replacementRoot.id)) return { code: 'index_out_of_bounds', path: 'index', message: 'Replacement index is out of bounds' }
        for (const node of command.nodes) document.nodes[node.id] = structuredClone(node)
        return { inverse: { ...cloneCommandMetadata(command, 'REMOVE_NODE'), type: 'REMOVE_NODE', nodeId: replacementRoot.id } }
      }

      if (target.parentId === null) return { code: 'root_operation_forbidden', path: 'nodeId', message: 'Root cannot be replaced' }
      const parent = document.nodes[target.parentId]
      if (!parent) return { code: 'document_invalid', path: 'nodeId', message: 'Parent is missing' }
      if (replacementRoot.parentId !== parent.id || !isAllowedChild(parent.type, replacementRoot.type)) {
        return { code: 'invalid_parent_child', path: 'nodes', message: 'Replacement root cannot be inserted into this parent' }
      }

      const previousNodes = subtreeNodes(document, target.id)
      const previousIds = new Set(previousNodes.map(node => node.id))
      const replacementIds = new Set(command.nodes.map(node => node.id))
      if (replacementIds.size !== command.nodes.length || command.nodes.some(node => document.nodes[node.id] && !previousIds.has(node.id))) {
        return { code: 'invalid_command', path: 'nodes', message: 'Replacement node IDs must be unique' }
      }

      const index = parent.children.indexOf(target.id)
      parent.children[index] = replacementRoot.id
      for (const node of previousNodes) delete document.nodes[node.id]
      for (const node of command.nodes) document.nodes[node.id] = structuredClone(node)
      return {
        inverse: {
          ...cloneCommandMetadata(command, 'REPLACE_SUBTREE'),
          type: 'REPLACE_SUBTREE',
          nodeId: replacementRoot.id,
          rootNodeId: target.id,
          nodes: previousNodes,
        },
      }
    }
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
