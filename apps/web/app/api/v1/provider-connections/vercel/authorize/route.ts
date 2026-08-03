import { createProviderConnectionHandlers } from '../../../../../../lib/server/provider-connection-api'
import { createProviderConnectionRouteDependencies } from '../../../../../../lib/server/provider-connection-route-dependencies'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return createProviderConnectionHandlers(createProviderConnectionRouteDependencies()).AUTHORIZE(request)
}
