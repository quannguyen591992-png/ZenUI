import { z } from 'zod'

export const DESIGN_LIMITS = {
  maxNodes: 500,
  maxDepth: 12,
  maxSerializedBytes: 1024 * 1024,
} as const

export const COMPONENT_TYPES = [
  'page',
  'section',
  'container',
  'stack',
  'heading',
  'paragraph',
  'image',
  'button',
] as const

export const FONT_ALLOWLIST = ['Arial', 'Georgia', 'Manrope', 'system-ui'] as const

const nodeIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const safeImageUrlSchema = z.string().url().refine(value => {
  const protocol = new URL(value).protocol
  return protocol === 'https:' || protocol === 'http:'
}, 'Image URL must use HTTP or HTTPS')
const safeLinkSchema = z.string().min(1).refine(value => {
  if (value.startsWith('#') || value.startsWith('/')) return !value.startsWith('//')
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:' || protocol === 'tel:'
  } catch {
    return false
  }
}, 'Link must be a safe internal, HTTP(S), mailto, or tel URL')

export const styleSchema = z.object({
  display: z.enum(['block', 'flex', 'grid', 'none']).optional(),
  flexDirection: z.enum(['row', 'column']).optional(),
  justifyContent: z.enum(['start', 'center', 'end', 'space-between']).optional(),
  alignItems: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  gap: z.number().int().min(0).max(200).optional(),
  width: z.union([z.number().int().min(0).max(4000), z.enum(['auto', 'full'])]).optional(),
  maxWidth: z.number().int().min(0).max(4000).optional(),
  paddingTop: z.number().int().min(0).max(400).optional(),
  paddingRight: z.number().int().min(0).max(400).optional(),
  paddingBottom: z.number().int().min(0).max(400).optional(),
  paddingLeft: z.number().int().min(0).max(400).optional(),
  marginTop: z.number().int().min(-200).max(400).optional(),
  marginRight: z.number().int().min(-200).max(400).optional(),
  marginBottom: z.number().int().min(-200).max(400).optional(),
  marginLeft: z.number().int().min(-200).max(400).optional(),
  fontFamily: z.enum(FONT_ALLOWLIST).optional(),
  fontSize: z.number().int().min(10).max(160).optional(),
  fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  color: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  borderColor: hexColorSchema.optional(),
  borderWidth: z.number().int().min(0).max(20).optional(),
  borderRadius: z.number().int().min(0).max(200).optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict()

export type NodeStyle = z.infer<typeof styleSchema>

const responsiveSchema = z.object({
  tablet: styleSchema.optional(),
  mobile: styleSchema.optional(),
}).strict()

const propsByType = {
  page: z.object({}).strict(),
  section: z.object({ label: z.string().min(1).max(100).optional() }).strict(),
  container: z.object({}).strict(),
  stack: z.object({}).strict(),
  heading: z.object({ text: z.string().min(1).max(500), level: z.number().int().min(1).max(6) }).strict(),
  paragraph: z.object({ text: z.string().min(1).max(5000) }).strict(),
  image: z.object({ src: safeImageUrlSchema, alt: z.string().min(1).max(300) }).strict(),
  button: z.object({ text: z.string().min(1).max(200), href: safeLinkSchema }).strict(),
} as const

const nodeSchemas = COMPONENT_TYPES.map(type => z.object({
  id: nodeIdSchema,
  type: z.literal(type),
  parentId: nodeIdSchema.nullable(),
  children: z.array(nodeIdSchema).max(DESIGN_LIMITS.maxNodes),
  props: propsByType[type],
  style: styleSchema,
  responsive: responsiveSchema,
}).strict())

export const designNodeSchema = z.discriminatedUnion('type', nodeSchemas as [
  typeof nodeSchemas[0],
  typeof nodeSchemas[1],
  ...Array<typeof nodeSchemas[number]>,
])

const themeSchema = z.object({
  colors: z.object({
    primary: hexColorSchema,
    background: hexColorSchema,
    text: hexColorSchema,
  }).strict(),
  fonts: z.object({
    heading: z.enum(FONT_ALLOWLIST),
    body: z.enum(FONT_ALLOWLIST),
  }).strict(),
  radius: z.object({
    sm: z.number().int().min(0).max(100),
    md: z.number().int().min(0).max(100),
    lg: z.number().int().min(0).max(100),
  }).strict(),
}).strict()

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: nodeIdSchema,
  version: z.number().int().positive(),
  theme: themeSchema,
  pages: z.array(z.object({
    id: nodeIdSchema,
    name: z.string().min(1).max(100),
    slug: z.literal('/'),
    rootNodeId: nodeIdSchema,
  }).strict()).length(1),
  nodes: z.record(nodeIdSchema, designNodeSchema),
}).strict()

export type DesignDocument = z.infer<typeof designDocumentSchema>
export type DesignNode = z.infer<typeof designNodeSchema>
export type ComponentType = DesignNode['type']

export type DesignValidationIssueCode =
  | 'schema_invalid'
  | 'document_size_exceeded'
  | 'node_limit_exceeded'
  | 'node_id_mismatch'
  | 'root_invalid'
  | 'orphan_node'
  | 'child_missing'
  | 'parent_child_mismatch'
  | 'cycle_detected'
  | 'depth_limit_exceeded'
  | 'unsafe_url'

export interface DesignValidationIssue {
  code: DesignValidationIssueCode
  path: string
  message: string
}

export type DesignValidationResult =
  | { success: true; data: DesignDocument }
  | { success: false; issues: DesignValidationIssue[] }

function schemaIssues(error: z.ZodError): DesignValidationIssue[] {
  return error.issues.map(issue => ({
    code: issue.path.at(-1) === 'src' || issue.path.at(-1) === 'href' ? 'unsafe_url' : 'schema_invalid',
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

function detectCycleAndDepth(document: DesignDocument, rootNodeId: string, issues: DesignValidationIssue[]): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const walk = (nodeId: string, depth: number): void => {
    if (visiting.has(nodeId)) {
      issues.push({ code: 'cycle_detected', path: `nodes.${nodeId}`, message: 'Node graph contains a cycle' })
      return
    }
    if (visited.has(nodeId)) return
    if (depth > DESIGN_LIMITS.maxDepth) {
      issues.push({ code: 'depth_limit_exceeded', path: `nodes.${nodeId}`, message: `Tree depth exceeds ${DESIGN_LIMITS.maxDepth}` })
      return
    }

    const node = document.nodes[nodeId]
    if (!node) return
    visiting.add(nodeId)
    for (const childId of node.children) walk(childId, depth + 1)
    visiting.delete(nodeId)
    visited.add(nodeId)
  }

  walk(rootNodeId, 1)
}

export function validateDesignDocument(input: unknown): DesignValidationResult {
  let serializedBytes: number
  try {
    serializedBytes = Buffer.byteLength(JSON.stringify(input), 'utf8')
  } catch {
    return { success: false, issues: [{ code: 'schema_invalid', path: '', message: 'Document must be serializable' }] }
  }
  if (serializedBytes > DESIGN_LIMITS.maxSerializedBytes) {
    return { success: false, issues: [{ code: 'document_size_exceeded', path: '', message: 'Document exceeds 1 MiB' }] }
  }

  const parsed = designDocumentSchema.safeParse(input)
  if (!parsed.success) return { success: false, issues: schemaIssues(parsed.error) }

  const document = parsed.data
  const issues: DesignValidationIssue[] = []
  const entries = Object.entries(document.nodes)
  if (entries.length > DESIGN_LIMITS.maxNodes) {
    issues.push({ code: 'node_limit_exceeded', path: 'nodes', message: `Document exceeds ${DESIGN_LIMITS.maxNodes} nodes` })
  }

  const page = document.pages[0]
  const root = page ? document.nodes[page.rootNodeId] : undefined
  if (!root || root.type !== 'page' || root.parentId !== null) {
    issues.push({ code: 'root_invalid', path: 'pages.0.rootNodeId', message: 'Root must reference a parentless page node' })
  }

  for (const [key, node] of entries) {
    if (key !== node.id) issues.push({ code: 'node_id_mismatch', path: `nodes.${key}.id`, message: 'Node ID must match its map key' })
    if (node.id !== page?.rootNodeId && (!node.parentId || !document.nodes[node.parentId])) {
      issues.push({ code: 'orphan_node', path: `nodes.${key}.parentId`, message: 'Non-root node must have an existing parent' })
    }
    const parent = node.parentId ? document.nodes[node.parentId] : undefined
    if (parent && !parent.children.includes(node.id)) {
      issues.push({ code: 'parent_child_mismatch', path: `nodes.${key}.parentId`, message: 'Parent must reference the node as a child' })
    }
    for (const childId of node.children) {
      const child = document.nodes[childId]
      if (!child) issues.push({ code: 'child_missing', path: `nodes.${key}.children`, message: `Child ${childId} does not exist` })
      else if (child.parentId !== node.id) issues.push({ code: 'parent_child_mismatch', path: `nodes.${key}.children`, message: `Child ${childId} must reference parent ${node.id}` })
    }
  }

  if (page) detectCycleAndDepth(document, page.rootNodeId, issues)
  return issues.length === 0 ? { success: true, data: document } : { success: false, issues }
}

export function exportDesignDocumentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(designDocumentSchema, { target: 'draft-7' })
}

export function createValidDesignFixture(): DesignDocument {
  return {
    schemaVersion: 1,
    projectId: 'project-1',
    version: 1,
    theme: {
      colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
      fonts: { heading: 'Manrope', body: 'Manrope' },
      radius: { sm: 6, md: 12, lg: 20 },
    },
    pages: [{ id: 'home', name: 'Home', slug: '/', rootNodeId: 'page-root' }],
    nodes: {
      'page-root': { id: 'page-root', type: 'page', parentId: null, children: ['section-1'], props: {}, style: {}, responsive: {} },
      'section-1': { id: 'section-1', type: 'section', parentId: 'page-root', children: ['container-1'], props: {}, style: { paddingTop: 96, paddingBottom: 96 }, responsive: {} },
      'container-1': { id: 'container-1', type: 'container', parentId: 'section-1', children: ['heading-1', 'paragraph-1', 'image-1', 'button-1'], props: {}, style: {}, responsive: {} },
      'heading-1': { id: 'heading-1', type: 'heading', parentId: 'container-1', children: [], props: { text: 'Build your next product', level: 1 }, style: { color: '#0f172a' }, responsive: {} },
      'paragraph-1': { id: 'paragraph-1', type: 'paragraph', parentId: 'container-1', children: [], props: { text: 'Launch a structured landing page.' }, style: {}, responsive: {} },
      'image-1': { id: 'image-1', type: 'image', parentId: 'container-1', children: [], props: { src: 'https://images.example.com/hero.png', alt: 'Product preview' }, style: {}, responsive: {} },
      'button-1': { id: 'button-1', type: 'button', parentId: 'container-1', children: [], props: { text: 'Start now', href: '#start' }, style: {}, responsive: {} },
    },
  }
}
