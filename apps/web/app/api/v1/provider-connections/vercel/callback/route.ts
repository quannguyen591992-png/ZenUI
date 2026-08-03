import { createProviderConnectionHandlers } from '../../../../../../lib/server/provider-connection-api'
import { createProviderConnectionRouteDependencies } from '../../../../../../lib/server/provider-connection-route-dependencies'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return createProviderConnectionHandlers(createProviderConnectionRouteDependencies()).CALLBACK(request)
}
