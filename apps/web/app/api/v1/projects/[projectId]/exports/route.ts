import { createExportHandlers } from '../../../../../../lib/server/export-api'
import { createExportRouteDependencies } from '../../../../../../lib/server/export-route-dependencies'

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createExportHandlers(createExportRouteDependencies()).POST(request, context)
}
