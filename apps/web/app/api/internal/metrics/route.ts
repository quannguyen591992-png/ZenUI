import { createWebMetricsHandler } from '../../../../lib/server/operations-route-dependencies'

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return createWebMetricsHandler()(request)
}
