import { FONT_ALLOWLIST } from '@zenui/design-schema'
import { z } from 'zod'

export const WEBSITE_BRIEF_SECTION_IDS = [
  'introduction',
  'benefits',
  'trust',
  'pricing',
  'faq',
  'contact',
] as const

export const websiteBriefSectionSchema = z.enum(WEBSITE_BRIEF_SECTION_IDS)
export type WebsiteBriefSection = z.infer<typeof websiteBriefSectionSchema>

const briefTextSchema = z.string().trim().min(2).max(500)
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  const parsed = /^#([0-9a-f]{6})$/i.exec(color)
  if (!parsed?.[1]) return Number.NaN
  return 0.2126 * channel(parsed[1].slice(0, 2))
    + 0.7152 * channel(parsed[1].slice(2, 4))
    + 0.0722 * channel(parsed[1].slice(4, 6))
}

function meetsContrast(left: string, right: string, minimum: number): boolean {
  const leftValue = luminance(left)
  const rightValue = luminance(right)
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return false
  return (Math.max(leftValue, rightValue) + 0.05) / (Math.min(leftValue, rightValue) + 0.05) >= minimum
}

export const GUIDED_TYPOGRAPHY_PRESET_IDS = ['compact', 'balanced', 'expressive'] as const
export const GUIDED_SPACING_PRESET_IDS = ['compact', 'balanced', 'airy'] as const
export const GUIDED_RADIUS_PRESET_IDS = ['sharp', 'balanced', 'soft'] as const

const customGuidedDesignSystemSchema = z.object({
  mode: z.literal('custom'),
  colors: z.object({
    primary: hexColorSchema,
    background: hexColorSchema,
    text: hexColorSchema,
  }).strict(),
  fonts: z.object({
    heading: z.enum(FONT_ALLOWLIST),
    body: z.enum(FONT_ALLOWLIST),
  }).strict(),
  typography: z.enum(GUIDED_TYPOGRAPHY_PRESET_IDS),
  spacing: z.enum(GUIDED_SPACING_PRESET_IDS),
  radius: z.enum(GUIDED_RADIUS_PRESET_IDS),
}).strict().superRefine((value, context) => {
  if (!meetsContrast(value.colors.text, value.colors.background, 4.5)) {
    context.addIssue({ code: 'custom', path: ['colors', 'text'], message: 'Text and background require at least 4.5:1 contrast' })
  }
  if (!meetsContrast(value.colors.primary, value.colors.background, 3)) {
    context.addIssue({ code: 'custom', path: ['colors', 'primary'], message: 'Primary and background require at least 3:1 contrast' })
  }
})

export const guidedDesignSystemSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('zenui') }).strict(),
  customGuidedDesignSystemSchema,
])
export type GuidedDesignSystem = z.infer<typeof guidedDesignSystemSchema>

export const websiteBriefSchema = z.object({
  description: z.string().trim().max(2000),
  offer: briefTextSchema,
  audience: briefTextSchema,
  primaryGoal: briefTextSchema,
  cta: z.string().trim().min(2).max(120),
  tone: z.string().trim().min(2).max(300),
  brandDetails: z.string().trim().max(500),
  designSystem: guidedDesignSystemSchema.optional(),
  mustHaveSections: z.array(websiteBriefSectionSchema).min(2).max(WEBSITE_BRIEF_SECTION_IDS.length),
}).strict().superRefine((value, context) => {
  if (new Set(value.mustHaveSections).size !== value.mustHaveSections.length) {
    context.addIssue({ code: 'custom', path: ['mustHaveSections'], message: 'duplicate_section' })
  }
  if (!value.mustHaveSections.includes('introduction')) {
    context.addIssue({ code: 'custom', path: ['mustHaveSections'], message: 'introduction_required' })
  }
  if (!value.mustHaveSections.includes('contact')) {
    context.addIssue({ code: 'custom', path: ['mustHaveSections'], message: 'contact_required' })
  }
})

export type WebsiteBrief = z.infer<typeof websiteBriefSchema>

export function normalizeWebsiteBrief(input: WebsiteBrief): WebsiteBrief & { designSystem: GuidedDesignSystem } {
  return { ...input, designSystem: input.designSystem ?? { mode: 'zenui' } }
}

function matchedValue(input: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = input.match(pattern)
    if (match?.[1]) return match[1].trim().replace(/[.!?]+$/, '')
  }
  return ''
}

export function prefillWebsiteBrief(input: string): Partial<WebsiteBrief> & Pick<WebsiteBrief, 'description' | 'mustHaveSections'> {
  const description = input.trim().slice(0, 2000)
  const sentences = description.split(/(?<=[.!?])\s+/).map(sentence => sentence.trim()).filter(Boolean)
  const offer = sentences[0]?.replace(/[.!?]+$/, '').slice(0, 500) ?? ''
  const audience = matchedValue(description, [
    /(?:dành cho|phục vụ|for)\s+([^.!?]+)/i,
    /(?:giúp|helps?)\s+([^.!?]+?)\s+(?:tạo|lên|build|plan|launch)/i,
  ])
  const primaryGoal = matchedValue(description, [
    /(?:mục tiêu(?:\s+chính)?\s*(?:là|:)|goal\s*(?:is|:))\s*([^.!?]+)/i,
  ])
  const cta = matchedValue(description, [
    /(?:hành động(?:\s+chính)?\s*(?::|là)|main action\s*(?::|is))\s*([^.!?]+)/i,
    /(?:cta\s*(?::|is))\s*([^.!?]+)/i,
  ])
  return {
    description,
    offer,
    ...(audience ? { audience } : {}),
    ...(primaryGoal ? { primaryGoal } : {}),
    ...(cta ? { cta } : {}),
    mustHaveSections: ['introduction', 'benefits', 'contact'],
  }
}
