import { componentRegistry, validateRegistryRelationships } from '@zenui/component-registry'
import { applyCommandTransaction } from '@zenui/design-commands'
import {
  designNodeSchema,
  styleSchema,
  validateDesignDocument,
  type DesignDocument,
  type RemoteImagePolicy,
} from '@zenui/design-schema'
import { z } from 'zod'

import { materializeLandingPageBlueprint } from './blueprint'
import { materializeLandingPageBlueprintV2 } from './blueprint-v2'
import {
  deriveProposalScope,
  materializeProposalWithCommands,
  type PreviousProposalContext,
  type ProposalGenerationJob,
  type ProposalGenerationResult,
  type ProposalScope,
} from './proposal'
import { normalizeLandingPageProviderBlueprint } from './provider-blueprint'

import type { DesignCommand } from '@zenui/design-commands'

export {
  applyVisualBriefPatch,
  evaluateMediaCandidates,
  mediaCandidateEvaluationSchema,
  mediaProposalCandidateSchema,
  mediaProposalReviewSchema,
  mediaViolationSchema,
  planVisualBrief,
  publicMediaProposalReview,
  publicMediaProposalReviewSchema,
  visualBriefPatchSchema,
  visualBriefSchema,
  visualRepresentationSchema,
  type EvaluateMediaCandidatesResult,
  type MediaCandidateEvaluation,
  type MediaCandidateInput,
  type MediaCandidateJudge,
  type MediaProposalCandidate,
  type MediaProposalReview,
  type MediaViolation,
  type PublicMediaProposalReview,
  type VisualBrief,
  type VisualBriefPatch,
  type VisualBriefPlannerProvider,
  type VisualBriefPlanResult,
  type VisualRepresentation,
} from './media-intelligence'
export {
  assistantContextPackSchema,
  assistantIntentSchema,
  assistantPlanV2Schema,
  buildAssistantContextPack,
  layoutRecipeSelectionSchema,
  planAssistantIntent,
  planLayoutRecipe,
  planSectionComposition,
  planStyleEdit,
  type AssistantContextPack,
  type AssistantIntent,
  type AssistantPlannerProvider,
  type AssistantPlanResult,
  type AssistantPlanV2,
  type LayoutRecipePlannerProvider,
  type LayoutRecipePlanResult,
  type LayoutRecipeSelection,
  type SectionCompositionPlannerProvider,
  type SectionCompositionPlanResult,
  type StyleEditPlannerProvider,
  type StyleEditPlanResult,
} from './assistant-planner'
export {
  landingPageBlueprintJsonSchema,
  landingPageBlueprintSchema,
  materializeLandingPageBlueprint,
  type LandingPageBlueprint,
} from './blueprint'
export {
  landingPageBlueprintV2JsonSchema,
  landingPageBlueprintV2Schema,
  materializeLandingPageBlueprintV2,
  type LandingPageBlueprintV2,
} from './blueprint-v2'
export {
  DENSITY_PRESET_IDS,
  MOOD_PRESET_IDS,
  PAGE_PRESET_IDS,
  THEME_PRESET_IDS,
  blueprintV2SectionSchema,
  getSectionPreset,
  sectionPresetRegistry,
  type BlueprintV2Section,
  type BlueprintV2SectionType,
  type SectionPresetDefinition,
} from './section-presets'
export {
  landingPageProviderBlueprintJsonSchema,
  landingPageProviderBlueprintSchema,
  normalizeLandingPageProviderBlueprint,
  type LandingPageProviderBlueprint,
} from './provider-blueprint'
export {
  GUIDED_RADIUS_PRESET_IDS,
  GUIDED_SPACING_PRESET_IDS,
  GUIDED_TYPOGRAPHY_PRESET_IDS,
  WEBSITE_BRIEF_SECTION_IDS,
  conversionGoalSchema,
  guidedDesignSystemSchema,
  guidedDesignSystemWarnings,
  normalizeWebsiteBrief,
  prefillWebsiteBrief,
  websiteBriefSchema,
  websiteBriefSectionSchema,
  type ConversionGoal,
  type GuidedDesignSystem,
  type GuidedDesignSystemWarning,
  type WebsiteBrief,
  type WebsiteBriefSection,
} from './guided-brief'
export {
  SITE_INTELLIGENCE_POLICY_VERSION,
  analyzeSiteIntelligence,
  captureRemixConstraints,
  designExplanationSchema,
  explainDesignEvidence,
  intelligenceCitationSchema,
  intelligenceEvidenceSchema,
  pageStoryStepSchema,
  remixAllowedChangeSchema,
  remixConstraintsSchema,
  siteIntelligenceFindingCodeSchema,
  siteIntelligenceFindingSchema,
  siteIntelligenceReviewSchema,
  storyPurposeSchema,
  validateRemixConstraints,
  type DesignExplanation,
  type IntelligenceCitation,
  type IntelligenceEvidence,
  type PageStoryStep,
  type RemixAllowedChange,
  type RemixConstraints,
  type SiteIntelligenceFinding,
  type SiteIntelligenceFindingCode,
  type SiteIntelligenceReview,
  type StoryPurpose,
} from './site-intelligence'
export {
  DESIGN_DIRECTION_PRESET_IDS,
  designDirectionContentBlueprintJsonSchema,
  designDirectionContentBlueprintSchema,
  designDirectionGenerationPlanJsonSchema,
  designDirectionGenerationPlanSchema,
  designDirectionPlannerCatalog,
  designDirectionPresetIdSchema,
  designDirectionContractSchema,
  designDirectionJobSchema,
  designDirectionRunErrorCodeSchema,
  designDirectionRunStatusSchema,
  materializeDesignDirections,
  resolveDesignDirectionPresetIds,
  runDesignDirectionGeneration,
  type DesignDirectionContentBlueprint,
  type DesignDirectionGenerationPlan,
  type DesignDirectionPresetId,
  type DesignDirectionImageIntent,
  type DesignDirectionOwnedImage,
  type DesignDirectionContract,
  type DesignDirectionGenerationResult,
  type DesignDirectionJob,
  type DesignDirectionRunErrorCode,
  type DesignDirectionRunStatus,
  type DesignDirectionProvider,
  type DesignDirectionProviderRequest,
  type DesignDirectionProviderResponse,
  type MaterializedDesignDirection,
} from './design-directions'

export const AI_PROMPT_VERSION = 'v2' as const
export const DEFAULT_MAX_REPAIR_ATTEMPTS = 2
export const DEFAULT_MAX_TRANSIENT_RETRIES = 1
export const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_CONTEXT_BYTES = 256 * 1024

export {
  appendProposalLineageTurn,
  buildProposalRefinementRequest,
  createProposalLineage,
  deriveProposalScope,
  leadFormAlignmentFromPrompt,
  materializeLayoutProposal,
  materializeMediaProposal,
  materializeSectionCompositionProposal,
  materializeStyleProposal,
  materializeProposalWithCommands,
  proposalActionSchema,
  proposalIntentSchema,
  proposalFeedbackCodeSchema,
  proposalLineageSchema,
  proposalRequestSchema,
  proposalScopeSchema,
  proposalSnapshotMatches,
  sectionCompositionSpecSchema,
  styleEditSpecSchema,
  routeProposalIntent,
  validateProposalRemix,
  type MaterializeProposalResult,
  type PreviousProposalContext,
  type ProposalAction,
  type ProposalIntent,
  type ProposalGenerationJob,
  type ProposalGenerationResult,
  type ProposalRequest,
  type ProposalScope,
  type ProposalIntentRoute,
  type ProposalFeedbackCode,
  type ProposalLineage,
  type SectionCompositionSpec,
  type StyleEditSpec,
  type MaterializeStyleProposalResult,
} from './proposal'

export const generationModeSchema = z.enum(['generate', 'edit-page', 'edit-selection'])
export type GenerationMode = z.infer<typeof generationModeSchema>

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict()

export type LlmUsage = z.infer<typeof usageSchema>

export const generationRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  mode: generationModeSchema,
  prompt: z.string().trim().min(3).max(4000),
  expectedVersion: z.number().int().positive(),
  selectedNodeId: z.string().min(1).max(100).optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === 'edit-selection' && !value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selection mode requires a selected node' })
  }
  if (value.mode !== 'edit-selection' && value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selected node is only valid for selection mode' })
  }
})

export const generationJobSchema = z.object({
  generationRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()

export type GenerationJob = z.infer<typeof generationJobSchema>

export const generationStatusSchema = z.enum(['queued', 'running', 'repairing', 'completed', 'failed'])
export type GenerationStatus = z.infer<typeof generationStatusSchema>

export const generationErrorCodeSchema = z.enum([
  'invalid_model_output',
  'scope_violation',
  'stale_document_version',
  'provider_bad_request',
  'provider_auth',
  'provider_rate_limit',
  'provider_timeout',
  'provider_transient',
  'provider_error',
  'budget_exceeded',
  'queue_unavailable',
])
export type GenerationErrorCode = z.infer<typeof generationErrorCodeSchema>

export const generationStatusEventSchema = z.object({
  runId: z.string().uuid(),
  status: generationStatusSchema,
  repairAttempt: z.number().int().min(0).max(DEFAULT_MAX_REPAIR_ATTEMPTS),
  usage: usageSchema.optional(),
  errorCode: generationErrorCodeSchema.optional(),
  documentVersion: z.number().int().positive().optional(),
  revisionId: z.string().uuid().optional(),
}).strict()

const operationSchemas = [
  z.object({ type: z.literal('INSERT_NODE'), parentId: z.string(), index: z.number().int().nonnegative(), node: designNodeSchema }).strict(),
  z.object({ type: z.literal('MOVE_NODE'), nodeId: z.string(), newParentId: z.string(), newIndex: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('REMOVE_NODE'), nodeId: z.string() }).strict(),
  z.object({ type: z.literal('DUPLICATE_NODE'), nodeId: z.string(), newNodeId: z.string(), targetParentId: z.string(), index: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('UPDATE_PROPS'), nodeId: z.string(), patch: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('UPDATE_STYLE'), nodeId: z.string(), patch: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('UPDATE_RESPONSIVE_STYLE'), nodeId: z.string(), breakpoint: z.enum(['tablet', 'mobile']), patch: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('UPDATE_THEME'), patch: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ type: z.literal('REPLACE_SUBTREE'), nodeId: z.string(), nodes: z.array(designNodeSchema).min(1), rootNodeId: z.string() }).strict(),
] as const

export const aiOperationSchema = z.discriminatedUnion('type', operationSchemas)
export type AiOperation = z.infer<typeof aiOperationSchema>

export const aiOperationBatchSchema = z.object({
  summary: z.string().trim().min(1).max(200),
  operations: z.array(aiOperationSchema).min(1).max(100),
}).strict()
export type AiOperationBatch = z.infer<typeof aiOperationBatchSchema>

export interface ProviderRequest {
  promptVersion: typeof AI_PROMPT_VERSION
  prompt: string
  context: PromptContext
  repair?: { attempt: number; issues: string[] }
  signal: AbortSignal
}

export interface ProviderResponse {
  output: unknown
  usage: LlmUsage
}

export interface LLMProvider {
  readonly name: string
  readonly model: string
  generateLandingPageBlueprint(input: ProviderRequest): Promise<ProviderResponse>
  generateOperations(input: ProviderRequest): Promise<ProviderResponse>
}

export interface PromptContext {
  mode: GenerationMode
  request: string
  registry: { type: string; description: string; allowedChildren: readonly string[] }[]
  theme: DesignDocument['theme']
  imageHosts?: string[]
  document?: DesignDocument
  selectedNodeId?: string
  selectedParent?: DesignDocument['nodes'][string]
  selectedNodes?: DesignDocument['nodes']
  editableProps?: Record<string, string[]>
  editIntent?: 'copy' | 'general'
}

const editablePropKeys = new Set([
  'alt', 'brand', 'description', 'href', 'label', 'level', 'name', 'text', 'title',
])

function editableProps(nodes: DesignDocument['nodes']): Record<string, string[]> {
  return Object.fromEntries(Object.values(nodes).flatMap(node => {
    const keys = Object.keys(node.props).filter(key => editablePropKeys.has(key)).sort()
    return keys.length > 0 ? [[node.id, keys]] : []
  }))
}

function editIntent(prompt: string): 'copy' | 'general' {
  const copy = /\b(copy|content|headline|heading|paragraph|rewrite|shorten|text|wording)\b|câu chữ|đoạn|ngắn gọn|nội dung|tiêu đề|viết lại/i.test(prompt)
  const visual = /\b(color|layout|responsive|spacing|style)\b|bố cục|khoảng cách|màu|trình bày/i.test(prompt)
  return copy && !visual ? 'copy' : 'general'
}

const stringEditPropertySchema = z.enum([
  'alt', 'brand', 'description', 'href', 'label', 'name', 'text', 'title',
])
const aiEditPropertySchema = z.enum([
  ...stringEditPropertySchema.options, 'level',
])

const aiEditResponseSchema = z.object({
  summary: z.string().trim().min(1).max(200),
  updates: z.array(z.object({
    nodeId: z.string().min(1).max(100),
    property: aiEditPropertySchema,
    value: z.union([z.string(), z.number().int()]),
  }).strict()).min(1).max(20),
}).strict()

export const aiCopyEditResponseJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    updates: {
      type: 'array', minItems: 1, maxItems: 20,
      items: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          property: { type: 'string', enum: stringEditPropertySchema.options },
          value: { type: 'string' },
        },
        required: ['nodeId', 'property', 'value'],
      },
    },
  },
  required: ['summary', 'updates'],
} as const

function isSerializedContainer(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    const parsed: unknown = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

function validEditValue(property: z.infer<typeof aiEditPropertySchema>, value: string | number): boolean {
  return property === 'level'
    ? typeof value === 'number' && value >= 1 && value <= 6
    : typeof value === 'string' && !isSerializedContainer(value)
}

export function normalizeAiEditResponse(input: unknown, context: PromptContext): AiOperationBatch | null {
  const parsed = aiEditResponseSchema.safeParse(input)
  if (!parsed.success || !context.editableProps) return null
  for (const update of parsed.data.updates) {
    const allowed = context.editableProps[update.nodeId]
    if (!allowed?.includes(update.property) || !validEditValue(update.property, update.value)) return null
  }
  return {
    summary: parsed.data.summary,
    operations: parsed.data.updates.map(update => ({
      type: 'UPDATE_PROPS' as const,
      nodeId: update.nodeId,
      patch: { [update.property]: update.value },
    })),
  }
}

export function buildAiOperationsResponseJsonSchema(_context: PromptContext): unknown {
  return aiCopyEditResponseJsonSchema
}

function subtreeIds(document: DesignDocument, rootId: string): string[] {
  const node = document.nodes[rootId]
  if (!node) return []
  return [rootId, ...node.children.flatMap(childId => subtreeIds(document, childId))]
}

function assertContextBudget(context: PromptContext, maxContextBytes: number): PromptContext {
  if (Buffer.byteLength(JSON.stringify(context), 'utf8') > maxContextBytes) {
    throw new Error('context_budget_exceeded')
  }
  return context
}

export function buildPromptContext(input: {
  mode: GenerationMode
  prompt: string
  document: DesignDocument
  imageHosts?: string[]
  selectedNodeId?: string
  maxContextBytes?: number
}): PromptContext {
  const registry = Object.values(componentRegistry).map(definition => ({
    type: definition.type,
    description: definition.aiDescription,
    allowedChildren: definition.allowedChildren,
  }))
  const base = {
    mode: input.mode,
    request: input.prompt,
    registry,
    theme: input.document.theme,
  }
  const maxContextBytes = input.maxContextBytes ?? DEFAULT_MAX_CONTEXT_BYTES
  if (input.mode === 'generate') {
    return assertContextBudget({
      mode: input.mode,
      request: input.prompt,
      registry: [],
      theme: input.document.theme,
      ...(input.imageHosts && input.imageHosts.length > 0 ? { imageHosts: input.imageHosts } : {}),
    }, maxContextBytes)
  }
  if (input.mode === 'edit-page') {
    return assertContextBudget({
      ...base,
      document: input.document,
      editableProps: editableProps(input.document.nodes),
      editIntent: editIntent(input.prompt),
    }, maxContextBytes)
  }
  if (!input.selectedNodeId || !input.document.nodes[input.selectedNodeId]) throw new Error('selected_node_not_found')
  const selected = input.document.nodes[input.selectedNodeId]!
  const selectedIds = new Set(subtreeIds(input.document, selected.id))
  const selectedNodes = Object.fromEntries(
    Object.entries(input.document.nodes)
      .filter(([id]) => selectedIds.has(id))
      .map(([id, node]) => [id, structuredClone(node)]),
  )
  const parent = selected.parentId ? input.document.nodes[selected.parentId] : undefined
  const selectedParent = parent
    ? { ...structuredClone(parent), children: [selected.id] }
    : undefined
  return assertContextBudget({
    ...base,
    selectedNodeId: selected.id,
    ...(selectedParent ? { selectedParent } : {}),
    selectedNodes,
    editableProps: editableProps(selectedNodes),
    editIntent: editIntent(input.prompt),
  }, maxContextBytes)
}

function validOperationProps(
  document: DesignDocument,
  operation: AiOperation,
): boolean {
  if (operation.type !== 'UPDATE_PROPS') return true
  const node = document.nodes[operation.nodeId]
  if (!node) return false
  const allowed = new Set(editableProps({ [node.id]: node })[node.id] ?? [])
  return Object.keys(operation.patch).every(key => allowed.has(key))
}

export type MaterializeCommandsResult =
  | { accepted: true; commands: DesignCommand[] }
  | { accepted: false; code: 'scope_violation' | 'invalid_model_output' }

function operationNodeIds(operation: AiOperation): string[] {
  switch (operation.type) {
    case 'INSERT_NODE': return [operation.parentId]
    case 'MOVE_NODE': return [operation.nodeId, operation.newParentId]
    case 'REMOVE_NODE':
    case 'UPDATE_PROPS':
    case 'UPDATE_STYLE':
    case 'UPDATE_RESPONSIVE_STYLE': return [operation.nodeId]
    case 'DUPLICATE_NODE': return [operation.nodeId, operation.targetParentId]
    case 'REPLACE_SUBTREE': return [operation.nodeId]
    case 'UPDATE_THEME': return []
  }
}

export function materializeAiCommands(input: {
  mode: Exclude<GenerationMode, 'generate'>
  selectedNodeId?: string
  document: DesignDocument
  operations: unknown
  runId: string
  expectedVersion: number
}): MaterializeCommandsResult {
  const parsed = z.array(aiOperationSchema).min(1).max(100).safeParse(input.operations)
  if (!parsed.success) return { accepted: false, code: 'invalid_model_output' }
  if (parsed.data.some(operation => !validOperationProps(input.document, operation))) {
    return { accepted: false, code: 'invalid_model_output' }
  }
  if (input.mode === 'edit-selection') {
    if (!input.selectedNodeId || !input.document.nodes[input.selectedNodeId]) {
      return { accepted: false, code: 'scope_violation' }
    }
    const scope = new Set(subtreeIds(input.document, input.selectedNodeId))
    for (const operation of parsed.data) {
      if (operation.type === 'UPDATE_THEME' || operationNodeIds(operation).some(id => !scope.has(id))) {
        return { accepted: false, code: 'scope_violation' }
      }
      if (operation.type === 'INSERT_NODE' && !scope.has(operation.parentId)) {
        return { accepted: false, code: 'scope_violation' }
      }
    }
  }
  return {
    accepted: true,
    commands: parsed.data.map((operation, index): DesignCommand => ({
      ...operation,
      commandId: `${input.runId}-${index}`,
      documentVersion: input.expectedVersion,
      source: 'ai',
    })),
  }
}

export function materializeProposal(input: {
  document: DesignDocument
  scope: ProposalScope
  operations: unknown
  summary: unknown
  runId: string
  expectedVersion: number
}) {
  return materializeProposalWithCommands({
    ...input,
    materializeCommands: materializeAiCommands,
  })
}

const zeroUsage = (): LlmUsage => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })

function addUsage(left: LlmUsage, right: LlmUsage): LlmUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  }
}

function normalizeUsage(input: unknown): LlmUsage {
  const parsed = usageSchema.safeParse(input)
  return parsed.success ? parsed.data : zeroUsage()
}

function providerErrorCode(error: unknown): GenerationErrorCode {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined
  const parsed = generationErrorCodeSchema.safeParse(code)
  return parsed.success ? parsed.data : 'provider_error'
}

function isTransient(code: GenerationErrorCode): boolean {
  return code === 'provider_transient' || code === 'provider_rate_limit'
}

async function callProvider(
  provider: LLMProvider,
  method: 'generateLandingPageBlueprint' | 'generateOperations',
  request: Omit<ProviderRequest, 'signal'>,
  timeoutMs: number,
  maxTransientRetries: number,
): Promise<ProviderResponse> {
  let retries = 0
  while (true) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await provider[method]({ ...request, signal: controller.signal })
    } catch (error) {
      const code = controller.signal.aborted ? 'provider_timeout' : providerErrorCode(error)
      if (!isTransient(code) || retries >= maxTransientRetries) throw Object.assign(new Error(code), { code })
      retries += 1
    } finally {
      clearTimeout(timeout)
    }
  }
}

export type GenerationResult =
  | {
      accepted: true
      document: DesignDocument
      commands: DesignCommand[]
      summary: string
      repairAttempts: number
      usage: LlmUsage
      provider: string
      model: string
      promptVersion: typeof AI_PROMPT_VERSION
    }
  | {
      accepted: false
      code: GenerationErrorCode
      repairAttempts: number
      usage: LlmUsage
      provider: string
      model: string
      promptVersion: typeof AI_PROMPT_VERSION
    }

export async function runGeneration(input: {
  provider: LLMProvider
  job: GenerationJob & {
    mode: GenerationMode
    prompt: string
    expectedVersion: number
    selectedNodeId?: string
  }
  document: DesignDocument
  maxRepairAttempts?: number
  maxTransientRetries?: number
  timeoutMs?: number
  maxContextBytes?: number
  maxTotalTokens?: number
  imagePolicy?: RemoteImagePolicy
  onRepairAttempt?: (attempt: number, issues: readonly string[]) => Promise<void> | void
}): Promise<GenerationResult> {
  const runtimeJob = generationJobSchema.extend({
    mode: generationModeSchema,
    prompt: z.string().trim().min(3).max(4000),
    expectedVersion: z.number().int().positive(),
    selectedNodeId: z.string().min(1).max(100).optional(),
  }).superRefine((value, context) => {
    if (value.mode === 'edit-selection' && !value.selectedNodeId) {
      context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selection mode requires a selected node' })
    }
    if (value.mode !== 'edit-selection' && value.selectedNodeId) {
      context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selected node is only valid for selection mode' })
    }
  }).safeParse(input.job)
  if (!runtimeJob.success) throw new Error('invalid_generation_job')
  const job = runtimeJob.data
  const maxRepairAttempts = input.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS
  const maxTransientRetries = input.maxTransientRetries ?? DEFAULT_MAX_TRANSIENT_RETRIES
  const timeoutMs = input.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
  const context = buildPromptContext({
    mode: job.mode,
    prompt: job.prompt,
    document: input.document,
    ...(input.imagePolicy ? { imageHosts: input.imagePolicy.sources.map(source => new URL(source.replace('*.', '')).hostname) } : {}),
    ...(job.selectedNodeId ? { selectedNodeId: job.selectedNodeId } : {}),
    ...(input.maxContextBytes ? { maxContextBytes: input.maxContextBytes } : {}),
  })
  let usage = zeroUsage()
  let lastCode: GenerationErrorCode = 'invalid_model_output'
  let issues = ['Output must match the required structured contract']

  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    if (attempt > 0) await input.onRepairAttempt?.(attempt, issues)
    let response: ProviderResponse
    try {
      response = await callProvider(
        input.provider,
        job.mode === 'generate' ? 'generateLandingPageBlueprint' : 'generateOperations',
        {
          promptVersion: AI_PROMPT_VERSION,
          prompt: job.prompt,
          context,
          ...(attempt > 0 ? { repair: { attempt, issues } } : {}),
        },
        timeoutMs,
        maxTransientRetries,
      )
    } catch (error) {
      return {
        accepted: false,
        code: providerErrorCode(error),
        repairAttempts: attempt,
        usage,
        provider: input.provider.name,
        model: input.provider.model,
        promptVersion: AI_PROMPT_VERSION,
      }
    }
    usage = addUsage(usage, normalizeUsage(response.usage))
    if (input.maxTotalTokens !== undefined && usage.totalTokens > input.maxTotalTokens) {
      return {
        accepted: false,
        code: 'budget_exceeded',
        repairAttempts: attempt,
        usage,
        provider: input.provider.name,
        model: input.provider.model,
        promptVersion: AI_PROMPT_VERSION,
      }
    }

    let commands: DesignCommand[]
    let summary: string
    if (job.mode === 'generate') {
      const version = response.output && typeof response.output === 'object' && 'version' in response.output
        ? (response.output as { version?: unknown }).version
        : undefined
      const normalizedV2 = version === 2 ? normalizeLandingPageProviderBlueprint(response.output) : null
      const materialized = version === 2
        ? materializeLandingPageBlueprintV2({
            blueprint: normalizedV2 ?? response.output,
            current: input.document,
            ...(input.imagePolicy ? { imagePolicy: input.imagePolicy } : {}),
          })
        : materializeLandingPageBlueprint({
            blueprint: response.output,
            current: input.document,
            ...(input.imagePolicy ? { imagePolicy: input.imagePolicy } : {}),
          })
      if (!materialized.accepted) {
        lastCode = 'invalid_model_output'
        issues = materialized.issues
        continue
      }
      commands = [{
        commandId: `${job.generationRunId}-0`,
        documentVersion: job.expectedVersion,
        source: 'ai',
        type: 'REPLACE_DOCUMENT',
        document: materialized.document,
      }]
      summary = 'AI generated landing page'
    } else {
      const normalized = normalizeAiEditResponse(response.output, context)
      const batch = normalized ?? aiOperationBatchSchema.safeParse(response.output).data
      if (!batch) {
        issues = ['Output must match the static edit envelope or operation batch']
        lastCode = 'invalid_model_output'
        continue
      }
      const materialized = materializeAiCommands({
        mode: job.mode,
        ...(job.selectedNodeId ? { selectedNodeId: job.selectedNodeId } : {}),
        document: input.document,
        operations: batch.operations,
        runId: job.generationRunId,
        expectedVersion: job.expectedVersion,
      })
      if (!materialized.accepted) {
        lastCode = materialized.code
        issues = [materialized.code]
        continue
      }
      commands = materialized.commands
      summary = batch.summary
    }

    const transaction = applyCommandTransaction(input.document, job.expectedVersion, commands)
    if (!transaction.accepted) {
      lastCode = transaction.error.code === 'stale_document_version'
        ? 'stale_document_version'
        : 'invalid_model_output'
      issues = [`${transaction.error.path}: ${transaction.error.message}`]
      continue
    }
    const relationships = validateRegistryRelationships(transaction.document)
    if (relationships.length > 0) {
      lastCode = 'invalid_model_output'
      issues = relationships.map(issue => `${issue.path}: ${issue.message}`)
      continue
    }
    return {
      accepted: true,
      document: transaction.document,
      commands,
      summary,
      repairAttempts: attempt,
      usage,
      provider: input.provider.name,
      model: input.provider.model,
      promptVersion: AI_PROMPT_VERSION,
    }
  }

  return {
    accepted: false,
    code: lastCode,
    repairAttempts: maxRepairAttempts,
    usage,
    provider: input.provider.name,
    model: input.provider.model,
    promptVersion: AI_PROMPT_VERSION,
  }
}

export async function runProposalGeneration(input: {
  provider: LLMProvider
  job: ProposalGenerationJob
  document: DesignDocument
  previousProposal?: PreviousProposalContext
  maxRepairAttempts?: number
  maxTransientRetries?: number
  timeoutMs?: number
  maxContextBytes?: number
  maxTotalTokens?: number
  onRepairAttempt?: (attempt: number, issues: readonly string[]) => Promise<void> | void
}): Promise<ProposalGenerationResult> {
  const scope = deriveProposalScope(input.document, input.job.selectedNodeId)
  if (!scope) {
    return {
      accepted: false,
      code: 'scope_violation',
      repairAttempts: 0,
      usage: zeroUsage(),
      provider: input.provider.name,
      model: input.provider.model,
      promptVersion: AI_PROMPT_VERSION,
    }
  }
  const previous = input.previousProposal
    ? {
        id: input.previousProposal.id,
        summary: input.previousProposal.summary.slice(0, 200),
        request: input.previousProposal.request.slice(0, 4000),
      }
    : undefined
  const prompt = previous
    ? JSON.stringify({ request: input.job.prompt, previousProposal: previous })
    : input.job.prompt
  if (prompt.length > 8_500) {
    return {
      accepted: false,
      code: 'budget_exceeded',
      repairAttempts: 0,
      usage: zeroUsage(),
      provider: input.provider.name,
      model: input.provider.model,
      promptVersion: AI_PROMPT_VERSION,
    }
  }
  const result = await runGeneration({
    provider: input.provider,
    job: {
      generationRunId: input.job.generationRunId,
      projectId: input.job.projectId,
      workspaceId: input.job.workspaceId,
      userId: input.job.userId,
      mode: scope.kind === 'page' ? 'edit-page' : 'edit-selection',
      prompt,
      expectedVersion: input.job.expectedVersion,
      ...(scope.kind !== 'page' ? { selectedNodeId: scope.rootNodeId } : {}),
    },
    document: input.document,
    ...(input.maxRepairAttempts !== undefined ? { maxRepairAttempts: input.maxRepairAttempts } : {}),
    ...(input.maxTransientRetries !== undefined ? { maxTransientRetries: input.maxTransientRetries } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxContextBytes !== undefined ? { maxContextBytes: input.maxContextBytes } : {}),
    ...(input.maxTotalTokens !== undefined ? { maxTotalTokens: input.maxTotalTokens } : {}),
    ...(input.onRepairAttempt ? { onRepairAttempt: input.onRepairAttempt } : {}),
  })
  if (!result.accepted) return result
  return {
    ...result,
    scope,
    proposedDocument: result.document,
  }
}

export function createMockLlmProvider(responses: { output: unknown; usage?: LlmUsage }[]): LLMProvider {
  let index = 0
  const next = (): Promise<ProviderResponse> => {
    const response = responses[index++] ?? { output: null }
    return Promise.resolve({ output: structuredClone(response.output), usage: response.usage ?? zeroUsage() })
  }
  return {
    name: 'mock',
    model: 'mock-structured-v1',
    generateLandingPageBlueprint: next,
    generateOperations: next,
  }
}

export const aiOperationsJsonSchema = z.toJSONSchema(aiOperationBatchSchema, { target: 'draft-7' })
export { styleSchema, validateDesignDocument }
