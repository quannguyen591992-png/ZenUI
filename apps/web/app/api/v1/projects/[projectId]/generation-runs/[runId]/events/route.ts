import { createGenerationEventsHandler } from '../../../../../../../../lib/server/generation-api'
import { createGenerationRouteDependencies } from '../../../../../../../../lib/server/generation-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  return createGenerationEventsHandler(createGenerationRouteDependencies())(request, context)
}
