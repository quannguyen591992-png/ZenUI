import { createPublicShareHandler } from '../../../../lib/server/share-api'
import { createPublicShareRouteDependencies } from '../../../../lib/server/share-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return createPublicShareHandler(
    createPublicShareRouteDependencies(),
  ).GET(request, context)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; path?: string[] }> },
) {
  return createPublicShareHandler(
    createPublicShareRouteDependencies(),
  ).POST(request, context)
}
