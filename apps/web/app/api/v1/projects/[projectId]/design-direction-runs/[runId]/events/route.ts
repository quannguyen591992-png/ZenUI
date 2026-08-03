import { createDesignDirectionEventsHandler } from '../../../../../../../../lib/server/design-direction-api'
import { createDesignDirectionRouteDependencies } from '../../../../../../../../lib/server/design-direction-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  return createDesignDirectionEventsHandler(createDesignDirectionRouteDependencies())(request, context)
}
