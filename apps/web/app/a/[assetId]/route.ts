import { createPublicAssetHandler } from '../../../lib/server/public-asset-api'
import { createPublicAssetRouteDependencies } from '../../../lib/server/public-asset-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }) {
  return createPublicAssetHandler(createPublicAssetRouteDependencies())(request, context)
}
