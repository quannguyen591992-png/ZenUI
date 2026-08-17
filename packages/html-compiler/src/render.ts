import {
  componentRegistry,
  validateRegistryRelationships,
} from '@zenui/component-registry'
import {
  ICON_PATHS,
  findPageByRoute,
  validateDesignDocument,
  type DesignDocument,
  type ConversionAction,
  type RemoteImagePolicy,
  type DesignNode,
  type LeadFormField,
  type LeadFormProps,
  type NodeStyle,
} from '@zenui/design-schema'
import {
  fontFaceCss,
  themeFontFamily,
  type FontSubsetPaths,
} from '@zenui/font-library'

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
  icon: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', lineHeight: '1' },
  image: { display: 'block', maxWidth: '100%', height: 'auto', backgroundColor: '#e2e8f0' },
  container: { marginLeft: 'auto', marginRight: 'auto' },
  'lead-form': { display: 'grid', gap: '16px', width: '100%' },
}

const renderRootSelector = '[data-zenui-render-root]'

export const RENDERER_SEMANTIC_CSS = [
  `${renderRootSelector} [data-node-type="heading"]{margin:0}`,
  `${renderRootSelector} [data-node-type="paragraph"]{margin:0}`,
  `${renderRootSelector} [data-node-type="button"],${renderRootSelector} [data-node-type="link"]{color:inherit;text-decoration:none}`,
  `${renderRootSelector} [data-node-type="image"]{display:block;max-width:100%;height:auto;background:#e2e8f0}`,
  `${renderRootSelector} [data-node-type="container"]{margin-left:auto;margin-right:auto}`,
  `${renderRootSelector} [data-node-type="button"]{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;font-weight:700;line-height:1.2;text-align:center;cursor:pointer}`,
  `${renderRootSelector} [data-node-type="button"]:focus-visible,${renderRootSelector} [data-node-type="link"]:focus-visible{outline:3px solid currentColor;outline-offset:3px}`,
  `${renderRootSelector} [data-node-type="badge"]{display:inline-flex;align-items:center;justify-content:center;width:max-content;line-height:1.2}`,
  `${renderRootSelector} [data-node-type="icon"]{display:inline-flex;align-items:center;justify-content:center;font-size:24px;line-height:1}`,
  `${renderRootSelector} [data-node-type="lead-form"]{display:grid;gap:16px;width:100%}`,
  `${renderRootSelector} [data-lead-form-field]{display:grid;gap:6px}`,
  `${renderRootSelector} [data-node-type="lead-form"] label{font-weight:600}`,
  `${renderRootSelector} [data-node-type="lead-form"] input:not([type="checkbox"]),${renderRootSelector} [data-node-type="lead-form"] textarea,${renderRootSelector} [data-node-type="lead-form"] select{width:100%;min-height:48px;padding:10px 12px;border:1px solid #94a3b8;border-radius:8px;background:transparent;color:inherit;font:inherit}`,
  `${renderRootSelector} [data-node-type="lead-form"] textarea{min-height:112px;resize:vertical}`,
  `${renderRootSelector} [data-node-type="lead-form"] [type="checkbox"]{width:20px;height:20px}`,
  `${renderRootSelector} [data-lead-form-consent]{display:flex;align-items:flex-start;gap:10px}`,
  `${renderRootSelector} [data-node-type="lead-form"] button{min-height:48px;padding:12px 22px;border:0;border-radius:8px;color:#fff;background:#344054;cursor:pointer}`,
  `${renderRootSelector} [data-node-type="lead-form"] input:focus-visible,${renderRootSelector} [data-node-type="lead-form"] textarea:focus-visible,${renderRootSelector} [data-node-type="lead-form"] select:focus-visible,${renderRootSelector} [data-node-type="lead-form"] button:focus-visible{outline:3px solid currentColor;outline-offset:3px}`,
  `${renderRootSelector} [data-lead-form-notice]{margin:0;font-size:14px}`,
].join('')

export type PresentationProfile = NonNullable<DesignDocument['theme']['presentation']>['profile']

export function resolvePresentationProfile(document: DesignDocument): PresentationProfile {
  return document.theme.presentation?.profile ?? 'refined'
}

const presentationProfileCss: Record<PresentationProfile, string> = {
  refined: [
    '@keyframes zenui-refined-reveal{from{opacity:.001;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}',
    '[data-zenui-render-root][data-visual-profile="refined"]>[data-node-type="section"]{animation:zenui-refined-reveal .7s ease-out both}',
  ].join(''),
  dynamic: [
    '@keyframes zenui-dynamic-reveal{from{opacity:.001;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
    '@keyframes zenui-dynamic-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}',
    '[data-zenui-render-root][data-visual-profile="dynamic"]>[data-node-type="section"]{animation:zenui-dynamic-reveal .76s cubic-bezier(.2,.7,.2,1) both}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] #features-section{animation-delay:.08s}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] #testimonials-section{animation-delay:.16s}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] #final-cta-section{animation-delay:.24s}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] [data-node-type="hero"]{position:relative;isolation:isolate}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] [data-node-type="hero"]::before{position:absolute;inset:8% 6% auto auto;z-index:-1;width:min(28vw,360px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,currentColor 0,transparent 68%);content:"";opacity:.32;pointer-events:none;transform:scale(1.025)}',
    '[data-zenui-render-root][data-visual-profile="dynamic"] [data-node-type="hero"] [data-node-type="image"]{animation:zenui-dynamic-float 6s ease-in-out infinite}',
  ].join(''),
  editorial: [
    '@keyframes zenui-editorial-reveal{from{opacity:.001;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}',
    '[data-zenui-render-root][data-visual-profile="editorial"]>[data-node-type="section"]{animation:zenui-editorial-reveal .86s cubic-bezier(.22,.61,.36,1) both}',
    '[data-zenui-render-root][data-visual-profile="editorial"] [data-node-type="divider"]{opacity:.72}',
    '[data-zenui-render-root][data-visual-profile="editorial"] [data-node-type="heading"]{text-wrap:balance}',
  ].join(''),
}

export function rendererPresentationCss(document: DesignDocument): string {
  const profile = resolvePresentationProfile(document)
  return [
    RENDERER_SEMANTIC_CSS,
    `${renderRootSelector} [data-node-type="button"]{transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease}`,
    `${renderRootSelector} [data-node-type="button"]:active{transform:translateY(0) scale(.985)}`,
    `${renderRootSelector} [data-node-type="link"]{position:relative;transition:opacity .18s ease}`,
    `${renderRootSelector} [data-node-type="link"]::after{position:absolute;right:0;bottom:-.18em;left:0;height:2px;background:currentColor;content:"";transform:scaleX(0);transform-origin:right;transition:transform .2s ease}`,
    `${renderRootSelector} [data-node-type="feature-card"]{transition:transform .22s ease,box-shadow .22s ease}`,
    `${renderRootSelector} [data-node-type="image"]{transition:transform .24s ease,box-shadow .24s ease}`,
    `${renderRootSelector} [data-node-type="lead-form"] input:not([type="checkbox"]),${renderRootSelector} [data-node-type="lead-form"] textarea,${renderRootSelector} [data-node-type="lead-form"] select{transition:border-color .18s ease,box-shadow .18s ease}`,
    `@media(hover:hover) and (pointer:fine){${renderRootSelector} [data-node-type="button"]:hover{transform:translateY(-2px);opacity:.94}${renderRootSelector} [data-node-type="link"]:hover{opacity:.78}${renderRootSelector} [data-node-type="link"]:hover::after{transform:scaleX(1);transform-origin:left}${renderRootSelector} [data-node-type="feature-card"]:hover{transform:translateY(-4px)}${renderRootSelector} [data-node-type="image"]:hover{transform:scale(1.018)}}`,
    presentationProfileCss[profile],
    '@media(hover:none),(pointer:coarse){[data-zenui-render-root] *,[data-zenui-render-root] *::before,[data-zenui-render-root] *::after{animation:none!important;transform:none!important}}',
    '@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}[data-zenui-render-root] *,[data-zenui-render-root] *::before,[data-zenui-render-root] *::after{animation:none!important;transition:none!important;transform:none!important}}',
  ].join('')
}

const unitless = new Set<keyof NodeStyle>([
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'fontFamily', 'fontWeight',
  'lineHeight', 'textAlign', 'color', 'backgroundColor', 'borderColor', 'aspectRatio',
  'objectFit', 'objectPosition', 'opacity',
])
const shadows = {
  xs: '0 1px 2px rgba(15,23,42,.04)',
  sm: '0 1px 2px rgba(15,23,42,.06)',
  md: '0 12px 32px rgba(15,23,42,.10)',
  lg: '0 24px 64px rgba(15,23,42,.16)',
  xl: '0 32px 80px rgba(15,23,42,.22)',
} as const
const iconStrokeAttributes = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.8',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
  focusable: 'false',
} as const

export function iconSvgChild(node: DesignNode): RenderPlanNode | null {
  if (node.type !== 'icon' || !('name' in node.props)) return null
  return {
    tag: 'svg',
    attributes: { ...iconStrokeAttributes, width: '1em', height: '1em' },
    text: null,
    children: ICON_PATHS[node.props.name].map(d => ({
      tag: 'path',
      attributes: { d },
      text: null,
      children: [],
    })),
  }
}

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

export interface LiveLeadFormBinding {
  action: string
  requestId?: string
  pageRoute: string
}

export interface LiveLeadFormOptions {
  origin: string
  bindings: Readonly<Record<string, LiveLeadFormBinding>>
}

export interface RenderAssetOptions {
  imagePolicy?: RemoteImagePolicy
  assetOrigin?: string
  portableAssetPaths?: Readonly<Record<string, string>>
  portableFontPaths?: Readonly<Record<string, FontSubsetPaths>>
  pageId?: string
  route?: string
  routePrefix?: string
  liveLeadForms?: LiveLeadFormOptions
  currentPageRoute?: string
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

export function conversionActionHref(
  document: DesignDocument,
  action: ConversionAction,
  routePrefix = '',
): string | null {
  switch (action.type) {
    case 'lead_form': return `#${action.formNodeId}`
    case 'internal_page': return pageHref(document, action.pageId, action.fragment, routePrefix)
    case 'external_url': return action.url
    case 'email': return `mailto:${action.address}`
    case 'phone': return `tel:${action.number.replaceAll(/\s+/g, '')}`
  }
}

function nodeAttributes(document: DesignDocument, node: DesignNode, options: RenderAssetOptions): Record<string, string> {
  const attributes: Record<string, string> = { id: node.id, 'data-node-id': node.id, 'data-node-type': node.type }
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
    } else if ('action' in node.props) {
      const resolved = conversionActionHref(document, node.props.action, options.routePrefix)
      if (resolved) {
        attributes.href = resolved
        if (node.props.action.type === 'external_url') attributes.rel = 'noreferrer noopener'
      }
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
  if (node.type === 'icon' && 'name' in node.props) return null
  return null
}

function textPlan(tag: string, text: string, attributes: Record<string, string> = {}): RenderPlanNode {
  return { tag, attributes, text, children: [] }
}

function leadFormControl(nodeId: string, field: LeadFormField): RenderPlanNode {
  const id = `${nodeId}-${field.key}`
  const required = field.required ? { required: '' } : {}
  const common = {
    id,
    name: field.key,
    ...required,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  }
  let control: RenderPlanNode
  if (field.type === 'textarea') {
    control = { tag: 'textarea', attributes: common, text: null, children: [] }
  } else if (field.type === 'select') {
    control = {
      tag: 'select',
      attributes: common,
      text: null,
      children: field.options.map(option => textPlan('option', option.label, { value: option.value })),
    }
  } else {
    control = { tag: 'input', attributes: { ...common, type: field.type }, text: null, children: [] }
  }
  return {
    tag: 'div',
    attributes: { 'data-lead-form-field': field.key },
    text: null,
    children: [textPlan('label', field.label, { for: id }), control],
  }
}

function hiddenLeadInput(name: string, value: string): RenderPlanNode {
  return {
    tag: 'input',
    attributes: { name, type: 'hidden', value },
    text: null,
    children: [],
  }
}

function leadFormPlan(
  node: DesignNode & { type: 'lead-form'; props: LeadFormProps },
  options: RenderAssetOptions,
): RenderPlanNode {
  const titleId = `${node.id}-title`
  const descriptionId = `${node.id}-description`
  const previewNoticeId = `${node.id}-preview-notice`
  const exportNoticeId = `${node.id}-export-notice`
  const privacyNoticeId = `${node.id}-privacy-notice`
  const binding = options.liveLeadForms?.bindings[node.id]
  const live = binding?.pageRoute === options.currentPageRoute ? binding : undefined
  const describedBy = [
    node.props.description ? descriptionId : null,
    live ? privacyNoticeId : previewNoticeId,
    live ? null : exportNoticeId,
  ].filter(Boolean).join(' ')
  const children: RenderPlanNode[] = [textPlan('h2', node.props.title, { id: titleId })]
  if (node.props.description) children.push(textPlan('p', node.props.description, { id: descriptionId }))
  if (live) {
    if (live.requestId) {
      children.push(
        hiddenLeadInput('__zenui_request_id', live.requestId),
      )
    }
    children.push(
      hiddenLeadInput('__zenui_form_node_id', node.id),
      hiddenLeadInput('__zenui_page_route', live.pageRoute),
    )
  }
  children.push(...node.props.fields.map(field => leadFormControl(node.id, field)))
  if (node.props.consent) {
    const consentId = `${node.id}-consent`
    children.push({
      tag: 'div',
      attributes: { 'data-lead-form-consent': '' },
      text: null,
      children: [
        {
          tag: 'input',
          attributes: { id: consentId, name: 'consent', type: 'checkbox', ...(node.props.consent.required ? { required: '' } : {}) },
          text: null,
          children: [],
        },
        textPlan('label', node.props.consent.label, { for: consentId }),
      ],
    })
  }
  children.push(textPlan('button', node.props.submitLabel, { type: 'submit' }))
  if (live) {
    children.push(textPlan(
      'p',
      'Dữ liệu được ZenUI lưu tối đa 90 ngày để chủ website liên hệ lại.',
      { id: privacyNoticeId, 'data-lead-form-notice': 'privacy' },
    ))
  } else {
    children.push(textPlan('p', 'Bản xem trước — chưa gửi dữ liệu', { id: previewNoticeId, 'data-lead-form-notice': 'preview' }))
    children.push(textPlan('p', 'Form ZenUI không hoạt động trong bản tải xuống.', { id: exportNoticeId, 'data-lead-form-notice': 'export' }))
  }
  return {
    tag: 'form',
    attributes: {
      id: node.id,
      'data-node-id': node.id,
      'data-node-type': node.type,
      ...(live ? { action: live.action, method: 'post' } : {}),
      'aria-labelledby': titleId,
      ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    },
    text: null,
    children,
  }
}

function renderPlanNode(document: DesignDocument, nodeId: string, options: RenderAssetOptions): RenderPlanNode {
  const node = document.nodes[nodeId]!
  if (node.type === 'lead-form' && 'fields' in node.props) {
    return leadFormPlan(
      node as DesignNode & { type: 'lead-form'; props: LeadFormProps },
      options,
    )
  }
  const synthetic = brandLogoChild(node, options) ?? iconSvgChild(node)
  return {
    tag: resolveNodeTag(node),
    attributes: nodeAttributes(document, node, options),
    text: synthetic ? null : nodeText(node),
    children: synthetic ? [synthetic] : node.children.flatMap(childId => {
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

function fontCss(document: DesignDocument, options: RenderAssetOptions): string {
  if (options.portableFontPaths) {
    return fontFaceCss(document.theme, fontId => options.portableFontPaths?.[fontId] ?? {
      latin: '', vietnamese: '',
    })
  }
  if (options.portableAssetPaths || !options.assetOrigin) return ''
  let origin: string
  try { origin = new URL(options.assetOrigin).origin } catch { return '' }
  return fontFaceCss(document.theme, fontId => ({
    latin: `${origin}/f/${fontId}/latin.woff2`,
    vietnamese: `${origin}/f/${fontId}/vietnamese.woff2`,
  }))
}

function compileCss(document: DesignDocument, options: RenderAssetOptions): string {
  const visibleNodes = Object.values(document.nodes).filter(node => !isNodeHidden(node))
  const base = visibleNodes.map(node => rule(node, node.style)).join('')
  const tablet = visibleNodes.map(node => rule(node, node.responsive.tablet ?? {})).join('')
  const mobile = visibleNodes.map(node => rule(node, node.responsive.mobile ?? {})).join('')
  const tabletRules = tablet ? `html[data-viewport="tablet"] ${tablet.replaceAll('}[', '}html[data-viewport="tablet"] [')}` : ''
  const mobileRules = mobile ? `html[data-viewport="mobile"] ${mobile.replaceAll('}[', '}html[data-viewport="mobile"] [')}` : ''
  return [
    fontCss(document, options),
    '*{box-sizing:border-box}',
    'html{scroll-behavior:smooth}',
    '[data-node-id]{scroll-margin-top:96px}',
    '@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}',
    `body{margin:0;background:${document.theme.colors.background};color:${document.theme.colors.text};font-family:${themeFontFamily(document.theme.fonts.body)};-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}`,
    `${renderRootSelector} [data-node-type="heading"]{font-family:${themeFontFamily(document.theme.fonts.heading)}}`,
    rendererPresentationCss(document),
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
  root.attributes['data-zenui-render-root'] = ''
  root.attributes['data-visual-profile'] = resolvePresentationProfile(document)
  const css = compileCss(document, options)
  return { success: true, plan: { document, root, css }, root, css }
}
