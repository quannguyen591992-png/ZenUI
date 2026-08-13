import { z } from 'zod'

const leadRetentionPolicySchema = z.object({
  intervalSeconds: z.number().int().min(60).max(86_400),
  batchSize: z.number().int().min(1).max(500),
}).strict()

export type LeadRetentionPolicy = z.infer<
  typeof leadRetentionPolicySchema
>

interface LeadRetentionRepository {
  purgeExpired(input: {
    now: Date
    batchSize: number
  }): Promise<{ scanned: number; deleted: number }>
}

interface RetentionTimer {
  unref(): void
}

interface RetentionTimers {
  setInterval(
    callback: () => void,
    milliseconds: number,
  ): RetentionTimer
  clearInterval(timer: RetentionTimer): void
}

export function startLeadRetentionMaintenance(dependencies: {
  repository: LeadRetentionRepository
  policy: LeadRetentionPolicy
  now?: () => Date
  timers?: RetentionTimers
  onFailure: () => void
}) {
  const policy = leadRetentionPolicySchema.safeParse(
    dependencies.policy,
  )
  if (!policy.success) {
    throw new Error('invalid_lead_retention_policy')
  }
  const now = dependencies.now ?? (() => new Date())
  const timers = dependencies.timers ?? {
    setInterval: (callback, milliseconds) => (
      globalThis.setInterval(callback, milliseconds)
    ),
    clearInterval: timer => globalThis.clearInterval(
      timer as ReturnType<typeof globalThis.setInterval>,
    ),
  }
  let activeSweep: Promise<void> | null = null

  const run = (): void => {
    if (activeSweep) return
    activeSweep = dependencies.repository.purgeExpired({
      now: now(),
      batchSize: policy.data.batchSize,
    }).then(
      () => undefined,
      () => dependencies.onFailure(),
    ).finally(() => {
      activeSweep = null
    })
  }

  const timer = timers.setInterval(
    run,
    policy.data.intervalSeconds * 1_000,
  )
  timer.unref()

  return {
    close(): void {
      timers.clearInterval(timer)
    },
    async whenIdle(): Promise<void> {
      await activeSweep
    },
  }
}
