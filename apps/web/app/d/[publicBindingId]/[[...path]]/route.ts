import { createPublicDeploymentLeadHandler } from '../../../../lib/server/public-lead-api'
import { createPublicDeploymentLeadRouteDependencies } from '../../../../lib/server/share-route-dependencies'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{
    publicBindingId: string
    path?: string[]
  }>
}

export async function GET(request: Request, context: RouteContext) {
  return createPublicDeploymentLeadHandler(
    createPublicDeploymentLeadRouteDependencies(),
  ).GET(request, context)
}

export async function POST(request: Request, context: RouteContext) {
  return createPublicDeploymentLeadHandler(
    createPublicDeploymentLeadRouteDependencies(),
  ).POST(request, context)
}
