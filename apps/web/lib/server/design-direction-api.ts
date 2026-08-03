import {
  designDirectionJobSchema,
  websiteBriefSchema,
  type DesignDirectionRunErrorCode,
  type DesignDirectionRunStatus,
  type LlmUsage,
  type MaterializedDesignDirection,
  type WebsiteBrief,
} from '@zenui/ai-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AuthContext } from '@zenui/database'
import type { DesignDocument } from '@zenui/design-schema'

export interface DesignDirectionApiProject {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  creationState: 'onboarding' | 'accepted'
  version: number
  document: DesignDocument
}

export interface DesignDirectionApiRun {
  id: string
  projectId: string
  workspaceId: string
  createdBy: string
  expectedVersion: number
  round: number
  status: DesignDirectionRunStatus
  provider: string | null
  model: string | null
  promptVersion: string | null
  errorCode: DesignDirectionRunErrorCode | null
  usage: LlmUsage
  directions: MaterializedDesignDirection[] | null
  selectedDirectionId: string | null
  documentVersion: number | null
  revisionId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface DesignDirectionRepository {
  saveBrief(context: AuthContext, projectId: string, brief: WebsiteBrief): Promise<WebsiteBrief>
  loadBrief(context: AuthContext, projectId: string): Promise<WebsiteBrief | null>
  create(context: AuthContext, projectId: string, input: {
    requestId: string
    expectedVersion: number
    brief: WebsiteBrief
    round: number
  }): Promise<DesignDirectionApiRun>
  findById(context: AuthContext, runId: string): Promise<DesignDirectionApiRun | null>
  cancel(context: AuthContext, runId: string): Promise<DesignDirectionApiRun | null>
  supersede(context: AuthContext, runId: string): Promise<DesignDirectionApiRun | null>
  accept(context: AuthContext, projectId: string, runId: string, directionId: string): Promise<
    | { accepted: true; version: number; revisionId: string; directionId: string; document: DesignDocument }
    | { accepted: false; code: 'not_found' | 'run_not_selectable' | 'direction_not_found' | 'stale_document_version' | 'invalid_design_document' }
  >
  fail(context: AuthContext, runId: string, input: {
    errorCode: string
    usage: LlmUsage
  }): Promise<DesignDirectionApiRun | null>
}

export interface DirectionAdmissionAccepted { accepted: true }
export interface DirectionAdmissionRejected {
  accepted: false
  code: 'ai_rate_limit_exceeded' | 'ai_budget_exceeded'
  retryAfterSeconds: number
}

export interface DesignDirectionApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<DesignDirectionApiProject | null>
  admission: {
    acquire(input: { userId: string; workspaceId: string; reservedTokens: number }): Promise<DirectionAdmissionAccepted | DirectionAdmissionRejected>
  }
  directions: DesignDirectionRepository
  queue: { enqueue(job: z.infer<typeof designDirectionJobSchema>): Promise<void> }
  pollIntervalMs: number
  heartbeatMs: number
}

const workspaceIdSchema = z.string().uuid()
const workspaceInputSchema = z.object({ workspaceId: workspaceIdSchema }).strict()
const briefRequestSchema = z.object({ workspaceId: workspaceIdSchema, brief: websiteBriefSchema }).strict()
const createRunSchema = z.object({
  workspaceId: workspaceIdSchema,
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  brief: websiteBriefSchema,
  round: z.number().int().min(0).max(100).default(0),
}).strict()
const chooseSchema = z.object({
  workspaceId: workspaceIdSchema,
  directionId: z.string().min(1).max(100),
}).strict()

function details(error: z.ZodError) {
  return error.issues.map(issue => ({
    path: issue.path.join('.'), code: issue.code, message: issue.message,
  }))
}

function parsed<T>(result: z.ZodSafeParseResult<T>): T {
  if (!result.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(result.error))
  return result.data
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

function workspaceFromQuery(request: Request): string {
  return parsed(workspaceIdSchema.safeParse(new URL(request.url).searchParams.get('workspaceId')))
}

async function requireWorkspace(
  dependencies: DesignDirectionApiDependencies,
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
  dependencies: DesignDirectionApiDependencies,
  context: AuthContext,
  projectId: string,
): Promise<DesignDirectionApiProject> {
  const project = await dependencies.findProject(context, projectId)
  if (!project) throw new ApiError('not_found', 'Resource not found', 404)
  return project
}

function publicDirection(direction: MaterializedDesignDirection) {
  return {
    id: direction.id,
    name: direction.name,
    character: direction.character,
    rationale: direction.rationale,
    contract: direction.contract,
    document: direction.document,
  }
}

function publicRun(run: DesignDirectionApiRun) {
  return {
    id: run.id,
    projectId: run.projectId,
    expectedVersion: run.expectedVersion,
    round: run.round,
    status: run.status,
    errorCode: run.errorCode,
    directions: run.directions?.map(publicDirection) ?? null,
    selectedDirectionId: run.selectedDirectionId,
    documentVersion: run.documentVersion,
    revisionId: run.revisionId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function createBriefHandler(dependencies: DesignDirectionApiDependencies) {
  type Context = { params: Promise<{ projectId: string }> }
  return {
    async GET(request: Request, routeContext: Context) {
      try {
        const workspaceId = workspaceFromQuery(request)
        const context = await requireWorkspace(dependencies, workspaceId, 'read')
        const { projectId } = await routeContext.params
        await requireProject(dependencies, context, projectId)
        return successResponse(await dependencies.directions.loadBrief(context, projectId))
      } catch (error) {
        return errorResponse(error)
      }
    },
    async PUT(request: Request, routeContext: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = parsed(briefRequestSchema.safeParse(await parseJsonBody(request)))
        const context = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
        const { projectId } = await routeContext.params
        const project = await requireProject(dependencies, context, projectId)
        if (project.creationState !== 'onboarding') throw new ApiError('project_already_accepted', 'Website already exists', 409)
        return successResponse(await dependencies.directions.saveBrief(context, projectId, input.brief))
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export const DESIGN_DIRECTION_RESERVED_TOKENS = 12_000

export function createDesignDirectionCollectionHandler(dependencies: DesignDirectionApiDependencies) {
  return {
    async POST(request: Request, routeContext: { params: Promise<{ projectId: string }> }) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = parsed(createRunSchema.safeParse(await parseJsonBody(request)))
        const context = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
        const { projectId } = await routeContext.params
        const project = await requireProject(dependencies, context, projectId)
        if (project.creationState !== 'onboarding') throw new ApiError('project_already_accepted', 'Website already exists', 409)
        if (project.version !== input.expectedVersion) throw new ApiError('stale_document_version', 'Document conflict', 409)
        const admission = await dependencies.admission.acquire({
          userId: context.userId,
          workspaceId: context.workspaceId,
          reservedTokens: DESIGN_DIRECTION_RESERVED_TOKENS,
        })
        if (!admission.accepted) {
          return errorResponse(new ApiError(admission.code, 'AI request limit exceeded', 429), {
            headers: { 'Retry-After': String(admission.retryAfterSeconds) },
          })
        }
        const run = await dependencies.directions.create(context, projectId, {
          requestId: input.requestId,
          expectedVersion: input.expectedVersion,
          brief: input.brief,
          round: input.round,
        })
        try {
          await dependencies.queue.enqueue(designDirectionJobSchema.parse({
            designDirectionRunId: run.id,
            projectId,
            workspaceId: context.workspaceId,
            userId: context.userId,
          }))
        } catch {
          await dependencies.directions.fail(context, run.id, {
            errorCode: 'queue_unavailable',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          })
          throw new ApiError('queue_unavailable', 'AI generation is temporarily unavailable', 503)
        }
        return successResponse(publicRun(run), {
          status: 202,
          headers: { Location: `/api/v1/projects/${projectId}/design-direction-runs/${run.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createDesignDirectionItemHandler(dependencies: DesignDirectionApiDependencies) {
  type Context = { params: Promise<{ projectId: string; runId: string }> }
  return {
    async GET(request: Request, routeContext: Context) {
      try {
        const workspaceId = workspaceFromQuery(request)
        const context = await requireWorkspace(dependencies, workspaceId, 'read')
        const { projectId, runId } = await routeContext.params
        await requireProject(dependencies, context, projectId)
        const run = await dependencies.directions.findById(context, runId)
        if (!run || run.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(publicRun(run))
      } catch (error) {
        return errorResponse(error)
      }
    },
    async DELETE(request: Request, routeContext: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = parsed(workspaceInputSchema.safeParse(await parseJsonBody(request)))
        const context = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
        const { projectId, runId } = await routeContext.params
        await requireProject(dependencies, context, projectId)
        const run = await dependencies.directions.findById(context, runId)
        if (!run || run.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
        const cancelled = await dependencies.directions.cancel(context, runId)
        if (!cancelled) throw new ApiError('run_not_cancellable', 'Request can no longer be cancelled', 409)
        return successResponse(publicRun(cancelled))
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createDirectionChooseHandler(dependencies: DesignDirectionApiDependencies) {
  return async function POST(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; runId: string }> },
  ) {
    try {
      requireTrustedOrigin(request, dependencies.trustedOrigin)
      const input = parsed(chooseSchema.safeParse(await parseJsonBody(request)))
      const context = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
      const { projectId, runId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const result = await dependencies.directions.accept(context, projectId, runId, input.directionId)
      if (!result.accepted) {
        const status = result.code === 'not_found' ? 404 : result.code === 'stale_document_version' ? 409 : 422
        throw new ApiError(result.code, result.code === 'not_found' ? 'Resource not found' : 'Direction cannot be selected', status)
      }
      return successResponse(result)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

function event(run: DesignDirectionApiRun) {
  return JSON.stringify({
    id: run.id,
    status: run.status,
    errorCode: run.errorCode,
    directions: run.directions?.map(publicDirection) ?? null,
    selectedDirectionId: run.selectedDirectionId,
    documentVersion: run.documentVersion,
    revisionId: run.revisionId,
  })
}

function terminal(status: DesignDirectionRunStatus): boolean {
  return ['completed', 'failed', 'cancelled', 'superseded', 'accepted'].includes(status)
}

export function createDesignDirectionEventsHandler(dependencies: DesignDirectionApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; runId: string }> },
  ) {
    try {
      const workspaceId = workspaceFromQuery(request)
      const context = await requireWorkspace(dependencies, workspaceId, 'read')
      const { projectId, runId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const initial = await dependencies.directions.findById(context, runId)
      if (!initial || initial.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let last = event(initial)
          let lastHeartbeat = Date.now()
          controller.enqueue(encoder.encode(`event: status\ndata: ${last}\n\n`))
          if (terminal(initial.status)) {
            controller.close()
            return
          }
          while (!request.signal.aborted) {
            const run = await dependencies.directions.findById(context, runId)
            if (!run || run.projectId !== projectId) break
            const next = event(run)
            if (next !== last) {
              controller.enqueue(encoder.encode(`event: status\ndata: ${next}\n\n`))
              last = next
            }
            if (terminal(run.status)) break
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
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        },
      })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
