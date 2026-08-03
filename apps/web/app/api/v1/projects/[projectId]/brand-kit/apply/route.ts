import { createBrandKitHandlers } from '../../../../../../../lib/server/brand-kit-api'
import { createBrandKitRouteDependencies } from '../../../../../../../lib/server/brand-kit-route-dependencies'

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createBrandKitHandlers(createBrandKitRouteDependencies()).APPLY(request, context)
}
