import { redirect } from 'next/navigation'

import { isE2eRuntimeEnabled } from '../../../lib/server/e2e-runtime'
import { validatePreviewOrigin } from '../../../lib/server/preview-config'
import { validateAssetOrigin } from '../../../lib/server/public-asset-api'
import { getRuntimeSession } from '../../../lib/server/runtime-session'

import { ProjectEditor } from './project-editor'

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!await getRuntimeSession()) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/projects/${projectId}`)}`)
  }

  const appOrigin = process.env.APP_ORIGIN
  const previewOrigin = process.env.PREVIEW_ORIGIN
  const assetOrigin = process.env.ASSET_ORIGIN
  const remoteImageHostAllowlist = process.env.REMOTE_IMAGE_HOST_ALLOWLIST
  if (!appOrigin || !previewOrigin || !assetOrigin || !remoteImageHostAllowlist) {
    throw new Error('APP_ORIGIN, PREVIEW_ORIGIN, ASSET_ORIGIN and REMOTE_IMAGE_HOST_ALLOWLIST are required')
  }
  return (
    <ProjectEditor
      projectId={projectId}
      editorOrigin={new URL(appOrigin).origin}
      previewOrigin={validatePreviewOrigin(previewOrigin, appOrigin)}
      assetOrigin={validateAssetOrigin(assetOrigin, appOrigin)}
      remoteImageHostAllowlist={remoteImageHostAllowlist}
      deploymentEnabled={isE2eRuntimeEnabled() || process.env.VERCEL_DEPLOYMENT_ENABLED === 'true'}
    />
  )
}
