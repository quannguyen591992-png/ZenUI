import { generationJobSchema, type GenerationJob } from '@zenui/ai-core'
import { assetJobSchema, type AssetJob } from '@zenui/asset-core'
import {
  deploymentJobSchema,
  type DeploymentJob,
} from '@zenui/deployment-core'
import { exportJobSchema, type ExportJob } from '@zenui/export-core'
import { z } from 'zod'

import type { QueueRecoveryAction } from '@zenui/database'

const recoveryPolicySchema = z.object({
  intervalSeconds: z.number().int().min(5).max(3600),
  staleQueuedSeconds: z.number().int().min(30).max(86_400),
  batchSize: z.number().int().min(1).max(500),
  maxAttempts: z.number().int().min(1).max(10),
}).strict()

export type RecoveryPolicy = z.infer<typeof recoveryPolicySchema>

interface RecoveryRepository {
  recover(input: {
    now: Date
    staleQueuedBefore: Date
    batchSize: number
    maxAttempts: number
  }): Promise<QueueRecoveryAction[]>
}

interface JobQueue<T> {
  enqueue(job: T): Promise<void>
}

interface RecoveryQueues {
  asset: JobQueue<AssetJob>
  generation: JobQueue<GenerationJob>
  export: JobQueue<ExportJob>
  deployment: JobQueue<DeploymentJob>
  reconciliation: JobQueue<DeploymentJob>
}

function metadataJob(action: QueueRecoveryAction) {
  const base = {
    projectId: action.projectId,
    workspaceId: action.workspaceId,
    userId: action.userId,
  }
  switch (action.kind) {
    case 'asset': return assetJobSchema.parse({ ...base, assetId: action.id })
    case 'generation': return generationJobSchema.parse({ ...base, generationRunId: action.id })
    case 'export': return exportJobSchema.parse({ ...base, exportRunId: action.id })
    case 'deployment': return deploymentJobSchema.parse({ ...base, deploymentId: action.id })
  }
}

export function createRecoverySweep(dependencies: {
  repository: RecoveryRepository
  queues: RecoveryQueues
  policy: RecoveryPolicy
  now?: () => Date
}) {
  const policy = recoveryPolicySchema.safeParse(dependencies.policy)
  if (!policy.success) throw new Error('invalid_recovery_policy')
  const now = dependencies.now ?? (() => new Date())

  return async function sweep(): Promise<{ scanned: number; enqueued: number; failed: number }> {
    const timestamp = now()
    const actions = await dependencies.repository.recover({
      now: timestamp,
      staleQueuedBefore: new Date(timestamp.getTime() - policy.data.staleQueuedSeconds * 1_000),
      batchSize: policy.data.batchSize,
      maxAttempts: policy.data.maxAttempts,
    })
    let enqueued = 0
    let failed = actions.filter(action => action.action === 'failed').length
    for (const action of actions) {
      if (action.action === 'failed') continue
      const job = metadataJob(action)
      try {
        if (action.action === 'reconcile') {
          await dependencies.queues.reconciliation.enqueue(job as DeploymentJob)
        } else {
          await dependencies.queues[action.kind].enqueue(job as never)
        }
        enqueued += 1
      } catch {
        failed += 1
      }
    }
    return { scanned: actions.length, enqueued, failed }
  }
}
