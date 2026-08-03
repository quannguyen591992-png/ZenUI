import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST as signOutLocal } from '../app/api/local/session/logout/route'
import { POST as signInLocal } from '../app/api/local/session/route'
import { E2E_SESSION_COOKIE } from '../lib/server/e2e-runtime'

const environment = { ...process.env }

function request(path: string, origin = 'http://localhost:3000') {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin,
    },
    body: new URLSearchParams({ callbackUrl: '/dashboard' }),
  })
}

afterEach(() => {
  process.env = { ...environment }
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('guarded local session routes', () => {
  it('creates an HTTP-only owner session and redirects to a safe callback in local mode', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'true'
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.AUTH_SECRET = 'local-test-secret-at-least-32-characters'

    const response = await signInLocal(request('/api/local/session'))

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${E2E_SESSION_COOKIE}=`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).not.toContain('Secure')
  })

  it('fails closed outside local mode and rejects cross-origin posts', async () => {
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.AUTH_SECRET = 'local-test-secret-at-least-32-characters'

    vi.stubEnv('NODE_ENV', 'production')
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'true'
    expect((await signInLocal(request('/api/local/session'))).status).toBe(404)

    vi.stubEnv('NODE_ENV', 'test')
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'false'
    process.env.ZENUI_E2E_ENABLED = 'true'
    expect((await signInLocal(request('/api/local/session'))).status).toBe(404)

    vi.stubEnv('NODE_ENV', 'development')
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'true'
    expect((await signInLocal(request('/api/local/session', 'https://evil.example'))).status).toBe(403)
  })

  it('falls back from an unsafe callback and clears the cookie on local logout', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    process.env.ZENUI_LOCAL_AUTH_ENABLED = 'true'
    process.env.ZENUI_E2E_ENABLED = 'false'
    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.AUTH_SECRET = 'local-test-secret-at-least-32-characters'

    const unsafe = new Request('http://localhost:3000/api/local/session', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://localhost:3000' },
      body: new URLSearchParams({ callbackUrl: 'https://evil.example' }),
    })
    expect((await signInLocal(unsafe)).headers.get('location')).toBe('http://localhost:3000/dashboard')

    const response = signOutLocal(request('/api/local/session/logout'))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`${E2E_SESSION_COOKIE}=`)
    expect(cookie).toMatch(/Max-Age=0|Expires=/i)
  })
})
