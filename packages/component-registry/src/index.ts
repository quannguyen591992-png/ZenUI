import {
  COMPONENT_TYPES,
  FONT_ALLOWLIST,
  buttonPropsSchema,
  createValidDesignFixture,
  imagePropsSchema,
  linkPropsSchema,
  styleSchema,
  type ComponentType,
  type DesignDocument,
  type DesignNode,
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

export interface ComponentTemplate {
  rootNodeId: string
  nodes: readonly DesignNode[]
}

export interface ComponentDefinition {
  type: ComponentType
  displayName: string
  category: 'layout' | 'content' | 'composite'
  isContainer: boolean
  defaultProps: Record<string, unknown>
  defaultStyle: NodeStyle
  propSchema: z.ZodType<Record<string, unknown>>
  styleSchema: typeof styleSchema
  allowedParents: readonly ComponentType[]
  allowedChildren: readonly ComponentType[]
  aiDescription: string
  inspector: readonly InspectorField[]
  renderTag: 'main' | 'section' | 'div' | 'nav' | 'article' | 'h2' | 'p' | 'img' | 'a' | 'span' | 'hr'
  template: ComponentTemplate | undefined
}

const emptyProps = z.object({}).strict()
const contentParents = ['section', 'container', 'stack', 'column', 'hero', 'feature-card'] as const
const flowChildren = [
  'container', 'stack', 'columns', 'divider', 'spacer', 'heading', 'paragraph', 'image',
  'button', 'link', 'icon', 'badge', 'feature-card',
] as const

function templateNode(
  id: string,
  type: ComponentType,
  parentId: string | null,
  children: string[],
  props: Record<string, unknown>,
  style: NodeStyle = {},
): DesignNode {
  return { id, type, parentId, children, props, style, responsive: {} }
}

const navbarTemplate: ComponentTemplate = {
  rootNodeId: 'navbar-root',
  nodes: [
    templateNode('navbar-root', 'navbar', null, ['navbar-brand', 'navbar-link', 'navbar-button'], { brand: 'ZenUI' }),
    templateNode('navbar-brand', 'link', 'navbar-root', [], { text: 'ZenUI', href: '#top', brandSlot: true }),
    templateNode('navbar-link', 'link', 'navbar-root', [], { text: 'Features', href: '#features' }),
    templateNode('navbar-button', 'button', 'navbar-root', [], { text: 'Get started', href: '#start' }),
  ],
}

const heroTemplate: ComponentTemplate = {
  rootNodeId: 'hero-root',
  nodes: [
    templateNode('hero-root', 'hero', null, ['hero-heading', 'hero-paragraph', 'hero-button'], { label: 'Hero' }),
    templateNode('hero-heading', 'heading', 'hero-root', [], { text: 'Build faster with ZenUI', level: 1 }),
    templateNode('hero-paragraph', 'paragraph', 'hero-root', [], { text: 'Create a structured landing page.' }),
    templateNode('hero-button', 'button', 'hero-root', [], { text: 'Start now', href: '#start' }),
  ],
}

const featureCardTemplate: ComponentTemplate = {
  rootNodeId: 'feature-card-root',
  nodes: [
    templateNode('feature-card-root', 'feature-card', null, ['feature-icon', 'feature-heading', 'feature-copy'], {
      title: 'Structured editing', description: 'Safe commands keep every edit valid.',
    }),
    templateNode('feature-icon', 'icon', 'feature-card-root', [], { name: 'star', label: 'Featured' }),
    templateNode('feature-heading', 'heading', 'feature-card-root', [], { text: 'Structured editing', level: 3 }),
    templateNode('feature-copy', 'paragraph', 'feature-card-root', [], { text: 'Safe commands keep every edit valid.' }),
  ],
}

const definitions: readonly ComponentDefinition[] = [
  {
    type: 'page', displayName: 'Page', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: {}, propSchema: emptyProps, styleSchema,
    allowedParents: [], allowedChildren: ['navbar', 'hero', 'section'], aiDescription: 'Root of the single landing page.',
    inspector: [], renderTag: 'main', template: undefined,
  },
  {
    type: 'section', displayName: 'Section', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { paddingTop: 64, paddingBottom: 64 },
    propSchema: z.object({
      label: z.string().min(1).max(100).optional(),
      hidden: z.boolean().optional(),
    }).strict(), styleSchema,
    allowedParents: ['page'], allowedChildren: flowChildren, aiDescription: 'Top-level responsive page section.',
    inspector: [], renderTag: 'section', template: undefined,
  },
  {
    type: 'container', displayName: 'Container', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { width: 'full', maxWidth: 1200 }, propSchema: emptyProps, styleSchema,
    allowedParents: ['section', 'stack', 'column', 'hero', 'feature-card', 'navbar'], allowedChildren: flowChildren,
    aiDescription: 'Width-constrained content container.', inspector: [], renderTag: 'div', template: undefined,
  },
  {
    type: 'stack', displayName: 'Stack', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { display: 'flex', flexDirection: 'column', gap: 16 }, propSchema: emptyProps, styleSchema,
    allowedParents: ['section', 'container', 'stack', 'column', 'hero', 'feature-card', 'navbar'], allowedChildren: flowChildren,
    aiDescription: 'Vertical or horizontal flow layout.',
    inspector: [{ key: 'flexDirection', label: 'Direction', control: 'select', options: ['row', 'column'] }],
    renderTag: 'div', template: undefined,
  },
  {
    type: 'columns', displayName: 'Columns', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: { display: 'grid', gap: 24 }, propSchema: emptyProps, styleSchema,
    allowedParents: ['section', 'container', 'stack', 'column', 'hero'], allowedChildren: ['column'],
    aiDescription: 'Responsive multi-column layout.', inspector: [], renderTag: 'div', template: undefined,
  },
  {
    type: 'column', displayName: 'Column', category: 'layout', isContainer: true,
    defaultProps: {}, defaultStyle: {}, propSchema: emptyProps, styleSchema,
    allowedParents: ['columns'], allowedChildren: flowChildren,
    aiDescription: 'One column inside Columns.', inspector: [], renderTag: 'div', template: undefined,
  },
  {
    type: 'divider', displayName: 'Divider', category: 'layout', isContainer: false,
    defaultProps: {}, defaultStyle: { borderColor: '#e2e8f0', borderWidth: 1 }, propSchema: emptyProps, styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Visual separator.',
    inspector: [], renderTag: 'hr', template: undefined,
  },
  {
    type: 'spacer', displayName: 'Spacer', category: 'layout', isContainer: false,
    defaultProps: { size: 32 }, defaultStyle: {},
    propSchema: z.object({ size: z.number().int().min(0).max(400) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Controlled vertical space.',
    inspector: [{ key: 'size', label: 'Size', control: 'number' }], renderTag: 'div', template: undefined,
  },
  {
    type: 'heading', displayName: 'Heading', category: 'content', isContainer: false,
    defaultProps: { text: 'New heading', level: 2 }, defaultStyle: { fontFamily: 'Manrope', fontSize: 48, fontWeight: '700' },
    propSchema: z.object({ text: z.string().min(1).max(500), level: z.number().int().min(1).max(6) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Semantic heading with editable level and text.',
    inspector: [{ key: 'text', label: 'Text', control: 'text' }, { key: 'level', label: 'Level', control: 'number' }],
    renderTag: 'h2', template: undefined,
  },
  {
    type: 'paragraph', displayName: 'Paragraph', category: 'content', isContainer: false,
    defaultProps: { text: 'New paragraph' }, defaultStyle: { fontFamily: 'Manrope', fontSize: 18 },
    propSchema: z.object({ text: z.string().min(1).max(5000) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Body text paragraph.',
    inspector: [{ key: 'text', label: 'Text', control: 'text' }], renderTag: 'p', template: undefined,
  },
  {
    type: 'image', displayName: 'Image', category: 'content', isContainer: false,
    defaultProps: { src: 'https://images.example.com/placeholder.png', alt: 'Placeholder image' }, defaultStyle: { width: 'full' },
    propSchema: imagePropsSchema, styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'HTTP(S) image with required alternative text.',
    inspector: [{ key: 'src', label: 'Image URL', control: 'url' }, { key: 'alt', label: 'Alternative text', control: 'text' }],
    renderTag: 'img', template: undefined,
  },
  {
    type: 'button', displayName: 'Button', category: 'content', isContainer: false,
    defaultProps: { text: 'Call to action', href: '#action' },
    defaultStyle: { backgroundColor: '#2563eb', color: '#ffffff', borderRadius: 8 },
    propSchema: buttonPropsSchema, styleSchema,
    allowedParents: [...contentParents, 'navbar'], allowedChildren: [], aiDescription: 'Call-to-action link rendered as a button.',
    inspector: [{ key: 'text', label: 'Label', control: 'text' }, { key: 'href', label: 'Destination', control: 'url' }],
    renderTag: 'a', template: undefined,
  },
  {
    type: 'link', displayName: 'Link', category: 'content', isContainer: false,
    defaultProps: { text: 'Link', href: '#link' }, defaultStyle: {},
    propSchema: linkPropsSchema, styleSchema,
    allowedParents: [...contentParents, 'navbar'], allowedChildren: [], aiDescription: 'Safe navigation link.',
    inspector: [{ key: 'text', label: 'Text', control: 'text' }, { key: 'href', label: 'Destination', control: 'url' }],
    renderTag: 'a', template: undefined,
  },
  {
    type: 'icon', displayName: 'Icon', category: 'content', isContainer: false,
    defaultProps: { name: 'star', label: 'Star' }, defaultStyle: {},
    propSchema: z.object({ name: z.enum(['arrow-right', 'check', 'menu', 'star']), label: z.string().min(1).max(100) }).strict(), styleSchema,
    allowedParents: [...contentParents, 'navbar'], allowedChildren: [], aiDescription: 'Accessible allowlisted icon.',
    inspector: [{ key: 'name', label: 'Icon', control: 'select', options: ['arrow-right', 'check', 'menu', 'star'] }],
    renderTag: 'span', template: undefined,
  },
  {
    type: 'badge', displayName: 'Badge', category: 'content', isContainer: false,
    defaultProps: { text: 'New' }, defaultStyle: { borderRadius: 20 },
    propSchema: z.object({ text: z.string().min(1).max(100) }).strict(), styleSchema,
    allowedParents: contentParents, allowedChildren: [], aiDescription: 'Short status badge.',
    inspector: [{ key: 'text', label: 'Text', control: 'text' }], renderTag: 'span', template: undefined,
  },
  {
    type: 'navbar', displayName: 'Navbar', category: 'composite', isContainer: true,
    defaultProps: { brand: 'ZenUI' }, defaultStyle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    propSchema: z.object({
      brand: z.string().min(1).max(100),
      hidden: z.boolean().optional(),
    }).strict(), styleSchema,
    allowedParents: ['page'], allowedChildren: ['container', 'stack', 'link', 'button', 'icon'],
    aiDescription: 'Top navigation composite.', inspector: [{ key: 'brand', label: 'Brand', control: 'text' }],
    renderTag: 'nav', template: navbarTemplate,
  },
  {
    type: 'hero', displayName: 'Hero', category: 'composite', isContainer: true,
    defaultProps: { label: 'Hero' }, defaultStyle: { paddingTop: 96, paddingBottom: 96 },
    propSchema: z.object({
      label: z.string().min(1).max(100),
      hidden: z.boolean().optional(),
    }).strict(), styleSchema,
    allowedParents: ['page'], allowedChildren: flowChildren,
    aiDescription: 'Landing page hero composite.', inspector: [], renderTag: 'section', template: heroTemplate,
  },
  {
    type: 'feature-card', displayName: 'Feature Card', category: 'composite', isContainer: true,
    defaultProps: { title: 'Feature', description: 'Describe the feature.' }, defaultStyle: { paddingTop: 24, paddingBottom: 24, borderRadius: 12 },
    propSchema: z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(1000),
      mediaSlot: z.enum(['hero-image', 'feature-1', 'feature-2', 'feature-3']).optional(),
    }).strict(), styleSchema,
    allowedParents: ['section', 'container', 'stack', 'column', 'hero', 'feature-card'],
    allowedChildren: ['container', 'stack', 'heading', 'paragraph', 'image', 'button', 'link', 'icon', 'badge', 'feature-card'],
    aiDescription: 'Feature summary composite card.', inspector: [], renderTag: 'article', template: featureCardTemplate,
  },
]

export const componentRegistry = Object.fromEntries(
  definitions.map(definition => [definition.type, definition]),
) as Record<ComponentType, ComponentDefinition>

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
        issues.push({
          code: 'invalid_parent_child',
          path: `nodes.${node.id}.children`,
          message: `${child.type} is not allowed inside ${node.type}`,
        })
      }
    }
  }
  return issues
}

function defaultNode(type: ComponentType, id: string, parentId: string): DesignNode {
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
  const preferredParent = definition.allowedParents.includes('container')
    ? 'container'
    : definition.allowedParents[0]
  if (!preferredParent) return document

  if (preferredParent === 'page') {
    document.nodes[id] = defaultNode(type, id, 'page-root')
    document.nodes['page-root']!.children.push(id)
    return document
  }
  if (preferredParent === 'container') {
    document.nodes[id] = defaultNode(type, id, 'container-1')
    document.nodes['container-1']!.children.push(id)
    return document
  }

  const parentId = `fixture-parent-${preferredParent}`
  document.nodes[parentId] = defaultNode(preferredParent, parentId, 'container-1')
  document.nodes['container-1']!.children.push(parentId)
  document.nodes[id] = defaultNode(type, id, parentId)
  document.nodes[parentId].children.push(id)
  return document
}

export const fontAllowlist = FONT_ALLOWLIST
