import { createValidDesignFixture, migrateDesignDocumentV1ToV2 } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import {
  createPublicShareHandler,
  createRandomShareSlug,
  createShareHandlers,
  validateShareOrigin,
} from '../lib/server/share-api'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const shareLinkId = '55555555-5555-4555-8555-555555555555'
const requestId = '66666666-6666-4666-8666-666666666666'
const bindingId = '77777777-7777-4777-8777-777777777777'
const leadId = '88888888-8888-4888-8888-888888888888'
const slug = 'A'.repeat(32)
const now = new Date('2026-07-22T12:00:00.000Z')

function withLeadForm() {
  const document = createValidDesignFixture()
  document.nodes['lead-form-1'] = {
    id: 'lead-form-1',
    type: 'lead-form',
    parentId: 'container-1',
    children: [],
    props: {
      title: 'Nhận tư vấn',
      description: 'Để lại email để được liên hệ.',
      submitLabel: 'Gửi thông tin',
      successCopy: 'Cảm ơn bạn. Chúng tôi sẽ liên hệ lại.',
      fields: [
        {
          key: 'email',
          type: 'email',
          label: 'Email',
          required: true,
        },
      ],
    },
    style: {},
    responsive: {},
  }
  document.nodes['container-1']!.children.push('lead-form-1')
  return document
}

function record(status: 'active' | 'disabled' | 'expired' = 'active') {
  return {
    id: shareLinkId, projectId, revisionId, slug, status,
    storedStatus: status === 'disabled' ? 'disabled' as const : 'active' as const,
    expiresAt: null, createdAt: now, updatedAt: now,
  }
}

function managementDependencies(overrides: Record<string, unknown> = {}) {
  const links = {
    create: vi.fn().mockResolvedValue({ created: true, link: record() }),
    list: vi.fn().mockResolvedValue([record()]),
    findById: vi.fn().mockResolvedValue(record()),
    disable: vi.fn().mockResolvedValue(record('disabled')),
  }
  const leads = {
    provisionBindings: vi.fn().mockResolvedValue({ bindings: [] }),
    listBindings: vi.fn().mockResolvedValue([]),
  }
  return {
    trustedOrigin: 'http://localhost:3000',
    shareOrigin: 'http://127.0.0.1:3000',
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' as const }),
    findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Page', status: 'active' as const, version: 1, document: createValidDesignFixture() }),
    admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
    createSlug: vi.fn(() => slug),
    links,
    leads,
    ...overrides,
  }
}

function createRequest(origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000/api/v1/projects/${projectId}/share-links`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId, revisionId, requestId }),
  })
}

describe('share management API', () => {
  it('enforces Origin before side effects and creates an owner-managed link', async () => {
    const deps = managementDependencies()
    const handlers = createShareHandlers(deps)
    const route = { params: Promise.resolve({ projectId }) }
    expect((await handlers.POST(createRequest('https://evil.test'), route)).status).toBe(403)
    expect(deps.links.create).not.toHaveBeenCalled()

    const response = await handlers.POST(createRequest(), route)
    expect(response.status).toBe(201)
    expect(response.headers.get('location')).toContain(shareLinkId)
    await expect(response.json()).resolves.toEqual({ data: expect.objectContaining({
      id: shareLinkId, revisionId, url: `http://127.0.0.1:3000/s/${slug}`, status: 'active',
    }) })
  })

  it('provisions immutable Lead Form bindings before exposing the managed Share', async () => {
    const deps = managementDependencies({
      leads: {
        listBindings: vi.fn().mockResolvedValue([]),
        provisionBindings: vi.fn().mockResolvedValue({
          bindings: [{
            id: bindingId,
            shareLinkId,
            revisionId,
            formNodeId: 'lead-form-1',
            pageRoute: '/',
            formTitle: 'Nhận tư vấn',
            status: 'active' as const,
          }],
        }),
      },
    })
    const response = await createShareHandlers(deps).POST(
      createRequest(),
      { params: Promise.resolve({ projectId }) },
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      data: { leadFormsLive: true },
    })
    expect(deps.leads.provisionBindings).toHaveBeenCalledWith(
      { userId, workspaceId },
      projectId,
      shareLinkId,
    )

    const failed = await createShareHandlers(managementDependencies({
      leads: {
        provisionBindings: vi.fn().mockRejectedValue(
          new Error('binding_unavailable'),
        ),
        listBindings: vi.fn().mockResolvedValue([]),
      },
    })).POST(createRequest(), { params: Promise.resolve({ projectId }) })
    expect(failed.status).toBe(503)
    await expect(failed.json()).resolves.toMatchObject({
      error: { code: 'share_form_unavailable' },
    })
  })

  it('lists and disables links without exposing tenant or project metadata', async () => {
    const handlers = createShareHandlers(managementDependencies())
    const listed = await handlers.GET(new Request(`http://localhost/api?workspaceId=${workspaceId}`), { params: Promise.resolve({ projectId }) })
    expect(listed.status).toBe(200)
    const body = await listed.json()
    expect(body).not.toHaveProperty('data.0.workspaceId')
    expect(body).not.toHaveProperty('data.0.projectId')
    expect(body).not.toHaveProperty('data.0.slug')

    const disabled = await handlers.DELETE(new Request('http://localhost/api', {
      method: 'DELETE', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ projectId, shareLinkId }) })
    expect(disabled.status).toBe(200)
    await expect(disabled.json()).resolves.toMatchObject({ data: { status: 'disabled' } })
  })

  it('validates isolated share origins and generated slug shape', () => {
    expect(createRandomShareSlug()).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(validateShareOrigin('http://127.0.0.1:3000', 'http://localhost:3000')).toBe('http://127.0.0.1:3000')
    expect(() => validateShareOrigin('http://localhost:3001', 'http://localhost:3000')).toThrow('must be isolated')
    expect(() => validateShareOrigin('not-a-url', 'http://localhost:3000')).toThrow('SHARE_ORIGIN is invalid')
    expect(() => validateShareOrigin('ftp://127.0.0.1', 'http://localhost:3000')).toThrow('SHARE_ORIGIN is invalid')
  })

  it('returns safe auth, role, validation and rate-limit errors', async () => {
    expect((await createShareHandlers(managementDependencies({ getSession: () => Promise.resolve(null) })).POST(createRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(401)
    expect((await createShareHandlers(managementDependencies({ findMembership: () => Promise.resolve({ userId, workspaceId, role: 'editor' }) })).POST(createRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(403)
    const limited = await createShareHandlers(managementDependencies({ admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 23 }) } })).POST(createRequest(), { params: Promise.resolve({ projectId }) })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('23')
    const malformed = new Request('http://localhost/api', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: '{}' })
    expect((await createShareHandlers(managementDependencies()).POST(malformed, { params: Promise.resolve({ projectId }) })).status).toBe(422)
  })

  it('retries bounded slug collisions without accepting client slugs', async () => {
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('share_slug_conflict'))
      .mockResolvedValueOnce({ created: true, link: { ...record(), slug: 'B'.repeat(32) } })
    const createSlug = vi.fn().mockReturnValueOnce(slug).mockReturnValueOnce('B'.repeat(32))
    const handlers = createShareHandlers(managementDependencies({ links: { ...managementDependencies().links, create }, createSlug }))
    const response = await handlers.POST(createRequest(), { params: Promise.resolve({ projectId }) })
    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('fails safely after bounded collisions and missing resources', async () => {
    const create = vi.fn().mockRejectedValue(new Error('share_slug_conflict'))
    const collision = createShareHandlers(managementDependencies({ links: { ...managementDependencies().links, create } }))
    expect((await collision.POST(createRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(503)
    expect(create).toHaveBeenCalledTimes(3)

    const missingProject = createShareHandlers(managementDependencies({ findProject: () => Promise.resolve(null) }))
    expect((await missingProject.GET(new Request(`http://localhost/api?workspaceId=${workspaceId}`), { params: Promise.resolve({ projectId }) })).status).toBe(404)
    const missingDisable = createShareHandlers(managementDependencies({ links: { ...managementDependencies().links, disable: () => Promise.resolve(null) } }))
    expect((await missingDisable.DELETE(new Request('http://localhost/api', {
      method: 'DELETE', headers: { origin: 'http://localhost:3000' }, body: JSON.stringify({ workspaceId }),
    }), { params: Promise.resolve({ projectId, shareLinkId }) })).status).toBe(404)
  })
})

describe('public share route', () => {
  function publicView(
    document = createValidDesignFixture(),
    bindings: Array<{
      id: string
      shareLinkId: string
      revisionId: string
      formNodeId: string
      pageRoute: string
      formTitle: string
      status: 'active' | 'disabled'
    }> = [],
  ) {
    return {
      workspaceId,
      projectId,
      shareLinkId,
      revisionId,
      document,
      bindings,
    }
  }

  function liveBinding() {
    return {
      bindingId,
      workspaceId,
      projectId,
      shareLinkId,
      revisionId,
      formNodeId: 'lead-form-1',
      pageRoute: '/',
      form: withLeadForm().nodes['lead-form-1']!.props,
    }
  }

  function dependencies(overrides: Record<string, unknown> = {}) {
    const leads = {
      resolvePublicBinding: vi.fn().mockResolvedValue(liveBinding()),
      appendEncrypted: vi.fn().mockResolvedValue({
        created: true,
        lead: {
          id: leadId,
          status: 'new' as const,
          version: 1,
          formTitle: 'Nhận tư vấn',
          receivedAt: now,
          expiresAt: new Date('2026-10-20T12:00:00.000Z'),
          contactedAt: null,
        },
      }),
    }
    const leadAdmission = {
      acquire: vi.fn().mockResolvedValue({ accepted: true as const }),
      release: vi.fn().mockResolvedValue(undefined),
    }
    const leadKeyring = {
      encrypt: vi.fn().mockReturnValue({
        ciphertext: 'encrypted',
        iv: 'initialization-vector',
        authTag: 'authentication-tag',
        keyVersion: 1,
      }),
      decrypt: vi.fn(),
      activeKeyVersion: 1,
    }
    return {
      shareOrigin: 'http://127.0.0.1:3000',
      assetOrigin: 'https://assets.example.com',
      remoteImageHostAllowlist: 'images.example.com',
      createRequestId: () => requestId,
      createLeadId: () => leadId,
      now: () => now,
      admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
      leadAdmission,
      leadKeyring,
      leads,
      links: { findPublicBySlug: vi.fn().mockResolvedValue(publicView()) },
      ...overrides,
    }
  }

  function submissionRequest(input: {
    origin?: string
    body?: URLSearchParams
    contentType?: string
  } = {}) {
    const body = input.body ?? new URLSearchParams({
      __zenui_request_id: requestId,
      __zenui_form_node_id: 'lead-form-1',
      __zenui_page_route: '/',
      email: 'visitor@example.test',
    })
    return new Request(`http://127.0.0.1:3000/s/${slug}`, {
      method: 'POST',
      headers: {
        origin: input.origin ?? 'http://127.0.0.1:3000',
        'content-type': input.contentType
          ?? 'application/x-www-form-urlencoded',
        'x-forwarded-for': '203.0.113.10',
      },
      body,
    })
  }

  it('renders safe immutable HTML only on the share host', async () => {
    const handler = createPublicShareHandler(dependencies())
    expect((await handler(new Request(`http://localhost:3000/s/${slug}`), { params: Promise.resolve({ slug }) })).status).toBe(404)
    const response = await handler(new Request(`http://127.0.0.1:3000/s/${slug}`, { headers: { cookie: 'zenui-e2e-session=secret' } }), { params: Promise.resolve({ slug }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("script-src 'none'")
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('set-cookie')).toBeNull()
    const html = await response.text()
    expect(html).toContain('Build your next product')
    expect(html).not.toContain(projectId)
    expect(html).not.toMatch(/<script|\son\w+=/i)
  })

  it('activates only provisioned immutable Lead Forms on managed Share', async () => {
    const document = withLeadForm()
    const live = await createPublicShareHandler(dependencies({
      links: {
        findPublicBySlug: () => Promise.resolve(publicView(
          document,
          [{
            id: bindingId,
            shareLinkId,
            revisionId,
            formNodeId: 'lead-form-1',
            pageRoute: '/',
            formTitle: 'Nhận tư vấn',
            status: 'active',
          }],
        )),
      },
    }))(
      new Request(`http://127.0.0.1:3000/s/${slug}`),
      { params: Promise.resolve({ slug }) },
    )

    expect(live.status).toBe(200)
    expect(live.headers.get('referrer-policy')).toBe('same-origin')
    expect(live.headers.get('content-security-policy')).toContain(
      'form-action http://127.0.0.1:3000',
    )
    const liveHtml = await live.text()
    expect(liveHtml).toContain(
      `action="http://127.0.0.1:3000/s/${slug}" method="post"`,
    )
    expect(liveHtml).toContain(
      `name="__zenui_request_id" type="hidden" value="${requestId}"`,
    )
    expect(liveHtml).not.toContain(projectId)
    expect(liveHtml).not.toContain(workspaceId)
    expect(liveHtml).not.toContain(bindingId)

    const visualOnly = await createPublicShareHandler(dependencies({
      links: {
        findPublicBySlug: () => Promise.resolve(publicView(document)),
      },
    }))(
      new Request(`http://127.0.0.1:3000/s/${slug}`),
      { params: Promise.resolve({ slug }) },
    )
    expect(visualOnly.status).toBe(200)
    expect(await visualOnly.text()).not.toMatch(
      /<form[^>]+(?:action|method)=/i,
    )
  })

  it('commits an encrypted validated submission before returning a safe receipt redirect', async () => {
    const deps = dependencies()
    const handlers = createPublicShareHandler(deps)
    const response = await handlers.POST(
      submissionRequest(),
      { params: Promise.resolve({ slug }) },
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      `/s/${slug}/__zenui/receipt`,
    )
    expect(response.headers.get('cache-control')).toBe(
      'no-store, max-age=0',
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
        workspaceId,
        projectId,
        shareLinkId,
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
    expect(await response.text()).toBe('')
  })

  it('releases admission when persistence fails and never returns a receipt early', async () => {
    const appendEncrypted = vi.fn().mockRejectedValue(
      new Error('database unavailable'),
    )
    const deps = dependencies({
      leads: {
        resolvePublicBinding: vi.fn().mockResolvedValue(liveBinding()),
        appendEncrypted,
      },
    })
    const response = await createPublicShareHandler(deps).POST(
      submissionRequest(),
      { params: Promise.resolve({ slug }) },
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    expect(deps.leadAdmission.release).toHaveBeenCalledWith({
      publicationId: bindingId,
      fingerprint: '203.0.113.10',
      reservationId: requestId,
    })
    const body = await response.text()
    expect(body).not.toContain('visitor@example.test')
    expect(body).not.toContain('database unavailable')
  })

  it('rejects wrong origin, content type and immutable field mismatch before persistence', async () => {
    const deps = dependencies()
    const handlers = createPublicShareHandler(deps)
    const route = { params: Promise.resolve({ slug }) }

    const wrongOrigin = await handlers.POST(
      submissionRequest({ origin: 'https://evil.example.test' }),
      route,
    )
    const wrongContentType = await handlers.POST(
      submissionRequest({ contentType: 'text/plain' }),
      route,
    )
    const mismatched = await handlers.POST(
      submissionRequest({
        body: new URLSearchParams({
          __zenui_request_id: requestId,
          __zenui_form_node_id: 'lead-form-1',
          __zenui_page_route: '/',
          unexpected: 'do-not-store',
        }),
      }),
      route,
    )

    expect(wrongOrigin.status).toBe(403)
    expect(wrongContentType.status).toBe(415)
    expect(mismatched.status).toBe(422)
    expect(deps.leadKeyring.encrypt).not.toHaveBeenCalled()
    expect(deps.leads.appendEncrypted).not.toHaveBeenCalled()
  })

  it('serves a no-script receipt without echoing visitor PII', async () => {
    const response = await createPublicShareHandler(dependencies()).GET(
      new Request(
        `http://127.0.0.1:3000/s/${slug}/__zenui/receipt`,
      ),
      {
        params: Promise.resolve({
          slug,
          path: ['__zenui', 'receipt'],
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain(
      "script-src 'none'",
    )
    const html = await response.text()
    expect(html).toContain('Đã nhận thông tin')
    expect(html).not.toContain('visitor@example.test')
    expect(html).not.toMatch(/<script|\son\w+=/i)
  })

  it('serves validated immutable deep routes and prefixes internal links', async () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    document.nodes['about-root'] = { id: 'about-root', type: 'page', parentId: null, children: ['about-section'], props: {}, style: {}, responsive: {} }
    document.nodes['about-section'] = { id: 'about-section', type: 'section', parentId: 'about-root', children: ['about-heading'], props: { label: 'About' }, style: {}, responsive: {} }
    document.nodes['about-heading'] = { id: 'about-heading', type: 'heading', parentId: 'about-section', children: [], props: { text: 'About ZenUI', level: 1 }, style: {}, responsive: {} }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    document.nodes['button-1']!.props = { text: 'About', pageId: 'about' }
    const handler = createPublicShareHandler(dependencies({ links: { findPublicBySlug: () => Promise.resolve(publicView(document)) } }))

    const home = await handler(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug, path: [] }) })
    const about = await handler(new Request(`http://127.0.0.1:3000/s/${slug}/about`), { params: Promise.resolve({ slug, path: ['about'] }) })
    const traversal = await handler(new Request(`http://127.0.0.1:3000/s/${slug}/%2e%2e/api`), { params: Promise.resolve({ slug, path: ['..', 'api'] }) })

    expect(home.status).toBe(200)
    expect(await home.text()).toContain(`href="/s/${slug}/about"`)
    expect(about.status).toBe(200)
    expect(await about.text()).toContain('About ZenUI')
    expect(traversal.status).toBe(404)
  })

  it('resolves immutable owned assets through the isolated asset origin', async () => {
    const document = createValidDesignFixture()
    document.nodes['image-1']!.props = {
      assetId: '77777777-7777-4777-8777-777777777777', alt: 'Product dashboard', decorative: false,
    }
    const response = await createPublicShareHandler(dependencies({
      links: { findPublicBySlug: () => Promise.resolve(publicView(document)) },
    }))(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain('img-src https://assets.example.com')
    expect(await response.text()).toContain('src="https://assets.example.com/a/77777777-7777-4777-8777-777777777777"')
  })

  it('returns generic noindex responses for malformed, missing, disabled and limited views', async () => {
    const missing = createPublicShareHandler(dependencies({ links: { findPublicBySlug: () => Promise.resolve(null) } }))
    const missingResponse = await missing(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(missingResponse.status).toBe(404)
    expect(await missingResponse.text()).toBe('Không tìm thấy')
    expect(missingResponse.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')

    const limited = createPublicShareHandler(dependencies({ admission: { acquire: () => Promise.resolve({ accepted: false, retryAfterSeconds: 10 }) } }))
    const limitedResponse = await limited(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(limitedResponse.status).toBe(429)
    expect(await limitedResponse.text()).toBe('Quá nhiều yêu cầu')

    const malformed = await createPublicShareHandler(dependencies())(
      new Request('http://127.0.0.1:3000/s/invalid'),
      { params: Promise.resolve({ slug: 'invalid' }) },
    )
    expect(malformed.status).toBe(404)
  })

  it('fails closed for denied image hosts, invalid documents and dependency errors', async () => {
    const denied = createValidDesignFixture()
    denied.nodes['image-1']!.props = { src: 'https://evil.example.test/hero.png', alt: 'Denied' }
    const deniedResponse = await createPublicShareHandler(dependencies({
      links: { findPublicBySlug: () => Promise.resolve(publicView(denied)) },
    }))(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(deniedResponse.status).toBe(500)

    const invalid = createValidDesignFixture()
    invalid.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'Unsafe' }
    const invalidResponse = await createPublicShareHandler(dependencies({
      links: { findPublicBySlug: () => Promise.resolve(publicView(invalid)) },
    }))(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(invalidResponse.status).toBe(500)
    expect(await invalidResponse.text()).toBe('Không thể hiển thị trang')

    const failedResponse = await createPublicShareHandler(dependencies({
      links: { findPublicBySlug: () => Promise.reject(new Error('secret')) },
    }))(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(failedResponse.status).toBe(500)
    expect(await failedResponse.text()).not.toContain('secret')
  })
})
