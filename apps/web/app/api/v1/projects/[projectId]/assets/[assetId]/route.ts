import { createAssetHandlers } from '../../../../../../../lib/server/asset-api'
import { createAssetRouteDependencies } from '../../../../../../../lib/server/asset-route-dependencies'

export async function GET(request: Request, context: { params: Promise<{ projectId: string; assetId: string }> }) {
  return createAssetHandlers(createAssetRouteDependencies()).GET_ITEM(request, context)
}
