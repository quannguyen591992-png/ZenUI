import { z } from 'zod'

export const DESIGN_LIMITS = {
  maxNodes: 500,
  maxDepth: 12,
  maxSerializedBytes: 1024 * 1024,
  maxPages: 20,
  maxNavigationItems: 20,
  maxPageSlugLength: 80,
  maxPageSlugSegments: 4,
  maxCompiledFiles: 20,
  maxCompiledFileBytes: 2 * 1024 * 1024,
  maxCompiledSiteBytes: 8 * 1024 * 1024,
  maxExportZipBytes: 10 * 1024 * 1024,
  maxLeadForms: 10,
  maxLeadFormFields: 12,
  maxLeadFieldKeyLength: 64,
  maxLeadFormTitleLength: 160,
  maxLeadFormCopyLength: 500,
  maxLeadFieldLabelLength: 120,
  maxLeadFieldPlaceholderLength: 160,
  maxLeadSelectOptions: 20,
  maxLeadSelectOptionLength: 120,
} as const

const RESERVED_PAGE_SEGMENTS = new Set([
  'api', '_next', 'a', 's', 'projects', 'integrations',
  'favicon.ico', 'robots.txt', 'sitemap.xml',
])

export type NormalizePageSlugResult =
  | { success: true; slug: string }
  | { success: false; code: 'invalid_page_slug' | 'reserved_page_slug' | 'page_slug_too_long' }

export function normalizePageSlug(input: string): NormalizePageSlugResult {
  const value = input.trim()
  if (!value || value === '/') return { success: true, slug: '/' }
  if (
    [...value].some(character => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f
    })
    || /[\\?#%]/.test(value)
    || value.includes('//')
  ) return { success: false, code: 'invalid_page_slug' }
  const rawSegments = value.replace(/^\/+|\/+$/g, '').split('/')
  if (rawSegments.some(segment => RESERVED_PAGE_SEGMENTS.has(segment.toLowerCase()))) {
    return { success: false, code: 'reserved_page_slug' }
  }
  if (
    rawSegments.length === 0
    || rawSegments.length > DESIGN_LIMITS.maxPageSlugSegments
    || rawSegments.some(segment => !segment || segment === '.' || segment === '..')
  ) return { success: false, code: 'invalid_page_slug' }
  const segments = rawSegments.map(segment => segment
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-'))
  if (segments.some(segment => !segment)) return { success: false, code: 'invalid_page_slug' }
  if (segments.some(segment => RESERVED_PAGE_SEGMENTS.has(segment))) {
    return { success: false, code: 'reserved_page_slug' }
  }
  const slug = `/${segments.join('/')}`
  return slug.length > DESIGN_LIMITS.maxPageSlugLength
    ? { success: false, code: 'page_slug_too_long' }
    : { success: true, slug }
}

export const COMPONENT_TYPES = [
  'page',
  'section',
  'container',
  'stack',
  'columns',
  'column',
  'divider',
  'spacer',
  'heading',
  'paragraph',
  'image',
  'button',
  'link',
  'icon',
  'badge',
  'navbar',
  'hero',
  'feature-card',
  'lead-form',
] as const

export const FONT_ALLOWLIST = ['Arial', 'Georgia', 'Manrope', 'system-ui'] as const
export const ICON_ALLOWLIST = [
  'arrow-right', 'check', 'menu', 'star',
  'shield', 'sparkles', 'clock', 'chart', 'users', 'mail', 'phone', 'play',
  'zap', 'heart', 'globe', 'lock', 'search', 'settings', 'calendar', 'download',
  'layers', 'target',
] as const

export type IconName = (typeof ICON_ALLOWLIST)[number]

/**
 * Server-owned outline paths on a 24x24 grid. These are compile-time constants:
 * neither the AI provider nor the browser can contribute or override path data.
 */
export const ICON_PATHS: Record<IconName, readonly string[]> = {
  'arrow-right': ['M5 12 h14', 'M13 5 l7 7 l-7 7'],
  check: ['M20 6 L9 17 L4 12'],
  menu: ['M4 6 h16', 'M4 12 h16', 'M4 18 h16'],
  star: ['M12 3 l2.8 5.7 l6.2 0.9 l-4.5 4.4 l1.1 6.2 l-5.6 -2.9 l-5.6 2.9 l1.1 -6.2 l-4.5 -4.4 l6.2 -0.9 Z'],
  shield: ['M12 3 l7.5 3 v5.5 c0 4.6 -3.1 8.2 -7.5 9.5 c-4.4 -1.3 -7.5 -4.9 -7.5 -9.5 V6 Z', 'M9 12 l2.2 2.2 l4 -4.4'],
  sparkles: ['M12 3 l1.9 4.6 l4.6 1.9 l-4.6 1.9 l-1.9 4.6 l-1.9 -4.6 l-4.6 -1.9 l4.6 -1.9 Z', 'M18.5 16 l0.9 2.1 l2.1 0.9 l-2.1 0.9 l-0.9 2.1 l-0.9 -2.1 l-2.1 -0.9 l2.1 -0.9 Z'],
  clock: ['M12 3 a9 9 0 1 0 0.1 0 Z', 'M12 7 v5.4 l3.6 2.1'],
  chart: ['M4 20 h16', 'M7 20 v-6', 'M12 20 v-11', 'M17 20 v-8'],
  users: ['M9 11 a3.6 3.6 0 1 0 0.1 0 Z', 'M3 20 c0 -3.4 2.7 -5.6 6 -5.6 c3.3 0 6 2.2 6 5.6', 'M16.5 5.4 a3.2 3.2 0 0 1 0 6.2', 'M17.5 14.8 c2.1 0.7 3.5 2.6 3.5 5.2'],
  mail: ['M3 6 h18 v12 h-18 Z', 'M3 7 l9 6.4 l9 -6.4'],
  phone: ['M6.5 3 h3.4 l1.7 4.2 l-2.3 1.6 c1 2.2 2.7 3.9 4.9 4.9 l1.6 -2.3 l4.2 1.7 v3.4 c0 1.1 -0.9 2 -2 2 C11.4 18.5 5.5 12.6 4.5 5 c0 -1.1 0.9 -2 2 -2 Z'],
  play: ['M9 6 l9 6 l-9 6 Z'],
  zap: ['M13.5 2 L5 13.5 h5.5 L9.5 22 L19 10.5 h-5.5 Z'],
  heart: ['M12 20.5 C6 16.6 3 13.4 3 9.8 C3 7 5.1 5 7.7 5 c1.7 0 3.3 0.9 4.3 2.4 C13 5.9 14.6 5 16.3 5 C18.9 5 21 7 21 9.8 c0 3.6 -3 6.8 -9 10.7 Z'],
  globe: ['M12 3 a9 9 0 1 0 0.1 0 Z', 'M3 12 h18', 'M12 3 c2.6 2.6 3.9 5.6 3.9 9 c0 3.4 -1.3 6.4 -3.9 9 c-2.6 -2.6 -3.9 -5.6 -3.9 -9 c0 -3.4 1.3 -6.4 3.9 -9 Z'],
  lock: ['M5 11 h14 v10 h-14 Z', 'M8.2 11 V7.6 a3.8 3.8 0 0 1 7.6 0 V11'],
  search: ['M11 4 a7 7 0 1 0 0.1 0 Z', 'M16.2 16.2 L21 21'],
  settings: ['M12 8.4 a3.6 3.6 0 1 0 0.1 0 Z', 'M12 2.5 l1.6 2.3 l2.8 -0.5 l0.7 2.7 l2.6 1.1 l-0.9 2.7 l1.8 2.2 l-1.8 2.2 l0.9 2.7 l-2.6 1.1 l-0.7 2.7 l-2.8 -0.5 L12 21.5 l-1.6 -2.3 l-2.8 0.5 l-0.7 -2.7 l-2.6 -1.1 l0.9 -2.7 L3.4 11 l1.8 -2.2 l-0.9 -2.7 l2.6 -1.1 l0.7 -2.7 l2.8 0.5 Z'],
  calendar: ['M4 6 h16 v15 h-16 Z', 'M4 11 h16', 'M8 3 v4', 'M16 3 v4'],
  download: ['M12 4 v11', 'M7.5 10.5 L12 15 l4.5 -4.5', 'M4 20 h16'],
  layers: ['M12 3 l9 4.6 l-9 4.6 l-9 -4.6 Z', 'M3 12.4 l9 4.6 l9 -4.6', 'M3 16.9 l9 4.6 l9 -4.6'],
  target: ['M12 3 a9 9 0 1 0 0.1 0 Z', 'M12 7.5 a4.5 4.5 0 1 0 0.1 0 Z', 'M12 11 a1 1 0 1 0 0.1 0 Z'],
}

const nodeIdSchema = z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
export const assetIdSchema = z.string().uuid()
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const safeImageUrlSchema = z.string().url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:'
    && !url.username
    && !url.password
    && !url.port
    && url.hostname !== 'localhost'
    && !/^\[.*\]$/.test(url.hostname)
    && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
}, 'Image URL must use public HTTPS without credentials or a custom port')

export interface RemoteImagePolicy {
  sources: string[]
  allows(value: string): boolean
}

function normalizeImageHost(value: string): { host: string; subdomains: boolean } {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '')
  const subdomains = trimmed.startsWith('*.')
  const host = subdomains ? trimmed.slice(2) : trimmed
  if (!host
    || host === 'localhost'
    || host.includes('/')
    || host.includes(':')
    || host.includes('@')
    || host.startsWith('.')
    || host.endsWith('.')
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
    || !host.includes('.')
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    throw new Error('invalid_image_host')
  }
  return { host: new URL(`https://${host}`).hostname.toLowerCase().replace(/\.$/, ''), subdomains }
}

export function createRemoteImagePolicy(input: string): RemoteImagePolicy {
  if (!input.trim()) throw new Error('REMOTE_IMAGE_HOST_ALLOWLIST is required')
  const entries = input.split(',').map(normalizeImageHost)
  const keys = entries.map(entry => `${entry.subdomains ? '*.' : ''}${entry.host}`)
  if (new Set(keys).size !== keys.length) throw new Error('duplicate_image_host')
  const sorted = [...entries].sort((left, right) => `${left.subdomains ? '*.' : ''}${left.host}`.localeCompare(`${right.subdomains ? '*.' : ''}${right.host}`))
  return {
    sources: sorted.map(entry => `https://${entry.subdomains ? '*.' : ''}${entry.host}`),
    allows(value: string): boolean {
      const parsed = safeImageUrlSchema.safeParse(value)
      if (!parsed.success) return false
      const hostname = new URL(parsed.data).hostname.toLowerCase().replace(/\.$/, '')
      return sorted.some(entry => entry.subdomains ? hostname.endsWith(`.${entry.host}`) : hostname === entry.host)
    },
  }
}
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
  gridColumns: z.number().int().min(1).max(3).optional(),
  gridColumnSpan: z.number().int().min(1).max(3).optional(),
  gridRowSpan: z.number().int().min(1).max(2).optional(),
  width: z.union([z.number().int().min(0).max(4000), z.enum(['auto', 'full'])]).optional(),
  maxWidth: z.number().int().min(0).max(4000).optional(),
  minHeight: z.number().int().min(0).max(1200).optional(),
  aspectRatio: z.enum(['square', 'landscape', 'wide', 'portrait']).optional(),
  objectFit: z.enum(['cover', 'contain']).optional(),
  objectPosition: z.enum(['center', 'top', 'bottom', 'left', 'right']).optional(),
  paddingTop: z.number().int().min(0).max(400).optional(),
  paddingRight: z.number().int().min(0).max(400).optional(),
  paddingBottom: z.number().int().min(0).max(400).optional(),
  paddingLeft: z.number().int().min(0).max(400).optional(),
  marginTop: z.number().int().min(-200).max(400).optional(),
  marginRight: z.union([
    z.number().int().min(-200).max(400),
    z.literal('auto'),
  ]).optional(),
  marginBottom: z.number().int().min(-200).max(400).optional(),
  marginLeft: z.union([
    z.number().int().min(-200).max(400),
    z.literal('auto'),
  ]).optional(),
  fontFamily: z.enum(FONT_ALLOWLIST).optional(),
  fontSize: z.number().int().min(10).max(160).optional(),
  fontWeight: z.enum(['400', '500', '600', '700', '800']).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-4).max(12).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  color: hexColorSchema.optional(),
  backgroundColor: hexColorSchema.optional(),
  borderColor: hexColorSchema.optional(),
  borderWidth: z.number().int().min(0).max(20).optional(),
  borderRadius: z.number().int().min(0).max(200).optional(),
  shadow: z.enum(['sm', 'md', 'lg']).optional(),
  opacity: z.number().min(0).max(1).optional(),
}).strict()

export type NodeStyle = z.infer<typeof styleSchema>

export type LeadFormLayout = 'left' | 'center' | 'right' | 'full'

export interface LeadFormLayoutPatch {
  width: 'full'
  maxWidth: 720 | null
  marginLeft: 0 | 'auto'
  marginRight: 0 | 'auto'
}

export function leadFormLayoutPatch(layout: LeadFormLayout): LeadFormLayoutPatch {
  switch (layout) {
    case 'left':
      return { width: 'full', maxWidth: 720, marginLeft: 0, marginRight: 'auto' }
    case 'center':
      return { width: 'full', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }
    case 'right':
      return { width: 'full', maxWidth: 720, marginLeft: 'auto', marginRight: 0 }
    case 'full':
      return { width: 'full', maxWidth: null, marginLeft: 0, marginRight: 0 }
  }
}

const responsiveSchema = z.object({
  tablet: styleSchema.optional(),
  mobile: styleSchema.optional(),
}).strict()

export const legacyRemoteImagePropsSchema = z.object({
  src: safeImageUrlSchema,
  alt: z.string().min(1).max(300),
}).strict()

export const ownedImagePropsSchema = z.object({
  assetId: assetIdSchema,
  alt: z.string().max(300),
  decorative: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.decorative && value.alt !== '') {
    context.addIssue({ code: 'custom', path: ['alt'], message: 'Decorative images require an empty alternative text' })
  }
  if (!value.decorative && value.alt.trim().length === 0) {
    context.addIssue({ code: 'custom', path: ['alt'], message: 'Content images require meaningful alternative text' })
  }
})

export const imagePropsSchema = z.union([legacyRemoteImagePropsSchema, ownedImagePropsSchema])

const pageReferenceFields = {
  pageId: nodeIdSchema,
  fragment: nodeIdSchema.optional(),
} as const

const externalHttpUrlSchema = z.string().url().max(2000).refine(value => {
  const url = new URL(value)
  return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
}, 'External URL must use HTTP(S) without credentials')

const phoneNumberSchema = z.string().trim().min(3).max(40).regex(/^\+?[0-9 ()-]+$/)

export const conversionActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead_form'), formNodeId: nodeIdSchema }).strict(),
  z.object({ type: z.literal('internal_page'), ...pageReferenceFields }).strict(),
  z.object({ type: z.literal('external_url'), url: externalHttpUrlSchema }).strict(),
  z.object({ type: z.literal('email'), address: z.string().email().max(320) }).strict(),
  z.object({ type: z.literal('phone'), number: phoneNumberSchema }).strict(),
])
export type ConversionAction = z.infer<typeof conversionActionSchema>

const leadSelectOptionSchema = z.object({
  label: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadSelectOptionLength),
  value: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadSelectOptionLength),
}).strict()

const leadFieldBaseFields = {
  key: z.string().min(1).max(DESIGN_LIMITS.maxLeadFieldKeyLength).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  label: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadFieldLabelLength),
  required: z.boolean(),
  placeholder: z.string().max(DESIGN_LIMITS.maxLeadFieldPlaceholderLength).optional(),
} as const

export const leadFormFieldSchema = z.discriminatedUnion('type', [
  z.object({ ...leadFieldBaseFields, type: z.literal('text') }).strict(),
  z.object({ ...leadFieldBaseFields, type: z.literal('email') }).strict(),
  z.object({ ...leadFieldBaseFields, type: z.literal('tel') }).strict(),
  z.object({ ...leadFieldBaseFields, type: z.literal('textarea') }).strict(),
  z.object({
    ...leadFieldBaseFields,
    type: z.literal('select'),
    options: z.array(leadSelectOptionSchema).min(1).max(DESIGN_LIMITS.maxLeadSelectOptions),
  }).strict().superRefine((value, context) => {
    const values = value.options.map(option => option.value)
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: 'Select option values must be unique' })
    }
  }),
])
export type LeadFormField = z.infer<typeof leadFormFieldSchema>

export const leadFormPropsSchema = z.object({
  title: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadFormTitleLength),
  description: z.string().max(DESIGN_LIMITS.maxLeadFormCopyLength),
  submitLabel: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadFieldLabelLength),
  successCopy: z.string().max(DESIGN_LIMITS.maxLeadFormCopyLength),
  fields: z.array(leadFormFieldSchema).min(1).max(DESIGN_LIMITS.maxLeadFormFields),
  consent: z.object({
    label: z.string().trim().min(1).max(DESIGN_LIMITS.maxLeadFormCopyLength),
    required: z.boolean(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  const keys = value.fields.map(field => field.key)
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['fields'], message: 'Lead Form field keys must be unique' })
  }
})
export type LeadFormProps = z.infer<typeof leadFormPropsSchema>

const linkBaseFields = {
  text: z.string().min(1).max(500),
  brandSlot: z.literal(true).optional(),
  logoAssetId: assetIdSchema.optional(),
  logoAlt: z.string().min(1).max(300).optional(),
} as const

export const linkPropsSchema = z.union([
  z.object({ ...linkBaseFields, href: safeLinkSchema }).strict(),
  z.object({ ...linkBaseFields, ...pageReferenceFields }).strict(),
  z.object({ ...linkBaseFields, action: conversionActionSchema }).strict(),
]).superRefine((value, context) => {
  if (Boolean(value.logoAssetId) !== Boolean(value.logoAlt)) {
    context.addIssue({ code: 'custom', path: ['logoAssetId'], message: 'Brand logos require both an owned asset and alternative text' })
  }
  if ((value.logoAssetId || value.logoAlt) && value.brandSlot !== true) {
    context.addIssue({ code: 'custom', path: ['brandSlot'], message: 'Owned logos are only valid on an explicit brand slot' })
  }
})

export const buttonPropsSchema = z.union([
  z.object({ text: z.string().min(1).max(200), href: safeLinkSchema }).strict(),
  z.object({ text: z.string().min(1).max(200), ...pageReferenceFields }).strict(),
  z.object({ text: z.string().min(1).max(200), action: conversionActionSchema }).strict(),
])

const propsByType = {
  page: z.object({}).strict(),
  section: z.object({
    label: z.string().min(1).max(100).optional(),
    hidden: z.boolean().optional(),
  }).strict(),
  container: z.object({}).strict(),
  stack: z.object({}).strict(),
  columns: z.object({}).strict(),
  column: z.object({}).strict(),
  divider: z.object({}).strict(),
  spacer: z.object({ size: z.number().int().min(0).max(400) }).strict(),
  heading: z.object({ text: z.string().min(1).max(500), level: z.number().int().min(1).max(6) }).strict(),
  paragraph: z.object({ text: z.string().min(1).max(5000) }).strict(),
  image: imagePropsSchema,
  button: buttonPropsSchema,
  link: linkPropsSchema,
  icon: z.object({ name: z.enum(ICON_ALLOWLIST), label: z.string().min(1).max(100) }).strict(),
  badge: z.object({ text: z.string().min(1).max(100) }).strict(),
  navbar: z.object({
    brand: z.string().min(1).max(100),
    hidden: z.boolean().optional(),
  }).strict(),
  hero: z.object({
    label: z.string().min(1).max(100),
    hidden: z.boolean().optional(),
  }).strict(),
  'feature-card': z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    mediaSlot: z.enum(['hero-image', 'feature-1', 'feature-2', 'feature-3']).optional(),
  }).strict(),
  'lead-form': leadFormPropsSchema,
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

const pageV1Schema = z.object({
  id: nodeIdSchema,
  name: z.string().min(1).max(100),
  slug: z.literal('/'),
  rootNodeId: nodeIdSchema,
}).strict()

const pageV2Schema = z.object({
  id: nodeIdSchema,
  name: z.string().trim().min(1).max(100),
  slug: z.string().min(1).max(DESIGN_LIMITS.maxPageSlugLength),
  rootNodeId: nodeIdSchema,
}).strict()

const navigationItemSchema = z.object({
  pageId: nodeIdSchema,
  label: z.string().trim().min(1).max(100),
}).strict()

const documentFields = {
  projectId: nodeIdSchema,
  version: z.number().int().positive(),
  theme: themeSchema,
  nodes: z.record(nodeIdSchema, designNodeSchema),
} as const

export const designDocumentV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...documentFields,
  pages: z.array(pageV1Schema).length(1),
}).strict()

export const designDocumentV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...documentFields,
  pages: z.array(pageV2Schema).min(1).max(DESIGN_LIMITS.maxPages),
  navigation: z.object({
    items: z.array(navigationItemSchema).max(DESIGN_LIMITS.maxNavigationItems),
  }).strict(),
}).strict()

export const designDocumentSchema = z.union([designDocumentV1Schema, designDocumentV2Schema])

const generatedNodePropsSchema = z.object({
  alt: z.string().min(1).max(300).optional(),
  brand: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  href: safeLinkSchema.optional(),
  label: z.string().min(1).max(100).optional(),
  level: z.number().int().min(1).max(6).optional(),
  name: z.enum(ICON_ALLOWLIST).optional(),
  size: z.number().int().min(0).max(400).optional(),
  src: safeImageUrlSchema.optional(),
  text: z.string().min(1).max(5000).optional(),
  title: z.string().min(1).max(200).optional(),
}).strict()

const generatedDesignNodeSchema = z.object({
  id: nodeIdSchema,
  type: z.enum(COMPONENT_TYPES),
  parentId: nodeIdSchema.nullable(),
  children: z.array(nodeIdSchema).max(DESIGN_LIMITS.maxNodes),
  props: generatedNodePropsSchema,
  style: styleSchema,
  responsive: responsiveSchema,
}).strict()

export const generatedDesignDocumentSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  theme: themeSchema,
  pages: z.array(z.union([pageV1Schema, pageV2Schema])).min(1).max(DESIGN_LIMITS.maxPages),
  navigation: z.object({ items: z.array(navigationItemSchema).max(DESIGN_LIMITS.maxNavigationItems) }).strict().optional(),
  nodes: z.record(nodeIdSchema, generatedDesignNodeSchema),
}).strict()

export type DesignDocumentV1 = z.infer<typeof designDocumentV1Schema>
export type DesignDocumentV2 = z.infer<typeof designDocumentV2Schema>
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
  | 'invalid_image_host'
  | 'page_limit_exceeded'
  | 'invalid_page_slug'
  | 'duplicate_page_id'
  | 'duplicate_page_slug'
  | 'navigation_invalid'
  | 'broken_page_reference'
  | 'broken_form_reference'
  | 'lead_form_limit_exceeded'
  | 'cross_page_relationship'

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

function detectCycleAndDepth(
  document: DesignDocument,
  rootNodeId: string,
  issues: DesignValidationIssue[],
  ownerByNode?: Map<string, string>,
  pageId?: string,
): void {
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
    if (ownerByNode && pageId) {
      const owner = ownerByNode.get(nodeId)
      if (owner && owner !== pageId) {
        issues.push({ code: 'cross_page_relationship', path: `nodes.${nodeId}`, message: 'A node can belong to only one page' })
        return
      }
      ownerByNode.set(nodeId, pageId)
    }
    visiting.add(nodeId)
    for (const childId of node.children) walk(childId, depth + 1)
    visiting.delete(nodeId)
    visited.add(nodeId)
  }

  walk(rootNodeId, 1)
}

export type BrokenPageReference =
  | { kind: 'navigation'; index: number; pageId: string }
  | { kind: 'node'; nodeId: string; pageId: string }

export interface BrokenFormReference {
  kind: 'form'
  nodeId: string
  formNodeId: string
}

export function collectBrokenPageReferences(document: DesignDocument): BrokenPageReference[] {
  const pageIds = new Set(document.pages.map(page => page.id))
  const broken: BrokenPageReference[] = []
  if (document.schemaVersion === 2) {
    document.navigation.items.forEach((item, index) => {
      if (!pageIds.has(item.pageId)) broken.push({ kind: 'navigation', index, pageId: item.pageId })
    })
  }
  for (const node of Object.values(document.nodes)) {
    if (node.type !== 'button' && node.type !== 'link') continue
    const pageId = 'pageId' in node.props
      ? node.props.pageId
      : 'action' in node.props && node.props.action.type === 'internal_page'
        ? node.props.action.pageId
        : null
    if (pageId && !pageIds.has(pageId)) broken.push({ kind: 'node', nodeId: node.id, pageId })
  }
  return broken.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

export function collectBrokenFormReferences(document: DesignDocument): BrokenFormReference[] {
  const broken: BrokenFormReference[] = []
  for (const node of Object.values(document.nodes)) {
    if (
      (node.type === 'button' || node.type === 'link')
      && 'action' in node.props
      && node.props.action.type === 'lead_form'
    ) {
      const target = document.nodes[node.props.action.formNodeId]
      if (target?.type !== 'lead-form') {
        broken.push({ kind: 'form', nodeId: node.id, formNodeId: node.props.action.formNodeId })
      }
    }
  }
  return broken.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function normalizedRouteInput(input: string): string | null {
  const withoutTrailingSlash = input.length > 1 ? input.replace(/\/+$/, '') : input
  const normalized = normalizePageSlug(withoutTrailingSlash)
  return normalized.success ? normalized.slug : null
}

export function findPageByRoute(document: DesignDocument, route: string): DesignDocument['pages'][number] | null {
  const normalized = normalizedRouteInput(route)
  if (!normalized) return null
  return document.pages.find(page => {
    const pageSlug = normalizePageSlug(page.slug)
    return pageSlug.success && pageSlug.slug === normalized
  }) ?? null
}

export function migrateDesignDocumentV1ToV2(input: DesignDocumentV1 | DesignDocumentV2): DesignDocumentV2 {
  if (input.schemaVersion === 2) return structuredClone(input)
  return {
    ...structuredClone(input),
    schemaVersion: 2,
    navigation: {
      items: input.pages.map(page => ({ pageId: page.id, label: page.name })),
    },
  }
}

export type ParseDesignDocumentResult =
  | { success: true; data: DesignDocumentV2; migrated: boolean }
  | { success: false; issues: DesignValidationIssue[] }

export function parseDesignDocument(
  input: unknown,
  options: { imagePolicy?: RemoteImagePolicy } = {},
): ParseDesignDocumentResult {
  const validation = validateDesignDocument(input, options)
  if (!validation.success) return validation
  return {
    success: true,
    data: migrateDesignDocumentV1ToV2(validation.data),
    migrated: validation.data.schemaVersion === 1,
  }
}

export function validateDesignDocument(
  input: unknown,
  options: { imagePolicy?: RemoteImagePolicy } = {},
): DesignValidationResult {
  let serializedBytes: number
  try {
    serializedBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength
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
  if (options.imagePolicy) {
    for (const [key, node] of entries) {
      if (node.type === 'image' && 'src' in node.props && !options.imagePolicy.allows(node.props.src)) {
        issues.push({
          code: 'invalid_image_host',
          path: `nodes.${key}.props.src`,
          message: 'Image host is not allowed',
        })
      }
    }
  }
  if (entries.length > DESIGN_LIMITS.maxNodes) {
    issues.push({ code: 'node_limit_exceeded', path: 'nodes', message: `Document exceeds ${DESIGN_LIMITS.maxNodes} nodes` })
  }

  const pageIds = new Set<string>()
  const rootIds = new Set<string>()
  const slugKeys = new Set<string>()
  let homeCount = 0
  for (const [index, page] of document.pages.entries()) {
    if (pageIds.has(page.id)) issues.push({ code: 'duplicate_page_id', path: `pages.${index}.id`, message: 'Page IDs must be unique' })
    pageIds.add(page.id)
    const normalized = normalizePageSlug(page.slug)
    if (!normalized.success || normalized.slug !== page.slug) {
      issues.push({ code: 'invalid_page_slug', path: `pages.${index}.slug`, message: 'Page slug must be canonical and safe' })
    } else {
      const key = normalized.slug.normalize('NFKC').toLowerCase()
      if (slugKeys.has(key)) issues.push({ code: 'duplicate_page_slug', path: `pages.${index}.slug`, message: 'Page routes must be unique' })
      slugKeys.add(key)
      if (normalized.slug === '/') homeCount += 1
    }
    if (rootIds.has(page.rootNodeId)) issues.push({ code: 'root_invalid', path: `pages.${index}.rootNodeId`, message: 'Each page requires a distinct root' })
    rootIds.add(page.rootNodeId)
    const root = document.nodes[page.rootNodeId]
    if (!root || root.type !== 'page' || root.parentId !== null) {
      issues.push({ code: 'root_invalid', path: `pages.${index}.rootNodeId`, message: 'Root must reference a parentless page node' })
    }
  }
  if (homeCount !== 1) issues.push({ code: 'root_invalid', path: 'pages', message: 'Document requires exactly one home page' })
  if (document.schemaVersion === 2 && document.pages.length > DESIGN_LIMITS.maxPages) {
    issues.push({ code: 'page_limit_exceeded', path: 'pages', message: `Document exceeds ${DESIGN_LIMITS.maxPages} pages` })
  }

  for (const [key, node] of entries) {
    if (key !== node.id) issues.push({ code: 'node_id_mismatch', path: `nodes.${key}.id`, message: 'Node ID must match its map key' })
    if (!rootIds.has(node.id) && (!node.parentId || !document.nodes[node.parentId])) {
      issues.push({ code: 'orphan_node', path: `nodes.${key}.parentId`, message: 'Non-root node must have an existing parent' })
    }
    if (rootIds.has(node.id) && node.parentId !== null) {
      issues.push({ code: 'root_invalid', path: `nodes.${key}.parentId`, message: 'Page roots must be parentless' })
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

  const ownerByNode = new Map<string, string>()
  for (const page of document.pages) detectCycleAndDepth(document, page.rootNodeId, issues, ownerByNode, page.id)
  for (const [key] of entries) {
    if (!ownerByNode.has(key)) issues.push({ code: 'orphan_node', path: `nodes.${key}`, message: 'Every node must belong to one page' })
  }
  if (document.schemaVersion === 2) {
    if (document.navigation.items.length > DESIGN_LIMITS.maxNavigationItems) {
      issues.push({ code: 'navigation_invalid', path: 'navigation.items', message: 'Navigation exceeds its item limit' })
    }
    const navigationPageIds = new Set<string>()
    document.navigation.items.forEach((item, index) => {
      if (navigationPageIds.has(item.pageId)) issues.push({ code: 'navigation_invalid', path: `navigation.items.${index}.pageId`, message: 'Navigation page IDs must be unique' })
      navigationPageIds.add(item.pageId)
    })
    for (const broken of collectBrokenPageReferences(document)) {
      const path = broken.kind === 'navigation'
        ? `navigation.items.${broken.index}.pageId`
        : `nodes.${broken.nodeId}.props`
      issues.push({ code: 'broken_page_reference', path, message: 'Page reference does not exist' })
    }
  }
  for (const broken of collectBrokenFormReferences(document)) {
    issues.push({
      code: 'broken_form_reference',
      path: `nodes.${broken.nodeId}.props.action.formNodeId`,
      message: 'Lead Form reference does not exist',
    })
  }
  const leadFormCount = entries.filter(([, node]) => node.type === 'lead-form').length
  if (leadFormCount > DESIGN_LIMITS.maxLeadForms) {
    issues.push({
      code: 'lead_form_limit_exceeded',
      path: 'nodes',
      message: `Document exceeds ${DESIGN_LIMITS.maxLeadForms} Lead Forms`,
    })
  }
  return issues.length === 0 ? { success: true, data: document } : { success: false, issues }
}

export function collectAssetReferences(document: DesignDocument): string[] {
  const ids = new Set<string>()
  for (const node of Object.values(document.nodes)) {
    if (node.type === 'image' && 'assetId' in node.props) ids.add(node.props.assetId)
    if (node.type === 'link' && 'logoAssetId' in node.props && node.props.logoAssetId) ids.add(node.props.logoAssetId)
  }
  return [...ids].sort()
}

export function collectLegacyRemoteImageReferences(document: DesignDocument): string[] {
  const urls = new Set<string>()
  for (const node of Object.values(document.nodes)) {
    if (node.type === 'image' && 'src' in node.props) urls.add(node.props.src)
  }
  return [...urls].sort()
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
