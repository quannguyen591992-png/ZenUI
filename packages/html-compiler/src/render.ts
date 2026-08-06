import {
  componentRegistry,
  validateRegistryRelationships,
} from '@zenui/component-registry'
import {
  findPageByRoute,
  validateDesignDocument,
  type DesignDocument,
  type RemoteImagePolicy,
  type DesignNode,
  type NodeStyle,
} from '@zenui/design-schema'

const styleOrder: readonly (keyof NodeStyle)[] = [
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'gridColumns', 'gridColumnSpan', 'gridRowSpan',
  'width', 'maxWidth', 'minHeight', 'aspectRatio', 'objectFit', 'objectPosition',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
  'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'shadow', 'opacity',
]

const cssNames: Record<keyof NodeStyle, string> = {
  display: 'display', flexDirection: 'flex-direction', justifyContent: 'justify-content',
  alignItems: 'align-items', gap: 'gap', gridColumns: 'grid-template-columns',
  gridColumnSpan: 'grid-column', gridRowSpan: 'grid-row',
  width: 'width', maxWidth: 'max-width', minHeight: 'min-height', aspectRatio: 'aspect-ratio',
  objectFit: 'object-fit', objectPosition: 'object-position',
  paddingTop: 'padding-top', paddingRight: 'padding-right', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left',
  marginTop: 'margin-top', marginRight: 'margin-right', marginBottom: 'margin-bottom', marginLeft: 'margin-left',
  fontFamily: 'font-family', fontSize: 'font-size', fontWeight: 'font-weight', lineHeight: 'line-height',
  letterSpacing: 'letter-spacing', textAlign: 'text-align', color: 'color', backgroundColor: 'background-color',
  borderColor: 'border-color', borderWidth: 'border-width', borderRadius: 'border-radius', shadow: 'box-shadow', opacity: 'opacity',
}

const browserStyleNames: Record<keyof NodeStyle, string> = {
  display: 'display', flexDirection: 'flexDirection', justifyContent: 'justifyContent',
  alignItems: 'alignItems', gap: 'gap', gridColumns: 'gridTemplateColumns',
  gridColumnSpan: 'gridColumn', gridRowSpan: 'gridRow',
  width: 'width', maxWidth: 'maxWidth', minHeight: 'minHeight', aspectRatio: 'aspectRatio',
  objectFit: 'objectFit', objectPosition: 'objectPosition',
  paddingTop: 'paddingTop', paddingRight: 'paddingRight', paddingBottom: 'paddingBottom', paddingLeft: 'paddingLeft',
  marginTop: 'marginTop', marginRight: 'marginRight', marginBottom: 'marginBottom', marginLeft: 'marginLeft',
  fontFamily: 'fontFamily', fontSize: 'fontSize', fontWeight: 'fontWeight', lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing', textAlign: 'textAlign', color: 'color', backgroundColor: 'backgroundColor',
  borderColor: 'borderColor', borderWidth: 'borderWidth', borderRadius: 'borderRadius', shadow: 'boxShadow', opacity: 'opacity',
}

export type RenderViewport = 'desktop' | 'tablet' | 'mobile'
export type BrowserNodeStyle = Record<string, string>

const semanticBrowserStyles: Partial<Record<DesignNode['type'], BrowserNodeStyle>> = {
  heading: { margin: '0' },
  paragraph: { margin: '0' },
  button: {
    color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '48px', padding: '12px 22px', fontWeight: '700', lineHeight: '1.2', textAlign: 'center', cursor: 'pointer',
  },
  link: { color: 'inherit', textDecoration: 'none' },
  badge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 'max-content', lineHeight: '1.2' },
  image: { display: 'block', maxWidth: '100%', height: 'auto', backgroundColor: '#e2e8f0' },
  container: { marginLeft: 'auto', marginRight: 'auto' },
}

export const RENDERER_SEMANTIC_CSS = [
  '[data-node-type="heading"]{margin:0}',
  '[data-node-type="paragraph"]{margin:0}',
  '[data-node-type="button"],[data-node-type="link"]{color:inherit;text-decoration:none}',
  '[data-node-type="image"]{display:block;max-width:100%;height:auto;background:#e2e8f0}',
  '[data-node-type="container"]{margin-left:auto;margin-right:auto}',
  '[data-node-type="button"]{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;font-weight:700;line-height:1.2;text-align:center;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}',
  '[data-node-type="button"]:hover{transform:translateY(-2px);opacity:.94}',
  '[data-node-type="button"]:focus-visible,[data-node-type="link"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}',
  '[data-node-type="link"]{transition:opacity .18s ease}[data-node-type="link"]:hover{opacity:.68}',
  '[data-node-type="badge"]{display:inline-flex;align-items:center;justify-content:center;width:max-content;line-height:1.2}',
  '[data-node-type="feature-card"]{transition:transform .2s ease,box-shadow .2s ease}[data-node-type="feature-card"]:hover{transform:translateY(-4px)}',
].join('')

const unitless = new Set<keyof NodeStyle>([
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'fontFamily', 'fontWeight',
  'lineHeight', 'textAlign', 'color', 'backgroundColor', 'borderColor', 'aspectRatio',
  'objectFit', 'objectPosition', 'opacity',
])
const shadows = {
  sm: '0 1px 2px rgba(15,23,42,.06)',
  md: '0 12px 32px rgba(15,23,42,.10)',
  lg: '0 24px 64px rgba(15,23,42,.16)',
} as const
const iconGlyphs = { 'arrow-right': '→', check: '✓', menu: '☰', star: '★' } as const

export interface RenderPlanNode {
  tag: string
  attributes: Record<string, string>
  text: string | null
  children: RenderPlanNode[]
}

export interface RenderPlan {
  document: DesignDocument
  root: RenderPlanNode
  css: string
}

export interface RenderAssetOptions {
  imagePolicy?: RemoteImagePolicy
  assetOrigin?: string
  portableAssetPaths?: Readonly<Record<string, string>>
  pageId?: string
  route?: string
  routePrefix?: string
}

export type RenderPlanResult =
  | { success: true; plan: RenderPlan; root: RenderPlanNode; css: string }
  | { success: false; code: 'invalid_document' | 'invalid_relationship' | 'route_not_found'; message: string }

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function resolveNodeTag(node: DesignNode): string {
  if (node.type === 'heading' && 'level' in node.props) return `h${node.props.level}`
  return componentRegistry[node.type].renderTag
}

function cssValue(key: keyof NodeStyle, value: NonNullable<NodeStyle[keyof NodeStyle]>): string {
  if (key === 'width') {
    if (value === 'full') return '100%'
    if (value === 'auto') return 'auto'
  }
  if (key === 'gridColumns' && typeof value === 'number') return `repeat(${value},minmax(0,1fr))`
  if ((key === 'gridColumnSpan' || key === 'gridRowSpan') && typeof value === 'number') return `span ${value}`
  if (key === 'aspectRatio' && typeof value === 'string') {
    return { square: '1/1', landscape: '4/3', wide: '16/9', portrait: '3/4' }[value] ?? value
  }
  if (key === 'shadow' && typeof value === 'string') return shadows[value as keyof typeof shadows]
  if (typeof value === 'number' && !unitless.has(key)) return `${value}px`
  return String(value)
}

export function resolveNodeStyle(node: DesignNode, viewport: RenderViewport = 'desktop'): NodeStyle {
  return viewport === 'desktop'
    ? node.style
    : { ...node.style, ...(node.responsive[viewport] ?? {}) }
}

export function nodeStyleToBrowserStyle(style: NodeStyle): BrowserNodeStyle {
  const result: BrowserNodeStyle = {}
  for (const key of styleOrder) {
    const value = style[key]
    if (value === undefined) continue
    result[browserStyleNames[key]] = cssValue(key, value)
  }
  if (style.borderWidth !== undefined && style.borderWidth > 0) result.borderStyle = 'solid'
  return result
}

export function isNodeHidden(node: DesignNode): boolean {
  return (node.type === 'navbar' || node.type === 'hero' || node.type === 'section')
    && 'hidden' in node.props
    && node.props.hidden === true
}

export function nodeToBrowserStyle(node: DesignNode, viewport: RenderViewport = 'desktop'): BrowserNodeStyle {
  const result = {
    ...(semanticBrowserStyles[node.type] ?? {}),
    ...nodeStyleToBrowserStyle(resolveNodeStyle(node, viewport)),
  }
  if (isNodeHidden(node)) result.display = 'none'
  if (node.type === 'spacer' && 'size' in node.props) result.height = `${node.props.size}px`
  return result
}

export function nodeStyleToCss(style: NodeStyle): string {
  return styleOrder
    .filter(key => style[key] !== undefined)
    .map(key => `${cssNames[key]}:${cssValue(key, style[key]!)}`)
    .join(';')
}

function assetUrl(options: RenderAssetOptions, assetId: string): string | null {
  const portablePath = options.portableAssetPaths?.[assetId]
  if (portablePath) return portablePath
  if (!options.assetOrigin) return null
  try { return `${new URL(options.assetOrigin).origin}/a/${assetId}` } catch { return null }
}

function pageHref(document: DesignDocument, pageId: string, fragment: string | undefined, prefix = ''): string | null {
  const page = document.pages.find(candidate => candidate.id === pageId)
  if (!page) return null
  const base = page.slug === '/' ? `${prefix || ''}/` : `${prefix || ''}${page.slug}`
  return fragment ? `${base}#${fragment}` : base
}

function nodeAttributes(document: DesignDocument, node: DesignNode, options: RenderAssetOptions): Record<string, string> {
  const attributes: Record<string, string> = { 'data-node-id': node.id, 'data-node-type': node.type }
  if (node.type === 'image' && 'alt' in node.props) {
    if ('src' in node.props) attributes.src = node.props.src
    if ('assetId' in node.props) {
      const resolved = assetUrl(options,node.props.assetId)
      if (resolved) attributes.src = resolved
    }
    attributes.alt = node.props.alt
    attributes.loading = 'lazy'
    attributes.referrerpolicy = 'no-referrer'
  }
  if (node.type === 'button' || node.type === 'link') {
    if ('href' in node.props) {
      attributes.href = node.props.href
      if (/^https?:/i.test(node.props.href)) attributes.rel = 'noreferrer noopener'
    } else if ('pageId' in node.props) {
      const resolved = pageHref(document, node.props.pageId, node.props.fragment, options.routePrefix)
      if (resolved) attributes.href = resolved
    }
  }
  if (node.type === 'icon' && 'label' in node.props && typeof node.props.label === 'string') {
    attributes['aria-label'] = node.props.label
  }
  if (node.type === 'spacer') attributes['aria-hidden'] = 'true'
  return attributes
}

function brandLogoChild(node: DesignNode, options: RenderAssetOptions): RenderPlanNode | null {
  if (node.type !== 'link' || !('logoAssetId' in node.props) || !node.props.logoAssetId || !node.props.logoAlt) return null
  const src = assetUrl(options,node.props.logoAssetId)
  if (!src) return null
  return {
    tag: 'img',
    attributes: {
      src,
      alt: node.props.logoAlt,
      loading: 'eager',
      referrerpolicy: 'no-referrer',
      'data-node-type': 'brand-logo',
    },
    text: null,
    children: [],
  }
}

function nodeText(node: DesignNode): string | null {
  if ((node.type === 'heading' || node.type === 'paragraph' || node.type === 'badge') && 'text' in node.props) return node.props.text
  if ((node.type === 'button' || node.type === 'link') && 'text' in node.props) return node.props.text
  if (node.type === 'icon' && 'name' in node.props) return iconGlyphs[node.props.name]
  return null
}

function renderPlanNode(document: DesignDocument, nodeId: string, options: RenderAssetOptions): RenderPlanNode {
  const node = document.nodes[nodeId]!
  const logo = brandLogoChild(node, options)
  return {
    tag: resolveNodeTag(node),
    attributes: nodeAttributes(document, node, options),
    text: logo ? null : nodeText(node),
    children: logo ? [logo] : node.children.flatMap(childId => {
      const child = document.nodes[childId]
      return child && !isNodeHidden(child) ? [renderPlanNode(document, childId, options)] : []
    }),
  }
}

function rule(node: DesignNode, style: NodeStyle): string {
  const spacer = node.type === 'spacer' && 'size' in node.props ? `height:${node.props.size}px` : ''
  const border = style.borderWidth !== undefined && style.borderWidth > 0 ? 'border-style:solid' : ''
  const declarations = [nodeStyleToCss(style), border, spacer].filter(Boolean).join(';')
  return declarations ? `[data-node-id="${node.id}"]{${declarations}}` : ''
}

function compileCss(document: DesignDocument): string {
  const visibleNodes = Object.values(document.nodes).filter(node => !isNodeHidden(node))
  const base = visibleNodes.map(node => rule(node, node.style)).join('')
  const tablet = visibleNodes.map(node => rule(node, node.responsive.tablet ?? {})).join('')
  const mobile = visibleNodes.map(node => rule(node, node.responsive.mobile ?? {})).join('')
  const tabletRules = tablet ? `html[data-viewport="tablet"] ${tablet.replaceAll('}[', '}html[data-viewport="tablet"] [')}` : ''
  const mobileRules = mobile ? `html[data-viewport="mobile"] ${mobile.replaceAll('}[', '}html[data-viewport="mobile"] [')}` : ''
  return [
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    `body{margin:0;background:${document.theme.colors.background};color:${document.theme.colors.text};font-family:${document.theme.fonts.body},sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}`,
    RENDERER_SEMANTIC_CSS,
    base,
    tabletRules,
    mobileRules,
    tablet ? `@media(max-width:1024px){${tablet}}` : '',
    mobile ? `@media(max-width:640px){${mobile}}` : '',
  ].join('')
}

export function buildRenderPlan(
  input: unknown,
  options: RenderAssetOptions = {},
): RenderPlanResult {
  const validation = validateDesignDocument(input, options)
  if (!validation.success) {
    return { success: false, code: 'invalid_document', message: validation.issues[0]?.message ?? 'Document is invalid' }
  }
  const relationships = validateRegistryRelationships(validation.data)
  if (relationships.length > 0) {
    return { success: false, code: 'invalid_relationship', message: relationships[0]?.message ?? 'Document relationships are invalid' }
  }
  const document = validation.data
  const page = options.pageId
    ? document.pages.find(candidate => candidate.id === options.pageId)
    : options.route
      ? findPageByRoute(document, options.route)
      : document.pages[0]
  if (!page) return { success: false, code: 'route_not_found', message: 'Page route does not exist' }
  const root = renderPlanNode(document, page.rootNodeId, options)
  const css = compileCss(document)
  return { success: true, plan: { document, root, css }, root, css }
}
