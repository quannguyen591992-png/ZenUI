import { createProposalActionHandler } from '../../../../../../../../lib/server/proposal-api'
import { createProposalRouteDependencies } from '../../../../../../../../lib/server/proposal-route-dependencies'

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; proposalId: string }> },
) {
  return createProposalActionHandler(createProposalRouteDependencies(), 'accept')(request, context)
}
