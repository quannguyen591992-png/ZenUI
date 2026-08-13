import { randomBytes } from 'node:crypto'

import { createRemoteImagePolicy, normalizePageSlug } from '@zenui/design-schema'
import { compileStandaloneHtml } from '@zenui/html-compiler'
import {
  LEAD_LIMITS,
  validateLeadSubmission,
  type LeadFormProps,
  type LeadPayload,
} from '@zenui/lead-core'
import {
  renderLeadReceiptHtml,
  type EncryptedLeadPayload,
  type LeadEncryptionContext,
} from '@zenui/lead-core/server'
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
import type {
  AuthContext,
  LeadBindingRecord,
  ShareLinkRecord,
} from '@zenui/database'
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
  leads: {
    provisionBindings(
      context: AuthContext,
      projectId: string,
      shareLinkId: string,
    ): Promise<{ bindings: LeadBindingRecord[] }>
    listBindings(
      context: AuthContext,
      projectId: string,
      shareLinkId: string,
    ): Promise<LeadBindingRecord[]>
  }
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

interface PublicShareView {
  workspaceId: string
  projectId: string
  shareLinkId: string
  revisionId: string
  document: DesignDocument
  bindings: LeadBindingRecord[]
}

interface PublicLeadBinding {
  bindingId: string
  workspaceId: string
  projectId: string
  shareLinkId: string
  revisionId: string
  formNodeId: string
  pageRoute: string
  form: LeadFormProps
}

interface LeadAdmission {
  acquire(input: {
    publicationId: string
    fingerprint: string
    reservationId: string
  }): Promise<
    { accepted: true }
    | { accepted: false; retryAfterSeconds: number }
  >
  release(input: {
    publicationId: string
    fingerprint: string
    reservationId: string
  }): Promise<void>
}

interface LeadKeyring {
  activeKeyVersion: number
  encrypt(
    payload: LeadPayload,
    context: LeadEncryptionContext,
  ): EncryptedLeadPayload
}

export interface PublicShareDependencies {
  shareOrigin: string
  assetOrigin: string
  remoteImageHostAllowlist: string
  createRequestId(): string
  createLeadId(): string
  now(): Date
  admission: PublicAdmission
  leadAdmission: LeadAdmission
  leadKeyring: LeadKeyring
  leads: {
    resolvePublicBinding(
      slug: string,
      pageRoute: string,
      formNodeId: string,
    ): Promise<PublicLeadBinding | null>
    appendEncrypted(input: {
      bindingId: string
      leadId: string
      requestId: string
      envelope: EncryptedLeadPayload
      receivedAt: Date
    }): Promise<unknown>
  }
  links: {
    findPublicBySlug(slug: string): Promise<PublicShareView | null>
  }
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

function publicLink(
  link: ShareLinkRecord,
  shareOrigin: string,
  leadFormsLive: boolean,
) {
  return shareLinkPublicSchema.parse({
    id: link.id,
    revisionId: link.revisionId,
    url: `${new URL(shareOrigin).origin}/s/${link.slug}`,
    status: link.status,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    leadFormsLive,
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
        const publicLinks = await Promise.all(links.map(async link => {
          const bindings = await deps.leads.listBindings(
            context,
            projectId,
            link.id,
          )
          return publicLink(
            link,
            deps.shareOrigin,
            bindings.some(binding => binding.status === 'active'),
          )
        }))
        return successResponse(publicLinks)
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
        const created = await createWithCollisionRetry(
          deps,
          context,
          projectId,
          parsed.data,
        )
        let bindings: LeadBindingRecord[]
        try {
          ({ bindings } = await deps.leads.provisionBindings(
            context,
            projectId,
            created.link.id,
          ))
        } catch {
          throw new ApiError(
            'share_form_unavailable',
            'The Share link could not activate its Lead Forms',
            503,
          )
        }
        const result = publicLink(
          created.link,
          deps.shareOrigin,
          bindings.some(binding => binding.status === 'active'),
        )
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
        return successResponse(publicLink(disabled, deps.shareOrigin, false))
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

type PublicShareRoute = {
  params: Promise<{ slug: string; path?: string[] }>
}

function exactPublicOrigin(
  request: Request,
  configuredOrigin: string,
): string | null {
  try {
    const expected = new URL(configuredOrigin).origin
    const requestUrl = new URL(request.url)
    const host = request.headers.get('host')
    const actual = host
      ? new URL(`${requestUrl.protocol}//${host}`).origin
      : requestUrl.origin
    return actual === expected ? expected : null
  } catch {
    return null
  }
}

function pathIsSafe(path: string[]): boolean {
  return !path.some(segment => (
    !segment
    || segment === '.'
    || segment === '..'
    || /[%\\?#]/.test(segment)
    || [...segment].some(
      character => character.charCodeAt(0) <= 0x1f,
    )
  ))
}

async function boundedFormBody(request: Request): Promise<string | null> {
  const declaredLength = request.headers.get('content-length')
  if (
    declaredLength
    && (
      !/^\d+$/.test(declaredLength)
      || Number(declaredLength) > LEAD_LIMITS.maxPayloadBytes
    )
  ) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let body = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > LEAD_LIMITS.maxPayloadBytes) {
      await reader.cancel()
      return null
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  return body + decoder.decode()
}

function submissionFromBody(body: string): {
  requestId: string
  formNodeId: string
  pageRoute: string
  fields: Record<string, string>
  consent?: boolean
} | null {
  const parameters = new URLSearchParams(body)
  const values = new Map<string, string>()
  for (const [key, value] of parameters) {
    if (values.has(key)) return null
    values.set(key, value)
  }
  const requestId = values.get('__zenui_request_id')
  const formNodeId = values.get('__zenui_form_node_id')
  const pageRoute = values.get('__zenui_page_route')
  if (!requestId || !formNodeId || !pageRoute) return null

  const fields: Record<string, string> = {}
  for (const [key, value] of values) {
    if (key.startsWith('__zenui_') || key === 'consent') continue
    fields[key] = value
  }
  return {
    requestId,
    formNodeId,
    pageRoute,
    fields,
    ...(values.has('consent') ? { consent: true } : {}),
  }
}

const receiptCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'none'",
  "style-src 'none'",
  "img-src 'none'",
  "font-src 'none'",
  "connect-src 'none'",
].join('; ')

export function createPublicShareHandler(deps: PublicShareDependencies) {
  const imagePolicy = createRemoteImagePolicy(
    deps.remoteImageHostAllowlist,
  )

  const GET = async (
    request: Request,
    route: PublicShareRoute,
  ): Promise<Response> => {
    const expectedOrigin = exactPublicOrigin(
      request,
      deps.shareOrigin,
    )
    if (!expectedOrigin) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const params = await route.params
    const parsedSlug = shareSlugSchema.safeParse(params.slug)
    if (!parsedSlug.success) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const rawPath = params.path ?? []
    if (!pathIsSafe(rawPath)) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const isReceipt = rawPath.length === 2
      && rawPath[0] === '__zenui'
      && rawPath[1] === 'receipt'
    const routePath = rawPath.length === 0
      ? '/'
      : `/${rawPath.join('/')}`
    const normalizedRoute = isReceipt
      ? null
      : normalizePageSlug(routePath)
    if (
      !isReceipt
      && (
        !normalizedRoute?.success
        || normalizedRoute.slug !== routePath
      )
    ) return plainPublicResponse('Không tìm thấy', 404)

    const fingerprint = clientFingerprint(request)
    const admission = await deps.admission.acquire({
      slug: parsedSlug.data,
      fingerprint,
    })
    if (!admission.accepted) {
      return plainPublicResponse(
        'Quá nhiều yêu cầu',
        429,
        admission.retryAfterSeconds,
      )
    }
    try {
      const view = await deps.links.findPublicBySlug(parsedSlug.data)
      if (!view) return plainPublicResponse('Không tìm thấy', 404)
      if (isReceipt) {
        const html = renderLeadReceiptHtml({
          successCopy: 'Thông tin của bạn đã được gửi thành công.',
          returnPath: `/s/${parsedSlug.data}`,
        })
        return new Response(html, {
          headers: {
            ...publicHeaders,
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': receiptCsp,
            'content-length': String(
              Buffer.byteLength(html, 'utf8'),
            ),
          },
        })
      }

      if (!normalizedRoute?.success) {
        return plainPublicResponse('Không tìm thấy', 404)
      }
      const canonicalRoute = normalizedRoute.slug
      const bindings = Object.fromEntries(
        view.bindings
          .filter(binding => (
            binding.status === 'active'
            && binding.pageRoute === canonicalRoute
          ))
          .map(binding => [binding.formNodeId, {
            action: `${expectedOrigin}/s/${parsedSlug.data}`,
            requestId: deps.createRequestId(),
            pageRoute: binding.pageRoute,
          }]),
      )
      const compiled = compileStandaloneHtml(view.document, {
        title: 'Trang được chia sẻ từ ZenUI',
        robots: SHARE_ROBOTS_POLICY,
        imagePolicy,
        assetOrigin: deps.assetOrigin,
        route: canonicalRoute,
        routePrefix: `/s/${parsedSlug.data}`,
        ...(Object.keys(bindings).length > 0
          ? {
              liveLeadForms: {
                origin: expectedOrigin,
                bindings,
              },
            }
          : {}),
      })
      if (!compiled.success) {
        return compiled.code === 'route_not_found'
          ? plainPublicResponse('Không tìm thấy', 404)
          : plainPublicResponse('Không thể hiển thị trang', 500)
      }
      return new Response(compiled.html, {
        headers: {
          ...publicHeaders,
          ...(Object.keys(bindings).length > 0
            ? { 'referrer-policy': 'same-origin' }
            : {}),
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

  const POST = async (
    request: Request,
    route: PublicShareRoute,
  ): Promise<Response> => {
    const expectedOrigin = exactPublicOrigin(
      request,
      deps.shareOrigin,
    )
    if (!expectedOrigin) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const origin = request.headers.get('origin')
    if (origin !== expectedOrigin) {
      return plainPublicResponse('Yêu cầu không được phép', 403)
    }
    const rawContentType = request.headers.get('content-type')
    const contentType = rawContentType
      ? (rawContentType.split(';', 1)[0] ?? '')
        .trim()
        .toLowerCase()
      : ''
    if (contentType !== 'application/x-www-form-urlencoded') {
      return plainPublicResponse('Loại nội dung không được hỗ trợ', 415)
    }
    const params = await route.params
    const parsedSlug = shareSlugSchema.safeParse(params.slug)
    if (!parsedSlug.success || (params.path?.length ?? 0) > 0) {
      return plainPublicResponse('Không tìm thấy', 404)
    }

    let body: string | null
    try {
      body = await boundedFormBody(request)
    } catch {
      return plainPublicResponse('Yêu cầu không hợp lệ', 422)
    }
    if (body === null) {
      return plainPublicResponse('Yêu cầu quá lớn', 413)
    }
    const submission = submissionFromBody(body)
    if (!submission) {
      return plainPublicResponse('Yêu cầu không hợp lệ', 422)
    }

    const binding = await deps.leads.resolvePublicBinding(
      parsedSlug.data,
      submission.pageRoute,
      submission.formNodeId,
    )
    if (!binding) return plainPublicResponse('Không tìm thấy', 404)
    const validation = validateLeadSubmission(
      submission,
      binding.form,
    )
    if (!validation.success) {
      return plainPublicResponse('Thông tin không hợp lệ', 422)
    }

    const fingerprint = clientFingerprint(request)
    const reservation = {
      publicationId: binding.bindingId,
      fingerprint,
      reservationId: submission.requestId,
    }
    const admission = await deps.leadAdmission.acquire(reservation)
    if (!admission.accepted) {
      return plainPublicResponse(
        'Quá nhiều yêu cầu',
        429,
        admission.retryAfterSeconds,
      )
    }

    const leadId = deps.createLeadId()
    const encryptionContext: LeadEncryptionContext = {
      workspaceId: binding.workspaceId,
      projectId: binding.projectId,
      shareLinkId: binding.shareLinkId,
      revisionId: binding.revisionId,
      formNodeId: binding.formNodeId,
      leadId,
    }
    try {
      const envelope = deps.leadKeyring.encrypt(
        validation.data,
        encryptionContext,
      )
      await deps.leads.appendEncrypted({
        bindingId: binding.bindingId,
        leadId,
        requestId: submission.requestId,
        envelope,
        receivedAt: deps.now(),
      })
    } catch {
      try {
        await deps.leadAdmission.release(reservation)
      } catch {
        // Persistence failure remains authoritative; release is best-effort.
      }
      return plainPublicResponse(
        'Không thể gửi thông tin lúc này',
        503,
      )
    }

    return new Response(null, {
      status: 303,
      headers: {
        ...publicHeaders,
        location: `/s/${parsedSlug.data}/__zenui/receipt`,
      },
    })
  }

  return Object.assign(GET, { GET, POST })
}
