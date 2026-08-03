import { createDeploymentHandlers } from '../../../../../../../lib/server/deployment-api'
import { createDeploymentRouteDependencies } from '../../../../../../../lib/server/deployment-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; deploymentId: string }> },
) {
  return createDeploymentHandlers(createDeploymentRouteDependencies()).GET_ITEM(request, context)
}
