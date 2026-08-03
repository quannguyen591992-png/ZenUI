import { createRevisionRestoreHandler } from '../../../../../../../../lib/server/project-api'
import { createRouteDependencies } from '../../../../../../../../lib/server/project-route-dependencies'

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; revisionId: string }> },
) {
  return createRevisionRestoreHandler(createRouteDependencies())(request, context)
}
