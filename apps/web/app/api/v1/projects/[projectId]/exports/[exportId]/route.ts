import { createExportHandlers } from '../../../../../../../lib/server/export-api'
import { createExportRouteDependencies } from '../../../../../../../lib/server/export-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; exportId: string }> },
) {
  return createExportHandlers(createExportRouteDependencies()).GET_ITEM(request, context)
}
