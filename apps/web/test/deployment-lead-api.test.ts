import { describe, expect, it, vi } from 'vitest'

import { createPublicDeploymentLeadHandler } from '../lib/server/public-lead-api'

const publicBindingId = 'A'.repeat(32)
const bindingId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '33333333-3333-4333-8333-333333333333'
const deploymentId = '44444444-4444-4444-8444-444444444444'
const revisionId = '55555555-5555-4555-8555-555555555555'
const requestId = '66666666-6666-4666-8666-666666666666'
const leadId = '77777777-7777-4777-8777-777777777777'
const now = new Date('2026-08-14T02:00:00.000Z')

function binding() {
  return {
    bindingId,
    workspaceId,
    projectId,
    deploymentId,
    revisionId,
    deploymentOrigin: 'https://zenui-live.vercel.app',
    formNodeId: 'lead-form-1',
    pageRoute: '/',
    form: {
      title: 'Nhận tư vấn',
      description: 'Để lại email để được liên hệ.',
      submitLabel: 'Gửi thông tin',
      successCopy: 'Cảm ơn bạn. Chúng tôi sẽ liên hệ lại.',
      fields: [{
        key: 'email',
        type: 'email' as const,
        label: 'Email',
        required: true,
      }],
    },
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const leads = {
    resolveDeploymentBinding: vi.fn().mockResolvedValue(binding()),
    resolveDeploymentReceipt: vi.fn().mockResolvedValue(binding()),
    appendEncrypted: vi.fn().mockResolvedValue({ created: true }),
  }
  const leadAdmission = {
    acquire: vi.fn().mockResolvedValue({ accepted: true as const }),
    release: vi.fn().mockResolvedValue(undefined),
  }
  const leadKeyring = {
    activeKeyVersion: 1,
    encrypt: vi.fn().mockReturnValue({
      ciphertext: 'encrypted',
      iv: 'initialization-vector',
      authTag: 'authentication-tag',
      keyVersion: 1,
    }),
  }
  return {
    shareOrigin: 'http://127.0.0.1:3000',
    createRequestId: () => requestId,
    createLeadId: () => leadId,
    now: () => now,
    leads,
    leadAdmission,
    leadKeyring,
    ...overrides,
  }
}

function submissionRequest(input: {
  host?: string
  origin?: string
  body?: string | URLSearchParams
  contentType?: string
} = {}) {
  const body = input.body ?? new URLSearchParams({
    __zenui_form_node_id: 'lead-form-1',
    __zenui_page_route: '/',
    email: 'visitor@example.test',
  })
  return new Request(`http://127.0.0.1:3000/d/${publicBindingId}`, {
    method: 'POST',
    headers: {
      host: input.host ?? '127.0.0.1:3000',
      origin: input.origin ?? 'https://zenui-live.vercel.app',
      'content-type': input.contentType ?? 'application/x-www-form-urlencoded',
      'x-forwarded-for': '203.0.113.10',
    },
    body,
  })
}

const route = {
  params: Promise.resolve({ publicBindingId }),
}

describe('public Deployment Lead route', () => {
  it('creates the request ID server-side and commits encrypted data before redirecting', async () => {
    const deps = dependencies()
    const response = await createPublicDeploymentLeadHandler(deps).POST(
      submissionRequest(),
      route,
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `/d/${publicBindingId}/__zenui/receipt`,
    )
    expect(deps.leads.resolveDeploymentBinding).toHaveBeenCalledWith(
      publicBindingId,
      '/',
      'lead-form-1',
    )
    expect(deps.leadAdmission.acquire).toHaveBeenCalledWith({
      publicationId: bindingId,
      fingerprint: '203.0.113.10',
      reservationId: requestId,
    })
    expect(deps.leadKeyring.encrypt).toHaveBeenCalledWith(
      {
        formTitle: 'Nhận tư vấn',
        fields: [{
          key: 'email',
          type: 'email',
          label: 'Email',
          value: 'visitor@example.test',
        }],
      },
      {
        publication: 'deployment',
        workspaceId,
        projectId,
        deploymentId,
        revisionId,
        formNodeId: 'lead-form-1',
        leadId,
      },
    )
    expect(deps.leads.appendEncrypted).toHaveBeenCalledWith({
      bindingId,
      leadId,
      requestId,
      envelope: {
        ciphertext: 'encrypted',
        iv: 'initialization-vector',
        authTag: 'authentication-tag',
        keyVersion: 1,
      },
      receivedAt: now,
    })
    expect(deps.leadAdmission.release).not.toHaveBeenCalled()
  })

  it('requires the exact intake host and canonical ready Deployment Origin', async () => {
    const deps = dependencies()
    const handler = createPublicDeploymentLeadHandler(deps)

    expect((await handler.POST(submissionRequest({ host: 'localhost:3000' }), route)).status).toBe(404)
    expect((await handler.POST(submissionRequest({ origin: 'https://forged.vercel.app' }), route)).status).toBe(403)
    expect(deps.leadKeyring.encrypt).not.toHaveBeenCalled()
  })

  it('rejects forged locators, duplicate fields, wrong form metadata, and unsupported bodies', async () => {
    const deps = dependencies()
    const handler = createPublicDeploymentLeadHandler(deps)
    const duplicate = '__zenui_form_node_id=lead-form-1&__zenui_page_route=%2F&email=one%40example.test&email=two%40example.test'

    expect((await handler.POST(submissionRequest({ body: duplicate }), route)).status).toBe(422)
    expect((await handler.POST(submissionRequest({ contentType: 'application/json' }), route)).status).toBe(415)
    expect((await handler.POST(submissionRequest(), {
      params: Promise.resolve({ publicBindingId: 'not-safe' }),
    })).status).toBe(404)

    deps.leads.resolveDeploymentBinding.mockResolvedValueOnce(null)
    expect((await handler.POST(submissionRequest({ body: new URLSearchParams({
      __zenui_form_node_id: 'wrong-form',
      __zenui_page_route: '/',
      email: 'visitor@example.test',
    }) }), route)).status).toBe(404)
    expect(deps.leadKeyring.encrypt).not.toHaveBeenCalled()
  })

  it('releases admission when durable append fails and returns no success receipt', async () => {
    const deps = dependencies({
      leads: {
        resolveDeploymentBinding: vi.fn().mockResolvedValue(binding()),
        appendEncrypted: vi.fn().mockRejectedValue(new Error('database unavailable')),
      },
    })
    const response = await createPublicDeploymentLeadHandler(deps).POST(
      submissionRequest(),
      route,
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    expect(deps.leadAdmission.release).toHaveBeenCalledWith({
      publicationId: bindingId,
      fingerprint: '203.0.113.10',
      reservationId: requestId,
    })
  })

  it('enforces body bounds, validation, and admission before persistence', async () => {
    const deps = dependencies()
    const handler = createPublicDeploymentLeadHandler(deps)

    expect((await handler.POST(submissionRequest({
      body: '__zenui_form_node_id=lead-form-1&__zenui_page_route=%2F&email=invalid',
    }), route)).status).toBe(422)
    expect((await handler.POST(new Request(
      `http://127.0.0.1:3000/d/${publicBindingId}`,
      {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3000',
          origin: 'https://zenui-live.vercel.app',
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': '999999',
        },
        body: 'email=visitor@example.test',
      },
    ), route)).status).toBe(413)

    deps.leadAdmission.acquire.mockResolvedValueOnce({
      accepted: false,
      retryAfterSeconds: 30,
    })
    const limited = await handler.POST(submissionRequest(), route)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('30')
    expect(deps.leads.appendEncrypted).not.toHaveBeenCalled()
  })

  it('renders a no-PII receipt linking to the immutable Deployment route', async () => {
    const deps = dependencies()
    const handler = createPublicDeploymentLeadHandler(deps)
    const request = new Request(
      `http://127.0.0.1:3000/d/${publicBindingId}/__zenui/receipt`,
      { headers: { host: '127.0.0.1:3000' } },
    )
    const response = await handler.GET(request, {
      params: Promise.resolve({
        publicBindingId,
        path: ['__zenui', 'receipt'],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("script-src 'none'")
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    const html = await response.text()
    expect(html).toContain('href="https://zenui-live.vercel.app/"')
    expect(html).not.toContain('visitor@example.test')
    expect(html).not.toContain(bindingId)

    expect((await handler.GET(request, {
      params: Promise.resolve({
        publicBindingId: 'not-safe',
        path: ['__zenui', 'receipt'],
      }),
    })).status).toBe(404)
    deps.leads.resolveDeploymentReceipt.mockResolvedValueOnce(null)
    expect((await handler.GET(request, {
      params: Promise.resolve({
        publicBindingId,
        path: ['__zenui', 'receipt'],
      }),
    })).status).toBe(404)
  })
})
