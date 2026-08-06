import {
  deriveProposalScope,
  generationJobSchema,
  proposalRequestSchema,
  routeProposalIntent,
  type GenerationErrorCode,
  type ProposalAction,
  type ProposalFeedbackCode,
  type ProposalIntent,
  type ProposalScope,
  type RemixAllowedChange,
} from '@zenui/ai-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AdmissionResultAccepted, AdmissionResultRejected } from './generation-api'
import type { ProjectApiRecord } from './project-api'
import type { AuthContext } from '@zenui/database'
import type { DesignDocument } from '@zenui/design-schema'

export type ProposalPublicStatus =
  | 'preparing' | 'ready' | 'accepted' | 'discarded' | 'superseded'
  | 'cancelled' | 'stale' | 'invalid-scope' | 'failed'

export interface ProposalApiRun {
  id: string
  projectId: string
  expectedVersion: number
  status: ProposalPublicStatus
  action: ProposalAction
  intent?: ProposalIntent
  scope: ProposalScope
  summary: string | null
  proposedDocument: DesignDocument | null
  errorCode: GenerationErrorCode | null
  createdAt: Date
  updatedAt: Date
}

interface InternalGenerationProposal {
  id: string
  projectId: string
  expectedVersion: number
  delivery: 'apply' | 'proposal'
  proposalAction: ProposalAction | null
  proposalIntent?: ProposalIntent | null
  proposalStatus: ProposalPublicStatus | null
  scope: ProposalScope | null
  proposedDocument: DesignDocument | null
  proposalSummary: string | null
  errorCode: GenerationErrorCode | null
  originalRequest?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ProposalRepository {
  createProposal(context: AuthContext, projectId: string, input: {
    requestId: string
    action: ProposalAction
    intent?: ProposalIntent
    allowedChanges?: RemixAllowedChange[]
    feedbackCodes?: ProposalFeedbackCode[]
    prompt: string
    expectedVersion: number
    selectedNodeId?: string
    previousProposalId?: string
    scope: ProposalScope
  }): Promise<InternalGenerationProposal | ProposalApiRun>
  findById(context: AuthContext, runId: string): Promise<InternalGenerationProposal | ProposalApiRun | null>
  list(context: AuthContext, projectId: string, limit?: number): Promise<(InternalGenerationProposal | ProposalApiRun)[]>
  acceptProposal(context: AuthContext, projectId: string, runId: string): Promise<
    | { accepted: true; version: number; revisionId: string; document: DesignDocument }
    | { accepted: false; code: string }
  >
  discardProposal(context: AuthContext, runId: string): Promise<InternalGenerationProposal | ProposalApiRun | null>
  cancelProposal(context: AuthContext, runId: string): Promise<InternalGenerationProposal | ProposalApiRun | null>
  fail(context: AuthContext, runId: string, input: {
    errorCode: string
    usage: { inputTokens: number; outputTokens: number; totalTokens: number }
    repairCount: number
  }): Promise<unknown>
}

export interface ProposalApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  admission: {
    acquire(input: { userId: string; workspaceId: string; reservedTokens: number }): Promise<AdmissionResultAccepted | AdmissionResultRejected>
  }
  proposals: ProposalRepository
  queue: { enqueue(job: z.infer<typeof generationJobSchema>): Promise<void> }
  pollIntervalMs: number
  heartbeatMs: number
}

const workspaceIdSchema = z.string().uuid()
const listQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()
const actionBodySchema = z.object({ workspaceId: workspaceIdSchema }).strict()

function details(error: z.ZodError) {
  return error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code, message: issue.message }))
}

function requireTrustedOrigin(request: Request, trustedOrigin: string): void {
  let expected: string
  try {
    expected = new URL(trustedOrigin).origin
  } catch {
    throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500)
  }
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  try {
    if (new URL(origin).origin !== expected) throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function requireWorkspace(
  dependencies: ProposalApiDependencies,
  workspaceId: string,
  permission: 'read' | 'mutateDocument',
): Promise<AuthContext> {
  const session = await dependencies.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await dependencies.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, permission)) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

async function requireProject(
  dependencies: ProposalApiDependencies,
  context: AuthContext,
  projectId: string,
): Promise<ProjectApiRecord> {
  const project = await dependencies.findProject(context, projectId)
  if (!project) throw new ApiError('not_found', 'Resource not found', 404)
  return project
}

function parseListQuery(request: Request) {
  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    workspaceId: url.searchParams.get('workspaceId'),
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
  return parsed.data
}

function publicProposal(input: InternalGenerationProposal | ProposalApiRun): ProposalApiRun | null {
  if ('action' in input && 'status' in input) {
    const visible = { ...input } as ProposalApiRun & { originalRequest?: string }
    delete visible.originalRequest
    return visible
  }
  if (input.delivery !== 'proposal' || !input.proposalAction || !input.proposalStatus || !input.scope) return null
  return {
    id: input.id,
    projectId: input.projectId,
    expectedVersion: input.expectedVersion,
    status: input.proposalStatus,
    action: input.proposalAction,
    intent: input.proposalIntent ?? 'standard',
    scope: input.scope,
    summary: input.proposalSummary,
    proposedDocument: input.proposalStatus === 'ready' || input.proposalStatus === 'accepted'
      ? input.proposedDocument
      : null,
    errorCode: input.errorCode,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

export const PROPOSAL_RESERVED_TOKENS = 8_000

export function createProposalCollectionHandlers(dependencies: ProposalApiDependencies) {
  type Context = { params: Promise<{ projectId: string }> }
  return {
    async GET(request: Request, routeContext: Context) {
      try {
        const query = parseListQuery(request)
        const context = await requireWorkspace(dependencies, query.workspaceId, 'read')
        const { projectId } = await routeContext.params
        await requireProject(dependencies, context, projectId)
        const proposals = (await dependencies.proposals.list(context, projectId, query.limit))
          .map(publicProposal)
          .filter((proposal): proposal is ProposalApiRun => proposal !== null)
        return successResponse(proposals)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async POST(request: Request, routeContext: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const parsed = proposalRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
        const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await routeContext.params
        const project = await requireProject(dependencies, context, projectId)
        if (project.version !== parsed.data.expectedVersion) {
          throw new ApiError('stale_document_version', 'Document conflict', 409)
        }
        const routed = routeProposalIntent({
          document: project.document,
          selectedNodeId: parsed.data.selectedNodeId,
          requestedIntent: parsed.data.intent,
          prompt: parsed.data.prompt ?? '',
        })
        if (!routed.accepted) {
          throw routed.code === 'forbidden_action'
            ? new ApiError('forbidden_action', 'This request is outside AI authority', 422)
            : new ApiError('invalid_scope', 'The selected content is not valid for this proposal', 422)
        }
        const scope = deriveProposalScope(project.document, routed.targetNodeId)
        if (!scope) throw new ApiError('invalid_scope', 'The selected content is no longer available', 422)
        if (routed.intent === 'remix-section' && scope.kind !== 'section') {
          throw new ApiError('invalid_scope', 'Remix requires a selected section', 422)
        }
        if (routed.intent === 'replace-media' && scope.kind !== 'element') {
          throw new ApiError('invalid_scope', 'Media replacement requires an exact image target', 422)
        }
        if (routed.intent === 'style' && scope.kind !== 'element') {
          throw new ApiError('invalid_scope', 'Style changes require an exact element target', 422)
        }
        if (routed.intent === 'layout' && scope.kind !== 'section') {
          throw new ApiError('invalid_scope', 'Layout changes require a selected section', 422)
        }
        if (routed.intent === 'composition' && (scope.kind !== 'section' || project.document.nodes[scope.rootNodeId]?.type !== 'section')) {
          throw new ApiError('invalid_scope', 'Composition changes require an exact top-level section', 422)
        }
        const admission = await dependencies.admission.acquire({
          userId: context.userId,
          workspaceId: context.workspaceId,
          reservedTokens: PROPOSAL_RESERVED_TOKENS,
        })
        if (!admission.accepted) {
          return errorResponse(new ApiError(admission.code, 'AI request limit exceeded', 429), {
            headers: { 'Retry-After': String(admission.retryAfterSeconds) },
          })
        }
        let prompt = parsed.data.prompt ?? ''
        if (parsed.data.action === 'try-another') {
          const previous = await dependencies.proposals.findById(context, parsed.data.previousProposalId)
          const visible = previous ? publicProposal(previous) : null
          if (!visible || visible.projectId !== projectId || visible.status !== 'ready') {
            throw new ApiError('proposal_not_replaceable', 'Proposal cannot be replaced', 409)
          }
          const originalRequest = previous && 'originalRequest' in previous
            ? previous.originalRequest
            : undefined
          if (!originalRequest) {
            throw new ApiError('proposal_not_replaceable', 'Proposal cannot be replaced', 409)
          }
          prompt = originalRequest
        }
        const created = await dependencies.proposals.createProposal(context, projectId, {
          requestId: parsed.data.requestId,
          action: parsed.data.action,
          intent: routed.intent,
          allowedChanges: parsed.data.allowedChanges,
          ...(parsed.data.feedbackCodes ? { feedbackCodes: parsed.data.feedbackCodes } : {}),
          prompt,
          expectedVersion: parsed.data.expectedVersion,
          ...(routed.targetNodeId ? { selectedNodeId: routed.targetNodeId } : {}),
          ...('previousProposalId' in parsed.data ? { previousProposalId: parsed.data.previousProposalId } : {}),
          scope,
        })
        const proposal = publicProposal(created)
        if (!proposal) throw new ApiError('proposal_create_failed', 'Could not prepare proposal', 500)
        const job = generationJobSchema.parse({
          generationRunId: proposal.id,
          projectId,
          workspaceId: context.workspaceId,
          userId: context.userId,
        })
        try {
          await dependencies.queue.enqueue(job)
        } catch {
          await dependencies.proposals.fail(context, proposal.id, {
            errorCode: 'queue_unavailable',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            repairCount: 0,
          })
          throw new ApiError('queue_unavailable', 'AI proposal is temporarily unavailable', 503)
        }
        return successResponse(proposal, {
          status: 202,
          headers: { Location: `/api/v1/projects/${projectId}/ai-proposals/${proposal.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createProposalItemHandler(dependencies: ProposalApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; proposalId: string }> },
  ) {
    try {
      const workspace = workspaceIdSchema.safeParse(new URL(request.url).searchParams.get('workspaceId'))
      if (!workspace.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(workspace.error))
      const context = await requireWorkspace(dependencies, workspace.data, 'read')
      const { projectId, proposalId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const found = await dependencies.proposals.findById(context, proposalId)
      const proposal = found ? publicProposal(found) : null
      if (!proposal || proposal.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      return successResponse(proposal)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createProposalActionHandler(
  dependencies: ProposalApiDependencies,
  action: 'accept' | 'discard' | 'cancel',
) {
  return async function POST(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; proposalId: string }> },
  ) {
    try {
      requireTrustedOrigin(request, dependencies.trustedOrigin)
      const parsed = actionBodySchema.safeParse(await parseJsonBody(request))
      if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
      const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
      const { projectId, proposalId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      if (action === 'accept') {
        const result = await dependencies.proposals.acceptProposal(context, projectId, proposalId)
        if (!result.accepted) {
          const status = result.code === 'stale_document_version' || result.code === 'proposal_not_ready' ? 409 : 422
          throw new ApiError(result.code, 'Proposal could not be accepted', status)
        }
        return successResponse(result)
      }
      const updated = action === 'discard'
        ? await dependencies.proposals.discardProposal(context, proposalId)
        : await dependencies.proposals.cancelProposal(context, proposalId)
      const proposal = updated ? publicProposal(updated) : null
      if (!proposal || proposal.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      return successResponse(proposal)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

const terminalStatuses = new Set<ProposalPublicStatus>([
  'ready', 'accepted', 'discarded', 'superseded', 'cancelled', 'stale', 'invalid-scope', 'failed',
])

export function createProposalEventsHandler(dependencies: ProposalApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; proposalId: string }> },
  ) {
    try {
      const workspace = workspaceIdSchema.safeParse(new URL(request.url).searchParams.get('workspaceId'))
      if (!workspace.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(workspace.error))
      const context = await requireWorkspace(dependencies, workspace.data, 'read')
      const { projectId, proposalId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const initialRun = await dependencies.proposals.findById(context, proposalId)
      const initial = initialRun ? publicProposal(initialRun) : null
      if (!initial || initial.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let last = JSON.stringify(initial)
          let lastHeartbeat = Date.now()
          controller.enqueue(encoder.encode(`event: status\ndata: ${last}\n\n`))
          if (terminalStatuses.has(initial.status)) return controller.close()
          while (!request.signal.aborted) {
            const nextRun = await dependencies.proposals.findById(context, proposalId)
            const next = nextRun ? publicProposal(nextRun) : null
            if (!next || next.projectId !== projectId) break
            const serialized = JSON.stringify(next)
            if (serialized !== last) {
              controller.enqueue(encoder.encode(`event: status\ndata: ${serialized}\n\n`))
              last = serialized
            }
            if (terminalStatuses.has(next.status)) break
            if (Date.now() - lastHeartbeat >= dependencies.heartbeatMs) {
              controller.enqueue(encoder.encode(': heartbeat\n\n'))
              lastHeartbeat = Date.now()
            }
            await new Promise(resolve => setTimeout(resolve, dependencies.pollIntervalMs))
          }
          controller.close()
        },
      })
      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        },
      })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
