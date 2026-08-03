import { createAssetHandlers } from '../../../../../../../../lib/server/asset-api'
import { createAssetRouteDependencies } from '../../../../../../../../lib/server/asset-route-dependencies'

export async function POST(request: Request, context: { params: Promise<{ projectId: string; assetId: string }> }) {
  return createAssetHandlers(createAssetRouteDependencies()).DERIVATIVE(request, context)
}
