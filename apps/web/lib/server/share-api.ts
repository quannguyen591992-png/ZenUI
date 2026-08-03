import { randomBytes } from 'node:crypto'

import { createRemoteImagePolicy, normalizePageSlug } from '@zenui/design-schema'
import { compileStandaloneHtml } from '@zenui/html-compiler'
import {
  SHARE_ROBOTS_POLICY,
  SHARE_SLUG_BYTES,
  shareCreateRequestSchema,
  shareDisableRequestSchema,
  shareLinkPublicSchema,
  shareSlugSchema,
} from '@zenui/share-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { ProjectApiRecord } from './project-api'
import type { AuthContext, ShareLinkRecord } from '@zenui/database'
import type { DesignDocument } from '@zenui/design-schema'

interface ManagementAdmission {
  acquire(input: { userId: string; workspaceId: string }): Promise<
    { accepted: true } | { accepted: false; retryAfterSeconds: number }
  >
}

interface PublicAdmission {
  acquire(input: { slug: string; fingerprint: string }): Promise<
    { accepted: true } | { accepted: false; retryAfterSeconds: number }
  >
}

export interface ShareApiDependencies {
  trustedOrigin: string
  shareOrigin: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  findProject(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  admission: ManagementAdmission
  createSlug(): string
  links: {
    create(context: AuthContext, projectId: string, input: {
      requestId: string
      revisionId: string
      slug: string
      expiresAt: Date | null
    }): Promise<{ created: boolean; link: ShareLinkRecord }>
    list(context: AuthContext, projectId: string): Promise<ShareLinkRecord[]>
    findById(context: AuthContext, shareLinkId: string): Promise<ShareLinkRecord | null>
    disable(context: AuthContext, projectId: string, shareLinkId: string): Promise<ShareLinkRecord | null>
  }
}

export interface PublicShareDependencies {
  shareOrigin: string
  assetOrigin: string
  remoteImageHostAllowlist: string
  admission: PublicAdmission
  links: { findPublicBySlug(slug: string): Promise<{ document: DesignDocument } | null> }
}

export function createRandomShareSlug(): string {
  return randomBytes(SHARE_SLUG_BYTES).toString('base64url')
}

export function validateShareOrigin(shareOrigin: string, editorOrigin: string): string {
  let share: URL
  let editor: URL
  try {
    share = new URL(shareOrigin)
    editor = new URL(editorOrigin)
  } catch {
    throw new Error('SHARE_ORIGIN is invalid')
  }
  if (!['http:', 'https:'].includes(share.protocol)) throw new Error('SHARE_ORIGIN is invalid')
  if (share.hostname === editor.hostname) throw new Error('SHARE_ORIGIN must be isolated from APP_ORIGIN')
  return share.origin
}

function requireTrustedOrigin(request: Request, trustedOrigin: string): void {
  let expected: string
  try { expected = new URL(trustedOrigin).origin } catch { throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500) }
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  try {
    if (new URL(origin).origin !== expected) throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function authorize(deps: ShareApiDependencies, workspaceId: string): Promise<AuthContext> {
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

function publicLink(link: ShareLinkRecord, shareOrigin: string) {
  return shareLinkPublicSchema.parse({
    id: link.id,
    revisionId: link.revisionId,
    url: `${new URL(shareOrigin).origin}/s/${link.slug}`,
    status: link.status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  })
}

async function createWithCollisionRetry(
  deps: ShareApiDependencies,
  context: AuthContext,
  projectId: string,
  input: z.infer<typeof shareCreateRequestSchema>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = deps.createSlug()
    if (!shareSlugSchema.safeParse(slug).success) throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500)
    try {
      return await deps.links.create(context, projectId, {
        requestId: input.requestId,
        revisionId: input.revisionId,
        slug,
        expiresAt: null,
      })
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'share_slug_conflict') throw error
    }
  }
  throw new ApiError('share_unavailable', 'Sharing is temporarily unavailable', 503)
}

export function createShareHandlers(deps: ShareApiDependencies) {
  return {
    async GET(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        const context = await authorize(deps, workspaceFrom(request))
        const { projectId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const links = await deps.links.list(context, projectId)
        return successResponse(links.map(link => publicLink(link, deps.shareOrigin)))
      } catch (error) { return errorResponse(error) }
    },

    async POST(request: Request, route: { params: Promise<{ projectId: string }> }) {
      try {
        requireTrustedOrigin(request, deps.trustedOrigin)
        const parsed = shareCreateRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId)
        const { projectId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const admission = await deps.admission.acquire({ userId: context.userId, workspaceId: context.workspaceId })
        if (!admission.accepted) {
          return errorResponse(new ApiError('share_rate_limit_exceeded', 'Share request limit exceeded', 429), {
            headers: { 'Retry-After': String(admission.retryAfterSeconds) },
          })
        }
        const created = await createWithCollisionRetry(deps, context, projectId, parsed.data)
        const result = publicLink(created.link, deps.shareOrigin)
        return successResponse(result, {
          status: 201,
          headers: { Location: `/api/v1/projects/${projectId}/share-links/${created.link.id}` },
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'not_found') return errorResponse(new ApiError('not_found', 'Resource not found', 404))
        return errorResponse(error)
      }
    },

    async DELETE(
      request: Request,
      route: { params: Promise<{ projectId: string; shareLinkId: string }> },
    ) {
      try {
        requireTrustedOrigin(request, deps.trustedOrigin)
        const parsed = shareDisableRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId)
        const { projectId, shareLinkId } = await route.params
        if (!await deps.findProject(context, projectId)) throw new ApiError('not_found', 'Resource not found', 404)
        const disabled = await deps.links.disable(context, projectId, shareLinkId)
        if (!disabled) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(publicLink(disabled, deps.shareOrigin))
      } catch (error) { return errorResponse(error) }
    },
  }
}

const publicHeaders = {
  'x-robots-tag': SHARE_ROBOTS_POLICY,
  'cache-control': 'no-store, max-age=0',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
}

function plainPublicResponse(body: string, status: number, retryAfterSeconds?: number): Response {
  return new Response(body, {
    status,
    headers: {
      ...publicHeaders,
      'content-type': 'text/plain; charset=utf-8',
      ...(retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : {}),
    },
  })
}

function clientFingerprint(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown'
}

export function createPublicShareHandler(deps: PublicShareDependencies) {
  const imagePolicy = createRemoteImagePolicy(deps.remoteImageHostAllowlist)
  return async function GET(
    request: Request,
    route: { params: Promise<{ slug: string; path?: string[] }> },
  ): Promise<Response> {
    let expectedOrigin: string
    try { expectedOrigin = new URL(deps.shareOrigin).origin } catch { return plainPublicResponse('Không tìm thấy', 404) }
    const requestUrl = new URL(request.url)
    const host = request.headers.get('host')
    const requestOrigin = host ? new URL(`${requestUrl.protocol}//${host}`).origin : requestUrl.origin
    if (requestOrigin !== expectedOrigin) return plainPublicResponse('Không tìm thấy', 404)
    const params = await route.params
    const parsedSlug = shareSlugSchema.safeParse(params.slug)
    if (!parsedSlug.success) return plainPublicResponse('Không tìm thấy', 404)
    const rawPath = params.path ?? []
    if (rawPath.some(segment => (
      !segment
      || segment === '.'
      || segment === '..'
      || /[%\\?#]/.test(segment)
      || [...segment].some(character => character.charCodeAt(0) <= 0x1f)
    ))) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const routePath = rawPath.length === 0 ? '/' : `/${rawPath.join('/')}`
    const normalizedRoute = normalizePageSlug(routePath)
    if (!normalizedRoute.success || normalizedRoute.slug !== routePath) return plainPublicResponse('Không tìm thấy', 404)
    const admission = await deps.admission.acquire({ slug: parsedSlug.data, fingerprint: clientFingerprint(request) })
    if (!admission.accepted) return plainPublicResponse('Quá nhiều yêu cầu', 429, admission.retryAfterSeconds)
    try {
      const view = await deps.links.findPublicBySlug(parsedSlug.data)
      if (!view) return plainPublicResponse('Không tìm thấy', 404)
      const compiled = compileStandaloneHtml(view.document, {
        title: 'Trang được chia sẻ từ ZenUI',
        robots: SHARE_ROBOTS_POLICY,
        imagePolicy,
        assetOrigin: deps.assetOrigin,
        route: normalizedRoute.slug,
        routePrefix: `/s/${parsedSlug.data}`,
      })
      if (!compiled.success) {
        return compiled.code === 'route_not_found'
          ? plainPublicResponse('Không tìm thấy', 404)
          : plainPublicResponse('Không thể hiển thị trang', 500)
      }
      return new Response(compiled.html, {
        headers: {
          ...publicHeaders,
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': compiled.csp,
          'content-length': String(compiled.bytes),
          etag: `"${compiled.checksum}"`,
        },
      })
    } catch {
      return plainPublicResponse('Không thể hiển thị trang', 500)
    }
  }
}
