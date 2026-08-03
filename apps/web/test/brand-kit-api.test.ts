import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it, vi } from 'vitest'

import { createBrandKitHandlers } from '../lib/server/brand-kit-api'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'

const kit = {
  id: '44444444-4444-4444-8444-444444444444', workspaceId, version: 1, name: 'NovaFlow',
  logoAssetId: null,
  colors: { primary: '#2563eb', background: '#ffffff', text: '#0f172a' },
  fonts: { heading: 'Manrope' as const, body: 'Arial' as const },
  updatedBy: userId, createdAt: new Date(), updatedAt: new Date(),
}

function dependencies(role: 'owner' | 'editor' | 'viewer' = 'owner') {
  return {
    trustedOrigin: 'http://localhost:3000',
    getSession: () => Promise.resolve({ userId }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role }),
    findProject: () => Promise.resolve({ id: projectId, version: 1 }),
    brands: {
      load: vi.fn().mockResolvedValue(kit),
      save: vi.fn().mockResolvedValue(kit),
      applyToProject: vi.fn().mockResolvedValue({ accepted: true, version: 2, document: { ...createValidDesignFixture(), version: 2 } }),
    },
  }
}

describe('Brand Kit API', () => {
  it('lets workspace members read a redacted kit but only owners update it', async () => {
    const viewer = createBrandKitHandlers(dependencies('viewer'))
    expect((await viewer.GET(new Request(`http://localhost/brand?workspaceId=${workspaceId}`), { params: Promise.resolve({ workspaceId }) })).status).toBe(200)
    expect((await viewer.PUT(new Request('http://localhost/brand', {
      method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1, name: 'NovaFlow', colors: kit.colors, fonts: kit.fonts }),
    }), { params: Promise.resolve({ workspaceId }) })).status).toBe(403)
  })

  it('checks Origin and validates contrast before saving', async () => {
    const deps = dependencies()
    const handlers = createBrandKitHandlers(deps)
    const denied = await handlers.PUT(new Request('http://localhost/brand', {
      method: 'PUT', headers: { origin: 'https://evil.test', 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1, name: 'NovaFlow', colors: kit.colors, fonts: kit.fonts }),
    }), { params: Promise.resolve({ workspaceId }) })
    expect(denied.status).toBe(403)
    expect(deps.brands.save).not.toHaveBeenCalled()

    const invalid = await handlers.PUT(new Request('http://localhost/brand', {
      method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 1, name: 'Unreadable', colors: { primary: '#eeeeee', background: '#ffffff', text: '#dddddd' }, fonts: kit.fonts }),
    }), { params: Promise.resolve({ workspaceId }) })
    expect(invalid.status).toBe(422)
  })

  it('returns safe read validation, authentication and repository errors', async () => {
    const handlers = createBrandKitHandlers(dependencies())
    const empty = createBrandKitHandlers({ ...dependencies(), brands: {
      ...dependencies().brands,
      load: vi.fn().mockResolvedValue(null),
    } })
    expect(await (await empty.GET(new Request(`http://localhost/brand?workspaceId=${workspaceId}`), {
      params: Promise.resolve({ workspaceId }),
    })).json()).toEqual({ data: null })
    expect((await handlers.GET(new Request('http://localhost/brand?workspaceId=invalid'), {
      params: Promise.resolve({ workspaceId }),
    })).status).toBe(422)
    const noSession = createBrandKitHandlers({ ...dependencies(), getSession: () => Promise.resolve(null) })
    expect((await noSession.GET(new Request(`http://localhost/brand?workspaceId=${workspaceId}`), {
      params: Promise.resolve({ workspaceId }),
    })).status).toBe(401)
    const noMembership = createBrandKitHandlers({ ...dependencies(), findMembership: () => Promise.resolve(null) })
    expect((await noMembership.GET(new Request(`http://localhost/brand?workspaceId=${workspaceId}`), {
      params: Promise.resolve({ workspaceId }),
    })).status).toBe(404)

    for (const [message, status] of [
      ['stale_brand_kit_version', 409], ['invalid_brand_kit', 422], ['invalid_brand_logo', 422], ['not_found', 404],
    ] as const) {
      const failed = createBrandKitHandlers({ ...dependencies(), brands: {
        ...dependencies().brands,
        save: vi.fn().mockRejectedValue(new Error(message)),
      } })
      const response = await failed.PUT(new Request('http://localhost/brand', {
        method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ expectedVersion: 1, name: 'NovaFlow', colors: kit.colors, fonts: kit.fonts }),
      }), { params: Promise.resolve({ workspaceId }) })
      expect(response.status).toBe(status)
      expect(await response.text()).not.toContain(message === 'invalid_brand_logo' ? 'logoAssetId' : 'database')
    }
  })

  it('applies a versioned kit atomically with document conflict handling', async () => {
    const deps = dependencies()
    const handlers = createBrandKitHandlers(deps)
    const response = await handlers.APPLY(new Request('http://localhost/apply', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedBrandKitVersion: 1, expectedDocumentVersion: 1 }),
    }), { params: Promise.resolve({ projectId }) })
    expect(response.status).toBe(200)
    expect(deps.brands.applyToProject).toHaveBeenCalledWith(
      { userId, workspaceId }, projectId,
      { expectedBrandKitVersion: 1, expectedDocumentVersion: 1 },
    )

    const conflicted = createBrandKitHandlers({ ...dependencies(), brands: {
      ...dependencies().brands,
      applyToProject: vi.fn().mockResolvedValue({ accepted: false, code: 'stale_document_version' }),
    } })
    expect((await conflicted.APPLY(new Request('http://localhost/apply', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedBrandKitVersion: 1, expectedDocumentVersion: 1 }),
    }), { params: Promise.resolve({ projectId }) })).status).toBe(409)

    const missingProject = createBrandKitHandlers({ ...dependencies(), findProject: () => Promise.resolve(null) })
    expect((await missingProject.APPLY(new Request('http://localhost/apply', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedBrandKitVersion: 1, expectedDocumentVersion: 1 }),
    }), { params: Promise.resolve({ projectId }) })).status).toBe(404)
    const missingBrand = createBrandKitHandlers({ ...dependencies(), brands: {
      ...dependencies().brands,
      applyToProject: vi.fn().mockResolvedValue({ accepted: false, code: 'not_found' }),
    } })
    expect((await missingBrand.APPLY(new Request('http://localhost/apply', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedBrandKitVersion: 1, expectedDocumentVersion: 1 }),
    }), { params: Promise.resolve({ projectId }) })).status).toBe(404)
    expect((await handlers.APPLY(new Request('http://localhost/apply', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, expectedBrandKitVersion: 0, expectedDocumentVersion: 1 }),
    }), { params: Promise.resolve({ projectId }) })).status).toBe(422)
  })
})
