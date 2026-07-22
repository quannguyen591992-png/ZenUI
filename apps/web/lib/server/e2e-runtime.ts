import { createHmac, timingSafeEqual } from 'node:crypto'

export const E2E_IDENTITIES = {
  owner: {
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    role: 'owner' as const,
  },
  outsider: {
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceId: '44444444-4444-4444-8444-444444444444',
    role: 'owner' as const,
  },
}

export const E2E_SESSION_COOKIE = 'zenui-e2e-session'

type E2eIdentityName = keyof typeof E2E_IDENTITIES

type RuntimeEnvironment = {
  NODE_ENV?: string
  ZENUI_E2E_ENABLED?: string
}

export function isE2eRuntimeEnabled(environment: RuntimeEnvironment = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.ZENUI_E2E_ENABLED === 'true'
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createE2eSessionToken(identity: E2eIdentityName, secret: string, expiresAt = Date.now() + 3_600_000): string {
  if (!(identity in E2E_IDENTITIES)) throw new Error('invalid_e2e_identity')
  const payload = Buffer.from(JSON.stringify({ identity, expiresAt }), 'utf8').toString('base64url')
  return `${payload}.${signature(payload, secret)}`
}

export function verifyE2eSessionToken(token: string, secret: string, now = Date.now()) {
  const [payload, supplied] = token.split('.')
  if (!payload || !supplied) return null
  const expected = signature(payload, secret)
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      identity?: string
      expiresAt?: number
    }
    if (typeof parsed.identity !== 'string' || !(parsed.identity in E2E_IDENTITIES)) return null
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now) return null
    return E2E_IDENTITIES[parsed.identity as E2eIdentityName]
  } catch {
    return null
  }
}
