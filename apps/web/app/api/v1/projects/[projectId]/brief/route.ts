import { createBriefHandler } from '../../../../../../lib/server/design-direction-api'
import { createDesignDirectionRouteDependencies } from '../../../../../../lib/server/design-direction-route-dependencies'

function handlers() {
  return createBriefHandler(createDesignDirectionRouteDependencies())
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handlers().GET(request, context)
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handlers().PUT(request, context)
}
