import { createLeadHandlers } from '../../../../../../../lib/server/lead-api'
import { createLeadRouteDependencies } from '../../../../../../../lib/server/lead-route-dependencies'

type LeadRoute = {
  params: Promise<{ projectId: string; leadId: string }>
}

export async function GET(
  request: Request,
  context: LeadRoute,
) {
  return createLeadHandlers(
    createLeadRouteDependencies(),
  ).GET_DETAIL(request, context)
}

export async function PATCH(
  request: Request,
  context: LeadRoute,
) {
  return createLeadHandlers(
    createLeadRouteDependencies(),
  ).PATCH(request, context)
}
