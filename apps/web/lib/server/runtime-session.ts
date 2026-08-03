import { cookies } from 'next/headers'

import { isConfiguredBetaEmailAllowed } from '../../auth'

import { createConfiguredAuth } from './configured-auth'
import { waitForDatabase } from './database'
import {
  E2E_SESSION_COOKIE,
  isGuardedIdentityRuntimeEnabled,
  verifyE2eSessionToken,
} from './e2e-runtime'

export async function getRuntimeSession(): Promise<{ userId: string } | null> {
  if (isGuardedIdentityRuntimeEnabled()) {
    const secret = process.env.AUTH_SECRET
    if (!secret) throw new Error('AUTH_SECRET is required')
    const token = (await cookies()).get(E2E_SESSION_COOKIE)?.value
    const identity = token ? verifyE2eSessionToken(token, secret) : null
    return identity ? { userId: identity.userId } : null
  }
  await waitForDatabase()
  const session = await createConfiguredAuth().auth()
  return session?.user.id && isConfiguredBetaEmailAllowed(session.user.email)
    ? { userId: session.user.id }
    : null
}
