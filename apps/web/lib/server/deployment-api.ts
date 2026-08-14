import {
  deploymentCreateRequestSchema,
  deploymentJobSchema,
  deploymentPublicSchema,
} from '@zenui/deployment-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AuthContext, DeploymentRecord } from '@zenui/database'

export interface DeploymentApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<{ id: string; workspaceId: string } | null>
  findRevision(context: AuthContext, projectId: string, revisionId: string): Promise<{ id: string; projectId: string } | null>
  findConnection(context: AuthContext): Promise<{ id: string; status: string } | null>
  admission: {
    acquire(input: { userId: string; workspaceId: string }): Promise<
      { accepted: true } | { accepted: false; retryAfterSeconds: number }
    >
  }
  deployments: {
    create(context: AuthContext, projectId: string, input: {
      revisionId: string
      connectionId: string
      requestId: string
      target: 'preview' | 'production'
    }): Promise<{ created: boolean; deployment: DeploymentRecord }>
    list(context: AuthContext, projectId: string): Promise<DeploymentRecord[]>
    findById(context: AuthContext, deploymentId: string): Promise<DeploymentRecord | null>
    disableLeadForms(
      context: AuthContext,
      projectId: string,
      deploymentId: string,
    ): Promise<DeploymentRecord | null>
    fail(context: AuthContext, deploymentId: string, code: string): Promise<DeploymentRecord | null>
  }
  queue: { enqueue(job: z.infer<typeof deploymentJobSchema>): Promise<void> }
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

async function authorize(deps: DeploymentApiDependencies, workspaceId: string): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await deps.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, 'manageProject')) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function workspaceFrom(request: Request): string {
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
  return parsed.data
}

function safeDeployment(deployment: DeploymentRecord) {
  return deploymentPublicSchema.parse({
    id: deployment.id,
    revisionId: deployment.revisionId,
    provider: deployment.provider,
    target: deployment.target,
    status: deployment.status,
    url: deployment.url,
    errorCode: deployment.errorCode,
    leadFormsLive: deployment.leadFormsLive,
    createdAt: deployment.createdAt.toISOString(),
    updatedAt: deployment.updatedAt.toISOString(),
  })
}

export function createDeploymentHandlers(deps: DeploymentApiDependencies) {
  return {
    async POST(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        trustedOrigin(request, deps.trustedOrigin)
        const parsed = deploymentCreateRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId)
        const { projectId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        if (!await deps.findRevision(context, projectId, parsed.data.revisionId)) throw new ApiError('not_found', 'Resource not found', 404)
        const connection = await deps.findConnection(context)
        if (!connection || connection.status !== 'connected') {
          throw new ApiError('connection_missing', 'Connect Vercel before deploying', 409)
        }
        const admission = await deps.admission.acquire({ userId: context.userId, workspaceId: context.workspaceId })
        if (!admission.accepted) {
          return errorResponse(new ApiError('deploy_rate_limit_exceeded', 'Deployment request limit exceeded', 429), {
            headers: { 'Retry-After': String(admission.retryAfterSeconds) },
          })
        }
        const created = await deps.deployments.create(context, projectId, {
          revisionId: parsed.data.revisionId,
          connectionId: connection.id,
          requestId: parsed.data.requestId,
          target: parsed.data.target,
        })
        if (created.created) {
          try {
            await deps.queue.enqueue(deploymentJobSchema.parse({
              deploymentId: created.deployment.id,
              projectId,
              workspaceId: context.workspaceId,
              userId: context.userId,
            }))
          } catch {
            await deps.deployments.fail(context, created.deployment.id, 'queue_unavailable')
            throw new ApiError('queue_unavailable', 'Deployment is temporarily unavailable', 503)
          }
        }
        return successResponse(safeDeployment(created.deployment), {
          status: 202,
          headers: { Location: `/api/v1/projects/${projectId}/deployments/${created.deployment.id}` },
        })
      } catch (error) { return errorResponse(error) }
    },

    async GET_LIST(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        const context = await authorize(deps, workspaceFrom(request))
        const { projectId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse((await deps.deployments.list(context, projectId)).map(safeDeployment), {
          headers: { 'cache-control': 'private, no-store' },
        })
      } catch (error) { return errorResponse(error) }
    },

    async GET_ITEM(request: Request, route: { params: Promise<{ projectId: string; deploymentId: string }> }) {
      try {
        const context = await authorize(deps, workspaceFrom(request))
        const { projectId, deploymentId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const deployment = await deps.deployments.findById(context, deploymentId)
        if (!deployment || deployment.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(safeDeployment(deployment), { headers: { 'cache-control': 'private, no-store' } })
      } catch (error) { return errorResponse(error) }
    },

    async DELETE_LEAD_FORMS(
      request: Request,
      route: {
        params: Promise<{ projectId: string; deploymentId: string }>
      },
    ) {
      try {
        trustedOrigin(request, deps.trustedOrigin)
        const context = await authorize(deps, workspaceFrom(request))
        const { projectId, deploymentId } = await route.params
        if (!await deps.findProject(context, projectId)) {
          throw new ApiError('not_found', 'Resource not found', 404)
        }
        const deployment = await deps.deployments.disableLeadForms(
          context,
          projectId,
          deploymentId,
        )
        if (!deployment) {
          throw new ApiError('not_found', 'Resource not found', 404)
        }
        return successResponse(safeDeployment(deployment), {
          headers: { 'cache-control': 'private, no-store' },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
