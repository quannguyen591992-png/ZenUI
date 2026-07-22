import { createProjectItemHandlers } from '../../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../../lib/server/project-route-dependencies'

type Context = { params: Promise<{ projectId: string }> }

function handlers() {
  return createProjectItemHandlers(createRouteDependencies())
}

export async function GET(request: Request, context: Context) {
  return handlers().GET(request, context)
}

export async function PATCH(request: Request, context: Context) {
  return handlers().PATCH(request, context)
}

export async function DELETE(request: Request, context: Context) {
  return handlers().DELETE(request, context)
}
