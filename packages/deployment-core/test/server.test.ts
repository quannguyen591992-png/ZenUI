import { randomBytes } from 'node:crypto'

import { expect, it, vi } from 'vitest'

import {
  createCredentialCipher,
  createCredentialKeyring,
  createVercelAdapter,
  VercelProviderError,
} from '../src/server'

const context = {
  provider: 'vercel' as const,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  connectionId: '22222222-2222-4222-8222-222222222222',
  configurationId: 'icfg_test',
}

it('encrypts credentials with authenticated tenant-bound AES-256-GCM', () => {
  const cipher = createCredentialCipher({ key: randomBytes(32).toString('base64'), keyVersion: 1 })
  const envelope = cipher.encrypt('vercel-access-token-secret', context)

  expect(envelope.ciphertext).not.toContain('vercel-access-token-secret')
  expect(cipher.decrypt(envelope, context)).toBe('vercel-access-token-secret')
  expect(() => cipher.decrypt(envelope, { ...context, workspaceId: '33333333-3333-4333-8333-333333333333' }))
    .toThrow('credential_decryption_failed')

  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}aa` }
  expect(() => cipher.decrypt(tampered, context)).toThrow('credential_decryption_failed')
})

it('decrypts previous credential versions and always encrypts with the active key', () => {
  const keyring = createCredentialKeyring({
    activeKeyVersion: 2,
    keys: {
      1: Buffer.alloc(32, 1).toString('base64'),
      2: Buffer.alloc(32, 2).toString('base64'),
    },
  })
  const previous = createCredentialCipher({ key: Buffer.alloc(32, 1).toString('base64'), keyVersion: 1 })
    .encrypt('previous-token', context)
  const current = keyring.encrypt('current-token', context)

  expect(current.keyVersion).toBe(2)
  expect(keyring.decrypt(previous, context)).toBe('previous-token')
  expect(keyring.decrypt(current, context)).toBe('current-token')
  expect(() => keyring.decrypt({ ...current, keyVersion: 3 }, context)).toThrow('credential_decryption_failed')
  expect(() => createCredentialKeyring({
    activeKeyVersion: 2,
    keys: { 1: Buffer.alloc(32, 1).toString('base64') },
  })).toThrow('credential_active_key_missing')
})

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

it('exchanges one-time codes and validates the installed configuration', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'provider-secret-token', team_id: 'team_test' }))
    .mockResolvedValueOnce(response({
      id: 'icfg_test', teamId: 'team_test', status: 'ready',
      scopes: ['deployment:read-write', 'integration-configuration:read-write'],
    }))
  const adapter = createVercelAdapter({
    fetch,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://app.example.test/api/v1/provider-connections/vercel/callback',
  })

  const token = await adapter.exchangeCode('one-time-code')
  expect(token).toEqual({ accessToken: 'provider-secret-token', teamId: 'team_test' })
  expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.vercel.com/v2/oauth/access_token', expect.objectContaining({
    method: 'POST',
    body: expect.any(URLSearchParams),
  }))
  const configuration = await adapter.getConfiguration(token.accessToken, 'icfg_test', token.teamId)
  expect(configuration).toMatchObject({ id: 'icfg_test', teamId: 'team_test', status: 'ready' })
  expect(fetch.mock.calls[1]?.[0]).toContain('teamId=team_test')
  expect(fetch.mock.calls[1]?.[1]?.headers).toEqual(expect.objectContaining({ authorization: 'Bearer provider-secret-token' }))
})

it('creates one static Vercel deployment and maps provider status safely', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'QUEUED', url: 'zenui-test.vercel.app' }))
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'BUILDING', url: 'zenui-test.vercel.app' }))
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'READY', url: 'zenui-test.vercel.app' }))
  const adapter = createVercelAdapter({
    fetch,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://app.example.test/callback',
  })

  const created = await adapter.createDeployment('provider-secret-token', {
    teamId: 'team_test',
    name: 'zenui-a1b2c3d4',
    files: [
      { path: 'about/index.html', content: '<!doctype html><h1>About</h1>' },
      { path: 'index.html', content: '<!doctype html><h1>Immutable</h1>' },
    ],
    target: 'production',
    correlationId: '44444444-4444-4444-8444-444444444444',
  })
  expect(created).toEqual({ providerDeploymentId: 'dpl_test', state: 'building' })
  const request = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
  expect(request).toMatchObject({
    name: 'zenui-a1b2c3d4', target: 'production', projectSettings: { framework: null },
    files: [
      { file: 'about/index.html', data: '<!doctype html><h1>About</h1>' },
      { file: 'index.html', data: '<!doctype html><h1>Immutable</h1>' },
    ],
  })
  expect(JSON.stringify(request)).not.toContain('provider-secret-token')

  await expect(adapter.getDeployment('provider-secret-token', 'dpl_test', 'team_test'))
    .resolves.toEqual({ state: 'building' })
  await expect(adapter.getDeployment('provider-secret-token', 'dpl_test', 'team_test'))
    .resolves.toEqual({ state: 'ready', url: 'https://zenui-test.vercel.app' })
})

it('finds deployment outcomes only by exact correlation metadata without creating again', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response({ deployments: [
      { id: 'dpl_other', readyState: 'READY', url: 'other.vercel.app', meta: { zenuiDeploymentId: 'other' } },
      { id: 'dpl_test', readyState: 'READY', url: 'zenui-test.vercel.app', meta: { zenuiDeploymentId: 'local-id' } },
    ] }))
    .mockResolvedValueOnce(response({ deployments: [] }))
    .mockResolvedValueOnce(response({ deployments: [
      { id: 'dpl_a', readyState: 'BUILDING', meta: { zenuiDeploymentId: 'duplicate' } },
      { id: 'dpl_b', readyState: 'QUEUED', meta: { zenuiDeploymentId: 'duplicate' } },
    ] }))
  const adapter = createVercelAdapter({
    fetch, clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://app.example.test/callback',
  })

  await expect(adapter.findDeploymentByCorrelation('token', {
    teamId: 'team_test', projectName: 'zenui-a1b2c3d4', correlationId: 'local-id',
  })).resolves.toEqual({ match: 'one', deployment: {
    providerDeploymentId: 'dpl_test', state: 'ready', url: 'https://zenui-test.vercel.app',
  } })
  await expect(adapter.findDeploymentByCorrelation('token', {
    teamId: null, projectName: 'zenui-a1b2c3d4', correlationId: 'missing',
  })).resolves.toEqual({ match: 'none' })
  await expect(adapter.findDeploymentByCorrelation('token', {
    teamId: null, projectName: 'zenui-a1b2c3d4', correlationId: 'duplicate',
  })).resolves.toEqual({ match: 'multiple' })
  expect(fetch.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true)
  expect(fetch.mock.calls[0]?.[0]).toContain('projectId=zenui-a1b2c3d4')
  expect(fetch.mock.calls[0]?.[0]).toContain('teamId=team_test')
})

it('normalizes provider failures without leaking response bodies or credentials', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ error: { message: 'provider-secret-detail' } }, 401))
  const adapter = createVercelAdapter({
    fetch,
    clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://app.example.test/callback',
  })

  await expect(adapter.exchangeCode('one-time-code')).rejects.toMatchObject({ code: 'provider_auth', message: 'provider_auth' })
  await expect(adapter.getConfiguration('provider-secret-token', 'icfg_test', null)).rejects.toBeInstanceOf(VercelProviderError)

  fetch.mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'READY', url: 'attacker.example.test' }))
  await expect(adapter.getDeployment('provider-secret-token', 'dpl_test', null))
    .rejects.toMatchObject({ code: 'provider_error', message: 'provider_error' })
})

it('uses safe timeout and disconnect semantics', async () => {
  const fetch = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error('provider-secret-network'), { name: 'AbortError' }))
    .mockRejectedValueOnce(new Error('provider-secret-network'))
    .mockRejectedValueOnce(new Error('provider-secret-create-outcome'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(response({ error: 'missing' }, 404))
    .mockResolvedValueOnce(response({ error: 'gone' }, 410))
    .mockResolvedValueOnce(response({ error: 'limited' }, 429))
    .mockResolvedValueOnce(response({ error: 'unavailable' }, 503))
  const adapter = createVercelAdapter({
    fetch,
    clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://app.example.test/callback', timeoutMs: 25,
  })

  await expect(adapter.exchangeCode('one-time-code')).rejects.toMatchObject({ code: 'provider_timeout', message: 'provider_timeout' })
  await expect(adapter.exchangeCode('one-time-code')).rejects.toMatchObject({ code: 'provider_transient' })
  await expect(adapter.createDeployment('token', {
    teamId: null, name: 'zenui-test1234', files: [{ path: 'index.html', content: '<h1>Page</h1>' }], target: 'preview', correlationId: 'local-id',
  })).rejects.toMatchObject({ code: 'provider_outcome_unknown' })
  await expect(adapter.disconnect('token', 'icfg_test', null)).resolves.toBeUndefined()
  await expect(adapter.disconnect('token', 'icfg_test', null)).resolves.toBeUndefined()
  await expect(adapter.disconnect('token', 'icfg_test', null)).resolves.toBeUndefined()
  await expect(adapter.disconnect('token', 'icfg_test', null)).rejects.toMatchObject({ code: 'provider_rate_limit' })
  await expect(adapter.disconnect('token', 'icfg_test', null)).rejects.toMatchObject({ code: 'provider_transient' })
})

it('validates malformed provider success payloads and terminal deployment states', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('not-json', { status: 200 }))
    .mockResolvedValueOnce(response({ access_token: '' }))
    .mockResolvedValueOnce(response({ id: 'wrong', scopes: [] }))
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'ERROR' }))
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'READY', url: 'https://zenui-direct.vercel.app' }))
    .mockResolvedValueOnce(response({ id: 'dpl_test', readyState: 'CANCELED' }))
  const adapter = createVercelAdapter({
    fetch, clientId: 'client-id', clientSecret: 'client-secret', redirectUri: 'https://app.example.test/callback',
  })
  await expect(adapter.exchangeCode('code')).rejects.toMatchObject({ code: 'provider_error' })
  await expect(adapter.exchangeCode('code')).rejects.toMatchObject({ code: 'provider_error' })
  await expect(adapter.getConfiguration('token', 'icfg_test', null)).rejects.toMatchObject({ code: 'provider_error' })
  await expect(adapter.createDeployment('token', {
    teamId: null, name: 'zenui-test1234', files: [{ path: 'index.html', content: '<h1>Page</h1>' }], target: 'preview', correlationId: 'local-id',
  })).rejects.toMatchObject({ code: 'provider_error' })
  await expect(adapter.createDeployment('token', {
    teamId: null, name: 'zenui-test1234', files: [{ path: 'index.html', content: '<h1>Page</h1>' }], target: 'preview', correlationId: 'local-id',
  })).resolves.toEqual({ providerDeploymentId: 'dpl_test', state: 'ready', url: 'https://zenui-direct.vercel.app' })
  await expect(adapter.getDeployment('token', 'dpl_test', null)).resolves.toEqual({ state: 'failed' })
})

it('rejects invalid cipher configuration and empty credentials', () => {
  expect(() => createCredentialCipher({ key: Buffer.alloc(31).toString('base64'), keyVersion: 1 }))
    .toThrow('credential_encryption_key_invalid')
  expect(() => createCredentialCipher({ key: Buffer.alloc(32).toString('base64'), keyVersion: 0 }))
    .toThrow('credential_key_version_invalid')
  const cipher = createCredentialCipher({ key: Buffer.alloc(32, 4).toString('base64'), keyVersion: 1 })
  expect(() => cipher.encrypt('', context)).toThrow('credential_invalid')
})
