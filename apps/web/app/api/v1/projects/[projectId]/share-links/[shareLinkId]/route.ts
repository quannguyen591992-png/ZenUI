import { createShareHandlers } from '../../../../../../../lib/server/share-api'
import { createShareRouteDependencies } from '../../../../../../../lib/server/share-route-dependencies'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; shareLinkId: string }> },
) {
  return createShareHandlers(createShareRouteDependencies()).DELETE(request, context)
}
