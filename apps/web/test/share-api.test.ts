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
const slug = 'A'.repeat(32)
const now = new Date('2026-07-22T12:00:00.000Z')

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
  return {
    trustedOrigin: 'http://localhost:3000',
    shareOrigin: 'http://127.0.0.1:3000',
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' as const }),
    findProject: () => Promise.resolve({ id: projectId, workspaceId, name: 'Page', status: 'active' as const, version: 1, document: createValidDesignFixture() }),
    admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
    createSlug: vi.fn(() => slug),
    links,
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
  function dependencies(overrides: Record<string, unknown> = {}) {
    return {
      shareOrigin: 'http://127.0.0.1:3000',
      assetOrigin: 'https://assets.example.com',
      remoteImageHostAllowlist: 'images.example.com',
      admission: { acquire: () => Promise.resolve({ accepted: true as const }) },
      links: { findPublicBySlug: vi.fn().mockResolvedValue({ document: createValidDesignFixture() }) },
      ...overrides,
    }
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

  it('serves validated immutable deep routes and prefixes internal links', async () => {
    const document = migrateDesignDocumentV1ToV2(createValidDesignFixture())
    document.nodes['about-root'] = { id: 'about-root', type: 'page', parentId: null, children: ['about-section'], props: {}, style: {}, responsive: {} }
    document.nodes['about-section'] = { id: 'about-section', type: 'section', parentId: 'about-root', children: ['about-heading'], props: { label: 'About' }, style: {}, responsive: {} }
    document.nodes['about-heading'] = { id: 'about-heading', type: 'heading', parentId: 'about-section', children: [], props: { text: 'About ZenUI', level: 1 }, style: {}, responsive: {} }
    document.pages.push({ id: 'about', name: 'About', slug: '/about', rootNodeId: 'about-root' })
    document.nodes['button-1']!.props = { text: 'About', pageId: 'about' }
    const handler = createPublicShareHandler(dependencies({ links: { findPublicBySlug: () => Promise.resolve({ document }) } }))

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
      links: { findPublicBySlug: () => Promise.resolve({ document }) },
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
      links: { findPublicBySlug: () => Promise.resolve({ document: denied }) },
    }))(new Request(`http://127.0.0.1:3000/s/${slug}`), { params: Promise.resolve({ slug }) })
    expect(deniedResponse.status).toBe(500)

    const invalid = createValidDesignFixture()
    invalid.nodes['image-1']!.props = { src: 'javascript:alert(1)', alt: 'Unsafe' }
    const invalidResponse = await createPublicShareHandler(dependencies({
      links: { findPublicBySlug: () => Promise.resolve({ document: invalid }) },
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
