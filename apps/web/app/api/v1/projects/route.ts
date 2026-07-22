import { createProjectCollectionHandlers } from '../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../lib/server/project-route-dependencies'

function handlers() {
  return createProjectCollectionHandlers(createRouteDependencies())
}

export async function GET(request: Request) {
  return handlers().GET(request)
}

export async function POST(request: Request) {
  return handlers().POST(request)
}
