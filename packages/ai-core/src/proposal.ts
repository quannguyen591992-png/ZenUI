import { validateRegistryRelationships } from '@zenui/component-registry'
import { applyCommandTransaction } from '@zenui/design-commands'
import {
  leadFormLayoutPatch,
  validateDesignDocument,
  type DesignDocument,
  type DesignNode,
} from '@zenui/design-schema'
import { z } from 'zod'

import { remixAllowedChangeSchema, remixConstraintsSchema, validateRemixConstraints } from './site-intelligence'

import type { AiOperation, GenerationErrorCode, LLMProvider, LlmUsage } from './index'
import type { RemixConstraints } from './site-intelligence'
import type { DesignCommand } from '@zenui/design-commands'

export const proposalActionSchema = z.enum(['request', 'refine', 'try-another'])
export type ProposalAction = z.infer<typeof proposalActionSchema>
export const proposalIntentSchema = z.enum(['standard', 'remix-section', 'replace-media', 'style', 'layout', 'composition'])
export type ProposalIntent = z.infer<typeof proposalIntentSchema>

const proposalScopeBaseSchema = z.object({
  rootNodeId: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
})

export const proposalScopeSchema = z.discriminatedUnion('kind', [
  proposalScopeBaseSchema.extend({
    kind: z.literal('page'),
    sectionNodeId: z.null(),
  }).strict(),
  proposalScopeBaseSchema.extend({
    kind: z.literal('section'),
    sectionNodeId: z.string().min(1).max(100),
  }).strict(),
  proposalScopeBaseSchema.extend({
    kind: z.literal('element'),
    sectionNodeId: z.string().min(1).max(100),
  }).strict(),
])
export type ProposalScope = z.infer<typeof proposalScopeSchema>

const mediaReplacementPattern = /(?:\b(?:image|photo|picture|visual)\b|(?:đổi|thay|tạo|làm|chọn|tìm)\s+(?:hình|ảnh)|(?:hình|ảnh)\s+(?:mới|khác|phù hợp|giống))/iu
const altTextPattern = /(?:\balt(?:ernative)?\s+text\b|mô\s+tả\s+(?:hình|ảnh)|(?:hình|ảnh)\s+thay\s+thế)/iu

export function leadFormAlignmentFromPrompt(prompt: string): 'left' | 'center' | 'right' | null {
  const alignments = new Set<'left' | 'center' | 'right'>()
  if (/(?:\bleft\b|(?:canh|căn)\s+trái)/iu.test(prompt)) alignments.add('left')
  if (/(?:\b(?:center|centre)(?:ed)?\b|(?:canh|căn)\s+giữa)/iu.test(prompt)) alignments.add('center')
  if (/(?:\bright\b|(?:canh|căn)\s+phải)/iu.test(prompt)) alignments.add('right')
  return alignments.size === 1 ? [...alignments][0]! : null
}

function isMediaTarget(node: DesignNode | undefined): boolean {
  return Boolean(
    node?.type === 'image'
    || (node?.type === 'feature-card' && 'mediaSlot' in node.props && node.props.mediaSlot),
  )
}

export type ProposalIntentRoute =
  | { accepted: true; intent: ProposalIntent; targetNodeId: string | null }
  | { accepted: false; code: 'forbidden_action' | 'invalid_media_target' | 'invalid_scope' }

const forbiddenProposalPattern = /(?:\b(?:publish|deploy|javascript|script|execute|raw\s+css|auth(?:entication)?|permission)\b|xuất\s*bản|triển\s*khai|chạy\s+(?:mã|code)|bỏ\s+qua\s+(?:xác\s+nhận|phê\s+duyệt)|phân\s+quyền)/iu

export function routeProposalIntent(input: {
  document: DesignDocument
  selectedNodeId: string | null | undefined
  requestedIntent: ProposalIntent
  prompt: string
}): ProposalIntentRoute {
  if (forbiddenProposalPattern.test(input.prompt)) {
    return { accepted: false, code: 'forbidden_action' }
  }
  const target = input.selectedNodeId ? input.document.nodes[input.selectedNodeId] : undefined
  const asksForMedia = input.requestedIntent === 'replace-media'
    || (mediaReplacementPattern.test(input.prompt) && !altTextPattern.test(input.prompt))
  if (asksForMedia) {
    return isMediaTarget(target) && input.selectedNodeId
      ? { accepted: true, intent: 'replace-media', targetNodeId: input.selectedNodeId }
      : { accepted: false, code: 'invalid_media_target' }
  }
  if (
    input.requestedIntent === 'standard'
    && target?.type === 'lead-form'
    && input.selectedNodeId
    && leadFormAlignmentFromPrompt(input.prompt)
  ) {
    return { accepted: true, intent: 'style', targetNodeId: input.selectedNodeId }
  }
  if (input.requestedIntent === 'remix-section' && !input.selectedNodeId) {
    return { accepted: false, code: 'invalid_scope' }
  }
  return { accepted: true, intent: input.requestedIntent, targetNodeId: input.selectedNodeId ?? null }
}

export const proposalFeedbackCodeSchema = z.enum([
  'wrong_topic', 'style_mismatch', 'layout_mismatch', 'unwanted_detail', 'copy_mismatch', 'other',
])
export type ProposalFeedbackCode = z.infer<typeof proposalFeedbackCodeSchema>

const proposalRequestBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  selectedNodeId: z.string().min(1).max(100).optional(),
  intent: proposalIntentSchema.default('standard'),
  allowedChanges: z.array(remixAllowedChangeSchema).max(3).default([]),
  feedbackCodes: z.array(proposalFeedbackCodeSchema).max(3).optional(),
})

export const proposalRequestSchema = z.discriminatedUnion('action', [
  proposalRequestBaseSchema.extend({
    action: z.literal('request'),
    prompt: z.string().trim().min(3).max(4000),
  }).strict(),
  proposalRequestBaseSchema.extend({
    action: z.literal('refine'),
    prompt: z.string().trim().min(3).max(4000),
    previousProposalId: z.string().uuid(),
  }).strict(),
  proposalRequestBaseSchema.extend({
    action: z.literal('try-another'),
    prompt: z.undefined().optional(),
    previousProposalId: z.string().uuid(),
  }).strict(),
]).superRefine((value, context) => {
  if ((value.intent === 'remix-section' || value.intent === 'replace-media' || value.intent === 'style' || value.intent === 'layout' || value.intent === 'composition') && !value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'This proposal intent requires an exact selection' })
  }
  if (value.intent === 'standard' && value.allowedChanges.length > 0) {
    context.addIssue({ code: 'custom', path: ['allowedChanges'], message: 'Allowed changes are only valid for Remix' })
  }
  if (value.action !== 'refine' && value.feedbackCodes) {
    context.addIssue({ code: 'custom', path: ['feedbackCodes'], message: 'Structured feedback is only valid for refinement' })
  }
  if (value.feedbackCodes && new Set(value.feedbackCodes).size !== value.feedbackCodes.length) {
    context.addIssue({ code: 'custom', path: ['feedbackCodes'], message: 'Feedback codes must be unique' })
  }
  if (new Set(value.allowedChanges).size !== value.allowedChanges.length) {
    context.addIssue({ code: 'custom', path: ['allowedChanges'], message: 'Allowed changes must be unique' })
  }
})
export type ProposalRequest = z.infer<typeof proposalRequestSchema>

const elementLabels: Partial<Record<DesignNode['type'], string>> = {
  heading: 'Tiêu đề',
  paragraph: 'Đoạn văn',
  image: 'Hình ảnh',
  button: 'Nút hành động',
  link: 'Liên kết',
  badge: 'Nhãn',
  icon: 'Biểu tượng',
  divider: 'Đường phân cách',
  spacer: 'Khoảng cách',
  container: 'Nhóm nội dung',
  'lead-form': 'Biểu mẫu',
}

function sectionLabel(node: DesignNode): string {
  if (node.type === 'navbar' && 'brand' in node.props) return String(node.props.brand)
  if ((node.type === 'hero' || node.type === 'section') && 'label' in node.props && node.props.label) {
    return String(node.props.label)
  }
  if (node.type === 'hero') return 'Giới thiệu'
  if (node.type === 'navbar') return 'Thanh điều hướng'
  return 'Nội dung'
}

function containingSection(document: DesignDocument, nodeId: string): DesignNode | null {
  let currentId: string | null = nodeId
  const pageRootId = document.pages[0]?.rootNodeId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const current: DesignNode | undefined = document.nodes[currentId]
    if (!current) return null
    if (
      (current.type === 'navbar' || current.type === 'hero' || current.type === 'section')
      && current.parentId === pageRootId
    ) return current
    currentId = current.parentId
  }
  return null
}

export function deriveProposalScope(
  document: DesignDocument,
  selectedNodeId: string | null | undefined,
): ProposalScope | null {
  const pageRootId = document.pages[0]?.rootNodeId
  if (!pageRootId || !document.nodes[pageRootId]) return null
  if (!selectedNodeId || selectedNodeId === pageRootId) {
    return { kind: 'page', rootNodeId: pageRootId, label: 'Toàn website', sectionNodeId: null }
  }
  const node = document.nodes[selectedNodeId]
  if (!node) return null
  const section = containingSection(document, node.id)
  if (!section) return null
  const sectionName = sectionLabel(section)
  if (node.id === section.id) {
    return {
      kind: 'section',
      rootNodeId: section.id,
      label: `Phần ${sectionName}`,
      sectionNodeId: section.id,
    }
  }
  return {
    kind: 'element',
    rootNodeId: node.id,
    label: `${elementLabels[node.type] ?? 'Nội dung'} trong Phần ${sectionName}`,
    sectionNodeId: section.id,
  }
}

export const styleEditSpecSchema = z.object({
  version: z.literal('style-edit-spec-v1'),
  emphasis: z.enum(['preserve', 'subtle', 'strong']),
  spacingDensity: z.enum(['preserve', 'compact', 'comfortable', 'spacious']),
  alignment: z.enum(['preserve', 'left', 'center', 'right']),
  surface: z.enum(['preserve', 'none', 'soft', 'primary']),
  mobileStack: z.enum(['preserve', 'column']),
}).strict()
export type StyleEditSpec = z.infer<typeof styleEditSpecSchema>

export type MaterializeStyleProposalResult = MaterializeProposalResult
  | { accepted: false; code: 'unsupported_style_target' | 'accessibility_regression' }

const styleTargetTypes = new Set<DesignNode['type']>([
  'section', 'container', 'stack', 'columns', 'column', 'heading', 'paragraph', 'button', 'link', 'badge', 'navbar', 'hero', 'feature-card', 'lead-form',
])

function colorChannel(value: string): number {
  const channel = Number.parseInt(value, 16) / 255
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function colorLuminance(color: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return 0
  return colorChannel(color.slice(1, 3)) * 0.2126
    + colorChannel(color.slice(3, 5)) * 0.7152
    + colorChannel(color.slice(5, 7)) * 0.0722
}

function contrastRatio(left: string, right: string): number {
  const first = colorLuminance(left)
  const second = colorLuminance(right)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

function stylePatch(document: DesignDocument, node: DesignNode, spec: StyleEditSpec): {
  desktop: Record<string, unknown>
  mobile: Record<string, unknown>
} {
  const desktop: Record<string, unknown> = {}
  const mobile: Record<string, unknown> = {}
  if (spec.emphasis !== 'preserve') {
    desktop.fontWeight = spec.emphasis === 'strong' ? '700' : '500'
  }
  if (spec.alignment !== 'preserve') {
    if (node.type === 'lead-form') Object.assign(desktop, leadFormLayoutPatch(spec.alignment))
    else desktop.textAlign = spec.alignment
  }
  if (spec.spacingDensity !== 'preserve') {
    const spacing = { compact: 8, comfortable: 16, spacious: 32 }[spec.spacingDensity]
    if (node.type === 'section' || node.type === 'hero') {
      desktop.paddingTop = spacing * 2
      desktop.paddingBottom = spacing * 2
    } else if (['container', 'stack', 'columns', 'column', 'navbar', 'feature-card'].includes(node.type)) {
      desktop.gap = spacing
    } else {
      desktop.marginBottom = spacing
    }
  }
  if (spec.surface === 'soft') desktop.backgroundColor = document.theme.colors.background
  if (spec.surface === 'primary') {
    desktop.backgroundColor = document.theme.colors.primary
    desktop.color = '#ffffff'
  }
  if (spec.surface === 'none') {
    desktop.backgroundColor = null
  }
  if (spec.mobileStack === 'column') {
    mobile.flexDirection = 'column'
    mobile.width = 'full'
  }
  return { desktop, mobile }
}

export function materializeStyleProposal(input: {
  document: DesignDocument
  targetNodeId: string
  spec: unknown
  runId: string
  expectedVersion: number
  summary: string
}): MaterializeStyleProposalResult {
  if (input.document.version !== input.expectedVersion) return { accepted: false, code: 'stale_document_version' }
  const spec = styleEditSpecSchema.safeParse(input.spec)
  const summary = z.string().trim().min(1).max(200).safeParse(input.summary)
  const node = input.document.nodes[input.targetNodeId]
  if (!spec.success || !summary.success) return { accepted: false, code: 'invalid_model_output' }
  if (!node || !styleTargetTypes.has(node.type)) return { accepted: false, code: 'unsupported_style_target' }
  if (spec.data.mobileStack === 'column' && !['container', 'stack', 'columns', 'navbar', 'hero', 'section', 'feature-card'].includes(node.type)) {
    return { accepted: false, code: 'unsupported_style_target' }
  }
  const patch = stylePatch(input.document, node, spec.data)
  const background = typeof patch.desktop.backgroundColor === 'string'
    ? patch.desktop.backgroundColor
    : node.style.backgroundColor ?? input.document.theme.colors.background
  const color = typeof patch.desktop.color === 'string'
    ? patch.desktop.color
    : node.style.color ?? input.document.theme.colors.text
  if ((patch.desktop.backgroundColor || patch.desktop.color) && contrastRatio(color, background) < 4.5) {
    return { accepted: false, code: 'accessibility_regression' }
  }
  const metadata = { documentVersion: input.expectedVersion, source: 'ai' as const }
  const commands: DesignCommand[] = []
  if (Object.keys(patch.desktop).length > 0) {
    commands.push({
      ...metadata, commandId: `${input.runId}-style-0`, type: 'UPDATE_STYLE',
      nodeId: node.id, patch: patch.desktop,
    })
  }
  if (Object.keys(patch.mobile).length > 0) {
    commands.push({
      ...metadata, commandId: `${input.runId}-style-mobile-0`, type: 'UPDATE_RESPONSIVE_STYLE',
      nodeId: node.id, breakpoint: 'mobile', patch: patch.mobile,
    })
  }
  if (commands.length === 0) return { accepted: false, code: 'invalid_model_output' }
  const transaction = applyCommandTransaction(input.document, input.expectedVersion, commands)
  if (!transaction.accepted || !validateDesignDocument(transaction.document).success || validateRegistryRelationships(transaction.document).length > 0) {
    return { accepted: false, code: transaction.accepted ? 'invalid_model_output' : transaction.error.code === 'stale_document_version' ? 'stale_document_version' : 'invalid_model_output' }
  }
  return { accepted: true, commands, proposedDocument: transaction.document, summary: summary.data }
}

export function materializeLayoutProposal(input: {
  document: DesignDocument
  sectionNodeId: string
  selection: unknown
  runId: string
  expectedVersion: number
  summary: string
}): MaterializeProposalResult | { accepted: false; code: 'unsupported_layout_target' } {
  if (input.document.version !== input.expectedVersion) return { accepted: false, code: 'stale_document_version' }
  const selection = z.object({
    version: z.literal('layout-recipe-selection-v1'),
    recipeId: z.enum(['navbar-centered', 'hero-centered', 'section-centered', 'section-surface']),
    density: z.enum(['compact', 'comfortable', 'spacious']),
    mobileStack: z.literal('column'),
  }).strict().safeParse(input.selection)
  const summary = z.string().trim().min(1).max(200).safeParse(input.summary)
  const section = input.document.nodes[input.sectionNodeId]
  const pageRoot = section?.parentId ? input.document.nodes[section.parentId] : undefined
  if (!section || !pageRoot || pageRoot.type !== 'page' || !['navbar', 'hero', 'section'].includes(section.type)) {
    return { accepted: false, code: 'unsupported_layout_target' }
  }
  if (!selection.success || !summary.success) return { accepted: false, code: 'invalid_model_output' }
  const prefix = section.type === 'navbar' ? 'navbar-' : section.type === 'hero' ? 'hero-' : 'section-'
  if (!selection.data.recipeId.startsWith(prefix)) return { accepted: false, code: 'invalid_model_output' }
  const density = { compact: 48, comfortable: 64, spacious: 96 }[selection.data.density]
  const desktop: Record<string, unknown> = {
    paddingTop: density,
    paddingBottom: density,
  }
  if (selection.data.recipeId.endsWith('centered')) desktop.textAlign = 'center'
  if (selection.data.recipeId === 'navbar-centered') {
    desktop.display = 'flex'
    desktop.justifyContent = 'center'
    desktop.alignItems = 'center'
  }
  if (selection.data.recipeId === 'section-surface') desktop.backgroundColor = input.document.theme.colors.background
  const commands: DesignCommand[] = [{
    commandId: `${input.runId}-layout-0`, documentVersion: input.expectedVersion, source: 'ai',
    type: 'UPDATE_STYLE', nodeId: section.id, patch: desktop,
  }, {
    commandId: `${input.runId}-layout-mobile-0`, documentVersion: input.expectedVersion, source: 'ai',
    type: 'UPDATE_RESPONSIVE_STYLE', nodeId: section.id, breakpoint: 'mobile',
    patch: { paddingTop: 32, paddingBottom: 32 },
  }]
  const transaction = applyCommandTransaction(input.document, input.expectedVersion, commands)
  if (!transaction.accepted || !validateDesignDocument(transaction.document).success || validateRegistryRelationships(transaction.document).length > 0) {
    return { accepted: false, code: transaction.accepted ? 'invalid_model_output' : transaction.error.code === 'stale_document_version' ? 'stale_document_version' : 'invalid_model_output' }
  }
  return { accepted: true, commands, proposedDocument: transaction.document, summary: summary.data }
}

export const compositionPreservationSchema = z.object({
  copy: z.literal('preserve'),
  cta: z.literal('preserve'),
  brand: z.literal('preserve'),
  media: z.literal('preserve'),
  order: z.literal('preserve'),
  responsive: z.literal('preserve'),
}).strict()

export const sectionCompositionSpecSchema = z.object({
  version: z.literal('section-composition-spec-v1'),
  templateId: z.enum(['section-split', 'section-stacked', 'section-cards']),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  preservation: compositionPreservationSchema,
}).strict()
export type SectionCompositionSpec = z.infer<typeof sectionCompositionSpecSchema>

function sectionSubtreeNodes(document: DesignDocument, rootNodeId: string): DesignNode[] {
  const result: DesignNode[] = []
  const pending = [rootNodeId]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = document.nodes[id]
    if (!node) continue
    result.push(structuredClone(node))
    pending.push(...node.children)
  }
  return result
}

function compositionId(runId: string, suffix: string): string {
  return `${runId}-composition-${suffix}`
}

function cloneCompositionContent(
  document: DesignDocument,
  rootNodeId: string,
  parentId: string,
): DesignNode[] {
  return sectionSubtreeNodes(document, rootNodeId).map(node => ({
    ...node,
    parentId: node.id === rootNodeId ? parentId : node.parentId,
  }))
}

export function materializeSectionCompositionProposal(input: {
  document: DesignDocument
  sectionNodeId: string
  spec: unknown
  runId: string
  expectedVersion: number
  summary: string
}): MaterializeProposalResult | { accepted: false; code: 'unsupported_composition_target' } {
  if (input.document.version !== input.expectedVersion) return { accepted: false, code: 'stale_document_version' }
  const spec = sectionCompositionSpecSchema.safeParse(input.spec)
  const summary = z.string().trim().min(1).max(200).safeParse(input.summary)
  const section = input.document.nodes[input.sectionNodeId]
  const pageRoot = section?.parentId ? input.document.nodes[section.parentId] : undefined
  if (!section || section.type !== 'section' || !pageRoot || pageRoot.type !== 'page') {
    return { accepted: false, code: 'unsupported_composition_target' }
  }
  if (!spec.success || !summary.success) return { accepted: false, code: 'invalid_model_output' }

  const sourceChildren = section.children.flatMap(childId => sectionSubtreeNodes(input.document, childId))
  if (sourceChildren.length === 0) return { accepted: false, code: 'invalid_model_output' }
  const density = { compact: 32, comfortable: 64, spacious: 96 }[spec.data.density]
  const containerId = compositionId(input.runId, 'container')
  const container: DesignNode = {
    id: containerId,
    type: 'container',
    parentId: section.id,
    children: [],
    props: {},
    style: { width: 'full', maxWidth: 1200 },
    responsive: {},
  }
  let wrapperNodes: DesignNode[] = []
  if (spec.data.templateId === 'section-split') {
    const columnsId = compositionId(input.runId, 'columns')
    const leftId = compositionId(input.runId, 'left')
    const rightId = compositionId(input.runId, 'right')
    const splitIndex = Math.max(1, Math.ceil(section.children.length / 2))
    const groups = [section.children.slice(0, splitIndex), section.children.slice(splitIndex)]
    const columns: DesignNode = {
      id: columnsId, type: 'columns', parentId: containerId, children: [leftId, rightId], props: {},
      style: { display: 'grid', gridColumns: 2, gap: 32 }, responsive: { mobile: { gridColumns: 1 } },
    }
    const left: DesignNode = { id: leftId, type: 'column', parentId: columnsId, children: [], props: {}, style: {}, responsive: {} }
    const right: DesignNode = { id: rightId, type: 'column', parentId: columnsId, children: [], props: {}, style: {}, responsive: {} }
    const cloned = groups.flatMap((group, groupIndex) => group.flatMap(childId => cloneCompositionContent(
      input.document,
      childId,
      groupIndex === 0 ? leftId : rightId,
    )))
    left.children = [...groups[0]!]
    right.children = [...groups[1]!]
    container.children = [columnsId]
    wrapperNodes = [container, columns, left, right, ...cloned]
  } else {
    const stackId = compositionId(input.runId, spec.data.templateId === 'section-cards' ? 'cards' : 'stack')
    const stack: DesignNode = {
      id: stackId, type: 'stack', parentId: containerId, children: [], props: {},
      style: spec.data.templateId === 'section-cards'
        ? { display: 'grid', gridColumns: 3, gap: 24 }
        : { display: 'flex', flexDirection: 'column', gap: 24 },
      responsive: { mobile: spec.data.templateId === 'section-cards' ? { gridColumns: 1 } : { flexDirection: 'column' } },
    }
    const cloned = section.children.flatMap(childId => cloneCompositionContent(
      input.document,
      childId,
      stackId,
    ))
    stack.children = [...section.children]
    container.children = [stackId]
    wrapperNodes = [container, stack, ...cloned]
  }
  const replacementSection: DesignNode = {
    ...structuredClone(section),
    children: [containerId],
    style: { ...section.style, paddingTop: density, paddingBottom: density },
    responsive: { ...section.responsive, mobile: { ...(section.responsive.mobile ?? {}), paddingTop: 32, paddingBottom: 32 } },
  }
  const command: DesignCommand = {
    commandId: `${input.runId}-composition-0`,
    documentVersion: input.expectedVersion,
    source: 'ai',
    type: 'REPLACE_SUBTREE',
    nodeId: section.id,
    rootNodeId: section.id,
    nodes: [replacementSection, ...wrapperNodes],
  }
  const transaction = applyCommandTransaction(input.document, input.expectedVersion, [command])
  if (!transaction.accepted || !validateDesignDocument(transaction.document).success || validateRegistryRelationships(transaction.document).length > 0) {
    return { accepted: false, code: transaction.accepted ? 'invalid_model_output' : transaction.error.code === 'stale_document_version' ? 'stale_document_version' : 'invalid_model_output' }
  }
  return { accepted: true, commands: [command], proposedDocument: transaction.document, summary: summary.data }
}

const proposalFeedbackSchema = z.object({
  codes: z.array(proposalFeedbackCodeSchema).min(1).max(3),
  note: z.string().trim().min(3).max(1000).optional(),
}).strict()
const proposalLineageTurnSchema = z.object({
  proposalId: z.string().uuid(),
  action: proposalActionSchema,
  feedback: proposalFeedbackSchema.nullable(),
  rejectedCandidateIds: z.array(z.string().min(1).max(100)).max(3),
}).strict()
export const proposalLineageSchema = z.object({
  version: z.literal('proposal-lineage-v1'),
  rootRequestId: z.string().uuid(),
  originalRequest: z.string().trim().min(3).max(4000),
  targetNodeId: z.string().min(1).max(100).nullable(),
  scope: proposalScopeSchema,
  contextFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  turns: z.array(proposalLineageTurnSchema).min(1).max(8),
}).strict().superRefine((value, context) => {
  const expectedTarget = value.scope.kind === 'page' ? null : value.scope.rootNodeId
  if (value.targetNodeId !== expectedTarget) {
    context.addIssue({ code: 'custom', path: ['targetNodeId'], message: 'Lineage target must match its immutable scope' })
  }
})
export type ProposalLineage = z.infer<typeof proposalLineageSchema>

export function createProposalLineage(input: {
  rootRequestId: string
  originalRequest: string
  targetNodeId: string | null
  scope: ProposalScope
  contextFingerprint: string
  proposalId: string
  rejectedCandidateIds?: string[]
}): ProposalLineage {
  return proposalLineageSchema.parse({
    version: 'proposal-lineage-v1',
    rootRequestId: input.rootRequestId,
    originalRequest: input.originalRequest,
    targetNodeId: input.targetNodeId,
    scope: input.scope,
    contextFingerprint: input.contextFingerprint,
    turns: [{
      proposalId: input.proposalId,
      action: 'request',
      feedback: null,
      rejectedCandidateIds: input.rejectedCandidateIds ?? [],
    }],
  })
}

export function appendProposalLineageTurn(input: {
  lineage: ProposalLineage
  proposalId: string
  action: Exclude<ProposalAction, 'request'>
  feedback?: { codes: z.infer<typeof proposalFeedbackCodeSchema>[]; note?: string }
  rejectedCandidateIds?: string[]
}): ProposalLineage {
  const lineage = proposalLineageSchema.parse(input.lineage)
  return proposalLineageSchema.parse({
    ...lineage,
    turns: [...lineage.turns, {
      proposalId: input.proposalId,
      action: input.action,
      feedback: input.feedback ?? null,
      rejectedCandidateIds: input.rejectedCandidateIds ?? [],
    }].slice(-8),
  })
}

export function buildProposalRefinementRequest(input: {
  lineage: ProposalLineage
  action: Exclude<ProposalAction, 'request'>
}) {
  const lineage = proposalLineageSchema.parse(input.lineage)
  return {
    originalRequest: lineage.originalRequest,
    targetNodeId: lineage.targetNodeId,
    scope: lineage.scope,
    previousProposalIds: lineage.turns.map(turn => turn.proposalId),
    rejectedCandidateIds: [...new Set(lineage.turns.flatMap(turn => turn.rejectedCandidateIds))],
    feedback: lineage.turns.flatMap(turn => turn.feedback ? [turn.feedback] : []),
  }
}

export type MaterializeProposalResult =
  | {
      accepted: true
      commands: DesignCommand[]
      proposedDocument: DesignDocument
      summary: string
    }
  | { accepted: false; code: 'scope_violation' | 'invalid_model_output' | 'stale_document_version' }

interface MaterializeCommands {
  mode: 'edit-page' | 'edit-selection'
  selectedNodeId?: string
  document: DesignDocument
  operations: unknown
  runId: string
  expectedVersion: number
}

export function materializeProposalWithCommands(input: {
  document: DesignDocument
  scope: ProposalScope
  operations: unknown
  summary: unknown
  runId: string
  expectedVersion: number
  materializeCommands?: (input: MaterializeCommands) =>
    | { accepted: true; commands: DesignCommand[] }
    | { accepted: false; code: 'scope_violation' | 'invalid_model_output' }
}): MaterializeProposalResult {
  if (input.document.version !== input.expectedVersion) {
    return { accepted: false, code: 'stale_document_version' }
  }
  const parsedScope = proposalScopeSchema.safeParse(input.scope)
  const parsedSummary = z.string().trim().min(1).max(200).safeParse(input.summary)
  if (!parsedScope.success || !parsedSummary.success) return { accepted: false, code: 'invalid_model_output' }
  const derived = deriveProposalScope(
    input.document,
    parsedScope.data.kind === 'page' ? null : parsedScope.data.rootNodeId,
  )
  if (
    !derived
    || derived.kind !== parsedScope.data.kind
    || derived.rootNodeId !== parsedScope.data.rootNodeId
    || derived.label !== parsedScope.data.label
    || derived.sectionNodeId !== parsedScope.data.sectionNodeId
  ) {
    return { accepted: false, code: 'scope_violation' }
  }
  if (!input.materializeCommands) throw new Error('materialize_commands_required')
  const materialized = input.materializeCommands({
    mode: parsedScope.data.kind === 'page' ? 'edit-page' : 'edit-selection',
    ...(parsedScope.data.kind !== 'page' ? { selectedNodeId: parsedScope.data.rootNodeId } : {}),
    document: input.document,
    operations: input.operations,
    runId: input.runId,
    expectedVersion: input.expectedVersion,
  })
  if (!materialized.accepted) return materialized
  const transaction = applyCommandTransaction(input.document, input.expectedVersion, materialized.commands)
  if (!transaction.accepted) {
    return {
      accepted: false,
      code: transaction.error.code === 'stale_document_version'
        ? 'stale_document_version'
        : 'invalid_model_output',
    }
  }
  if (!validateDesignDocument(transaction.document).success || validateRegistryRelationships(transaction.document).length > 0) {
    return { accepted: false, code: 'invalid_model_output' }
  }
  return {
    accepted: true,
    commands: materialized.commands,
    proposedDocument: transaction.document,
    summary: parsedSummary.data,
  }
}

export function materializeMediaProposal(input: {
  document: DesignDocument
  targetNodeId: string
  assetId: string
  alt: string
  runId: string
  expectedVersion: number
  summary: string
}): MaterializeProposalResult {
  if (input.document.version !== input.expectedVersion) return { accepted: false, code: 'stale_document_version' }
  const assetId = z.string().uuid().safeParse(input.assetId)
  const alt = z.string().trim().min(1).max(300).safeParse(input.alt)
  const summary = z.string().trim().min(1).max(200).safeParse(input.summary)
  const target = input.document.nodes[input.targetNodeId]
  if (!assetId.success || !alt.success || !summary.success || !isMediaTarget(target)) {
    return { accepted: false, code: target ? 'invalid_model_output' : 'scope_violation' }
  }
  const metadata = {
    commandId: `${input.runId}-media-0`,
    documentVersion: input.expectedVersion,
    source: 'ai' as const,
  }
  const commands: DesignCommand[] = target!.type === 'image'
    ? [{
        ...metadata,
        type: 'UPDATE_PROPS',
        nodeId: target!.id,
        patch: { assetId: assetId.data, alt: alt.data, decorative: false, src: null },
      }]
    : (() => {
        if (!target!.parentId) return []
        const mediaSlot = 'mediaSlot' in target!.props ? target!.props.mediaSlot : undefined
        const imageId = `${input.runId}-media-image`
        return [{
          ...metadata,
          type: 'REPLACE_SUBTREE' as const,
          nodeId: target!.id,
          rootNodeId: imageId,
          nodes: [{
            id: imageId,
            type: 'image' as const,
            parentId: target!.parentId,
            children: [],
            props: { assetId: assetId.data, alt: alt.data, decorative: false },
            style: {
              width: 'full' as const,
              aspectRatio: mediaSlot === 'hero-image' ? 'wide' as const : 'landscape' as const,
              objectFit: 'cover' as const,
              objectPosition: 'center' as const,
              borderRadius: input.document.theme.radius.md,
              shadow: 'md' as const,
              backgroundColor: '#eef2ff',
            },
            responsive: mediaSlot === 'hero-image'
              ? { tablet: { aspectRatio: 'landscape' as const }, mobile: { aspectRatio: 'landscape' as const, objectPosition: 'top' as const } }
              : {},
          }],
        }]
      })()
  if (commands.length === 0) return { accepted: false, code: 'scope_violation' }
  const transaction = applyCommandTransaction(input.document, input.expectedVersion, commands)
  if (!transaction.accepted) {
    return {
      accepted: false,
      code: transaction.error.code === 'stale_document_version' ? 'stale_document_version' : 'invalid_model_output',
    }
  }
  if (validateRegistryRelationships(transaction.document).length > 0) {
    return { accepted: false, code: 'invalid_model_output' }
  }
  return { accepted: true, commands, proposedDocument: transaction.document, summary: summary.data }
}

export function proposalSnapshotMatches(
  base: DesignDocument,
  commands: readonly DesignCommand[],
  snapshot: DesignDocument,
): boolean {
  const validated = validateDesignDocument(snapshot)
  if (!validated.success) return false
  const transaction = applyCommandTransaction(base, base.version, commands)
  return transaction.accepted && JSON.stringify(transaction.document) === JSON.stringify(validated.data)
}

export function validateProposalRemix(input: {
  intent: ProposalIntent
  base: DesignDocument
  proposed: DesignDocument
  constraints?: RemixConstraints
}): { accepted: true } | { accepted: false; code: 'constraint_violation' } {
  if (input.intent !== 'remix-section') return { accepted: true }
  const constraints = remixConstraintsSchema.safeParse(input.constraints)
  if (!constraints.success) return { accepted: false, code: 'constraint_violation' }
  return validateRemixConstraints({
    base: input.base,
    proposed: input.proposed,
    constraints: constraints.data,
  }).accepted
    ? { accepted: true }
    : { accepted: false, code: 'constraint_violation' }
}

export interface ProposalGenerationSuccess {
  accepted: true
  scope: ProposalScope
  commands: DesignCommand[]
  proposedDocument: DesignDocument
  summary: string
  repairAttempts: number
  usage: LlmUsage
  provider: string
  model: string
  promptVersion: string
}

export type ProposalGenerationResult = ProposalGenerationSuccess | {
  accepted: false
  code: GenerationErrorCode
  repairAttempts: number
  usage: LlmUsage
  provider: string
  model: string
  promptVersion: string
}

export interface ProposalGenerationJob {
  generationRunId: string
  projectId: string
  workspaceId: string
  userId: string
  prompt: string
  expectedVersion: number
  selectedNodeId?: string
}

export interface PreviousProposalContext {
  id: string
  summary: string
  request: string
}

export type ProposalProvider = LLMProvider
export type ProposalOperation = AiOperation
