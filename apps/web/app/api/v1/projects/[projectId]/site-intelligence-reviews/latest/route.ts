import { createSiteIntelligenceLatestHandler } from '../../../../../../../lib/server/site-intelligence-api'
import { createSiteIntelligenceRouteDependencies } from '../../../../../../../lib/server/site-intelligence-route-dependencies'

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createSiteIntelligenceLatestHandler(createSiteIntelligenceRouteDependencies())(request, context)
}
