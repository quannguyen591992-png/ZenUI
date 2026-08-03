import {
  generationJobSchema,
  generationRequestSchema,
  generationStatusEventSchema,
  type GenerationErrorCode,
  type GenerationMode,
  type LlmUsage,
} from '@zenui/ai-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { ProjectApiRecord } from './project-api'
import type { AuthContext } from '@zenui/database'

export interface GenerationApiRun {
  id: string
  projectId: string
  workspaceId: string
  createdBy: string
  mode: GenerationMode
  selectedNodeId: string | null
  expectedVersion: number
  status: 'queued' | 'running' | 'repairing' | 'completed' | 'failed'
  provider: string | null
  model: string | null
  promptVersion: string | null
  repairCount: number
  errorCode: GenerationErrorCode | null
  usage: LlmUsage
  documentVersion: number | null
  revisionId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface GenerationRunRepository {
  create(
    context: AuthContext,
    projectId: string,
    input: {
      requestId: string
      mode: GenerationMode
      selectedNodeId?: string
      prompt: string
      expectedVersion: number
    },
  ): Promise<GenerationApiRun>
  findById(context: AuthContext, runId: string): Promise<GenerationApiRun | null>
  list(context: AuthContext, projectId: string, limit?: number): Promise<GenerationApiRun[]>
  fail(
    context: AuthContext,
    runId: string,
    input: { errorCode: string; usage: LlmUsage; repairCount: number },
  ): Promise<GenerationApiRun | null>
}

export interface AdmissionResultAccepted { accepted: true }
export interface AdmissionResultRejected {
  accepted: false
  code: 'ai_rate_limit_exceeded' | 'ai_budget_exceeded'
  retryAfterSeconds: number
}

export interface GenerationApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  admission: {
    acquire(input: { userId: string; workspaceId: string; reservedTokens: number }): Promise<AdmissionResultAccepted | AdmissionResultRejected>
  }
  runs: GenerationRunRepository
  queue: { enqueue(job: z.infer<typeof generationJobSchema>): Promise<void> }
  pollIntervalMs: number
  heartbeatMs: number
}

const workspaceIdSchema = z.string().uuid()
const listQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict()

function details(error: z.ZodError) {
  return error.issues.map(issue => ({
    path: issue.path.join('.'), code: issue.code, message: issue.message,
  }))
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
  dependencies: GenerationApiDependencies,
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
  dependencies: GenerationApiDependencies,
  context: AuthContext,
  projectId: string,
): Promise<ProjectApiRecord> {
  const project = await dependencies.findProject(context, projectId)
  if (!project) throw new ApiError('not_found', 'Resource not found', 404)
  return project
}

function parseWorkspace(request: Request): string {
  const parsed = workspaceIdSchema.safeParse(new URL(request.url).searchParams.get('workspaceId'))
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
  return parsed.data
}

export const GENERATION_RESERVED_TOKENS = {
  generate: 12_000,
  'edit-page': 8_000,
  'edit-selection': 8_000,
} as const satisfies Record<GenerationMode, number>

function parseListQuery(request: Request) {
  const url = new URL(request.url)
  const parsed = listQuerySchema.safeParse({
    workspaceId: url.searchParams.get('workspaceId'),
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
  return parsed.data
}

export function createGenerationCollectionHandlers(dependencies: GenerationApiDependencies) {
  type Context = { params: Promise<{ projectId: string }> }
  return {
    async GET(request: Request, routeContext: Context) {
      try {
        const query = parseListQuery(request)
        const context = await requireWorkspace(dependencies, query.workspaceId, 'read')
        const { projectId } = await routeContext.params
        await requireProject(dependencies, context, projectId)
        return successResponse(await dependencies.runs.list(context, projectId, query.limit))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async POST(request: Request, routeContext: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const parsed = generationRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
        const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await routeContext.params
        const project = await requireProject(dependencies, context, projectId)
        if (project.version !== parsed.data.expectedVersion) {
          throw new ApiError('stale_document_version', 'Document conflict', 409)
        }
        if (parsed.data.mode === 'edit-selection' && !project.document.nodes[parsed.data.selectedNodeId!]) {
          throw new ApiError('validation_error', 'Request validation failed', 422, [{
            path: 'selectedNodeId', code: 'node_not_found', message: 'Selected node does not exist',
          }])
        }
        const admission = await dependencies.admission.acquire({
          userId: context.userId,
          workspaceId: context.workspaceId,
          reservedTokens: GENERATION_RESERVED_TOKENS[parsed.data.mode],
        })
        if (!admission.accepted) {
          return errorResponse(new ApiError(admission.code, 'AI request limit exceeded', 429), {
            headers: { 'Retry-After': String(admission.retryAfterSeconds) },
          })
        }
        const run = await dependencies.runs.create(context, projectId, {
          requestId: parsed.data.requestId,
          mode: parsed.data.mode,
          ...(parsed.data.selectedNodeId ? { selectedNodeId: parsed.data.selectedNodeId } : {}),
          prompt: parsed.data.prompt,
          expectedVersion: parsed.data.expectedVersion,
        })
        const job = generationJobSchema.parse({
          generationRunId: run.id,
          projectId,
          workspaceId: context.workspaceId,
          userId: context.userId,
        })
        try {
          await dependencies.queue.enqueue(job)
        } catch {
          await dependencies.runs.fail(context, run.id, {
            errorCode: 'queue_unavailable',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            repairCount: 0,
          })
          throw new ApiError('queue_unavailable', 'AI generation is temporarily unavailable', 503)
        }
        return successResponse(run, {
          status: 202,
          headers: { Location: `/api/v1/projects/${projectId}/generation-runs/${run.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createGenerationItemHandler(dependencies: GenerationApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; runId: string }> },
  ) {
    try {
      const workspaceId = parseWorkspace(request)
      const context = await requireWorkspace(dependencies, workspaceId, 'read')
      const { projectId, runId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const run = await dependencies.runs.findById(context, runId)
      if (!run || run.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      return successResponse(run)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

function statusEvent(run: GenerationApiRun) {
  return generationStatusEventSchema.parse({
    runId: run.id,
    status: run.status,
    repairAttempt: run.repairCount,
    usage: run.usage,
    ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    ...(run.documentVersion ? { documentVersion: run.documentVersion } : {}),
    ...(run.revisionId ? { revisionId: run.revisionId } : {}),
  })
}

export function createGenerationEventsHandler(dependencies: GenerationApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; runId: string }> },
  ) {
    try {
      const workspaceId = parseWorkspace(request)
      const context = await requireWorkspace(dependencies, workspaceId, 'read')
      const { projectId, runId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const initial = await dependencies.runs.findById(context, runId)
      if (!initial || initial.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          let lastStatus = JSON.stringify(statusEvent(initial))
          let lastHeartbeat = Date.now()
          controller.enqueue(encoder.encode(`event: status\ndata: ${lastStatus}\n\n`))
          if (initial.status === 'completed' || initial.status === 'failed') {
            controller.close()
            return
          }
          while (!request.signal.aborted) {
            const run = await dependencies.runs.findById(context, runId)
            if (!run || run.projectId !== projectId) break
            const serialized = JSON.stringify(statusEvent(run))
            if (serialized !== lastStatus) {
              controller.enqueue(encoder.encode(`event: status\ndata: ${serialized}\n\n`))
              lastStatus = serialized
            }
            if (run.status === 'completed' || run.status === 'failed') break
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
