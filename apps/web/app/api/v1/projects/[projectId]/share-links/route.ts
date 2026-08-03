import { createShareHandlers } from '../../../../../../lib/server/share-api'
import { createShareRouteDependencies } from '../../../../../../lib/server/share-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createShareHandlers(createShareRouteDependencies()).GET(request, context)
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createShareHandlers(createShareRouteDependencies()).POST(request, context)
}
