import { createProjectRevisionHandlers } from '../../../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../../../lib/server/project-route-dependencies'

type Context = { params: Promise<{ projectId: string }> }

function handlers() {
  return createProjectRevisionHandlers(createRouteDependencies())
}

export async function GET(request: Request, context: Context) {
  return handlers().GET(request, context)
}

export async function POST(request: Request, context: Context) {
  return handlers().POST(request, context)
}
