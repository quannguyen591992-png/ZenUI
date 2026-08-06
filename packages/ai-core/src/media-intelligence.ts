import { z } from 'zod'

import { assistantContextPackSchema, type AssistantContextPack } from './assistant-planner'

import type { LlmUsage } from './index'

export const visualRepresentationSchema = z.enum([
  'photo', 'editorial-illustration', 'process-diagram', 'product-ui', 'abstract',
])
export type VisualRepresentation = z.infer<typeof visualRepresentationSchema>

const boundedListSchema = z.array(z.string().trim().min(1).max(120)).max(12)

export const visualBriefSchema = z.object({
  version: z.literal('visual-brief-v1'),
  subject: z.string().trim().min(3).max(300),
  message: z.string().trim().min(3).max(500),
  representation: visualRepresentationSchema,
  composition: z.string().trim().min(3).max(500),
  mustInclude: boundedListSchema,
  mustAvoid: boundedListSchema,
  peoplePolicy: z.enum(['required', 'allowed', 'forbidden']),
  textPolicy: z.enum(['none', 'symbolic-only']),
  style: z.string().trim().min(2).max(300),
  palette: z.array(z.string().trim().min(1).max(40)).max(8),
  aspectRatio: z.enum(['square', 'landscape', 'wide', 'portrait']),
  focalArea: z.enum(['left', 'center', 'right', 'top', 'bottom']),
  generationPrompt: z.string().trim().min(10).max(2000),
  searchQuery: z.string().trim().min(3).max(300).nullable(),
  alt: z.string().trim().min(3).max(300),
}).strict().superRefine((brief, context) => {
  if (brief.representation === 'photo' && !brief.searchQuery) {
    context.addIssue({ code: 'custom', path: ['searchQuery'], message: 'photo_search_query_required' })
  }
  if (brief.representation !== 'photo' && brief.searchQuery !== null) {
    context.addIssue({ code: 'custom', path: ['searchQuery'], message: 'stock_fallback_not_allowed' })
  }
})
export type VisualBrief = z.infer<typeof visualBriefSchema>

export const visualBriefPatchSchema = z.object({
  subject: z.string().trim().min(3).max(300).optional(),
  message: z.string().trim().min(3).max(500).optional(),
  composition: z.string().trim().min(3).max(500).optional(),
  mustInclude: boundedListSchema.optional(),
  mustAvoid: boundedListSchema.optional(),
  peoplePolicy: z.enum(['required', 'allowed', 'forbidden']).optional(),
  textPolicy: z.enum(['none', 'symbolic-only']).optional(),
  style: z.string().trim().min(2).max(300).optional(),
  palette: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  aspectRatio: z.enum(['square', 'landscape', 'wide', 'portrait']).optional(),
  focalArea: z.enum(['left', 'center', 'right', 'top', 'bottom']).optional(),
  generationPrompt: z.string().trim().min(10).max(2000).optional(),
  searchQuery: z.string().trim().min(3).max(300).nullable().optional(),
  alt: z.string().trim().min(3).max(300).optional(),
}).strict()
export type VisualBriefPatch = z.infer<typeof visualBriefPatchSchema>

export interface VisualBriefPlannerProvider {
  planVisualBrief(input: { context: AssistantContextPack; signal: AbortSignal }): Promise<{
    output: unknown
    usage: LlmUsage
  }>
}

export type VisualBriefPlanResult =
  | { accepted: true; brief: VisualBrief; usage: LlmUsage }
  | { accepted: false; code: 'invalid_context' | 'invalid_media_target' | 'invalid_model_output' | 'brief_mismatch' }

const processIntentPattern = /(?:\b(?:process|workflow|roadmap|timeline|milestone|diagram|board|kanban|step)\b|quy\s*trình|luồng|lộ\s*trình|mốc|sơ\s*đồ|bảng|cột|thẻ|mũi\s*tên|bước)/iu
const productUiIntentPattern = /(?:\b(?:dashboard|interface|product\s*ui|app\s*screen|wireframe|mockup)\b|giao\s*diện|màn\s*hình|bảng\s*điều\s*khiển)/iu
const illustrationIntentPattern = /(?:\b(?:illustration|editorial|vector|drawn)\b|minh\s*họa|đồ\s*họa)/iu
const abstractIntentPattern = /(?:\babstract\b|trừu\s*tượng)/iu
const noPeoplePattern = /(?:\b(?:no|without)\s+(?:people|person|humans?)\b|không\s+(?:có\s+)?người|bỏ\s+người)/iu

function requiredRepresentation(request: string): VisualRepresentation | null {
  if (processIntentPattern.test(request)) return 'process-diagram'
  if (productUiIntentPattern.test(request)) return 'product-ui'
  if (illustrationIntentPattern.test(request)) return 'editorial-illustration'
  if (abstractIntentPattern.test(request)) return 'abstract'
  return null
}

function briefMatchesRequest(context: AssistantContextPack, brief: VisualBrief): boolean {
  const representation = requiredRepresentation(context.request)
  if (representation && brief.representation !== representation) return false
  if (noPeoplePattern.test(context.request) && brief.peoplePolicy !== 'forbidden') return false
  if (brief.representation !== 'photo' && brief.searchQuery !== null) return false
  return true
}

export async function planVisualBrief(input: {
  context: AssistantContextPack
  provider: VisualBriefPlannerProvider
  signal?: AbortSignal
}): Promise<VisualBriefPlanResult> {
  const context = assistantContextPackSchema.safeParse(input.context)
  if (!context.success) return { accepted: false, code: 'invalid_context' }
  if (!context.data.mediaSlot) return { accepted: false, code: 'invalid_media_target' }
  const response = await input.provider.planVisualBrief({
    context: context.data,
    signal: input.signal ?? new AbortController().signal,
  })
  const brief = visualBriefSchema.safeParse(response.output)
  if (!brief.success) return { accepted: false, code: 'invalid_model_output' }
  if (!briefMatchesRequest(context.data, brief.data)) return { accepted: false, code: 'brief_mismatch' }
  return { accepted: true, brief: brief.data, usage: response.usage }
}

export function applyVisualBriefPatch(brief: VisualBrief, patch: VisualBriefPatch): VisualBrief {
  return visualBriefSchema.parse({
    ...visualBriefSchema.parse(brief),
    ...visualBriefPatchSchema.parse(patch),
    version: 'visual-brief-v1',
  })
}

export const mediaViolationSchema = z.enum([
  'wrong_representation', 'missing_required_detail', 'forbidden_detail',
  'people_present', 'people_missing', 'readable_text', 'poor_composition',
])
export type MediaViolation = z.infer<typeof mediaViolationSchema>

export const mediaCandidateEvaluationSchema = z.object({
  candidateId: z.string().min(1).max(100),
  semanticRelevance: z.number().min(0).max(1),
  representationMatch: z.number().min(0).max(1),
  mustIncludeCoverage: z.number().min(0).max(1),
  compositionFit: z.number().min(0).max(1),
  websiteUsability: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  violations: z.array(mediaViolationSchema).max(8),
  safeReason: z.string().trim().min(1).max(240),
}).strict()
export type MediaCandidateEvaluation = z.infer<typeof mediaCandidateEvaluationSchema>

export interface MediaCandidateInput {
  candidateId: string
  assetId: string
  source: 'generated' | 'library'
  bytes: Uint8Array
}

export interface MediaCandidateJudge {
  evaluateBatch(input: {
    brief: VisualBrief
    candidates: { candidateId: string; source: MediaCandidateInput['source']; bytes: Uint8Array }[]
    signal: AbortSignal
  }): Promise<{ output: unknown; usage: LlmUsage }>
}

interface ScoredMediaCandidate extends MediaCandidateEvaluation {
  score: number
  passed: boolean
}

export const mediaProposalCandidateSchema = z.object({
  candidateId: z.string().min(1).max(100),
  assetId: z.string().uuid(),
  source: z.enum(['generated', 'library']),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  safeReason: z.string().trim().min(1).max(240),
}).strict()
export type MediaProposalCandidate = z.infer<typeof mediaProposalCandidateSchema>

export const mediaProposalReviewSchema = z.object({
  version: z.literal('media-proposal-review-v1'),
  visualBrief: visualBriefSchema,
  candidates: z.array(mediaProposalCandidateSchema).min(1).max(3),
  selectedCandidateId: z.string().min(1).max(100),
  rootRequestId: z.string().uuid(),
  previousProposalId: z.string().uuid().nullable(),
  rejectedCandidateIds: z.array(z.string().min(1).max(100)).max(12),
}).strict().superRefine((review, context) => {
  const candidateIds = new Set(review.candidates.map(candidate => candidate.candidateId))
  if (candidateIds.size !== review.candidates.length) {
    context.addIssue({ code: 'custom', path: ['candidates'], message: 'duplicate_candidate_id' })
  }
  if (!review.candidates.some(candidate => candidate.candidateId === review.selectedCandidateId && candidate.passed)) {
    context.addIssue({ code: 'custom', path: ['selectedCandidateId'], message: 'selected_candidate_must_pass' })
  }
})
export type MediaProposalReview = z.infer<typeof mediaProposalReviewSchema>

export const publicMediaProposalReviewSchema = z.object({
  version: z.literal('media-proposal-review-v1'),
  representation: visualRepresentationSchema,
  alt: z.string().trim().min(3).max(300),
  candidates: z.array(mediaProposalCandidateSchema.omit({ passed: true })).min(1).max(3),
  selectedCandidateId: z.string().min(1).max(100),
}).strict()
export type PublicMediaProposalReview = z.infer<typeof publicMediaProposalReviewSchema>

export function publicMediaProposalReview(input: MediaProposalReview): PublicMediaProposalReview {
  const review = mediaProposalReviewSchema.parse(input)
  return publicMediaProposalReviewSchema.parse({
    version: review.version,
    representation: review.visualBrief.representation,
    alt: review.visualBrief.alt,
    candidates: review.candidates.map(({ passed: _passed, ...candidate }) => candidate),
    selectedCandidateId: review.selectedCandidateId,
  })
}

export type EvaluateMediaCandidatesResult =
  | {
      accepted: true
      selectedCandidateId: string
      selectedAssetId: string
      evaluations: ScoredMediaCandidate[]
      usage: LlmUsage
    }
  | {
      accepted: false
      code: 'invalid_candidates' | 'invalid_judge_output' | 'no_semantic_match'
      evaluations?: ScoredMediaCandidate[]
      usage?: LlmUsage
    }

function candidateScore(evaluation: MediaCandidateEvaluation): number {
  return (
    evaluation.semanticRelevance * 0.3
    + evaluation.representationMatch * 0.25
    + evaluation.mustIncludeCoverage * 0.2
    + evaluation.compositionFit * 0.15
    + evaluation.websiteUsability * 0.1
  )
}

export async function evaluateMediaCandidates(input: {
  brief: VisualBrief
  candidates: MediaCandidateInput[]
  judge: MediaCandidateJudge
  minimumScore?: number
  signal?: AbortSignal
}): Promise<EvaluateMediaCandidatesResult> {
  const brief = visualBriefSchema.safeParse(input.brief)
  const candidateSchema = z.array(z.object({
    candidateId: z.string().min(1).max(100),
    assetId: z.string().uuid(),
    source: z.enum(['generated', 'library']),
    bytes: z.instanceof(Uint8Array),
  }).strict()).min(1).max(3).superRefine((candidates, context) => {
    if (new Set(candidates.map(candidate => candidate.candidateId)).size !== candidates.length) {
      context.addIssue({ code: 'custom', message: 'duplicate_candidate_id' })
    }
  }).safeParse(input.candidates)
  if (!brief.success || !candidateSchema.success) return { accepted: false, code: 'invalid_candidates' }
  const response = await input.judge.evaluateBatch({
    brief: brief.data,
    candidates: candidateSchema.data.map(candidate => ({
      candidateId: candidate.candidateId,
      source: candidate.source,
      bytes: candidate.bytes,
    })),
    signal: input.signal ?? new AbortController().signal,
  })
  const evaluations = z.array(mediaCandidateEvaluationSchema).length(candidateSchema.data.length).safeParse(response.output)
  if (!evaluations.success) return { accepted: false, code: 'invalid_judge_output' }
  const expectedIds = new Set(candidateSchema.data.map(candidate => candidate.candidateId))
  if (
    new Set(evaluations.data.map(evaluation => evaluation.candidateId)).size !== evaluations.data.length
    || evaluations.data.some(evaluation => !expectedIds.has(evaluation.candidateId))
  ) return { accepted: false, code: 'invalid_judge_output' }
  const minimumScore = input.minimumScore ?? 0.75
  const scored = evaluations.data.map(evaluation => {
    const score = candidateScore(evaluation)
    return { ...evaluation, score, passed: evaluation.violations.length === 0 && score >= minimumScore }
  })
  const selected = [...scored].filter(evaluation => evaluation.passed).sort((left, right) => right.score - left.score)[0]
  if (!selected) {
    return { accepted: false, code: 'no_semantic_match', evaluations: scored, usage: response.usage }
  }
  const candidate = candidateSchema.data.find(value => value.candidateId === selected.candidateId)!
  return {
    accepted: true,
    selectedCandidateId: candidate.candidateId,
    selectedAssetId: candidate.assetId,
    evaluations: scored,
    usage: response.usage,
  }
}
