import { analyzeSiteIntelligence, type SiteIntelligenceReview, type WebsiteBrief } from '@zenui/ai-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { ProjectApiRecord } from './project-api'
import type { AuthContext } from '@zenui/database'

export interface SiteIntelligenceApiReview {
  id: string
  projectId: string
  documentVersion: number
  policyVersion: string
  analysis: SiteIntelligenceReview
  dismissedFindingFingerprints: string[]
  stale: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SiteIntelligenceApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  loadBrief(context: AuthContext, projectId: string): Promise<WebsiteBrief | null>
  reviews: {
    create(context: AuthContext, projectId: string, input: {
      requestId: string
      expectedVersion: number
      analysis: SiteIntelligenceReview
    }): Promise<SiteIntelligenceApiReview>
    findById(context: AuthContext, reviewId: string): Promise<SiteIntelligenceApiReview | null>
    findLatest(context: AuthContext, projectId: string): Promise<SiteIntelligenceApiReview | null>
    dismiss(context: AuthContext, projectId: string, fingerprint: string): Promise<unknown>
    restore(context: AuthContext, projectId: string, fingerprint: string): Promise<unknown>
  }
}

const workspaceIdSchema = z.string().uuid()
const createReviewSchema = z.object({
  workspaceId: workspaceIdSchema,
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
}).strict()
const actionBodySchema = z.object({ workspaceId: workspaceIdSchema }).strict()
const fingerprintSchema = z.string().regex(/^[a-f0-9]{16}$/)

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
  dependencies: SiteIntelligenceApiDependencies,
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
  dependencies: SiteIntelligenceApiDependencies,
  context: AuthContext,
  projectId: string,
): Promise<ProjectApiRecord> {
  const project = await dependencies.findProject(context, projectId)
  if (!project) throw new ApiError('not_found', 'Resource not found', 404)
  return project
}

function workspaceFromQuery(request: Request): string {
  const parsed = workspaceIdSchema.safeParse(new URL(request.url).searchParams.get('workspaceId'))
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
  return parsed.data
}

function publicReview(review: SiteIntelligenceApiReview) {
  return {
    id: review.id,
    projectId: review.projectId,
    documentVersion: review.documentVersion,
    policyVersion: review.policyVersion,
    analysis: review.analysis,
    dismissedFindingFingerprints: review.dismissedFindingFingerprints,
    stale: review.stale,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }
}

export function createSiteIntelligenceReviewCollectionHandler(dependencies: SiteIntelligenceApiDependencies) {
  return {
    async POST(request: Request, routeContext: { params: Promise<{ projectId: string }> }) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const parsed = createReviewSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
        const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await routeContext.params
        const project = await requireProject(dependencies, context, projectId)
        if (project.version !== parsed.data.expectedVersion) {
          throw new ApiError('stale_document_version', 'Document conflict', 409)
        }
        const brief = await dependencies.loadBrief(context, projectId)
        if (!brief) throw new ApiError('website_brief_required', 'Website brief is required', 409)
        const analysis = analyzeSiteIntelligence({ document: project.document, brief })
        const review = await dependencies.reviews.create(context, projectId, {
          requestId: parsed.data.requestId,
          expectedVersion: parsed.data.expectedVersion,
          analysis,
        })
        return successResponse(publicReview(review), {
          status: 201,
          headers: { Location: `/api/v1/projects/${projectId}/site-intelligence-reviews/${review.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createSiteIntelligenceLatestHandler(dependencies: SiteIntelligenceApiDependencies) {
  return async function GET(request: Request, routeContext: { params: Promise<{ projectId: string }> }) {
    try {
      const workspaceId = workspaceFromQuery(request)
      const context = await requireWorkspace(dependencies, workspaceId, 'read')
      const { projectId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const review = await dependencies.reviews.findLatest(context, projectId)
      return successResponse(review ? publicReview(review) : null)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createSiteIntelligenceItemHandler(dependencies: SiteIntelligenceApiDependencies) {
  return async function GET(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; reviewId: string }> },
  ) {
    try {
      const workspaceId = workspaceFromQuery(request)
      const context = await requireWorkspace(dependencies, workspaceId, 'read')
      const { projectId, reviewId } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const review = await dependencies.reviews.findById(context, reviewId)
      if (!review || review.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
      return successResponse(publicReview(review))
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createSiteIntelligenceFindingActionHandler(
  dependencies: SiteIntelligenceApiDependencies,
  action: 'dismiss' | 'restore',
) {
  return async function POST(
    request: Request,
    routeContext: { params: Promise<{ projectId: string; fingerprint: string }> },
  ) {
    try {
      requireTrustedOrigin(request, dependencies.trustedOrigin)
      const parsed = actionBodySchema.safeParse(await parseJsonBody(request))
      if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(parsed.error))
      const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
      const { projectId, fingerprint: fingerprintInput } = await routeContext.params
      await requireProject(dependencies, context, projectId)
      const fingerprint = fingerprintSchema.safeParse(fingerprintInput)
      if (!fingerprint.success) throw new ApiError('validation_error', 'Request validation failed', 422, details(fingerprint.error))
      const result = action === 'dismiss'
        ? await dependencies.reviews.dismiss(context, projectId, fingerprint.data)
        : await dependencies.reviews.restore(context, projectId, fingerprint.data)
      if (!result) throw new ApiError('not_found', 'Resource not found', 404)
      return successResponse(result)
    } catch (error) {
      return errorResponse(error)
    }
  }
}
