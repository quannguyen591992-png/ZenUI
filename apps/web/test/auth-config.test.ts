import { describe, expect, it } from 'vitest'

import { createAuthConfig } from '../auth'

describe('Auth.js configuration', () => {
  it('requires server-only provider credentials', () => {
    expect(() => createAuthConfig({
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
    })).toThrow('AUTH_SECRET is required')
    expect(() => createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: '',
      AUTH_GITHUB_SECRET: '',
    })).toThrow('AUTH_GITHUB_ID and AUTH_GITHUB_SECRET are required')
  })

  it('normalizes GitHub profiles without exposing provider credentials', () => {
    const config = createAuthConfig({
      AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      AUTH_GITHUB_ID: 'github-id',
      AUTH_GITHUB_SECRET: 'github-secret',
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
    })

    expect(config.session).toEqual({ strategy: 'database' })
    expect(config.cookies?.sessionToken?.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    })
    expect(config.providers).toHaveLength(1)
  })
})
