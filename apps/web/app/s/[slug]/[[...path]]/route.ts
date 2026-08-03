import { createPublicShareHandler } from '../../../../lib/server/share-api'
import { createPublicShareRouteDependencies } from '../../../../lib/server/share-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return createPublicShareHandler(createPublicShareRouteDependencies())(request, context)
}
