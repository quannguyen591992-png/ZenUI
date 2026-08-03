import { DEPLOYMENT_CONTENT_TYPE } from '@zenui/deployment-core'

import { getE2eDeploymentArtifact } from '../../../../../lib/server/e2e-deployment-runtime'
import { isE2eRuntimeEnabled } from '../../../../../lib/server/e2e-runtime'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ deploymentId: string }> }) {
  if (!isE2eRuntimeEnabled()) return new Response('Not found', { status: 404 })
  const { deploymentId } = await context.params
  const artifact = getE2eDeploymentArtifact(deploymentId)
  if (!artifact) return new Response('Not found', { status: 404 })
  const body = artifact.buffer.slice(artifact.byteOffset, artifact.byteOffset + artifact.byteLength) as ArrayBuffer
  return new Response(body, {
    headers: {
      'content-type': DEPLOYMENT_CONTENT_TYPE,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
