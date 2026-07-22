import { componentRegistry } from '@zenui/component-registry'
import {
  validateDesignDocument,
  type DesignDocument,
  type DesignNode,
  type NodeStyle,
} from '@zenui/design-schema'

const styleOrder: readonly (keyof NodeStyle)[] = [
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'width', 'maxWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign',
  'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderRadius', 'opacity',
]

const cssNames: Record<keyof NodeStyle, string> = {
  display: 'display',
  flexDirection: 'flex-direction',
  justifyContent: 'justify-content',
  alignItems: 'align-items',
  gap: 'gap',
  width: 'width',
  maxWidth: 'max-width',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  marginTop: 'margin-top',
  marginRight: 'margin-right',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  textAlign: 'text-align',
  color: 'color',
  backgroundColor: 'background-color',
  borderColor: 'border-color',
  borderWidth: 'border-width',
  borderRadius: 'border-radius',
  opacity: 'opacity',
}

const unitless = new Set<keyof NodeStyle>([
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'fontFamily', 'fontWeight',
  'lineHeight', 'textAlign', 'color', 'backgroundColor', 'borderColor', 'opacity',
])

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
  if (typeof value === 'number' && !unitless.has(key)) return `${value}px`
  return String(value)
}

export function nodeStyleToCss(style: NodeStyle): string {
  return styleOrder
    .filter(key => style[key] !== undefined)
    .map(key => `${cssNames[key]}:${cssValue(key, style[key]!)}`)
    .join(';')
}

const iconGlyphs = {
  'arrow-right': '→',
  check: '✓',
  menu: '☰',
  star: '★',
} as const

function responsiveCss(document: DesignDocument, breakpoint: 'tablet' | 'mobile'): string {
  return Object.values(document.nodes)
    .filter(node => node.responsive[breakpoint] !== undefined)
    .map(node => `[data-node-id="${escapeHtml(node.id)}"]{${nodeStyleToCss(node.responsive[breakpoint]!)}}`)
    .join('')
}

function renderNode(document: DesignDocument, nodeId: string): string {
  const node = document.nodes[nodeId]!
  const tag = resolveNodeTag(node)
  const style = nodeStyleToCss(node.style)
  const attributes = [`data-node-id="${escapeHtml(node.id)}"`]
  if (style) attributes.push(`style="${escapeHtml(style)}"`)

  if (node.type === 'image' && 'src' in node.props && 'alt' in node.props) {
    attributes.push(`src="${escapeHtml(node.props.src)}"`, `alt="${escapeHtml(node.props.alt)}"`)
    return `<img ${attributes.join(' ')}>`
  }

  if ((node.type === 'button' || node.type === 'link') && 'href' in node.props && 'text' in node.props) {
    attributes.push(`href="${escapeHtml(node.props.href)}"`)
    return `<${tag} ${attributes.join(' ')}>${escapeHtml(node.props.text)}</${tag}>`
  }
  if (node.type === 'icon' && 'name' in node.props && 'label' in node.props) {
    attributes.push(`aria-label="${escapeHtml(node.props.label)}"`)
    return `<${tag} ${attributes.join(' ')}>${iconGlyphs[node.props.name]}</${tag}>`
  }
  if (node.type === 'spacer' && 'size' in node.props) {
    attributes.push(`aria-hidden="true"`)
    const spacerStyle = [style, `height:${node.props.size}px`].filter(Boolean).join(';')
    const styleIndex = attributes.findIndex(attribute => attribute.startsWith('style='))
    if (styleIndex >= 0) attributes[styleIndex] = `style="${escapeHtml(spacerStyle)}"`
    else attributes.push(`style="${escapeHtml(spacerStyle)}"`)
    return `<${tag} ${attributes.join(' ')}></${tag}>`
  }

  const content = (node.type === 'heading' || node.type === 'paragraph' || node.type === 'badge') && 'text' in node.props
    ? escapeHtml(node.props.text)
    : node.children.map(childId => renderNode(document, childId)).join('')
  return `<${tag} ${attributes.join(' ')}>${content}</${tag}>`
}

export type CompileResult =
  | { success: true; html: string }
  | { success: false; code: 'invalid_document'; message: string }

export function compileStandaloneHtml(input: unknown): CompileResult {
  const validation = validateDesignDocument(input)
  if (!validation.success) {
    return {
      success: false,
      code: 'invalid_document',
      message: validation.issues[0]?.message ?? 'Document is invalid',
    }
  }
  const document = validation.data
  const rootNodeId = document.pages[0]!.rootNodeId
  const body = renderNode(document, rootNodeId)
  const tablet = responsiveCss(document, 'tablet')
  const mobile = responsiveCss(document, 'mobile')
  const responsive = `${tablet ? `@media(max-width:1024px){${tablet}}` : ''}${mobile ? `@media(max-width:640px){${mobile}}` : ''}`
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>ZenUI Export</title>\n<style>*{box-sizing:border-box}body{margin:0;background:${document.theme.colors.background};color:${document.theme.colors.text};font-family:${document.theme.fonts.body},sans-serif}img{max-width:100%;height:auto}${responsive}</style>\n</head>\n<body>${body}</body>\n</html>\n`
  return { success: true, html }
}
