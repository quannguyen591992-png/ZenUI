import {
  EXPORT_CONTENT_TYPE,
  EXPORT_FILENAME,
  exportJobSchema,
  exportRequestSchema,
  exportRunPublicSchema,
  type ExportErrorCode,
} from '@zenui/export-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { ProjectApiRecord } from './project-api'
import type { AuthContext, ExportRunRecord } from '@zenui/database'

interface ExportCreateResult { created: boolean; run: ExportRunRecord }

export interface ExportApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  admission: { acquire(input: { userId: string; workspaceId: string }): Promise<{ accepted: true } | { accepted: false; retryAfterSeconds: number }> }
  runs: {
    create(context: AuthContext, projectId: string, input: { requestId: string; expectedVersion: number }): Promise<ExportCreateResult>
    findById(context: AuthContext, runId: string): Promise<ExportRunRecord | null>
    fail(context: AuthContext, runId: string, code: ExportErrorCode): Promise<ExportRunRecord | null>
    getArtifactKey(context: AuthContext, runId: string): Promise<string | null>
  }
  queue: { enqueue(job: z.infer<typeof exportJobSchema>): Promise<void> }
  store: { get(key: string): Promise<Uint8Array | null> }
}

function safeRun(run: ExportRunRecord) {
  return exportRunPublicSchema.parse({
    id: run.id,
    projectId: run.projectId,
    status: run.status,
    expectedVersion: run.expectedVersion,
    documentVersion: run.documentVersion,
    artifact: run.artifact,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  })
}

function trustedOrigin(request: Request, expected: string): void {
  const origin = request.headers.get('origin')
  let normalized: string
  try { normalized = new URL(expected).origin } catch { throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500) }
  if (!origin || origin === 'null') throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  try {
    if (new URL(origin).origin !== normalized) throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function authorize(deps: ExportApiDependencies, workspaceId: string, permission: 'read' | 'mutateDocument'): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await deps.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, permission)) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function workspaceFrom(request: Request): string {
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
  return parsed.data
}

export function createExportHandlers(deps: ExportApiDependencies) {
  return {
    async POST(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        trustedOrigin(request, deps.trustedOrigin)
        const parsed = exportRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await route.params
        const project = await deps.findProject(context, projectId)
        if (!project) throw new ApiError('not_found', 'Resource not found', 404)
        if (project.version !== parsed.data.expectedVersion) throw new ApiError('stale_document_version', 'Document conflict', 409)
        const admission = await deps.admission.acquire({ userId: context.userId, workspaceId: context.workspaceId })
        if (!admission.accepted) return errorResponse(new ApiError('export_rate_limit_exceeded', 'Export request limit exceeded', 429), { headers: { 'Retry-After': String(admission.retryAfterSeconds) } })
        const created = await deps.runs.create(context, projectId, { requestId: parsed.data.requestId, expectedVersion: parsed.data.expectedVersion })
        if (created.created) {
          try {
            await deps.queue.enqueue(exportJobSchema.parse({
              exportRunId: created.run.id, projectId, workspaceId: context.workspaceId, userId: context.userId,
            }))
          } catch {
            await deps.runs.fail(context, created.run.id, 'queue_unavailable')
            throw new ApiError('queue_unavailable', 'Export is temporarily unavailable', 503)
          }
        }
        return successResponse(safeRun(created.run), { status: 202, headers: { Location: `/api/v1/projects/${projectId}/exports/${created.run.id}` } })
      } catch (error) { return errorResponse(error) }
    },

    async GET_ITEM(request: Request, route: { params: Promise<{ projectId: string; exportId: string }> }) {
      try {
        const context = await authorize(deps, workspaceFrom(request), 'read')
        const { projectId, exportId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const run = await deps.runs.findById(context, exportId)
        if (!run || run.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(safeRun(run))
      } catch (error) { return errorResponse(error) }
    },

    async GET_DOWNLOAD(request: Request, route: { params: Promise<{ projectId: string; exportId: string }> }) {
      try {
        const context = await authorize(deps, workspaceFrom(request), 'read')
        const { projectId, exportId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const run = await deps.runs.findById(context, exportId)
        if (!run || run.projectId !== projectId || run.status !== 'completed' || !run.artifact) throw new ApiError('not_found', 'Artifact not found', 404)
        const key = await deps.runs.getArtifactKey(context, exportId)
        const content = key ? await deps.store.get(key) : null
        if (!content || content.byteLength !== run.artifact.bytes) throw new ApiError('artifact_unavailable', 'Artifact is unavailable', 503)
        const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
        return new Response(body, { headers: {
          'content-type': EXPORT_CONTENT_TYPE,
          'content-length': String(content.byteLength),
          'content-disposition': `attachment; filename="${EXPORT_FILENAME}"`,
          etag: `"${run.artifact.checksum}"`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        } })
      } catch (error) { return errorResponse(error) }
    },
  }
}
