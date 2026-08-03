import {
  brandKitApplyRequestSchema,
  brandKitSchema,
  brandKitUpdateRequestSchema,
  type BrandKit,
} from '@zenui/asset-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AuthContext, BrandKitRecord, ReplaceDocumentResult } from '@zenui/database'

export interface BrandKitApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<{ id: string; version: number } | null>
  brands: {
    load(context: AuthContext): Promise<BrandKitRecord | null>
    save(context: AuthContext, input: Omit<BrandKit, 'version'> & { expectedVersion: number }): Promise<BrandKitRecord>
    applyToProject(context: AuthContext, projectId: string, input: {
      expectedBrandKitVersion: number
      expectedDocumentVersion: number
    }): Promise<ReplaceDocumentResult>
  }
}

function requireOrigin(request: Request, expectedInput: string): void {
  let expected: string
  try { expected = new URL(expectedInput).origin } catch { throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500) }
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  try {
    if (new URL(origin).origin !== expected) throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function authorize(deps: BrandKitApiDependencies, workspaceId: string, permission: 'read' | 'manageProject'): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await deps.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, permission)) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function publicKit(record: BrandKitRecord) {
  return brandKitSchema.parse({
    version: record.version,
    name: record.name,
    logoAssetId: record.logoAssetId ?? null,
    colors: record.colors,
    fonts: record.fonts,
  })
}

function mapRepositoryError(error: unknown): never {
  const code = error instanceof Error ? error.message : ''
  if (code === 'stale_brand_kit_version') throw new ApiError(code, 'Brand Kit conflict', 409)
  if (code === 'invalid_brand_kit' || code === 'invalid_brand_logo') throw new ApiError(code, 'Brand Kit is invalid', 422)
  if (code === 'not_found') throw new ApiError(code, 'Resource not found', 404)
  throw error
}

export function createBrandKitHandlers(deps: BrandKitApiDependencies) {
  return {
    async GET(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
      try {
        const { workspaceId } = await route.params
        const query = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
        if (!query.success || query.data !== workspaceId) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, workspaceId, 'read')
        const kit = await deps.brands.load(context)
        return successResponse(kit ? publicKit(kit) : null)
      } catch (error) { return errorResponse(error) }
    },

    async PUT(request: Request, route: { params: Promise<{ workspaceId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const { workspaceId } = await route.params
        const context = await authorize(deps, workspaceId, 'manageProject')
        const parsed = brandKitUpdateRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Brand Kit validation failed', 422)
        try {
          return successResponse(publicKit(await deps.brands.save(context, parsed.data)))
        } catch (error) { mapRepositoryError(error) }
      } catch (error) { return errorResponse(error) }
    },

    async APPLY(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const parsed = brandKitApplyRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'manageProject')
        const { projectId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const result = await deps.brands.applyToProject(context, projectId, {
          expectedBrandKitVersion: parsed.data.expectedBrandKitVersion,
          expectedDocumentVersion: parsed.data.expectedDocumentVersion,
        })
        if (!result.accepted) {
          const status = result.code === 'stale_document_version' ? 409 : 404
          throw new ApiError(result.code, status === 409 ? 'Document conflict' : 'Resource not found', status)
        }
        return successResponse({ version: result.version, document: result.document })
      } catch (error) { return errorResponse(error) }
    },
  }
}
