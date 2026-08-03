import { createAssetHandlers } from '../../../../../../../lib/server/asset-api'
import { createAssetRouteDependencies } from '../../../../../../../lib/server/asset-route-dependencies'

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createAssetHandlers(createAssetRouteDependencies()).SEARCH(request, context)
}
