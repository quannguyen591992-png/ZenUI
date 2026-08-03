import { createDirectionChooseHandler } from '../../../../../../../../lib/server/design-direction-api'
import { createDesignDirectionRouteDependencies } from '../../../../../../../../lib/server/design-direction-route-dependencies'

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  return createDirectionChooseHandler(createDesignDirectionRouteDependencies())(request, context)
}
