import { createWebReadinessHandler } from '../../../../lib/server/operations-route-dependencies'

export const dynamic = 'force-dynamic'

export function GET() {
  return createWebReadinessHandler()()
}
