import { createGenerationCollectionHandlers } from '../../../../../../lib/server/generation-api'
import { createGenerationRouteDependencies } from '../../../../../../lib/server/generation-route-dependencies'

function handlers() {
  return createGenerationCollectionHandlers(createGenerationRouteDependencies())
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handlers().GET(request, context)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handlers().POST(request, context)
}
