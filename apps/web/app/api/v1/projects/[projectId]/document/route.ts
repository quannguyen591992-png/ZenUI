import { createProjectDocumentHandler } from '../../../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../../../lib/server/project-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return createProjectDocumentHandler(createRouteDependencies())(request, context)
}
