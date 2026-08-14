import { createDeploymentHandlers } from '../../../../../../../../lib/server/deployment-api'
import { createDeploymentRouteDependencies } from '../../../../../../../../lib/server/deployment-route-dependencies'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  context: {
    params: Promise<{ projectId: string; deploymentId: string }>
  },
) {
  return createDeploymentHandlers(
    createDeploymentRouteDependencies(),
  ).DELETE_LEAD_FORMS(request, context)
}
