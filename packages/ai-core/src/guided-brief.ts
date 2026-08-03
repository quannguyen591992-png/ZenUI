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

export const websiteBriefSchema = z.object({
  description: z.string().trim().max(2000),
  offer: briefTextSchema,
  audience: briefTextSchema,
  primaryGoal: briefTextSchema,
  cta: z.string().trim().min(2).max(120),
  tone: z.string().trim().min(2).max(300),
  brandDetails: z.string().trim().max(500),
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
