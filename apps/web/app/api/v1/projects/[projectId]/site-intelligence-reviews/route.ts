import { createSiteIntelligenceReviewCollectionHandler } from '../../../../../../lib/server/site-intelligence-api'
import { createSiteIntelligenceRouteDependencies } from '../../../../../../lib/server/site-intelligence-route-dependencies'

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return createSiteIntelligenceReviewCollectionHandler(createSiteIntelligenceRouteDependencies()).POST(request, context)
}
