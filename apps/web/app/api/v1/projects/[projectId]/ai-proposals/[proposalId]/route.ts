import { createProposalItemHandler } from '../../../../../../../lib/server/proposal-api'
import { createProposalRouteDependencies } from '../../../../../../../lib/server/proposal-route-dependencies'

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; proposalId: string }> },
) {
  return createProposalItemHandler(createProposalRouteDependencies())(request, context)
}
