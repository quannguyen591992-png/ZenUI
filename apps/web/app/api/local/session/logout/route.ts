import { NextResponse } from 'next/server'

import { requireExactAppOrigin } from '../../../../../lib/server/auth-navigation'
import { E2E_SESSION_COOKIE, isLocalAuthRuntimeEnabled } from '../../../../../lib/server/e2e-runtime'

export function POST(request: Request) {
  if (!isLocalAuthRuntimeEnabled()) return new NextResponse(null, { status: 404 })
  if (!requireExactAppOrigin(request, process.env.APP_ORIGIN)) {
    return NextResponse.json({ error: { code: 'invalid_origin', message: 'Request origin is not allowed' } }, { status: 403 })
  }

  const appOrigin = process.env.APP_ORIGIN
  if (!appOrigin) {
    return NextResponse.json({ error: { code: 'server_misconfigured', message: 'Không thể hoàn tất đăng xuất.' } }, { status: 500 })
  }

  const response = NextResponse.redirect(new URL('/', appOrigin), 303)
  response.cookies.delete(E2E_SESSION_COOKIE)
  return response
}
