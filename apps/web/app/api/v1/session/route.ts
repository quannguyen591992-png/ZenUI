import { createSessionContextHandler } from '../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../lib/server/project-route-dependencies'

export async function GET() {
  return createSessionContextHandler(createRouteDependencies())()
}
