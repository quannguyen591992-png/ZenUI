import { createDesignDirectionCollectionHandler } from '../../../../../../lib/server/design-direction-api'
import { createDesignDirectionRouteDependencies } from '../../../../../../lib/server/design-direction-route-dependencies'

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return createDesignDirectionCollectionHandler(createDesignDirectionRouteDependencies()).POST(request, context)
}
