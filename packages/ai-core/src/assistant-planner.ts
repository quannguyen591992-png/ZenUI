import { validateDesignDocument, type DesignDocument, type DesignNode } from '@zenui/design-schema'
import { z } from 'zod'

import { websiteBriefSchema, type WebsiteBrief } from './guided-brief'
import {
  deriveProposalScope,
  sectionCompositionSpecSchema,
  styleEditSpecSchema,
  type ProposalScope,
  type SectionCompositionSpec,
  type StyleEditSpec,
} from './proposal'

import type { LlmUsage } from './index'

const contextNodePropsSchema = z.object({
  text: z.string().max(5000).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  alt: z.string().max(300).optional(),
  decorative: z.boolean().optional(),
  label: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  mediaSlot: z.enum(['hero-image', 'feature-1', 'feature-2', 'feature-3']).optional(),
}).strict()

const contextNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  props: contextNodePropsSchema,
}).strict()

const assistantBriefSchema = z.object({
  offer: z.string().trim().min(2).max(500),
  audience: z.string().trim().min(2).max(500),
  primaryGoal: z.string().trim().min(2).max(500),
  cta: z.string().trim().min(2).max(120),
  tone: z.string().trim().min(2).max(300),
  brandDetails: z.string().trim().max(500),
}).strict()

const assistantThemeSchema = z.object({
  colors: z.object({ primary: z.string(), background: z.string(), text: z.string() }).strict(),
  fonts: z.object({ heading: z.string(), body: z.string() }).strict(),
  radius: z.object({ sm: z.number(), md: z.number(), lg: z.number() }).strict(),
}).strict()

const contextScopeSchema = z.object({
  kind: z.enum(['page', 'section', 'element']),
  rootNodeId: z.string().min(1).max(100),
  sectionNodeId: z.string().min(1).max(100).nullable(),
}).strict()

export const assistantContextPackSchema = z.object({
  version: z.literal('assistant-context-v1'),
  request: z.string().trim().min(3).max(4000),
  locale: z.enum(['vi', 'en']),
  documentVersion: z.number().int().positive(),
  scope: contextScopeSchema,
  selectedNode: contextNodeSchema.nullable(),
  section: z.object({
    id: z.string().min(1).max(100),
    type: z.enum(['navbar', 'hero', 'section']),
    label: z.string().min(1).max(200),
    text: z.string().max(3000),
  }).strict().nullable(),
  surroundings: z.array(z.object({
    position: z.enum(['before', 'after']),
    id: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    purpose: z.enum(['introduction', 'trust', 'value', 'objections', 'action']),
  }).strict()).max(2),
  websiteBrief: assistantBriefSchema.nullable(),
  theme: assistantThemeSchema,
  mediaSlot: z.object({
    kind: z.enum(['image', 'feature-media-slot']),
    aspectRatio: z.enum(['square', 'landscape', 'wide', 'portrait', 'unspecified']),
    alt: z.string().max(300).nullable(),
  }).strict().nullable(),
}).strict()
export type AssistantContextPack = z.infer<typeof assistantContextPackSchema>

export const assistantIntentSchema = z.enum(['copy', 'media', 'style', 'layout', 'composition'])
export type AssistantIntent = z.infer<typeof assistantIntentSchema>

export const assistantPlanV2Schema = z.object({
  version: z.literal('assistant-plan-v2'),
  intent: assistantIntentSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(240),
  targetNodeId: z.string().min(1).max(100).nullable(),
  scope: z.enum(['page', 'section', 'element']),
}).strict()
export type AssistantPlanV2 = z.infer<typeof assistantPlanV2Schema>

export interface AssistantPlannerProvider {
  plan(input: { context: AssistantContextPack; signal: AbortSignal }): Promise<{ output: unknown; usage: LlmUsage }>
}

export type AssistantPlanResult =
  | { accepted: true; plan: AssistantPlanV2; usage: LlmUsage }
  | { accepted: false; code: 'invalid_context' | 'invalid_media_target' | 'invalid_model_output' | 'scope_violation' | 'clarification_required' | 'forbidden_action' }

export interface StyleEditPlannerProvider {
  planStyleEdit(input: { context: AssistantContextPack; signal: AbortSignal }): Promise<{ output: unknown; usage: LlmUsage }>
}

export type StyleEditPlanResult =
  | { accepted: true; spec: StyleEditSpec; usage: LlmUsage }
  | { accepted: false; code: 'invalid_context' | 'unsupported_style_target' | 'invalid_model_output' }

export const layoutRecipeSelectionSchema = z.object({
  version: z.literal('layout-recipe-selection-v1'),
  recipeId: z.enum(['navbar-centered', 'hero-centered', 'section-centered', 'section-surface']),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  mobileStack: z.literal('column'),
}).strict()
export type LayoutRecipeSelection = z.infer<typeof layoutRecipeSelectionSchema>

export interface LayoutRecipePlannerProvider {
  planLayoutRecipe(input: { context: AssistantContextPack; signal: AbortSignal }): Promise<{ output: unknown; usage: LlmUsage }>
}

export type LayoutRecipePlanResult =
  | { accepted: true; selection: LayoutRecipeSelection; usage: LlmUsage }
  | { accepted: false; code: 'invalid_context' | 'unsupported_layout_target' | 'invalid_model_output' }

export interface SectionCompositionPlannerProvider {
  planSectionComposition(input: { context: AssistantContextPack; signal: AbortSignal }): Promise<{ output: unknown; usage: LlmUsage }>
}

export type SectionCompositionPlanResult =
  | { accepted: true; spec: SectionCompositionSpec; usage: LlmUsage }
  | { accepted: false; code: 'invalid_context' | 'unsupported_composition_target' | 'invalid_model_output' }

export async function planSectionComposition(input: {
  context: AssistantContextPack
  provider: SectionCompositionPlannerProvider
  signal?: AbortSignal
}): Promise<SectionCompositionPlanResult> {
  const context = assistantContextPackSchema.safeParse(input.context)
  if (!context.success) return { accepted: false, code: 'invalid_context' }
  if (
    context.data.scope.kind !== 'section'
    || !context.data.section
    || context.data.section.type !== 'section'
  ) return { accepted: false, code: 'unsupported_composition_target' }
  const response = await input.provider.planSectionComposition({
    context: context.data,
    signal: input.signal ?? new AbortController().signal,
  })
  const spec = sectionCompositionSpecSchema.safeParse(response.output)
  return spec.success
    ? { accepted: true, spec: spec.data, usage: response.usage }
    : { accepted: false, code: 'invalid_model_output' }
}

export async function planLayoutRecipe(input: {
  context: AssistantContextPack
  provider: LayoutRecipePlannerProvider
  signal?: AbortSignal
}): Promise<LayoutRecipePlanResult> {
  const context = assistantContextPackSchema.safeParse(input.context)
  if (!context.success) return { accepted: false, code: 'invalid_context' }
  if (context.data.scope.kind !== 'section' || !context.data.section) {
    return { accepted: false, code: 'unsupported_layout_target' }
  }
  const response = await input.provider.planLayoutRecipe({
    context: context.data,
    signal: input.signal ?? new AbortController().signal,
  })
  const selection = layoutRecipeSelectionSchema.safeParse(response.output)
  if (!selection.success) return { accepted: false, code: 'invalid_model_output' }
  const expectedPrefix = context.data.section.type === 'navbar'
    ? 'navbar-'
    : context.data.section.type === 'hero' ? 'hero-' : 'section-'
  return selection.data.recipeId.startsWith(expectedPrefix)
    ? { accepted: true, selection: selection.data, usage: response.usage }
    : { accepted: false, code: 'invalid_model_output' }
}

const styleTargetTypes = new Set([
  'section', 'container', 'stack', 'columns', 'column', 'heading', 'paragraph',
  'button', 'link', 'badge', 'navbar', 'hero', 'feature-card',
])

export async function planStyleEdit(input: {
  context: AssistantContextPack
  provider: StyleEditPlannerProvider
  signal?: AbortSignal
}): Promise<StyleEditPlanResult> {
  const context = assistantContextPackSchema.safeParse(input.context)
  if (!context.success) return { accepted: false, code: 'invalid_context' }
  if (
    context.data.scope.kind !== 'element'
    || !context.data.selectedNode
    || !styleTargetTypes.has(context.data.selectedNode.type)
  ) return { accepted: false, code: 'unsupported_style_target' }
  const response = await input.provider.planStyleEdit({
    context: context.data,
    signal: input.signal ?? new AbortController().signal,
  })
  const spec = styleEditSpecSchema.safeParse(response.output)
  return spec.success
    ? { accepted: true, spec: spec.data, usage: response.usage }
    : { accepted: false, code: 'invalid_model_output' }
}

const zeroUsage: LlmUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

function boundedProps(node: DesignNode): z.infer<typeof contextNodePropsSchema> {
  const source = node.props as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of ['text', 'title', 'description', 'alt', 'decorative', 'label', 'brand', 'mediaSlot']) {
    if (source[key] !== undefined) result[key] = source[key]
  }
  return contextNodePropsSchema.parse(result)
}

function contextNode(node: DesignNode): z.infer<typeof contextNodeSchema> {
  return { id: node.id, type: node.type, props: boundedProps(node) }
}

function subtreeIds(document: DesignDocument, rootNodeId: string): string[] {
  const result: string[] = []
  const pending = [rootNodeId]
  const visited = new Set<string>()
  while (pending.length > 0 && result.length < 80) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = document.nodes[id]
    if (!node) continue
    result.push(id)
    pending.push(...node.children)
  }
  return result
}

function nodeText(node: DesignNode): string {
  const props = boundedProps(node)
  return [props.brand, props.label, props.title, props.description, props.text, props.alt]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function sectionText(document: DesignDocument, sectionId: string): string {
  return subtreeIds(document, sectionId)
    .map(id => nodeText(document.nodes[id]!))
    .filter(Boolean)
    .join(' ')
    .slice(0, 3000)
}

function sectionLabel(node: DesignNode): string {
  const props = boundedProps(node)
  return props.brand ?? props.label ?? (node.type === 'hero' ? 'Mở đầu' : 'Nội dung')
}

function storyPurpose(node: DesignNode, text: string): 'introduction' | 'trust' | 'value' | 'objections' | 'action' {
  const key = `${node.type} ${node.id} ${sectionLabel(node)} ${text}`.toLocaleLowerCase('en-US')
  if (node.type === 'navbar' || node.type === 'hero' || /hero|intro|welcome|giới thiệu|mở đầu/.test(key)) return 'introduction'
  if (/testimonial|customer|logo|trust|review|proof|stat|tin dùng|khách hàng|bằng chứng/.test(key)) return 'trust'
  if (/faq|question|objection|câu hỏi|băn khoăn/.test(key)) return 'objections'
  if (/cta|contact|footer|start|signup|action|liên hệ|bắt đầu|đăng ký/.test(key)) return 'action'
  return 'value'
}

function pageSections(document: DesignDocument, scope: ProposalScope): DesignNode[] {
  const page = document.pages.find(candidate => {
    let current: DesignNode | undefined = document.nodes[scope.rootNodeId]
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      if (current.id === candidate.rootNodeId) return true
      visited.add(current.id)
      current = current.parentId ? document.nodes[current.parentId] : undefined
    }
    return false
  }) ?? document.pages[0]
  const root = page ? document.nodes[page.rootNodeId] : undefined
  return root?.children.flatMap(id => {
    const node = document.nodes[id]
    return node && (node.type === 'navbar' || node.type === 'hero' || node.type === 'section') ? [node] : []
  }) ?? []
}

function mediaSlot(node: DesignNode | null): AssistantContextPack['mediaSlot'] {
  if (!node) return null
  const props = boundedProps(node)
  if (node.type === 'image') {
    return {
      kind: 'image',
      aspectRatio: node.style.aspectRatio ?? 'unspecified',
      alt: props.alt ?? null,
    }
  }
  if (node.type === 'feature-card' && props.mediaSlot) {
    return {
      kind: 'feature-media-slot',
      aspectRatio: node.style.aspectRatio ?? (props.mediaSlot === 'hero-image' ? 'wide' : 'landscape'),
      alt: null,
    }
  }
  return null
}

export function buildAssistantContextPack(input: {
  document: DesignDocument
  selectedNodeId?: string | null
  request: string
  locale: 'vi' | 'en'
  brief?: WebsiteBrief | null
}): AssistantContextPack {
  const document = validateDesignDocument(input.document)
  if (!document.success) throw new Error('invalid_design_document')
  const scope = deriveProposalScope(document.data, input.selectedNodeId)
  if (!scope) throw new Error('invalid_scope')
  const selected = input.selectedNodeId ? document.data.nodes[input.selectedNodeId] ?? null : null
  const section = scope.sectionNodeId ? document.data.nodes[scope.sectionNodeId] ?? null : null
  const sections = pageSections(document.data, scope)
  const sectionIndex = section ? sections.findIndex(candidate => candidate.id === section.id) : -1
  const surroundings = sectionIndex < 0 ? [] : [
    sectionIndex > 0 ? { position: 'before' as const, node: sections[sectionIndex - 1]! } : null,
    sectionIndex + 1 < sections.length ? { position: 'after' as const, node: sections[sectionIndex + 1]! } : null,
  ].flatMap(value => value ? [{
    position: value.position,
    id: value.node.id,
    label: sectionLabel(value.node),
    purpose: storyPurpose(value.node, sectionText(document.data, value.node.id)),
  }] : [])
  const parsedBrief = input.brief ? websiteBriefSchema.parse(input.brief) : null
  return assistantContextPackSchema.parse({
    version: 'assistant-context-v1',
    request: input.request,
    locale: input.locale,
    documentVersion: document.data.version,
    scope: { kind: scope.kind, rootNodeId: scope.rootNodeId, sectionNodeId: scope.sectionNodeId },
    selectedNode: selected ? contextNode(selected) : null,
    section: section && (section.type === 'navbar' || section.type === 'hero' || section.type === 'section') ? {
      id: section.id,
      type: section.type,
      label: sectionLabel(section),
      text: sectionText(document.data, section.id),
    } : null,
    surroundings,
    websiteBrief: parsedBrief ? {
      offer: parsedBrief.offer,
      audience: parsedBrief.audience,
      primaryGoal: parsedBrief.primaryGoal,
      cta: parsedBrief.cta,
      tone: parsedBrief.tone,
      brandDetails: parsedBrief.brandDetails,
    } : null,
    theme: document.data.theme,
    mediaSlot: mediaSlot(selected),
  })
}

function expectedTarget(context: AssistantContextPack): string | null {
  return context.scope.kind === 'page' ? null : context.scope.rootNodeId
}

const forbiddenActionPattern = /(?:\b(?:publish|deploy|javascript|script|execute|auth(?:entication)?|permission)\b|xuất\s*bản|triển\s*khai|chạy\s+(?:mã|code)|bỏ\s+qua\s+(?:xác\s+nhận|phê\s+duyệt)|phân\s+quyền)/iu

function deterministicGuard(context: AssistantContextPack): AssistantPlanResult | null {
  if (forbiddenActionPattern.test(context.request)) {
    return { accepted: false, code: 'forbidden_action' }
  }
  if (context.mediaSlot && context.selectedNode && context.selectedNode.type !== 'image' && context.selectedNode.type !== 'feature-card') {
    return { accepted: false, code: 'invalid_media_target' }
  }
  return null
}

function intentScopeAllowed(plan: AssistantPlanV2): boolean {
  if (plan.intent === 'copy' || plan.intent === 'media' || plan.intent === 'style') return plan.scope === 'element'
  if (plan.intent === 'layout' || plan.intent === 'composition') return plan.scope === 'section'
  return false
}

export async function planAssistantIntent(input: {
  context: AssistantContextPack
  provider: AssistantPlannerProvider
  minimumConfidence?: number
  signal?: AbortSignal
}): Promise<AssistantPlanResult> {
  const parsedContext = assistantContextPackSchema.safeParse(input.context)
  if (!parsedContext.success) return { accepted: false, code: 'invalid_context' }
  const guarded = deterministicGuard(parsedContext.data)
  if (guarded) return guarded
  const response = await input.provider.plan({
    context: parsedContext.data,
    signal: input.signal ?? new AbortController().signal,
  })
  const plan = assistantPlanV2Schema.safeParse(response.output)
  if (!plan.success) return { accepted: false, code: 'invalid_model_output' }
  if (plan.data.confidence < (input.minimumConfidence ?? 0.7)) {
    return { accepted: false, code: 'clarification_required' }
  }
  if (
    plan.data.scope !== parsedContext.data.scope.kind
    || plan.data.targetNodeId !== expectedTarget(parsedContext.data)
    || !intentScopeAllowed(plan.data)
  ) return { accepted: false, code: 'scope_violation' }
  if (plan.data.intent === 'media' && !parsedContext.data.mediaSlot) {
    return { accepted: false, code: 'invalid_media_target' }
  }
  if ((plan.data.intent === 'layout' || plan.data.intent === 'composition') && plan.data.scope === 'element') {
    return { accepted: false, code: 'scope_violation' }
  }
  return { accepted: true, plan: plan.data, usage: response.usage ?? zeroUsage }
}
