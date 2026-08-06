import { NextRequest, NextResponse } from 'next/server'

import { isMisroutedVercelCallback } from './lib/server/provider-callback'

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== '/') return NextResponse.next()
  const query = Object.fromEntries(request.nextUrl.searchParams.entries())
  if (!isMisroutedVercelCallback(query)) return NextResponse.next()
  return NextResponse.redirect(new URL('/provider-callback-error', request.url))
}

export const config = { matcher: '/' }
