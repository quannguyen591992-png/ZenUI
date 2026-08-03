import { webLivenessHandler } from '../../../../lib/server/operations-route-dependencies'

export const dynamic = 'force-dynamic'

export function GET() {
  return webLivenessHandler()
}
