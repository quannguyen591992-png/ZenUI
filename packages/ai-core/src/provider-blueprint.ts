import { ICON_ALLOWLIST } from '@zenui/design-schema'
import { z } from 'zod'

import {
  DENSITY_PRESET_IDS,
  MOOD_PRESET_IDS,
  PAGE_PRESET_IDS,
  THEME_PRESET_IDS,
  type BlueprintV2SectionType,
} from './section-presets'

import type { LandingPageBlueprintV2 } from './blueprint-v2'

const shortTextSchema = z.string().trim().min(1).max(200)
const bodyTextSchema = z.string().trim().min(1).max(1000)
const sectionTypeSchema = z.enum([
  'logo-cloud', 'stats', 'features', 'testimonials', 'pricing', 'faq', 'final-cta', 'footer',
])

export const landingPageProviderBlueprintSchema = z.object({
  version: z.literal(2),
  pagePreset: z.enum(PAGE_PRESET_IDS),
  brand: z.string().trim().min(1).max(100),
  themePreset: z.enum(THEME_PRESET_IDS),
  mood: z.enum(MOOD_PRESET_IDS),
  density: z.enum(DENSITY_PRESET_IDS),
  navbarVariant: z.enum(['compact', 'centered', 'announcement']),
  heroVariant: z.enum(['split', 'centered', 'product-shot', 'editorial']),
  featuresVariant: z.enum(['grid', 'bento', 'alternating']),
  sectionOrder: z.array(sectionTypeSchema).min(4).max(8),
  announcement: shortTextSchema,
  navLabels: z.array(shortTextSchema).min(2).max(5),
  navbarCta: shortTextSchema,
  conversionIntent: z.enum(['lead_form', 'internal_page']).optional(),
  heroBadge: shortTextSchema,
  heroHeading: z.string().trim().min(1).max(220),
  heroParagraph: z.string().trim().min(1).max(1200),
  heroPrimaryCta: shortTextSchema,
  heroSecondaryCta: shortTextSchema,
  heroProof: shortTextSchema,
  heroImageUrl: z.string().url().max(1000).optional(),
  heroImageAlt: z.string().trim().min(1).max(300).optional(),
  logos: z.array(shortTextSchema).min(3).max(8),
  statsHeading: z.string().trim().min(1).max(220),
  stats: z.array(z.object({ value: z.string().trim().min(1).max(40), label: shortTextSchema }).strict()).min(3).max(4),
  featuresHeading: z.string().trim().min(1).max(220),
  featuresParagraph: bodyTextSchema,
  features: z.array(z.object({
    icon: z.enum(ICON_ALLOWLIST),
    heading: shortTextSchema,
    paragraph: bodyTextSchema,
  }).strict()).min(3).max(6),
  testimonialsHeading: z.string().trim().min(1).max(220),
  testimonials: z.array(z.object({ quote: z.string().trim().min(1).max(800), name: shortTextSchema, role: shortTextSchema }).strict()).min(2).max(4),
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
  faqs: z.array(z.object({ question: z.string().trim().min(1).max(240), answer: bodyTextSchema }).strict()).min(3).max(6),
  finalCtaHeading: z.string().trim().min(1).max(220),
  finalCtaParagraph: bodyTextSchema,
  finalCtaText: shortTextSchema,
  footerTagline: z.string().trim().min(1).max(240),
  copyright: z.string().trim().min(1).max(200),
}).strict().superRefine((value, context) => {
  if (Boolean(value.heroImageUrl) !== Boolean(value.heroImageAlt)) {
    context.addIssue({ code: 'custom', path: ['heroImageUrl'], message: 'image_url_and_alt_must_appear_together' })
  }
})

export type LandingPageProviderBlueprint = z.infer<typeof landingPageProviderBlueprintSchema>
export const landingPageProviderBlueprintJsonSchema = z.toJSONSchema(landingPageProviderBlueprintSchema, { target: 'draft-7' })

function orderedSectionTypes(input: LandingPageProviderBlueprint['sectionOrder']): BlueprintV2SectionType[] {
  const unique = [...new Set(input)].filter(type => type !== 'footer')
  if (!unique.includes('features')) unique.unshift('features')
  if (!unique.includes('final-cta')) unique.push('final-cta')
  return [...unique.slice(0, 7), 'footer']
}

function normalizeHighlightedPlans(plans: LandingPageProviderBlueprint['plans']): LandingPageProviderBlueprint['plans'] {
  const highlightedIndex = plans.findIndex(plan => plan.highlighted)
  const selectedIndex = highlightedIndex >= 0 ? highlightedIndex : Math.min(1, plans.length - 1)
  return plans.map((plan, index) => ({ ...plan, highlighted: index === selectedIndex }))
}

function navigationLinks(labels: string[]): { text: string; href: string }[] {
  const targets = ['#features', '#pricing', '#testimonials', '#faq', '#start']
  return labels.map((text, index) => ({ text, href: targets[index] ?? '#top' }))
}

export function normalizeLandingPageProviderBlueprint(input: unknown): LandingPageBlueprintV2 | null {
  const parsed = landingPageProviderBlueprintSchema.safeParse(input)
  if (!parsed.success) return null
  const blueprint = parsed.data
  const sections: Record<BlueprintV2SectionType, LandingPageBlueprintV2['sections'][number]> = {
    'logo-cloud': {
      type: 'logo-cloud', variant: 'panel', eyebrow: 'Được các đội ngũ tin dùng', logos: blueprint.logos,
    },
    stats: {
      type: 'stats', variant: 'cards', heading: blueprint.statsHeading, items: blueprint.stats,
    },
    features: {
      type: 'features', variant: blueprint.featuresVariant, eyebrow: 'Năng lực nổi bật',
      heading: blueprint.featuresHeading, paragraph: blueprint.featuresParagraph, items: blueprint.features,
    },
    testimonials: {
      type: 'testimonials', variant: 'spotlight', eyebrow: 'Khách hàng nói gì',
      heading: blueprint.testimonialsHeading, items: blueprint.testimonials,
    },
    pricing: {
      type: 'pricing', variant: 'contrast', eyebrow: 'Bảng giá', heading: blueprint.pricingHeading,
      paragraph: blueprint.pricingParagraph,
      plans: normalizeHighlightedPlans(blueprint.plans).map(plan => ({
        ...plan, cta: { text: `Chọn ${plan.name}`, href: '#start' },
      })),
    },
    faq: {
      type: 'faq', variant: 'two-column', eyebrow: 'Câu hỏi thường gặp', heading: blueprint.faqHeading, items: blueprint.faqs,
    },
    'final-cta': {
      type: 'final-cta', variant: 'panel', heading: blueprint.finalCtaHeading,
      paragraph: blueprint.finalCtaParagraph, primaryCta: { text: blueprint.finalCtaText, href: '#start' },
    },
    footer: {
      type: 'footer', variant: 'columns', tagline: blueprint.footerTagline,
      columns: [
        { heading: 'Khám phá', links: navigationLinks(blueprint.navLabels).slice(0, 3) },
        { heading: 'Bắt đầu', links: [{ text: blueprint.navbarCta, href: '#start' }, { text: 'Về đầu trang', href: '#top' }] },
      ],
      copyright: blueprint.copyright,
    },
  }
  const image = blueprint.heroImageUrl && blueprint.heroImageAlt
    ? { src: blueprint.heroImageUrl, alt: blueprint.heroImageAlt }
    : undefined
  return {
    version: 2,
    pagePreset: blueprint.pagePreset,
    brand: blueprint.brand,
    ...(blueprint.conversionIntent ? { conversionGoal: { type: blueprint.conversionIntent } } : {}),
    theme: {
      preset: blueprint.themePreset,
      mood: blueprint.mood,
      density: blueprint.density,
      headingFont: blueprint.pagePreset === 'saas' ? 'Manrope' : blueprint.mood === 'editorial' ? 'Georgia' : 'Manrope',
      bodyFont: 'Manrope',
    },
    navbar: {
      variant: blueprint.navbarVariant,
      announcement: blueprint.announcement,
      links: navigationLinks(blueprint.navLabels),
      cta: { text: blueprint.navbarCta, href: '#start' },
    },
    hero: {
      variant: blueprint.heroVariant,
      badge: blueprint.heroBadge,
      heading: blueprint.heroHeading,
      paragraph: blueprint.heroParagraph,
      primaryCta: { text: blueprint.heroPrimaryCta, href: '#start' },
      secondaryCta: { text: blueprint.heroSecondaryCta, href: '#features' },
      proof: blueprint.heroProof,
      ...(image ? { image } : {}),
    },
    sections: orderedSectionTypes(blueprint.sectionOrder).map(type => sections[type]),
  }
}
