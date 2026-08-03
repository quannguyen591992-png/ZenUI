import { createConfiguredAuth } from '../../../../lib/server/configured-auth'

import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  return createConfiguredAuth().handlers.GET(request)
}

export async function POST(request: NextRequest) {
  return createConfiguredAuth().handlers.POST(request)
}
