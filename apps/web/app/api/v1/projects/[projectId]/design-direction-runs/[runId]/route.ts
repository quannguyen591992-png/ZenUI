import { createDesignDirectionItemHandler } from '../../../../../../../lib/server/design-direction-api'
import { createDesignDirectionRouteDependencies } from '../../../../../../../lib/server/design-direction-route-dependencies'

function handlers() {
  return createDesignDirectionItemHandler(createDesignDirectionRouteDependencies())
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  return handlers().GET(request, context)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  return handlers().DELETE(request, context)
}
