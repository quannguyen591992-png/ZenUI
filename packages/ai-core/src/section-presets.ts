import { ICON_ALLOWLIST } from '@zenui/design-schema'
import { z } from 'zod'

const safeHrefSchema = z.string().min(1).max(500).refine(value => {
  if (value.startsWith('#') || value.startsWith('/')) return !value.startsWith('//')
  try {
    const protocol = new URL(value).protocol
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:' || protocol === 'tel:'
  } catch {
    return false
  }
}, 'unsafe_href')

const shortTextSchema = z.string().trim().min(1).max(160)
const bodyTextSchema = z.string().trim().min(1).max(1000)
const ctaSchema = z.object({ text: z.string().trim().min(1).max(120), href: safeHrefSchema }).strict()
const imageSchema = z.object({
  src: z.string().url().max(1000),
  alt: z.string().trim().min(1).max(300),
}).strict()
const linkSchema = z.object({ text: z.string().trim().min(1).max(100), href: safeHrefSchema }).strict()

export const PAGE_PRESET_IDS = ['saas', 'course', 'agency', 'portfolio', 'product-launch'] as const
export const THEME_PRESET_IDS = ['indigo', 'emerald', 'coral', 'violet', 'graphite'] as const
export const MOOD_PRESET_IDS = ['confident', 'friendly', 'editorial', 'bold'] as const
export const DENSITY_PRESET_IDS = ['compact', 'balanced', 'airy'] as const

export const navbarPresetSchema = z.object({
  variant: z.enum(['compact', 'centered', 'announcement']),
  links: z.array(linkSchema).min(2).max(5),
  cta: ctaSchema,
  announcement: z.string().trim().min(1).max(140).optional(),
}).strict()

export const heroPresetSchema = z.object({
  variant: z.enum(['split', 'centered', 'product-shot', 'editorial', 'overlap']),
  badge: z.string().trim().min(1).max(100).optional(),
  heading: z.string().trim().min(1).max(220),
  paragraph: z.string().trim().min(1).max(1200),
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema.optional(),
  image: imageSchema.optional(),
  proof: z.string().trim().min(1).max(180).optional(),
}).strict()

export const logoCloudSectionSchema = z.object({
  type: z.literal('logo-cloud'),
  variant: z.enum(['row', 'panel']),
  eyebrow: z.string().trim().min(1).max(120).optional(),
  logos: z.array(shortTextSchema).min(3).max(8),
}).strict()

export const statsSectionSchema = z.object({
  type: z.literal('stats'),
  variant: z.enum(['strip', 'cards']),
  heading: shortTextSchema.optional(),
  items: z.array(z.object({ value: z.string().trim().min(1).max(40), label: shortTextSchema }).strict()).min(3).max(4),
}).strict()

export const featuresSectionSchema = z.object({
  type: z.literal('features'),
  variant: z.enum(['grid', 'bento', 'alternating', 'icon-list']),
  eyebrow: z.string().trim().min(1).max(120).optional(),
  heading: z.string().trim().min(1).max(220),
  paragraph: bodyTextSchema,
  items: z.array(z.object({
    icon: z.enum(ICON_ALLOWLIST),
    heading: shortTextSchema,
    paragraph: bodyTextSchema,
    image: imageSchema.optional(),
  }).strict()).min(3).max(6),
}).strict()

export const testimonialsSectionSchema = z.object({
  type: z.literal('testimonials'),
  variant: z.enum(['cards', 'spotlight', 'quote-wall']),
  eyebrow: z.string().trim().min(1).max(120).optional(),
  heading: z.string().trim().min(1).max(220),
  items: z.array(z.object({
    quote: z.string().trim().min(1).max(800),
    name: shortTextSchema,
    role: shortTextSchema,
  }).strict()).min(2).max(4),
}).strict()

export const pricingSectionSchema = z.object({
  type: z.literal('pricing'),
  variant: z.enum(['cards', 'contrast']),
  eyebrow: z.string().trim().min(1).max(120).optional(),
  heading: z.string().trim().min(1).max(220),
  paragraph: bodyTextSchema,
  plans: z.array(z.object({
    name: shortTextSchema,
    price: z.string().trim().min(1).max(80),
    description: bodyTextSchema,
    features: z.array(shortTextSchema).min(2).max(6),
    cta: ctaSchema,
    highlighted: z.boolean(),
  }).strict()).min(2).max(3),
}).strict()

export const faqSectionSchema = z.object({
  type: z.literal('faq'),
  variant: z.enum(['stacked', 'two-column', 'accordion-cards']),
  eyebrow: z.string().trim().min(1).max(120).optional(),
  heading: z.string().trim().min(1).max(220),
  items: z.array(z.object({
    question: z.string().trim().min(1).max(240),
    answer: bodyTextSchema,
  }).strict()).min(3).max(6),
}).strict()

export const finalCtaSectionSchema = z.object({
  type: z.literal('final-cta'),
  variant: z.enum(['panel', 'split', 'banner']),
  heading: z.string().trim().min(1).max(220),
  paragraph: bodyTextSchema,
  primaryCta: ctaSchema,
  secondaryCta: ctaSchema.optional(),
}).strict()

export const footerSectionSchema = z.object({
  type: z.literal('footer'),
  variant: z.enum(['simple', 'columns']),
  tagline: z.string().trim().min(1).max(240),
  columns: z.array(z.object({
    heading: shortTextSchema,
    links: z.array(linkSchema).min(1).max(5),
  }).strict()).max(3),
  copyright: z.string().trim().min(1).max(200),
}).strict()

export const blueprintV2SectionSchema = z.discriminatedUnion('type', [
  logoCloudSectionSchema,
  statsSectionSchema,
  featuresSectionSchema,
  testimonialsSectionSchema,
  pricingSectionSchema,
  faqSectionSchema,
  finalCtaSectionSchema,
  footerSectionSchema,
])

export type BlueprintV2Section = z.infer<typeof blueprintV2SectionSchema>
export type BlueprintV2SectionType = BlueprintV2Section['type']

export interface SectionPresetDefinition {
  type: BlueprintV2SectionType
  variants: readonly string[]
  contentSchema: z.ZodType<BlueprintV2Section>
  template: {
    root: 'section'
    componentTypes: readonly string[]
  }
  responsiveContract: readonly string[]
  accessibilityRules: readonly string[]
}

function definition(input: SectionPresetDefinition): SectionPresetDefinition {
  return input
}

export const sectionPresetRegistry = {
  'logo-cloud': definition({
    type: 'logo-cloud', variants: ['row', 'panel'], contentSchema: logoCloudSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'paragraph', 'badge'] },
    responsiveContract: ['Wrap logos without horizontal overflow', 'Preserve readable labels at mobile width'],
    accessibilityRules: ['Render organization names as text', 'Do not imply endorsement beyond supplied content'],
  }),
  stats: definition({
    type: 'stats', variants: ['strip', 'cards'], contentSchema: statsSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'feature-card', 'heading', 'paragraph'] },
    responsiveContract: ['Four columns desktop', 'Single column mobile'],
    accessibilityRules: ['Keep value and label adjacent', 'Never encode meaning with color alone'],
  }),
  features: definition({
    type: 'features', variants: ['grid', 'bento', 'alternating', 'icon-list'], contentSchema: featuresSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'columns', 'column', 'feature-card', 'icon', 'heading', 'paragraph', 'image'] },
    responsiveContract: ['Grid collapses to one column on mobile', 'Alternating media becomes copy-first vertical flow'],
    accessibilityRules: ['Use semantic heading order', 'Every image requires descriptive alternative text'],
  }),
  testimonials: definition({
    type: 'testimonials', variants: ['cards', 'spotlight', 'quote-wall'], contentSchema: testimonialsSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'feature-card', 'heading', 'paragraph', 'badge'] },
    responsiveContract: ['Cards collapse without clipping', 'Spotlight remains readable at narrow widths'],
    accessibilityRules: ['Quote attribution is visible text', 'Do not rely on decorative quotation marks'],
  }),
  pricing: definition({
    type: 'pricing', variants: ['cards', 'contrast'], contentSchema: pricingSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'feature-card', 'heading', 'paragraph', 'button', 'icon', 'badge'] },
    responsiveContract: ['Plans use equal columns desktop', 'Plans stack with highlighted plan first on mobile'],
    accessibilityRules: ['Price includes a readable billing phrase', 'Plan features use icon and text'],
  }),
  faq: definition({
    type: 'faq', variants: ['stacked', 'two-column', 'accordion-cards'], contentSchema: faqSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'columns', 'column', 'feature-card', 'heading', 'paragraph'] },
    responsiveContract: ['Two-column layout collapses to one column', 'Answers remain visible without JavaScript'],
    accessibilityRules: ['Questions use headings', 'Static answers require no pointer interaction'],
  }),
  'final-cta': definition({
    type: 'final-cta', variants: ['panel', 'split', 'banner'], contentSchema: finalCtaSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'feature-card', 'stack', 'heading', 'paragraph', 'button'] },
    responsiveContract: ['Actions stack at mobile width', 'Panel padding reduces without reducing tap targets'],
    accessibilityRules: ['CTA text describes the destination', 'Primary action has deterministic contrast'],
  }),
  footer: definition({
    type: 'footer', variants: ['simple', 'columns'], contentSchema: footerSectionSchema,
    template: { root: 'section', componentTypes: ['section', 'container', 'stack', 'heading', 'paragraph', 'link', 'divider'] },
    responsiveContract: ['Columns stack on mobile', 'Links wrap without horizontal overflow'],
    accessibilityRules: ['Footer links remain descriptive', 'Copyright is visible text'],
  }),
} as const satisfies Record<BlueprintV2SectionType, SectionPresetDefinition>

export function getSectionPreset(section: BlueprintV2Section): SectionPresetDefinition {
  return sectionPresetRegistry[section.type]
}
