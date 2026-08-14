import {
  LEAD_LIMITS,
  validateLeadSubmission,
  type LeadFormProps,
  type LeadPayload,
} from '@zenui/lead-core'
import { SHARE_ROBOTS_POLICY } from '@zenui/share-core'

import type {
  EncryptedLeadPayload,
  LeadEncryptionContext,
} from '@zenui/lead-core/server'

interface DeploymentLeadBinding {
  bindingId: string
  workspaceId: string
  projectId: string
  deploymentId: string
  revisionId: string
  deploymentOrigin: string
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

export interface PublicDeploymentLeadDependencies {
  shareOrigin: string
  createRequestId(): string
  createLeadId(): string
  now(): Date
  leadAdmission: LeadAdmission
  leadKeyring: LeadKeyring
  leads: {
    resolveDeploymentBinding(
      publicBindingId: string,
      pageRoute: string,
      formNodeId: string,
    ): Promise<DeploymentLeadBinding | null>
    resolveDeploymentReceipt(
      publicBindingId: string,
    ): Promise<DeploymentLeadBinding | null>
    appendEncrypted(input: {
      bindingId: string
      leadId: string
      requestId: string
      envelope: EncryptedLeadPayload
      receivedAt: Date
    }): Promise<unknown>
  }
}

type PublicDeploymentLeadRoute = {
  params: Promise<{
    publicBindingId: string
    path?: string[]
  }>
}

const publicHeaders = {
  'x-robots-tag': SHARE_ROBOTS_POLICY,
  'cache-control': 'no-store, max-age=0',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
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

function plainPublicResponse(
  body: string,
  status: number,
  retryAfterSeconds?: number,
): Response {
  return new Response(body, {
    status,
    headers: {
      ...publicHeaders,
      'content-type': 'text/plain; charset=utf-8',
      ...(retryAfterSeconds
        ? { 'retry-after': String(retryAfterSeconds) }
        : {}),
    },
  })
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

function clientFingerprint(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown'
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

function deploymentSubmissionFromBody(body: string): {
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
  if (values.has('__zenui_request_id')) return null
  const formNodeId = values.get('__zenui_form_node_id')
  const pageRoute = values.get('__zenui_page_route')
  if (!formNodeId || !pageRoute) return null

  const fields: Record<string, string> = {}
  for (const [key, value] of values) {
    if (key.startsWith('__zenui_') || key === 'consent') continue
    fields[key] = value
  }
  return {
    formNodeId,
    pageRoute,
    fields,
    ...(values.has('consent') ? { consent: true } : {}),
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!)
}

function deploymentReceiptHtml(
  successCopy: string,
  returnUrl: string,
): string {
  const safeCopy = escapeHtml(successCopy)
  const safeReturnUrl = escapeHtml(returnUrl)
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${receiptCsp}"><title>Đã nhận thông tin</title></head><body><main><h1>Đã nhận thông tin</h1><p>${safeCopy}</p><a href="${safeReturnUrl}">Quay lại website</a></main></body></html>`
}

function deploymentReturnUrl(binding: DeploymentLeadBinding): string | null {
  try {
    const origin = new URL(binding.deploymentOrigin)
    if (
      origin.protocol !== 'https:'
      || !origin.hostname.toLowerCase().endsWith('.vercel.app')
      || origin.origin !== binding.deploymentOrigin
      || !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/.test(binding.pageRoute)
    ) return null
    return new URL(binding.pageRoute, `${origin.origin}/`).toString()
  } catch {
    return null
  }
}

export function createPublicDeploymentLeadHandler(
  deps: PublicDeploymentLeadDependencies,
) {
  const GET = async (
    request: Request,
    route: PublicDeploymentLeadRoute,
  ): Promise<Response> => {
    if (!exactPublicOrigin(request, deps.shareOrigin)) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const params = await route.params
    if (
      !/^[A-Za-z0-9_-]{32}$/.test(params.publicBindingId)
      || params.path?.join('/') !== '__zenui/receipt'
    ) return plainPublicResponse('Không tìm thấy', 404)
    const binding = await deps.leads.resolveDeploymentReceipt(
      params.publicBindingId,
    )
    const returnUrl = binding ? deploymentReturnUrl(binding) : null
    if (!binding || !returnUrl) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const html = deploymentReceiptHtml(
      'Thông tin của bạn đã được gửi thành công.',
      returnUrl,
    )
    return new Response(html, {
      headers: {
        ...publicHeaders,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': receiptCsp,
        'content-length': String(Buffer.byteLength(html, 'utf8')),
      },
    })
  }

  const POST = async (
    request: Request,
    route: PublicDeploymentLeadRoute,
  ): Promise<Response> => {
    if (!exactPublicOrigin(request, deps.shareOrigin)) {
      return plainPublicResponse('Không tìm thấy', 404)
    }
    const params = await route.params
    if (
      !/^[A-Za-z0-9_-]{32}$/.test(params.publicBindingId)
      || (params.path?.length ?? 0) > 0
    ) return plainPublicResponse('Không tìm thấy', 404)
    const rawContentType = request.headers.get('content-type')
    const contentType = rawContentType
      ? (rawContentType.split(';', 1)[0] ?? '').trim().toLowerCase()
      : ''
    if (contentType !== 'application/x-www-form-urlencoded') {
      return plainPublicResponse('Loại nội dung không được hỗ trợ', 415)
    }

    let body: string | null
    try {
      body = await boundedFormBody(request)
    } catch {
      return plainPublicResponse('Yêu cầu không hợp lệ', 422)
    }
    if (body === null) return plainPublicResponse('Yêu cầu quá lớn', 413)
    const submission = deploymentSubmissionFromBody(body)
    if (!submission) return plainPublicResponse('Yêu cầu không hợp lệ', 422)

    const binding = await deps.leads.resolveDeploymentBinding(
      params.publicBindingId,
      submission.pageRoute,
      submission.formNodeId,
    )
    if (!binding) return plainPublicResponse('Không tìm thấy', 404)
    if (request.headers.get('origin') !== binding.deploymentOrigin) {
      return plainPublicResponse('Yêu cầu không được phép', 403)
    }
    const requestId = deps.createRequestId()
    const validation = validateLeadSubmission({
      ...submission,
      requestId,
    }, binding.form)
    if (!validation.success) {
      return plainPublicResponse('Thông tin không hợp lệ', 422)
    }

    const fingerprint = clientFingerprint(request)
    const reservation = {
      publicationId: binding.bindingId,
      fingerprint,
      reservationId: requestId,
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
      publication: 'deployment',
      workspaceId: binding.workspaceId,
      projectId: binding.projectId,
      deploymentId: binding.deploymentId,
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
        requestId,
        envelope,
        receivedAt: deps.now(),
      })
    } catch {
      try {
        await deps.leadAdmission.release(reservation)
      } catch {
        // Persistence failure remains authoritative; release is best-effort.
      }
      return plainPublicResponse('Không thể gửi thông tin lúc này', 503)
    }

    return new Response(null, {
      status: 303,
      headers: {
        ...publicHeaders,
        location: `/d/${params.publicBindingId}/__zenui/receipt`,
      },
    })
  }

  return { GET, POST }
}
