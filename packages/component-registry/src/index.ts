import {
  COMPONENT_TYPES,
  FONT_ALLOWLIST,
  createValidDesignFixture,
  styleSchema,
  type ComponentType,
  type DesignDocument,
  type NodeStyle,
} from '@zenui/design-schema'
import { z } from 'zod'

export { COMPONENT_TYPES }

export interface InspectorField {
  key: string
  label: string
  control: 'text' | 'number' | 'color' | 'select' | 'url'
  options?: readonly string[]
}

export interface ComponentDefinition {
  type: ComponentType
  displayName: string
  category: 'layout' | 'content'
  isContainer: boolean
  defaultProps: Record<string, unknown>
  defaultStyle: NodeStyle
  propSchema: z.ZodType<Record<string, unknown>>
  styleSchema: typeof styleSchema
  allowedParents: readonly ComponentType[]
  allowedChildren: readonly ComponentType[]
  aiDescription: string
  inspector: readonly InspectorField[]
  renderTag: 'main' | 'section' | 'div' | 'h2' | 'p' | 'img' | 'a'
}

const emptyProps = z.object({}).strict()
const contentParents = ['section', 'container', 'stack'] as const

const definitions: readonly ComponentDefinition[] = [
  {
    type: 'page', displayName: 'Page', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: {}, propSchema: emptyProps, styleSchema,
    allowedParents: [], allowedChildren: ['section'], aiDescription: 'Root of the single landing page.', inspector: [], renderTag: 'main',
  },
  {
    type: 'section', displayName: 'Section', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { paddingTop: 64, paddingBottom: 64 }, propSchema: z.object({ label: z.string().min(1).max(100).optional() }).strict(), styleSchema,
    allowedParents: ['page'], allowedChildren: ['container', 'stack', 'heading', 'paragraph', 'image', 'button'], aiDescription: 'Top-level responsive page section.', inspector: [], renderTag: 'section',
  },
  {
    type: 'container', displayName: 'Container', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { width: 'full', maxWidth: 1200 }, propSchema: emptyProps, styleSchema,
    allowedParents: ['section', 'stack'], allowedChildren: ['container', 'stack', 'heading', 'paragraph', 'image', 'button'], aiDescription: 'Width-constrained content container.', inspector: [], renderTag: 'div',
  },
  {
    type: 'stack', displayName: 'Stack', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { display: 'flex', flexDirection: 'column', gap: 16 }, propSchema: emptyProps, styleSchema,
    allowedParents: ['section', 'container', 'stack'], allowedChildren: ['container', 'stack', 'heading', 'paragraph', 'image', 'button'], aiDescription: 'Vertical or horizontal flow layout.', inspector: [{ key: 'flexDirection', label: 'Direction', control: 'select', options: ['row', 'column'] }], renderTag: 'div',
  },
  {
    type: 'heading', displayName: 'Heading', category: 'content', isContainer: false,
    defaultProps: { text: 'New heading', level: 2 }, defaultStyle: { fontFamily: 'Manrope', fontSize: 48, fontWeight: '700' }, propSchema: z.object({ text: z.string().min(1).max(500), level: z.number().int().min(1).max(6) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Semantic heading with editable level and text.', inspector: [{ key: 'text', label: 'Text', control: 'text' }, { key: 'level', label: 'Level', control: 'number' }], renderTag: 'h2',
  },
  {
    type: 'paragraph', displayName: 'Paragraph', category: 'content', isContainer: false,
    defaultProps: { text: 'New paragraph' }, defaultStyle: { fontFamily: 'Manrope', fontSize: 18 }, propSchema: z.object({ text: z.string().min(1).max(5000) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Body text paragraph.', inspector: [{ key: 'text', label: 'Text', control: 'text' }], renderTag: 'p',
  },
  {
    type: 'image', displayName: 'Image', category: 'content', isContainer: false,
    defaultProps: { src: 'https://images.example.com/placeholder.png', alt: 'Placeholder image' }, defaultStyle: { width: 'full' }, propSchema: z.object({ src: z.string().url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol)), alt: z.string().min(1).max(300) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'HTTP(S) image with required alternative text.', inspector: [{ key: 'src', label: 'Image URL', control: 'url' }, { key: 'alt', label: 'Alternative text', control: 'text' }], renderTag: 'img',
  },
  {
    type: 'button', displayName: 'Button', category: 'content', isContainer: false,
    defaultProps: { text: 'Call to action', href: '#action' }, defaultStyle: { backgroundColor: '#2563eb', color: '#ffffff', borderRadius: 8 }, propSchema: z.object({ text: z.string().min(1).max(200), href: z.string().min(1) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Call-to-action link rendered as a button.', inspector: [{ key: 'text', label: 'Label', control: 'text' }, { key: 'href', label: 'Destination', control: 'url' }], renderTag: 'a',
  },
]

export const componentRegistry = Object.fromEntries(definitions.map(definition => [definition.type, definition])) as Record<ComponentType, ComponentDefinition>

export function isAllowedChild(parentType: ComponentType, childType: ComponentType): boolean {
  const parent = componentRegistry[parentType]
  const child = componentRegistry[childType]
  return parent.allowedChildren.includes(childType) && child.allowedParents.includes(parentType)
}

export function validateRegistryRelationships(document: DesignDocument): { code: 'invalid_parent_child'; path: string; message: string }[] {
  const issues: { code: 'invalid_parent_child'; path: string; message: string }[] = []
  for (const node of Object.values(document.nodes)) {
    for (const childId of node.children) {
      const child = document.nodes[childId]
      if (child && !isAllowedChild(node.type, child.type)) {
        issues.push({ code: 'invalid_parent_child', path: `nodes.${node.id}.children`, message: `${child.type} is not allowed inside ${node.type}` })
      }
    }
  }
  return issues
}

function defaultNode(type: ComponentType, id: string, parentId: string): DesignDocument['nodes'][string] {
  const definition = componentRegistry[type]
  return {
    id,
    type,
    parentId,
    children: [],
    props: structuredClone(definition.defaultProps),
    style: structuredClone(definition.defaultStyle),
    responsive: {},
  }
}

export function createRegistryFixture(type: ComponentType): DesignDocument {
  const document = createValidDesignFixture()
  if (type === 'page') return document

  const id = `fixture-${type}`
  const definition = componentRegistry[type]
  const parentId = definition.allowedParents.includes('container') ? 'container-1' : definition.allowedParents[0]
  if (!parentId) return document

  if (type === 'section') {
    document.nodes[id] = defaultNode(type, id, 'page-root')
    document.nodes['page-root']!.children.push(id)
  } else if (parentId === 'container-1') {
    document.nodes[id] = defaultNode(type, id, parentId)
    document.nodes[parentId]!.children.push(id)
  } else {
    const parentNodeId = `fixture-parent-${parentId}`
    const grandParentId = parentId === 'section' ? 'page-root' : 'section-1'
    document.nodes[parentNodeId] = defaultNode(parentId, parentNodeId, grandParentId)
    document.nodes[grandParentId]!.children.push(parentNodeId)
    document.nodes[id] = defaultNode(type, id, parentNodeId)
    document.nodes[parentNodeId].children.push(id)
  }
  return document
}

export const fontAllowlist = FONT_ALLOWLIST
