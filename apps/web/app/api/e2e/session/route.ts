import { NextResponse } from 'next/server'
import { z } from 'zod'

import { resetE2eAssetSources } from '../../../../lib/server/asset-route-dependencies'
import { resetE2eDatabase } from '../../../../lib/server/database'
import {
  createE2eSessionToken,
  E2E_SESSION_COOKIE,
  isE2eRuntimeEnabled,
  isGuardedIdentityRuntimeEnabled,
  resetE2eRuntimeCounters,
} from '../../../../lib/server/e2e-runtime'
import { resetE2ePublicAssets } from '../../../../lib/server/public-asset-route-dependencies'

const requestSchema = z.object({ identity: z.enum(['owner', 'outsider']) }).strict()

export async function POST(request: Request) {
  if (!isGuardedIdentityRuntimeEnabled()) return new NextResponse(null, { status: 404 })
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Invalid E2E identity' } }, { status: 422 })
  }
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is required')
  const token = createE2eSessionToken(parsed.data.identity, secret)
  const response = NextResponse.json({ data: { identity: parsed.data.identity } })
  response.cookies.set(E2E_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 3600,
  })
  return response
}

export async function DELETE() {
  if (!isGuardedIdentityRuntimeEnabled()) return new NextResponse(null, { status: 404 })
  if (isE2eRuntimeEnabled()) {
    await resetE2eDatabase()
    resetE2eAssetSources()
    resetE2ePublicAssets()
    resetE2eRuntimeCounters()
  }
  const response = NextResponse.json({ data: { reset: isE2eRuntimeEnabled() } })
  response.cookies.delete(E2E_SESSION_COOKIE)
  return response
}
