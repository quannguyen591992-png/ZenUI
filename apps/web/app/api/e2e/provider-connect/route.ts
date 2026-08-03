import { isE2eRuntimeEnabled } from '../../../../lib/server/e2e-runtime'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  if (!isE2eRuntimeEnabled()) return new Response('Not found', { status: 404 })
  const requestUrl = new URL(request.url)
  const state = requestUrl.searchParams.get('state')
  if (!state) return new Response('Invalid request', { status: 422 })
  const callback = new URL('/api/v1/provider-connections/vercel/callback', requestUrl.origin)
  callback.searchParams.set('state', state)
  callback.searchParams.set('code', 'e2e-one-time-code')
  callback.searchParams.set('configurationId', 'icfg_e2e')
  callback.searchParams.set('teamId', 'team_e2e')
  callback.searchParams.set('source', 'external')
  return Response.redirect(callback, 303)
}
