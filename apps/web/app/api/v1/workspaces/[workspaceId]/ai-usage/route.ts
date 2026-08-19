import { createUsageHandlers } from '../../../../../../lib/server/usage-api'
import { createUsageRouteDependencies } from '../../../../../../lib/server/usage-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  return createUsageHandlers(
    createUsageRouteDependencies(),
  ).GET(request, context)
}
