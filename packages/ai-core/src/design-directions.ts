import {
  ICON_ALLOWLIST,
  ownedImagePropsSchema,
  type DesignDocument,
  type RemoteImagePolicy,
} from '@zenui/design-schema'
import { z } from 'zod'

import { materializeLandingPageBlueprintV2 } from './blueprint-v2'
import { normalizeWebsiteBrief, websiteBriefSchema, type WebsiteBrief } from './guided-brief'
import {
  PAGE_PRESET_IDS,
  type BlueprintV2Section,
} from './section-presets'

import type { LandingPageBlueprintV2, OwnedMediaMap, OwnedMediaSlot } from './blueprint-v2'

const shortTextSchema = z.string().trim().min(1).max(200)
const bodyTextSchema = z.string().trim().min(1).max(1000)
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict()

const sectionTypeSchema = z.enum([
  'logo-cloud', 'stats', 'features', 'testimonials', 'pricing', 'faq', 'final-cta', 'footer',
])

export const designDirectionContentBlueprintSchema = z.object({
  version: z.literal(1),
  language: z.enum(['vi', 'en']),
  pagePreset: z.enum(PAGE_PRESET_IDS),
  brand: z.string().trim().min(1).max(100),
  announcement: shortTextSchema,
  navLabels: z.array(shortTextSchema).min(2).max(5),
  heroBadge: shortTextSchema,
  heroHeading: z.string().trim().min(1).max(220),
  heroParagraph: z.string().trim().min(1).max(1200),
  heroSecondaryCta: shortTextSchema,
  heroProof: shortTextSchema,
  heroImage: z.object({
    query: z.string().trim().min(2).max(160),
    alt: z.string().trim().min(1).max(300),
  }).strict(),
  contentImages: z.array(z.object({
    slot: z.enum(['feature-1', 'feature-2', 'feature-3']),
    query: z.string().trim().min(2).max(160),
    alt: z.string().trim().min(1).max(300),
  }).strict()).max(3),
  logos: z.array(shortTextSchema).min(3).max(8),
  statsHeading: z.string().trim().min(1).max(220),
  stats: z.array(z.object({
    value: z.string().trim().min(1).max(40),
    label: shortTextSchema,
  }).strict()).min(3).max(4),
  featuresHeading: z.string().trim().min(1).max(220),
  featuresParagraph: bodyTextSchema,
  features: z.array(z.object({
    icon: z.enum(ICON_ALLOWLIST),
    heading: shortTextSchema,
    paragraph: bodyTextSchema,
  }).strict()).min(3).max(6),
  testimonialsHeading: z.string().trim().min(1).max(220),
  testimonials: z.array(z.object({
    quote: z.string().trim().min(1).max(800),
    name: shortTextSchema,
    role: shortTextSchema,
  }).strict()).min(2).max(4),
  pricingHeading: z.string().trim().min(1).max(220),
  pricingParagraph: bodyTextSchema,
  plans: z.array(z.object({
    name: shortTextSchema,
    price: z.string().trim().min(1).max(80),
    description: bodyTextSchema,
    features: z.array(shortTextSchema).min(2).max(6),
    highlighted: z.boolean(),
  }).strict()).min(2).max(3),
  faqHeading: z.string().trim().min(1).max(220),
  faqs: z.array(z.object({
    question: z.string().trim().min(1).max(240),
    answer: bodyTextSchema,
  }).strict()).min(3).max(6),
  finalCtaHeading: z.string().trim().min(1).max(220),
  finalCtaParagraph: bodyTextSchema,
  footerTagline: z.string().trim().min(1).max(240),
  copyright: z.string().trim().min(1).max(200),
  sectionOrder: z.array(sectionTypeSchema).min(4).max(8),
}).strict().superRefine((value, context) => {
  if (new Set(value.sectionOrder).size !== value.sectionOrder.length) {
    context.addIssue({ code: 'custom', path: ['sectionOrder'], message: 'duplicate_section_type' })
  }
  for (const required of ['features', 'final-cta', 'footer'] as const) {
    if (!value.sectionOrder.includes(required)) {
      context.addIssue({ code: 'custom', path: ['sectionOrder'], message: `${required}_required` })
    }
  }
  if (value.sectionOrder.at(-1) !== 'footer') {
    context.addIssue({ code: 'custom', path: ['sectionOrder'], message: 'footer_must_be_last' })
  }
  if (new Set(value.contentImages.map(image => image.slot)).size !== value.contentImages.length) {
    context.addIssue({ code: 'custom', path: ['contentImages'], message: 'duplicate_media_slot' })
  }
  for (const image of value.contentImages) {
    const featureIndex = Number(image.slot.slice(-1)) - 1
    if (!value.features[featureIndex]) {
      context.addIssue({ code: 'custom', path: ['contentImages'], message: 'media_slot_without_feature' })
    }
  }
})

export type DesignDirectionContentBlueprint = z.infer<typeof designDirectionContentBlueprintSchema>
export type DesignDirectionMediaIntent = {
  slot: OwnedMediaSlot
  query: string
  alt: string
}
export type DesignDirectionImageIntent = DesignDirectionMediaIntent
export type DesignDirectionOwnedImage = z.infer<typeof ownedImagePropsSchema>
export const designDirectionRunStatusSchema = z.enum([
  'queued', 'running', 'completed', 'failed', 'cancelled', 'superseded', 'accepted',
])
export type DesignDirectionRunStatus = z.infer<typeof designDirectionRunStatusSchema>
export const designDirectionRunErrorCodeSchema = z.enum([
  'invalid_model_output', 'brief_mismatch', 'provider_auth', 'provider_rate_limit',
  'provider_timeout', 'provider_transient', 'provider_error', 'budget_exceeded', 'queue_unavailable',
  'stale_document_version',
])
export type DesignDirectionRunErrorCode = z.infer<typeof designDirectionRunErrorCodeSchema>
export const designDirectionJobSchema = z.object({
  designDirectionRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()
export type DesignDirectionJob = z.infer<typeof designDirectionJobSchema>
export const designDirectionContentBlueprintJsonSchema = z.toJSONSchema(
  designDirectionContentBlueprintSchema,
  { target: 'draft-7' },
)

export const designDirectionContractSchema = z.object({
  themePreset: z.enum(['indigo', 'emerald', 'coral', 'violet', 'graphite']),
  mood: z.enum(['confident', 'friendly', 'editorial', 'bold']),
  density: z.enum(['compact', 'balanced', 'airy']),
  navbarVariant: z.enum(['compact', 'centered', 'announcement']),
  heroVariant: z.enum(['split', 'centered', 'product-shot', 'editorial', 'overlap']),
  featuresVariant: z.enum(['grid', 'bento', 'alternating', 'icon-list']),
  testimonialsVariant: z.enum(['cards', 'spotlight', 'quote-wall']),
  faqVariant: z.enum(['stacked', 'two-column', 'accordion-cards']),
  finalCtaVariant: z.enum(['panel', 'split', 'banner']),
  footerVariant: z.enum(['simple', 'columns']),
}).strict()

export type DesignDirectionContract = z.infer<typeof designDirectionContractSchema>

export interface MaterializedDesignDirection {
  id: string
  name: string
  character: string
  rationale: string
  contract: DesignDirectionContract
  document: DesignDocument
}

type SectionRhythm = 'benefit-first' | 'proof-first' | 'offer-first'

interface DirectionPreset extends DesignDirectionContract {
  id: string
  name: string
  character: string
  rationale: string
  sectionRhythm: SectionRhythm
}

const sectionRhythms: readonly SectionRhythm[] = ['benefit-first', 'proof-first', 'offer-first']

function directionSet(presets: readonly Omit<DirectionPreset, 'sectionRhythm'>[]): readonly DirectionPreset[] {
  return presets.map((preset, index) => ({ ...preset, sectionRhythm: sectionRhythms[index]! }))
}

const directionPresetSets: readonly (readonly DirectionPreset[])[] = [
  directionSet([
    {
      id: 'clear-momentum', name: 'Đà tiến rõ ràng', character: 'Trực tiếp và tập trung',
      rationale: 'Phân cấp trực tiếp làm nổi bật giá trị chính và hành động tiếp theo.',
      themePreset: 'indigo', mood: 'confident', density: 'balanced', navbarVariant: 'compact',
      heroVariant: 'overlap', featuresVariant: 'icon-list', testimonialsVariant: 'quote-wall', faqVariant: 'accordion-cards',
      finalCtaVariant: 'banner', footerVariant: 'simple',
    },
    {
      id: 'trusted-advisor', name: 'Người bạn đáng tin', character: 'Ưu tiên bằng chứng',
      rationale: 'Câu chuyện dựa trên bằng chứng xây dựng niềm tin trước khi mời hành động.',
      themePreset: 'emerald', mood: 'friendly', density: 'airy', navbarVariant: 'centered',
      heroVariant: 'centered', featuresVariant: 'alternating', testimonialsVariant: 'spotlight', faqVariant: 'two-column',
      finalCtaVariant: 'split', footerVariant: 'columns',
    },
    {
      id: 'bold-launch', name: 'Khởi động nổi bật', character: 'Năng động và giàu hình ảnh',
      rationale: 'Phần mở đầu mạnh và bố cục đa dạng tạo năng lượng mà vẫn giữ thông điệp chính.',
      themePreset: 'coral', mood: 'bold', density: 'compact', navbarVariant: 'announcement',
      heroVariant: 'product-shot', featuresVariant: 'bento', testimonialsVariant: 'cards', faqVariant: 'two-column',
      finalCtaVariant: 'panel', footerVariant: 'columns',
    },
  ]),
  directionSet([
    {
      id: 'calm-clarity', name: 'Rõ ràng và điềm tĩnh', character: 'Thoáng và an tâm',
      rationale: 'Nhịp nội dung thoáng giúp người xem hiểu đề nghị theo một trình tự bình tĩnh.',
      themePreset: 'graphite', mood: 'editorial', density: 'airy', navbarVariant: 'compact',
      heroVariant: 'editorial', featuresVariant: 'alternating', testimonialsVariant: 'spotlight', faqVariant: 'stacked',
      finalCtaVariant: 'split', footerVariant: 'simple',
    },
    {
      id: 'friendly-guide', name: 'Hướng dẫn thân thiện', character: 'Ấm áp và gần gũi',
      rationale: 'Bố cục trung tâm và các bước rõ ràng tạo cảm giác được hướng dẫn.',
      themePreset: 'violet', mood: 'friendly', density: 'balanced', navbarVariant: 'centered',
      heroVariant: 'centered', featuresVariant: 'grid', testimonialsVariant: 'cards', faqVariant: 'two-column',
      finalCtaVariant: 'panel', footerVariant: 'columns',
    },
    {
      id: 'decisive-proof', name: 'Bằng chứng thuyết phục', character: 'Gọn và giàu bằng chứng',
      rationale: 'Mở đầu trực tiếp kết hợp khối lợi ích nổi bật để thúc đẩy quyết định.',
      themePreset: 'emerald', mood: 'confident', density: 'compact', navbarVariant: 'announcement',
      heroVariant: 'split', featuresVariant: 'bento', testimonialsVariant: 'spotlight', faqVariant: 'stacked',
      finalCtaVariant: 'split', footerVariant: 'columns',
    },
  ]),
  directionSet([
    {
      id: 'precise-editorial', name: 'Biên tập chính xác', character: 'Sắc nét và có chiều sâu',
      rationale: 'Ngôn ngữ biên tập cùng bố cục rõ ràng giúp thông điệp chuyên môn dễ được ghi nhớ.',
      themePreset: 'violet', mood: 'editorial', density: 'balanced', navbarVariant: 'centered',
      heroVariant: 'editorial', featuresVariant: 'grid', testimonialsVariant: 'spotlight', faqVariant: 'stacked',
      finalCtaVariant: 'split', footerVariant: 'simple',
    },
    {
      id: 'human-momentum', name: 'Động lực gần gũi', character: 'Cởi mở và giàu nhịp điệu',
      rationale: 'Khối mở đầu trực diện kết hợp lợi ích xen kẽ tạo đà khám phá tự nhiên.',
      themePreset: 'coral', mood: 'friendly', density: 'airy', navbarVariant: 'compact',
      heroVariant: 'split', featuresVariant: 'alternating', testimonialsVariant: 'cards', faqVariant: 'two-column',
      finalCtaVariant: 'panel', footerVariant: 'columns',
    },
    {
      id: 'proof-command', name: 'Dẫn dắt bằng chứng', character: 'Quyết đoán và thực dụng',
      rationale: 'Hình ảnh sản phẩm nổi bật và khối lợi ích cô đọng đưa bằng chứng vào trọng tâm.',
      themePreset: 'graphite', mood: 'confident', density: 'compact', navbarVariant: 'announcement',
      heroVariant: 'product-shot', featuresVariant: 'bento', testimonialsVariant: 'spotlight', faqVariant: 'two-column',
      finalCtaVariant: 'split', footerVariant: 'columns',
    },
  ]),
  directionSet([
    {
      id: 'focused-conversion', name: 'Chuyển đổi tập trung', character: 'Cô đọng và thuyết phục',
      rationale: 'Thông điệp trung tâm và các điểm mạnh dạng khối giúp người xem quyết định nhanh hơn.',
      themePreset: 'emerald', mood: 'confident', density: 'compact', navbarVariant: 'compact',
      heroVariant: 'centered', featuresVariant: 'bento', testimonialsVariant: 'cards', faqVariant: 'stacked',
      finalCtaVariant: 'panel', footerVariant: 'simple',
    },
    {
      id: 'editorial-story', name: 'Câu chuyện biên tập', character: 'Điềm tĩnh và giàu ngữ cảnh',
      rationale: 'Phần mở đầu như một trang biên tập dẫn vào chuỗi lợi ích theo nhịp kể chuyện mạch lạc.',
      themePreset: 'graphite', mood: 'editorial', density: 'airy', navbarVariant: 'centered',
      heroVariant: 'editorial', featuresVariant: 'alternating', testimonialsVariant: 'spotlight', faqVariant: 'two-column',
      finalCtaVariant: 'split', footerVariant: 'columns',
    },
    {
      id: 'vivid-product', name: 'Sản phẩm sống động', character: 'Nổi bật và giàu năng lượng',
      rationale: 'Hình ảnh sản phẩm mạnh kết hợp lưới lợi ích rõ ràng tạo ấn tượng hiện đại.',
      themePreset: 'indigo', mood: 'bold', density: 'balanced', navbarVariant: 'announcement',
      heroVariant: 'product-shot', featuresVariant: 'grid', testimonialsVariant: 'cards', faqVariant: 'stacked',
      finalCtaVariant: 'panel', footerVariant: 'columns',
    },
  ]),
]

function briefLanguage(brief: WebsiteBrief): 'vi' | 'en' {
  const content = [brief.description, brief.offer, brief.audience, brief.primaryGoal, brief.cta, brief.tone].join(' ')
  return /[ăâđêôơưĂÂĐÊÔƠƯ]|[àáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(content) ? 'vi' : 'en'
}

function requiredBlueprintSections(brief: WebsiteBrief): string[] {
  const result = ['features', 'final-cta', 'footer']
  if (brief.mustHaveSections.includes('trust')) result.push('testimonials')
  if (brief.mustHaveSections.includes('pricing')) result.push('pricing')
  if (brief.mustHaveSections.includes('faq')) result.push('faq')
  return result
}

function sectionsFor(
  brief: WebsiteBrief,
  content: DesignDirectionContentBlueprint,
  preset: DirectionPreset,
): BlueprintV2Section[] {
  const sections: Record<z.infer<typeof sectionTypeSchema>, BlueprintV2Section> = {
    'logo-cloud': { type: 'logo-cloud', variant: preset.footerVariant === 'columns' ? 'panel' : 'row', logos: content.logos },
    stats: { type: 'stats', variant: preset.featuresVariant === 'bento' ? 'cards' : 'strip', heading: content.statsHeading, items: content.stats },
    features: {
      type: 'features', variant: preset.featuresVariant, heading: content.featuresHeading,
      paragraph: content.featuresParagraph, items: content.features,
    },
    testimonials: {
      type: 'testimonials', variant: preset.testimonialsVariant,
      heading: content.testimonialsHeading, items: content.testimonials,
    },
    pricing: {
      type: 'pricing', variant: preset.featuresVariant === 'grid' ? 'cards' : 'contrast',
      heading: content.pricingHeading, paragraph: content.pricingParagraph,
      plans: content.plans.map(plan => ({
        ...plan,
        cta: { text: brief.cta, href: '#start' },
      })),
    },
    faq: { type: 'faq', variant: preset.faqVariant, heading: content.faqHeading, items: content.faqs },
    'final-cta': {
      type: 'final-cta', variant: preset.finalCtaVariant, heading: content.finalCtaHeading,
      paragraph: content.finalCtaParagraph, primaryCta: { text: brief.cta, href: '#start' },
    },
    footer: {
      type: 'footer', variant: preset.footerVariant, tagline: content.footerTagline,
      columns: preset.footerVariant === 'columns'
        ? [{ heading: content.navLabels[0]!, links: content.navLabels.slice(1).map(text => ({ text, href: '#start' })) }]
        : [],
      copyright: content.copyright,
    },
  }
  type NonFooterSectionType = Exclude<z.infer<typeof sectionTypeSchema>, 'footer'>
  const required = new Set<z.infer<typeof sectionTypeSchema>>(requiredBlueprintSections(brief) as z.infer<typeof sectionTypeSchema>[])
  const ordered: NonFooterSectionType[] = [...new Set(content.sectionOrder)]
    .filter((type): type is NonFooterSectionType => type !== 'footer')
    .filter(type => required.has(type) || type === 'logo-cloud' || type === 'stats')
  for (const type of required) {
    if (type !== 'footer' && !ordered.includes(type)) ordered.push(type)
  }
  const priorities: Record<SectionRhythm, readonly NonFooterSectionType[]> = {
    'benefit-first': ['features', 'stats', 'logo-cloud', 'testimonials', 'pricing', 'faq', 'final-cta'],
    'proof-first': ['testimonials', 'logo-cloud', 'stats', 'features', 'pricing', 'faq', 'final-cta'],
    'offer-first': ['pricing', 'features', 'stats', 'testimonials', 'logo-cloud', 'faq', 'final-cta'],
  }
  const rank = new Map(priorities[preset.sectionRhythm].map((type, index) => [type, index]))
  const rhythmOrdered = ordered
    .map((type, index) => ({ type, index }))
    .sort((left, right) => (rank.get(left.type) ?? priorities[preset.sectionRhythm].length) - (rank.get(right.type) ?? priorities[preset.sectionRhythm].length) || left.index - right.index)
    .map(({ type }) => type)
  return [...rhythmOrdered.map(type => sections[type]), sections.footer]
}

function blueprintFor(
  brief: WebsiteBrief,
  content: DesignDirectionContentBlueprint,
  preset: DirectionPreset,
): LandingPageBlueprintV2 {
  return {
    version: 2,
    pagePreset: content.pagePreset,
    brand: content.brand,
    theme: {
      preset: preset.themePreset,
      mood: preset.mood,
      density: preset.density,
      headingFont: content.pagePreset === 'saas' ? 'Manrope' : preset.mood === 'editorial' ? 'Georgia' : 'Manrope',
      bodyFont: 'Manrope',
    },
    navbar: {
      variant: preset.navbarVariant,
      ...(preset.navbarVariant === 'announcement' ? { announcement: content.announcement } : {}),
      links: content.navLabels.map((text, index) => ({ text, href: index === 0 ? '#features' : '#start' })),
      cta: { text: brief.cta, href: '#start' },
    },
    hero: {
      variant: preset.heroVariant,
      badge: content.heroBadge,
      heading: content.heroHeading,
      paragraph: content.heroParagraph,
      primaryCta: { text: brief.cta, href: '#start' },
      secondaryCta: { text: content.heroSecondaryCta, href: '#features' },
      proof: content.heroProof,
    },
    sections: sectionsFor(brief, content, preset),
  }
}

export type MaterializeDesignDirectionsResult =
  | { accepted: true; directions: MaterializedDesignDirection[] }
  | { accepted: false; code: 'invalid_brief' | 'invalid_blueprint' | 'brief_mismatch' | 'invalid_direction' }

export function materializeDesignDirections(input: {
  brief: WebsiteBrief
  blueprint: unknown
  current: DesignDocument
  round: number
  imagePolicy?: RemoteImagePolicy
  heroImage?: DesignDirectionOwnedImage
  ownedMedia?: OwnedMediaMap
}): MaterializeDesignDirectionsResult {
  const parsedBrief = websiteBriefSchema.safeParse(input.brief)
  if (!parsedBrief.success) return { accepted: false, code: 'invalid_brief' }
  const brief = normalizeWebsiteBrief(parsedBrief.data)
  const content = designDirectionContentBlueprintSchema.safeParse(input.blueprint)
  if (!content.success) return { accepted: false, code: 'invalid_blueprint' }
  if (content.data.language !== briefLanguage(brief)) return { accepted: false, code: 'brief_mismatch' }
  const required = requiredBlueprintSections(brief)
  if (required.some(type => !content.data.sectionOrder.includes(type as z.infer<typeof sectionTypeSchema>))) {
    return { accepted: false, code: 'brief_mismatch' }
  }
  const ownedMediaInput = { ...(input.ownedMedia ?? {}), ...(input.heroImage ? { hero: input.heroImage } : {}) }
  const ownedMedia: OwnedMediaMap = {}
  for (const [slot, image] of Object.entries(ownedMediaInput)) {
    if (!['hero', 'feature-1', 'feature-2', 'feature-3'].includes(slot)) return { accepted: false, code: 'invalid_direction' }
    const parsedImage = ownedImagePropsSchema.safeParse(image)
    if (!parsedImage.success) return { accepted: false, code: 'invalid_direction' }
    ownedMedia[slot as OwnedMediaSlot] = parsedImage.data
  }
  const setIndex = ((input.round % directionPresetSets.length) + directionPresetSets.length) % directionPresetSets.length
  const set = directionPresetSets[setIndex]!
  const directions: MaterializedDesignDirection[] = []
  for (const preset of set) {
    const result = materializeLandingPageBlueprintV2({
      blueprint: blueprintFor(brief, content.data, preset),
      current: input.current,
      ...(input.imagePolicy ? { imagePolicy: input.imagePolicy } : {}),
      ...(Object.keys(ownedMedia).length > 0 ? { ownedMedia } : {}),
      designSystem: brief.designSystem,
    })
    if (!result.accepted) return { accepted: false, code: 'invalid_direction' }
    directions.push({
      id: preset.id,
      name: preset.name,
      character: preset.character,
      rationale: preset.rationale,
      contract: designDirectionContractSchema.parse({
        themePreset: preset.themePreset,
        mood: preset.mood,
        density: preset.density,
        navbarVariant: preset.navbarVariant,
        heroVariant: preset.heroVariant,
        featuresVariant: preset.featuresVariant,
        testimonialsVariant: preset.testimonialsVariant,
        faqVariant: preset.faqVariant,
        finalCtaVariant: preset.finalCtaVariant,
        footerVariant: preset.footerVariant,
      }),
      document: result.document,
    })
  }
  return { accepted: true, directions }
}

export type DesignDirectionContentBrief = Omit<WebsiteBrief, 'designSystem'>

function contentBrief(brief: WebsiteBrief): DesignDirectionContentBrief {
  return {
    description: brief.description,
    offer: brief.offer,
    audience: brief.audience,
    primaryGoal: brief.primaryGoal,
    cta: brief.cta,
    tone: brief.tone,
    brandDetails: brief.brandDetails,
    mustHaveSections: brief.mustHaveSections,
  }
}

export interface DesignDirectionProviderRequest {
  brief: DesignDirectionContentBrief
  promptVersion: 'directions-v1'
  signal: AbortSignal
}

export interface DesignDirectionProviderResponse {
  output: unknown
  usage: z.infer<typeof usageSchema>
}

export interface DesignDirectionProvider {
  readonly name: string
  readonly model: string
  generateContentBlueprint(input: DesignDirectionProviderRequest): Promise<DesignDirectionProviderResponse>
}

export type DesignDirectionGenerationResult =
  | {
      accepted: true
      blueprint: DesignDirectionContentBlueprint
      directions: MaterializedDesignDirection[]
      usage: z.infer<typeof usageSchema>
      provider: string
      model: string
      promptVersion: 'directions-v1'
    }
  | {
      accepted: false
      code: 'invalid_model_output' | 'brief_mismatch' | 'provider_auth' | 'provider_rate_limit' | 'provider_timeout' | 'provider_transient' | 'provider_error'
      usage: z.infer<typeof usageSchema>
      provider: string
      model: string
      promptVersion: 'directions-v1'
    }

function safeProviderCode(error: unknown): Exclude<DesignDirectionGenerationResult, { accepted: true }>['code'] {
  const value = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined
  return z.enum([
    'provider_auth', 'provider_rate_limit', 'provider_timeout', 'provider_transient', 'provider_error',
  ]).catch('provider_error').parse(value)
}

export async function runDesignDirectionGeneration(input: {
  provider: DesignDirectionProvider
  brief: WebsiteBrief
  current: DesignDocument
  round: number
  imagePolicy?: RemoteImagePolicy
  resolveHeroImage?: (intent: DesignDirectionImageIntent) => Promise<DesignDirectionOwnedImage | null>
  resolveMedia?: (intent: DesignDirectionMediaIntent) => Promise<DesignDirectionOwnedImage | null>
  timeoutMs?: number
}): Promise<DesignDirectionGenerationResult> {
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  const parsedBrief = websiteBriefSchema.safeParse(input.brief)
  if (!parsedBrief.success) {
    return {
      accepted: false, code: 'invalid_model_output', usage,
      provider: input.provider.name, model: input.provider.model, promptVersion: 'directions-v1',
    }
  }
  const brief = normalizeWebsiteBrief(parsedBrief.data)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30_000)
  let response: DesignDirectionProviderResponse
  try {
    response = await input.provider.generateContentBlueprint({
      brief: contentBrief(brief),
      promptVersion: 'directions-v1',
      signal: controller.signal,
    })
  } catch (error) {
    return {
      accepted: false,
      code: controller.signal.aborted ? 'provider_timeout' : safeProviderCode(error),
      usage,
      provider: input.provider.name,
      model: input.provider.model,
      promptVersion: 'directions-v1',
    }
  } finally {
    clearTimeout(timeout)
  }
  const parsedUsage = usageSchema.safeParse(response.usage)
  const actualUsage = parsedUsage.success ? parsedUsage.data : usage
  const blueprint = designDirectionContentBlueprintSchema.safeParse(response.output)
  if (!blueprint.success) {
    return {
      accepted: false, code: 'invalid_model_output', usage: actualUsage,
      provider: input.provider.name, model: input.provider.model, promptVersion: 'directions-v1',
    }
  }
  const ownedMedia: OwnedMediaMap = {}
  const intents: DesignDirectionMediaIntent[] = [
    { slot: 'hero', ...blueprint.data.heroImage },
    ...blueprint.data.contentImages,
  ]
  const resolver = input.resolveMedia
    ?? (input.resolveHeroImage
      ? (intent: DesignDirectionMediaIntent) => intent.slot === 'hero'
          ? input.resolveHeroImage!(intent)
          : Promise.resolve(null)
      : undefined)
  if (resolver) {
    for (let index = 0; index < intents.length; index += 2) {
      const batch = intents.slice(index, index + 2)
      const settled = await Promise.all(batch.map(async intent => {
        try {
          const parsed = ownedImagePropsSchema.safeParse(await resolver(intent))
          return parsed.success ? { slot: intent.slot, image: parsed.data } : null
        } catch {
          return null
        }
      }))
      for (const value of settled) if (value) ownedMedia[value.slot] = value.image
    }
  }
  const materialized = materializeDesignDirections({
    brief,
    blueprint: blueprint.data,
    current: input.current,
    round: input.round,
    ...(input.imagePolicy ? { imagePolicy: input.imagePolicy } : {}),
    ...(Object.keys(ownedMedia).length > 0 ? { ownedMedia } : {}),
  })
  if (!materialized.accepted) {
    return {
      accepted: false,
      code: materialized.code === 'brief_mismatch' ? 'brief_mismatch' : 'invalid_model_output',
      usage: actualUsage,
      provider: input.provider.name,
      model: input.provider.model,
      promptVersion: 'directions-v1',
    }
  }
  return {
    accepted: true,
    blueprint: blueprint.data,
    directions: materialized.directions,
    usage: actualUsage,
    provider: input.provider.name,
    model: input.provider.model,
    promptVersion: 'directions-v1',
  }
}
