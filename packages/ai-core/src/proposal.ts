import { validateRegistryRelationships } from '@zenui/component-registry'
import { applyCommandTransaction } from '@zenui/design-commands'
import { validateDesignDocument, type DesignDocument, type DesignNode } from '@zenui/design-schema'
import { z } from 'zod'

import { remixAllowedChangeSchema, remixConstraintsSchema, validateRemixConstraints } from './site-intelligence'

import type { AiOperation, GenerationErrorCode, LLMProvider, LlmUsage } from './index'
import type { RemixConstraints } from './site-intelligence'
import type { DesignCommand } from '@zenui/design-commands'

export const proposalActionSchema = z.enum(['request', 'refine', 'try-another'])
export type ProposalAction = z.infer<typeof proposalActionSchema>
export const proposalIntentSchema = z.enum(['standard', 'remix-section', 'replace-media'])
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

function isMediaTarget(node: DesignNode | undefined): boolean {
  return Boolean(
    node?.type === 'image'
    || (node?.type === 'feature-card' && 'mediaSlot' in node.props && node.props.mediaSlot),
  )
}

export type ProposalIntentRoute =
  | { accepted: true; intent: ProposalIntent; targetNodeId: string | null }
  | { accepted: false; code: 'invalid_media_target' | 'invalid_scope' }

export function routeProposalIntent(input: {
  document: DesignDocument
  selectedNodeId: string | null | undefined
  requestedIntent: ProposalIntent
  prompt: string
}): ProposalIntentRoute {
  const target = input.selectedNodeId ? input.document.nodes[input.selectedNodeId] : undefined
  const asksForMedia = input.requestedIntent === 'replace-media'
    || (mediaReplacementPattern.test(input.prompt) && !altTextPattern.test(input.prompt))
  if (asksForMedia) {
    return isMediaTarget(target) && input.selectedNodeId
      ? { accepted: true, intent: 'replace-media', targetNodeId: input.selectedNodeId }
      : { accepted: false, code: 'invalid_media_target' }
  }
  if (input.requestedIntent === 'remix-section' && !input.selectedNodeId) {
    return { accepted: false, code: 'invalid_scope' }
  }
  return { accepted: true, intent: input.requestedIntent, targetNodeId: input.selectedNodeId ?? null }
}

const proposalRequestBaseSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  selectedNodeId: z.string().min(1).max(100).optional(),
  intent: proposalIntentSchema.default('standard'),
  allowedChanges: z.array(remixAllowedChangeSchema).max(3).default([]),
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
  if ((value.intent === 'remix-section' || value.intent === 'replace-media') && !value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'This proposal intent requires an exact selection' })
  }
  if (value.intent === 'standard' && value.allowedChanges.length > 0) {
    context.addIssue({ code: 'custom', path: ['allowedChanges'], message: 'Allowed changes are only valid for Remix' })
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
