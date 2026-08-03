import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireExactAppOrigin, safeAuthCallbackPath } from '../../../../lib/server/auth-navigation'
import {
  createE2eSessionToken,
  E2E_SESSION_COOKIE,
  isLocalAuthRuntimeEnabled,
} from '../../../../lib/server/e2e-runtime'

const localSessionSchema = z.object({
  callbackUrl: z.string().max(500).optional(),
}).strict()

export async function POST(request: Request) {
  if (!isLocalAuthRuntimeEnabled()) return new NextResponse(null, { status: 404 })
  if (!requireExactAppOrigin(request, process.env.APP_ORIGIN)) {
    return NextResponse.json({ error: { code: 'invalid_origin', message: 'Request origin is not allowed' } }, { status: 403 })
  }

  const parsed = localSessionSchema.safeParse(Object.fromEntries(await request.formData().catch(() => new FormData())))
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'validation_error', message: 'Thông tin đăng nhập chưa hợp lệ.' } }, { status: 422 })
  }

  const secret = process.env.AUTH_SECRET
  const appOrigin = process.env.APP_ORIGIN
  if (!secret || !appOrigin) {
    return NextResponse.json({ error: { code: 'server_misconfigured', message: 'Không thể hoàn tất đăng nhập.' } }, { status: 500 })
  }

  const location = new URL(safeAuthCallbackPath(parsed.data.callbackUrl), appOrigin)
  const response = NextResponse.redirect(location, 303)
  response.cookies.set(E2E_SESSION_COOKIE, createE2eSessionToken('owner', secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 3600,
  })
  return response
}
