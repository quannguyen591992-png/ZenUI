import { createBrandKitHandlers } from '../../../../../../lib/server/brand-kit-api'
import { createBrandKitRouteDependencies } from '../../../../../../lib/server/brand-kit-route-dependencies'

export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return createBrandKitHandlers(createBrandKitRouteDependencies()).GET(request, context)
}

export async function PUT(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  return createBrandKitHandlers(createBrandKitRouteDependencies()).PUT(request, context)
}
