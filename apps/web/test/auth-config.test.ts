import { describe, expect, it } from 'vitest'

import {
  createAuthConfig,
  createBetaEmailPolicy,
  isConfiguredBetaEmailAllowed,
} from '../auth'

describe('Auth.js configuration', () => {
  it('parses and enforces a normalized beta email allowlist', () => {
    const policy = createBetaEmailPolicy('Owner@Example.COM, mentor@example.com')
    expect(policy.emails).toEqual(['mentor@example.com', 'owner@example.com'])
    expect(policy.allows(' OWNER@example.com ')).toBe(true)
    expect(policy.allows('outsider@example.com')).toBe(false)
    expect(policy.allows(null)).toBe(false)

    expect(() => createBetaEmailPolicy('')).toThrow('BETA_ALLOWED_EMAILS is required')
    expect(() => createBetaEmailPolicy('not-an-email')).toThrow('invalid_beta_email')
    expect(() => createBetaEmailPolicy('owner@example.com,OWNER@example.com')).toThrow('duplicate_beta_email')
  })

  it('denies missing or non-allowlisted OAuth emails generically', async () => {
    const config = createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
      BETA_ALLOWED_EMAILS: 'owner@example.com',
    })
    expect(await config.callbacks?.signIn?.({
      user: { id: '1', email: 'owner@example.com' }, account: null, profile: undefined,
    } as never)).toBe(true)
    expect(await config.callbacks?.signIn?.({
      user: { id: '2', email: 'outsider@example.com' }, account: null, profile: undefined,
    } as never)).toBe(false)
    expect(await config.callbacks?.signIn?.({
      user: { id: '3', email: null }, account: null, profile: undefined,
    } as never)).toBe(false)
  })
  it('rechecks allowlist membership for existing server sessions', () => {
    process.env.BETA_ALLOWED_EMAILS = 'owner@example.com'
    expect(isConfiguredBetaEmailAllowed('OWNER@example.com')).toBe(true)
    expect(isConfiguredBetaEmailAllowed('removed@example.com')).toBe(false)
  })

  it('requires server-only provider credentials', () => {
    expect(() => createAuthConfig({
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
      BETA_ALLOWED_EMAILS: 'owner@example.com',
    })).toThrow('AUTH_SECRET is required')
    expect(() => createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: '',
      AUTH_GITHUB_SECRET: '',
      BETA_ALLOWED_EMAILS: 'owner@example.com',
    })).toThrow('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required')
  })

  it('normalizes GitHub profiles without exposing provider credentials', () => {
    const config = createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
      BETA_ALLOWED_EMAILS: 'owner@example.com',
    })
    const provider = config.providers[0]
    if (typeof provider === 'function' || !provider || provider.type !== 'oauth') throw new Error('Expected OAuth provider')

    expect(provider.profile?.({ id: 42, login: 'zenui' }, {})).toEqual({
      id: '42',
      name: 'zenui',
      email: null,
      image: null,
    })
    expect(provider.profile?.({
      id: 43,
      login: 'zenui-user',
      name: 'ZenUI User',
      email: 'user@example.test',
      avatar_url: 'https://images.example.test/avatar.png',
    }, {})).toEqual({
      id: '43',
      name: 'ZenUI User',
      email: 'user@example.test',
      image: 'https://images.example.test/avatar.png',
    })
  })

  it('uses database sessions and secure cookie policy', () => {
    const config = createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
      BETA_ALLOWED_EMAILS: 'owner@example.com',
    })

    expect(config.session).toEqual({ strategy: 'database' })
    expect(config.cookies?.sessionToken?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    })
    expect(config.providers).toHaveLength(1)
    expect(config.pages).toEqual({ signIn: '/login', error: '/auth-error' })
  })
})
