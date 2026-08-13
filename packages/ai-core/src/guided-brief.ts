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

export const conversionGoalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead_form') }).strict(),
  z.object({ type: z.literal('internal_page') }).strict(),
])
export type ConversionGoal = z.infer<typeof conversionGoalSchema>

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

function contrastRatio(left: string, right: string): number | null {
  const leftValue = luminance(left)
  const rightValue = luminance(right)
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null
  return (Math.max(leftValue, rightValue) + 0.05) / (Math.min(leftValue, rightValue) + 0.05)
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
}).strict()

export const guidedDesignSystemSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('zenui') }).strict(),
  customGuidedDesignSystemSchema,
])
export type GuidedDesignSystem = z.infer<typeof guidedDesignSystemSchema>

export interface GuidedDesignSystemWarning {
  code: 'text_background_contrast' | 'primary_background_contrast'
  path: readonly ['colors', 'text' | 'primary']
  ratio: number
  minimum: 4.5 | 3
}

export function guidedDesignSystemWarnings(
  input: GuidedDesignSystem,
): GuidedDesignSystemWarning[] {
  if (input.mode !== 'custom') return []

  const warnings: GuidedDesignSystemWarning[] = []
  const textRatio = contrastRatio(input.colors.text, input.colors.background)
  if (textRatio !== null && textRatio < 4.5) {
    warnings.push({
      code: 'text_background_contrast',
      path: ['colors', 'text'],
      ratio: Number(textRatio.toFixed(2)),
      minimum: 4.5,
    })
  }

  const primaryRatio = contrastRatio(
    input.colors.primary,
    input.colors.background,
  )
  if (primaryRatio !== null && primaryRatio < 3) {
    warnings.push({
      code: 'primary_background_contrast',
      path: ['colors', 'primary'],
      ratio: Number(primaryRatio.toFixed(2)),
      minimum: 3,
    })
  }

  return warnings
}

export const websiteBriefSchema = z.object({
  description: z.string().trim().max(2000),
  offer: briefTextSchema,
  audience: briefTextSchema,
  primaryGoal: briefTextSchema,
  cta: z.string().trim().min(2).max(120),
  tone: z.string().trim().min(2).max(300),
  brandDetails: z.string().trim().max(500),
  conversionGoal: conversionGoalSchema.optional(),
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

function defaultConversionGoal(): ConversionGoal {
  return { type: 'lead_form' }
}

export function normalizeWebsiteBrief(
  input: WebsiteBrief,
): WebsiteBrief & { conversionGoal: ConversionGoal; designSystem: GuidedDesignSystem } {
  return {
    ...input,
    conversionGoal: input.conversionGoal ?? defaultConversionGoal(),
    designSystem: input.designSystem ?? { mode: 'zenui' },
  }
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
    conversionGoal: defaultConversionGoal(),
    mustHaveSections: ['introduction', 'benefits', 'contact'],
  }
}
