import { createLeadHandlers } from '../../../../../../lib/server/lead-api'
import { createLeadRouteDependencies } from '../../../../../../lib/server/lead-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return createLeadHandlers(
    createLeadRouteDependencies(),
  ).GET_LIST(request, context)
}
