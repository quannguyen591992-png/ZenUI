import { createProposalCollectionHandlers } from '../../../../../../lib/server/proposal-api'
import { createProposalRouteDependencies } from '../../../../../../lib/server/proposal-route-dependencies'

function handlers() {
  return createProposalCollectionHandlers(createProposalRouteDependencies())
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handlers().GET(request, context)
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return handlers().POST(request, context)
}
