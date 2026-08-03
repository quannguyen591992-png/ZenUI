import { describe, expect, it, vi } from 'vitest'

import { createProviderConnectionHandlers } from '../lib/server/provider-connection-api'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const connectionId = '33333333-3333-4333-8333-333333333333'
const returnPath = '/projects/44444444-4444-4444-8444-444444444444'
const connection = {
  id: connectionId,
  workspaceId,
  provider: 'vercel' as const,
  status: 'connected' as const,
  connectedAt: new Date('2026-07-22T12:00:00.000Z'),
  disconnectedAt: null,
  createdAt: new Date('2026-07-22T12:00:00.000Z'),
  updatedAt: new Date('2026-07-22T12:00:00.000Z'),
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    trustedOrigin: 'http://localhost:3000',
    installOrigin: 'https://vercel.com',
    integrationSlug: 'zenui-test',
    getSession: vi.fn().mockResolvedValue({ userId }),
    findMembership: vi.fn().mockResolvedValue({ userId, workspaceId, role: 'owner' as const }),
    states: {
      create: vi.fn().mockResolvedValue('a'.repeat(43)),
      consume: vi.fn().mockResolvedValue({ userId, workspaceId, returnPath }),
    },
    oauth: {
      exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'provider-secret-token', teamId: 'team_test' }),
      getConfiguration: vi.fn().mockResolvedValue({
        id: 'icfg_test', teamId: 'team_test', status: 'ready',
        scopes: ['deployment:read-write', 'integration-configuration:read-write'],
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
    },
    cipher: { encrypt: vi.fn().mockReturnValue({ ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyVersion: 1 }) },
    connections: {
      reserveId: vi.fn().mockReturnValue(connectionId),
      connect: vi.fn().mockResolvedValue(connection),
      findPublic: vi.fn().mockResolvedValue(connection),
      getInternal: vi.fn().mockResolvedValue({
        ...connection, configurationId: 'icfg_test', teamId: 'team_test',
        scopes: ['deployment:read-write', 'integration-configuration:read-write'],
        encryptedCredential: { ciphertext: 'encrypted', iv: 'iv', authTag: 'tag', keyVersion: 1 },
      }),
      disconnect: vi.fn().mockResolvedValue({ ...connection, status: 'disconnected' }),
    },
    decryptCredential: vi.fn().mockReturnValue('provider-secret-token'),
    ...overrides,
  }
}

function mutation(path: string, body: unknown, method = 'POST', origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('provider connection API', () => {
  it('rejects forged Origin before authentication or state creation', async () => {
    const deps = dependencies()
    const response = await createProviderConnectionHandlers(deps).AUTHORIZE(
      mutation('/api/v1/provider-connections/vercel/authorize', { workspaceId, returnPath }, 'POST', 'https://evil.test'),
    )
    expect(response.status).toBe(403)
    expect(deps.getSession).not.toHaveBeenCalled()
    expect(deps.states.create).not.toHaveBeenCalled()
  })

  it('creates a state-bound Vercel install URL for owners only', async () => {
    const deps = dependencies()
    const response = await createProviderConnectionHandlers(deps).AUTHORIZE(
      mutation('/api/v1/provider-connections/vercel/authorize', { workspaceId, returnPath }),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    const url = new URL(body.data.url)
    expect(url.origin).toBe('https://vercel.com')
    expect(url.pathname).toBe('/integrations/zenui-test/new')
    expect(url.searchParams.get('state')).toBe('a'.repeat(43))
    expect(JSON.stringify(body)).not.toContain('provider-secret')

    const forbidden = await createProviderConnectionHandlers(dependencies({
      findMembership: vi.fn().mockResolvedValue({ userId, workspaceId, role: 'editor' }),
    })).AUTHORIZE(mutation('/api/v1/provider-connections/vercel/authorize', { workspaceId, returnPath }))
    expect(forbidden.status).toBe(403)
  })

  it('consumes callback state once, validates scopes, encrypts the token and redirects safely', async () => {
    const deps = dependencies()
    const response = await createProviderConnectionHandlers(deps).CALLBACK(new Request(
      `http://localhost:3000/api/v1/provider-connections/vercel/callback?state=${'a'.repeat(43)}&code=one-time-code&configurationId=icfg_test&teamId=team_test&source=external`,
    ))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(`http://localhost:3000${returnPath}?provider=connected`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('cross-origin-opener-policy')).toBe('unsafe-none')
    expect(deps.states.consume).toHaveBeenCalledTimes(1)
    expect(deps.cipher.encrypt).toHaveBeenCalledWith('provider-secret-token', expect.objectContaining({
      workspaceId, connectionId, configurationId: 'icfg_test', provider: 'vercel',
    }))
    expect(deps.connections.connect).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      id: connectionId, configurationId: 'icfg_test', encryptedCredential: expect.objectContaining({ ciphertext: 'encrypted' }),
    }))
  })

  it('fails closed for replay, user mismatch, malformed callback and insufficient scopes', async () => {
    expect((await createProviderConnectionHandlers(dependencies({
      states: { create: vi.fn(), consume: vi.fn().mockResolvedValue(null) },
    })).CALLBACK(new Request(`http://localhost/api?state=${'a'.repeat(43)}&code=code&configurationId=icfg_test&source=external`))).status).toBe(403)

    expect((await createProviderConnectionHandlers(dependencies({
      getSession: vi.fn().mockResolvedValue({ userId: '55555555-5555-4555-8555-555555555555' }),
    })).CALLBACK(new Request(`http://localhost/api?state=${'a'.repeat(43)}&code=code&configurationId=icfg_test&source=external`))).status).toBe(403)

    expect((await createProviderConnectionHandlers(dependencies()).CALLBACK(new Request('http://localhost/api?code=code'))).status).toBe(422)
    expect((await createProviderConnectionHandlers(dependencies({
      oauth: {
        exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'secret', teamId: null }),
        getConfiguration: vi.fn().mockResolvedValue({ id: 'icfg_test', teamId: null, status: 'ready', scopes: ['deployment:read'] }),
        disconnect: vi.fn(),
      },
    })).CALLBACK(new Request(`http://localhost/api?state=${'a'.repeat(43)}&code=code&configurationId=icfg_test&source=external`))).status).toBe(403)
  })

  it('returns redacted status and disconnects idempotently only after provider revoke', async () => {
    const deps = dependencies()
    const get = await createProviderConnectionHandlers(deps).GET(new Request(`http://localhost/api?workspaceId=${workspaceId}`))
    const body = await get.json()
    expect(get.status).toBe(200)
    expect(body.data).toMatchObject({ id: connectionId, provider: 'vercel', status: 'connected' })
    expect(JSON.stringify(body)).not.toMatch(/configurationId|teamId|credential|token/i)

    const disconnected = await createProviderConnectionHandlers(deps).DELETE(
      mutation(`/api/v1/provider-connections/vercel?workspaceId=${workspaceId}`, { workspaceId }, 'DELETE'),
    )
    expect(disconnected.status).toBe(200)
    expect(deps.oauth.disconnect).toHaveBeenCalledWith('provider-secret-token', 'icfg_test', 'team_test')
    expect(deps.connections.disconnect).toHaveBeenCalledWith(expect.any(Object), connectionId)
  })

  it('keeps the encrypted local connection when provider revoke fails transiently', async () => {
    const deps = dependencies({
      oauth: {
        exchangeCode: vi.fn(), getConfiguration: vi.fn(),
        disconnect: vi.fn().mockRejectedValue(new Error('provider_transient')),
      },
    })
    const response = await createProviderConnectionHandlers(deps).DELETE(
      mutation(`/api/v1/provider-connections/vercel?workspaceId=${workspaceId}`, { workspaceId }, 'DELETE'),
    )
    expect(response.status).toBe(503)
    expect(deps.connections.disconnect).not.toHaveBeenCalled()
    expect(JSON.stringify(await response.json())).not.toContain('provider-secret')
  })
})
