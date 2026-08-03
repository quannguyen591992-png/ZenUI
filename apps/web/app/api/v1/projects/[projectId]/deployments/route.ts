import { createDeploymentHandlers } from '../../../../../../lib/server/deployment-api'
import { createDeploymentRouteDependencies } from '../../../../../../lib/server/deployment-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createDeploymentHandlers(createDeploymentRouteDependencies()).GET_LIST(request, context)
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createDeploymentHandlers(createDeploymentRouteDependencies()).POST(request, context)
}
