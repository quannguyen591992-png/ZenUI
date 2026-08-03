import { isE2eRuntimeEnabled, readE2eRuntimeCounters } from '../../../../lib/server/e2e-runtime'

export const dynamic = 'force-dynamic'

export function GET() {
  if (!isE2eRuntimeEnabled()) return new Response('Not found', { status: 404 })
  return Response.json({ data: readE2eRuntimeCounters() })
}
