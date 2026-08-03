import {
  assetDerivativeRequestSchema,
  assetImportRequestSchema,
  assetJobSchema,
  assetPublicSchema,
  assetSearchQuerySchema,
  assetUploadQuerySchema,
  type AssetErrorCode,
  type AssetJob,
  type AssetPublic,
  type CropTransform,
} from '@zenui/asset-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AssetRecord, AuthContext } from '@zenui/database'

interface AssetCreateInput {
  projectId?: string
  requestId: string
  scope: 'project' | 'workspace'
  source: 'upload' | 'pexels'
  defaultAlt: string
  sourceObjectKey?: string
  providerResultId?: string
}

export interface AssetApiDependencies {
  trustedOrigin: string
  maxUploadBytes: number
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<{ id: string; version: number } | null>
  admission: { acquire(input: { userId: string; workspaceId: string }): Promise<{ accepted: true } | { accepted: false; retryAfterSeconds: number }> }
  assets: {
    create(context: AuthContext, input: AssetCreateInput): Promise<AssetRecord>
    createDerivative(context: AuthContext, projectId: string, parentAssetId: string, input: { requestId: string; transform: CropTransform }): Promise<AssetRecord>
    findById(context: AuthContext, assetId: string): Promise<AssetRecord | null>
    list(context: AuthContext, projectId: string): Promise<AssetRecord[]>
    fail(context: AuthContext, assetId: string, code: AssetErrorCode): Promise<AssetRecord | null>
    archive(context: AuthContext, assetId: string): Promise<AssetRecord | null>
  }
  sourceStore: { put(input: { key: string; bytes: Uint8Array; contentType: string }): Promise<void> }
  queue: { enqueue(job: AssetJob): Promise<void> }
  search: { search(query: string, limit: number): Promise<unknown[]> }
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

async function authorize(deps: AssetApiDependencies, workspaceId: string, permission: 'read' | 'mutateDocument'): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await deps.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, permission)) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function publicAsset(record: AssetRecord): AssetPublic {
  return assetPublicSchema.parse({
    id: record.id,
    scope: record.scope,
    status: record.status,
    source: record.source,
    width: record.status === 'ready' ? record.width : null,
    height: record.status === 'ready' ? record.height : null,
    bytes: record.status === 'ready' ? record.bytes : null,
    contentType: record.status === 'ready' ? record.contentType : null,
    defaultAlt: record.defaultAlt,
    attribution: record.attribution,
    errorCode: record.status === 'failed' ? record.errorCode : null,
    archived: record.archived,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function queryObject(request: Request): Record<string, string | null> {
  const values = new URL(request.url).searchParams
  return Object.fromEntries([...values.keys()].map(key => [key, values.get(key)]))
}

async function readUpload(request: Request, maxBytes: number): Promise<{ bytes: Uint8Array; contentType: string }> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new ApiError('unsupported_media_type', 'Only JPEG, PNG and WebP images are accepted', 415)
  }
  const length = Number(request.headers.get('content-length'))
  if (!Number.isInteger(length) || length < 1) throw new ApiError('validation_error', 'Content-Length is required', 422)
  if (length > maxBytes) throw new ApiError('image_too_large', 'Image is too large', 413)
  if (!request.body) throw new ApiError('validation_error', 'Image body is required', 422)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    total += chunk.value.byteLength
    if (total > maxBytes) throw new ApiError('image_too_large', 'Image is too large', 413)
    chunks.push(chunk.value)
  }
  if (total !== length) throw new ApiError('validation_error', 'Image length does not match Content-Length', 422)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return { bytes, contentType }
}

async function projectContext(
  deps: AssetApiDependencies,
  context: AuthContext,
  projectId: string,
): Promise<void> {
  if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
}

async function admit(deps: AssetApiDependencies, context: AuthContext): Promise<void> {
  const result = await deps.admission.acquire({ userId: context.userId, workspaceId: context.workspaceId })
  if (!result.accepted) throw new ApiError('asset_rate_limit_exceeded', 'Image request limit exceeded', 429)
}

async function enqueueOrFail(deps: AssetApiDependencies, context: AuthContext, record: AssetRecord): Promise<void> {
  try {
    await deps.queue.enqueue(assetJobSchema.parse({
      assetId: record.id,
      ...(record.projectId ? { projectId: record.projectId } : {}),
      workspaceId: context.workspaceId,
      userId: context.userId,
    }))
  } catch {
    await deps.assets.fail(context, record.id, 'queue_unavailable')
    throw new ApiError('queue_unavailable', 'Image processing is temporarily unavailable', 503)
  }
}

export function createAssetHandlers(deps: AssetApiDependencies) {
  return {
    async LIST(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        const workspace = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
        if (!workspace.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, workspace.data, 'read')
        const { projectId } = await route.params
        await projectContext(deps, context, projectId)
        return successResponse((await deps.assets.list(context, projectId)).map(publicAsset))
      } catch (error) { return errorResponse(error) }
    },

    async GET_ITEM(request: Request, route: { params: Promise<{ projectId: string; assetId: string }> }) {
      try {
        const workspace = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
        if (!workspace.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, workspace.data, 'read')
        const { projectId, assetId } = await route.params
        await projectContext(deps, context, projectId)
        const record = await deps.assets.findById(context, assetId)
        if (!record || record.projectId !== projectId && record.scope !== 'workspace') throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(publicAsset(record))
      } catch (error) { return errorResponse(error) }
    },

    async UPLOAD(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const parsed = assetUploadQuerySchema.safeParse(queryObject(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await route.params
        await projectContext(deps, context, projectId)
        if (parsed.data.scope !== 'project') throw new ApiError('validation_error', 'Project uploads require project scope', 422)
        await admit(deps, context)
        const upload = await readUpload(request, deps.maxUploadBytes)
        const sourceObjectKey = `asset-sources/${context.workspaceId}/${crypto.randomUUID()}`
        await deps.sourceStore.put({ key: sourceObjectKey, bytes: upload.bytes, contentType: upload.contentType })
        const record = await deps.assets.create(context, {
          projectId, requestId: parsed.data.requestId, scope: 'project', source: 'upload',
          defaultAlt: parsed.data.defaultAlt, sourceObjectKey,
        })
        await enqueueOrFail(deps, context, record)
        return successResponse(publicAsset(record), { status: 202, headers: { Location: `/api/v1/projects/${projectId}/assets/${record.id}` } })
      } catch (error) { return errorResponse(error) }
    },

    async SEARCH(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        const parsed = assetSearchQuerySchema.safeParse(queryObject(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'read')
        await projectContext(deps, context, (await route.params).projectId)
        return successResponse(await deps.search.search(parsed.data.query, parsed.data.limit))
      } catch (error) { return errorResponse(error) }
    },

    async IMPORT(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const parsed = assetImportRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'mutateDocument')
        const { projectId } = await route.params
        await projectContext(deps, context, projectId)
        await admit(deps, context)
        const record = await deps.assets.create(context, {
          projectId, requestId: parsed.data.requestId, scope: 'project', source: 'pexels',
          defaultAlt: parsed.data.defaultAlt, providerResultId: parsed.data.resultId,
        })
        await enqueueOrFail(deps, context, record)
        return successResponse(publicAsset(record), { status: 202 })
      } catch (error) { return errorResponse(error) }
    },

    async DERIVATIVE(request: Request, route: { params: Promise<{ projectId: string; assetId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const parsed = assetDerivativeRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'mutateDocument')
        const { projectId, assetId } = await route.params
        await projectContext(deps, context, projectId)
        await admit(deps, context)
        const record = await deps.assets.createDerivative(context, projectId, assetId, {
          requestId: parsed.data.requestId, transform: parsed.data.transform,
        })
        await enqueueOrFail(deps, context, record)
        return successResponse(publicAsset(record), { status: 202 })
      } catch (error) { return errorResponse(error) }
    },

    async ARCHIVE(request: Request, route: { params: Promise<{ projectId: string; assetId: string }> }) {
      try {
        requireOrigin(request, deps.trustedOrigin)
        const parsed = z.object({ workspaceId: z.string().uuid() }).strict().safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId, 'mutateDocument')
        const { projectId, assetId } = await route.params
        await projectContext(deps, context, projectId)
        const record = await deps.assets.archive(context, assetId)
        if (!record || record.projectId !== projectId) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(publicAsset(record))
      } catch (error) { return errorResponse(error) }
    },
  }
}
