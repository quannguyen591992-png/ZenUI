import { createDeploymentRepository } from '@zenui/database'
import { DEPLOYMENT_CONTENT_TYPE, deploymentJobSchema } from '@zenui/deployment-core'
import { createRemoteImagePolicy } from '@zenui/design-schema'
import { createDeterministicSiteArchive } from '@zenui/export-core'
import { compileStaticSite } from '@zenui/html-compiler'

import type * as schema from '@zenui/database/schema'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

const artifacts = new Map<string, Uint8Array>()

export function getE2eDeploymentArtifact(deploymentId: string): Uint8Array | null {
  return artifacts.get(deploymentId) ?? null
}

export function createE2eDeploymentQueue(database: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const deployments = createDeploymentRepository(database)
  const imagePolicy = createRemoteImagePolicy(process.env.REMOTE_IMAGE_HOST_ALLOWLIST ?? '')
  const assetOrigin = new URL(process.env.ASSET_ORIGIN ?? 'http://127.0.0.1:3002').origin
  return {
    enqueue(jobInput: unknown): Promise<void> {
      const job = deploymentJobSchema.parse(jobInput)
      queueMicrotask(() => {
        void (async () => {
          const context = { userId: job.userId, workspaceId: job.workspaceId }
          const input = await deployments.getWorkerInput(context, job.deploymentId)
          if (!input || !await deployments.claimUploading(context, job.deploymentId)) return
          const compiled = compileStaticSite(input.document, { imagePolicy, assetOrigin })
          if (!compiled.success) {
            await deployments.fail(context, job.deploymentId, compiled.code === 'artifact_too_large' ? compiled.code : 'invalid_artifact')
            return
          }
          let bundle: ReturnType<typeof createDeterministicSiteArchive>
          try {
            bundle = createDeterministicSiteArchive(compiled.files.map(file => ({ path: file.path, content: file.html })))
          } catch (error) {
            await deployments.fail(context, job.deploymentId, error instanceof Error && error.message === 'archive_too_large'
              ? 'artifact_too_large'
              : 'invalid_artifact')
            return
          }
          artifacts.set(job.deploymentId, bundle.content)
          const projectName = `zenui-${job.projectId.replaceAll('-', '').slice(0, 16)}`
          const building = await deployments.recordArtifact(context, job.deploymentId, {
            artifactKey: `deployments/${job.workspaceId}/${job.projectId}/${job.deploymentId}/site.bundle`,
            checksum: bundle.checksum,
            bytes: bundle.bytes,
            contentType: DEPLOYMENT_CONTENT_TYPE,
            providerProjectName: projectName,
            providerDeploymentId: `dpl_${job.deploymentId.replaceAll('-', '')}`,
          })
          if (building) await deployments.completeReady(context, job.deploymentId, `https://${projectName}.vercel.app`)
        })()
      })
      return Promise.resolve()
    },
  }
}
