import { createSiteIntelligenceFindingActionHandler } from '../../../../../../../../lib/server/site-intelligence-api'
import { createSiteIntelligenceRouteDependencies } from '../../../../../../../../lib/server/site-intelligence-route-dependencies'

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; fingerprint: string }> },
) {
  return createSiteIntelligenceFindingActionHandler(createSiteIntelligenceRouteDependencies(), 'dismiss')(request, context)
}
