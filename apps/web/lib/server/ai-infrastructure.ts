import { createHmac, randomBytes } from 'node:crypto'

import type { AdmissionResultAccepted, AdmissionResultRejected } from './generation-api'
import type { DesignDirectionJob, GenerationJob } from '@zenui/ai-core'
import type { AssetJob } from '@zenui/asset-core'
import type { DeploymentJob } from '@zenui/deployment-core'
import type { ExportJob } from '@zenui/export-core'

export interface RedisEvalClient {
  eval(script: string, numberOfKeys: number, ...values: string[]): Promise<unknown>
}

interface AdmissionLimits {
  userRunsPerMinute: number
  workspaceRunsPerMinute: number
  workspaceDailyTokens: number
}

const admissionScript = `
local user_key = KEYS[1]
local workspace_key = KEYS[2]
local budget_key = KEYS[3]
local user_limit = tonumber(ARGV[1])
local workspace_limit = tonumber(ARGV[2])
local budget_limit = tonumber(ARGV[3])
local reserved = tonumber(ARGV[4])
local rate_ttl = tonumber(ARGV[5])
local budget_ttl = tonumber(ARGV[6])

local user_count = tonumber(redis.call('GET', user_key) or '0')
local workspace_count = tonumber(redis.call('GET', workspace_key) or '0')
local used_tokens = tonumber(redis.call('GET', budget_key) or '0')

if user_count >= user_limit or workspace_count >= workspace_limit then
  return {0, math.max(redis.call('TTL', user_key), redis.call('TTL', workspace_key), 1), 'rate'}
end
if used_tokens + reserved > budget_limit then
  return {0, math.max(redis.call('TTL', budget_key), 1), 'budget'}
end

redis.call('INCR', user_key)
redis.call('EXPIRE', user_key, rate_ttl)
redis.call('INCR', workspace_key)
redis.call('EXPIRE', workspace_key, rate_ttl)
redis.call('INCRBY', budget_key, reserved)
redis.call('EXPIRE', budget_key, budget_ttl)
return {1, 0, 'accepted'}
`

export function createRedisAdmissionGate(redis: RedisEvalClient, limits: AdmissionLimits) {
  return {
    async acquire(input: {
      userId: string
      workspaceId: string
      reservedTokens: number
    }): Promise<AdmissionResultAccepted | AdmissionResultRejected> {
      const result = await redis.eval(
        admissionScript,
        3,
        `zenui:ai:rate:user:${input.userId}`,
        `zenui:ai:rate:workspace:${input.workspaceId}`,
        `zenui:ai:budget:workspace:${input.workspaceId}`,
        String(limits.userRunsPerMinute),
        String(limits.workspaceRunsPerMinute),
        String(limits.workspaceDailyTokens),
        String(input.reservedTokens),
        '60',
        '86400',
      )
      if (!Array.isArray(result) || Number(result[0]) !== 1) {
        const reason = Array.isArray(result) ? String(result[2] ?? 'rate') : 'rate'
        return {
          accepted: false,
          code: reason === 'budget' ? 'ai_budget_exceeded' : 'ai_rate_limit_exceeded',
          retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60),
        }
      }
      return { accepted: true }
    },
  }
}

interface QueueLike<T> {
  add(name: string, data: T, options: Record<string, unknown>): Promise<unknown>
}

export function createRedisGenerationQueue(
  queue: QueueLike<GenerationJob>,
  options: { attempts?: number } = {},
) {
  return {
    async enqueue(job: GenerationJob): Promise<void> {
      await queue.add('generate', job, {
        jobId: job.generationRunId,
        attempts: options.attempts ?? 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      })
    },
  }
}

export function createRedisDesignDirectionQueue(queue: QueueLike<DesignDirectionJob>) {
  return {
    async enqueue(job: DesignDirectionJob): Promise<void> {
      await queue.add('prepare-directions', job, {
        jobId: job.designDirectionRunId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      })
    },
  }
}

const exportAdmissionScript = `
local user_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local workspace_count = tonumber(redis.call('GET', KEYS[2]) or '0')
if user_count >= tonumber(ARGV[1]) or workspace_count >= tonumber(ARGV[2]) then
  return {0, math.max(redis.call('TTL', KEYS[1]), redis.call('TTL', KEYS[2]), 1)}
end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 60)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 60)
return {1, 0}
`

export function createRedisAssetAdmissionGate(
  redis: RedisEvalClient,
  limits: { userRunsPerMinute: number; workspaceRunsPerMinute: number },
) {
  return {
    async acquire(input: { userId: string; workspaceId: string }) {
      const result = await redis.eval(
        exportAdmissionScript,
        2,
        `zenui:asset:rate:user:${input.userId}`,
        `zenui:asset:rate:workspace:${input.workspaceId}`,
        String(limits.userRunsPerMinute),
        String(limits.workspaceRunsPerMinute),
      )
      return Array.isArray(result) && Number(result[0]) === 1
        ? { accepted: true as const }
        : { accepted: false as const, retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60) }
    },
  }
}

export function createRedisAssetQueue(queue: QueueLike<AssetJob>) {
  return {
    async enqueue(job: AssetJob): Promise<void> {
      await queue.add('process-asset', job, {
        jobId: job.assetId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      })
    },
  }
}

export function createRedisExportAdmissionGate(
  redis: RedisEvalClient,
  limits: { userRunsPerMinute: number; workspaceRunsPerMinute: number },
) {
  return {
    async acquire(input: { userId: string; workspaceId: string }) {
      const result = await redis.eval(
        exportAdmissionScript,
        2,
        `zenui:export:rate:user:${input.userId}`,
        `zenui:export:rate:workspace:${input.workspaceId}`,
        String(limits.userRunsPerMinute),
        String(limits.workspaceRunsPerMinute),
      )
      return Array.isArray(result) && Number(result[0]) === 1
        ? { accepted: true as const }
        : { accepted: false as const, retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60) }
    },
  }
}

export function createRedisShareAdmissionGate(
  redis: RedisEvalClient,
  limits: { userRunsPerMinute: number; workspaceRunsPerMinute: number },
) {
  return {
    async acquire(input: { userId: string; workspaceId: string }) {
      const result = await redis.eval(
        exportAdmissionScript,
        2,
        `zenui:share:manage:user:${input.userId}`,
        `zenui:share:manage:workspace:${input.workspaceId}`,
        String(limits.userRunsPerMinute),
        String(limits.workspaceRunsPerMinute),
      )
      return Array.isArray(result) && Number(result[0]) === 1
        ? { accepted: true as const }
        : { accepted: false as const, retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60) }
    },
  }
}

function keyedHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

export function createRedisPublicShareAdmissionGate(
  redis: RedisEvalClient,
  limits: { viewerViewsPerMinute: number; linkViewsPerMinute: number },
  hashingSecret: string,
) {
  return {
    async acquire(input: { slug: string; fingerprint: string }) {
      const result = await redis.eval(
        exportAdmissionScript,
        2,
        `zenui:share:view:viewer:${keyedHash(input.fingerprint, hashingSecret)}`,
        `zenui:share:view:link:${keyedHash(input.slug, hashingSecret)}`,
        String(limits.viewerViewsPerMinute),
        String(limits.linkViewsPerMinute),
      )
      return Array.isArray(result) && Number(result[0]) === 1
        ? { accepted: true as const }
        : { accepted: false as const, retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60) }
    },
  }
}

const leadAdmissionReserveScript = `
local ip_publication_count = tonumber(redis.call('HGET', KEYS[1], 'count') or '0')
local publication_count = tonumber(redis.call('HGET', KEYS[2], 'count') or '0')
local has_ip_reservation = redis.call('HEXISTS', KEYS[1], ARGV[5])
local has_publication_reservation = redis.call('HEXISTS', KEYS[2], ARGV[6])
if has_ip_reservation == 1 and has_publication_reservation == 1 then
  return {1, 0}
end
if has_ip_reservation == 1 or has_publication_reservation == 1 then
  return {0, math.max(redis.call('TTL', KEYS[1]), redis.call('TTL', KEYS[2]), 1)}
end
if ip_publication_count >= tonumber(ARGV[1]) or publication_count >= tonumber(ARGV[3]) then
  return {0, math.max(redis.call('TTL', KEYS[1]), redis.call('TTL', KEYS[2]), 1)}
end
redis.call('HSETNX', KEYS[1], ARGV[5], '1')
redis.call('HINCRBY', KEYS[1], 'count', 1)
if ip_publication_count == 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
redis.call('HSETNX', KEYS[2], ARGV[6], '1')
redis.call('HINCRBY', KEYS[2], 'count', 1)
if publication_count == 0 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
end
return {1, 0}
`

const leadAdmissionReleaseScript = `
if redis.call('HDEL', KEYS[1], ARGV[1]) == 1 then
  local count = redis.call('HINCRBY', KEYS[1], 'count', -1)
  if count <= 0 then redis.call('DEL', KEYS[1]) end
end
if redis.call('HDEL', KEYS[2], ARGV[2]) == 1 then
  local count = redis.call('HINCRBY', KEYS[2], 'count', -1)
  if count <= 0 then redis.call('DEL', KEYS[2]) end
end
return {1, 1}
`

interface LeadAdmissionDigestor {
  digest(
    purpose: 'ip-publication-admission' | 'publication-admission' | 'potential-duplicate',
    value: string,
  ): string
}

export function createRedisLeadAdmissionGate(
  redis: RedisEvalClient,
  limits: {
    ipPublicationRunsPerWindow: number
    ipPublicationWindowSeconds: number
    publicationRunsPerWindow: number
    publicationWindowSeconds: number
  },
  digestor: LeadAdmissionDigestor,
) {
  const keys = (input: { publicationId: string; fingerprint: string }) => [
    `zenui:lead:admission:ip-publication:${digestor.digest(
      'ip-publication-admission',
      `${input.fingerprint}\0${input.publicationId}`,
    )}`,
    `zenui:lead:admission:publication:${digestor.digest(
      'publication-admission',
      input.publicationId,
    )}`,
  ] as const
  const reservationDigests = (input: {
    publicationId: string
    fingerprint: string
    reservationId: string
  }) => [
    digestor.digest(
      'ip-publication-admission',
      `${input.reservationId}\0${input.fingerprint}\0${input.publicationId}`,
    ),
    digestor.digest(
      'publication-admission',
      `${input.reservationId}\0${input.publicationId}`,
    ),
  ] as const
  const fallbackRetryAfter = Math.max(1, limits.publicationWindowSeconds)

  return {
    async acquire(input: { publicationId: string; fingerprint: string; reservationId: string }) {
      const result = await redis.eval(
        leadAdmissionReserveScript,
        2,
        ...keys(input),
        String(limits.ipPublicationRunsPerWindow),
        String(limits.ipPublicationWindowSeconds),
        String(limits.publicationRunsPerWindow),
        String(limits.publicationWindowSeconds),
        ...reservationDigests(input),
      )
      if (Array.isArray(result) && Number(result[0]) === 1) return { accepted: true as const }
      const retryAfter = Number(Array.isArray(result) ? result[1] : fallbackRetryAfter)
      return {
        accepted: false as const,
        retryAfterSeconds: Math.min(
          fallbackRetryAfter,
          Math.max(1, Number.isFinite(retryAfter) ? retryAfter : fallbackRetryAfter),
        ),
      }
    },

    async release(input: {
      publicationId: string
      fingerprint: string
      reservationId: string
    }): Promise<void> {
      await redis.eval(
        leadAdmissionReleaseScript,
        2,
        ...keys(input),
        ...reservationDigests(input),
      )
    },
  }
}

interface ExportQueueLike {
  add(name: string, data: ExportJob, options: Record<string, unknown>): Promise<unknown>
}

export function createRedisExportQueue(queue: ExportQueueLike) {
  return {
    async enqueue(job: ExportJob): Promise<void> {
      await queue.add('export', job, {
        jobId: job.exportRunId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      })
    },
  }
}

export function createRedisDeploymentAdmissionGate(
  redis: RedisEvalClient,
  limits: { userRunsPerMinute: number; workspaceRunsPerMinute: number },
) {
  return {
    async acquire(input: { userId: string; workspaceId: string }) {
      const result = await redis.eval(
        exportAdmissionScript,
        2,
        `zenui:deploy:rate:user:${input.userId}`,
        `zenui:deploy:rate:workspace:${input.workspaceId}`,
        String(limits.userRunsPerMinute),
        String(limits.workspaceRunsPerMinute),
      )
      return Array.isArray(result) && Number(result[0]) === 1
        ? { accepted: true as const }
        : { accepted: false as const, retryAfterSeconds: Math.max(1, Number(Array.isArray(result) ? result[1] : 60) || 60) }
    },
  }
}

interface DeploymentQueueLike {
  add(name: string, data: DeploymentJob, options: Record<string, unknown>): Promise<unknown>
}

export function createRedisDeploymentQueue(queue: DeploymentQueueLike) {
  return {
    async enqueue(job: DeploymentJob): Promise<void> {
      await queue.add('deploy', job, {
        jobId: job.deploymentId,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 500,
      })
    },
  }
}

const oauthStateCreateScript = `
if redis.call('EXISTS', KEYS[1]) == 1 then return nil end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 'created'
`

const oauthStateConsumeScript = `
local value = redis.call('GET', KEYS[1])
if not value then return nil end
redis.call('DEL', KEYS[1])
return value
`

const oauthStateRecordSchema = {
  parse(value: string): { userId: string; workspaceId: string; returnPath: string } | null {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      return typeof parsed.userId === 'string'
        && typeof parsed.workspaceId === 'string'
        && typeof parsed.returnPath === 'string'
        && /^\/projects\/[0-9a-f-]{36}$/.test(parsed.returnPath)
        ? { userId: parsed.userId, workspaceId: parsed.workspaceId, returnPath: parsed.returnPath }
        : null
    } catch {
      return null
    }
  },
}

export function createRedisOAuthStateStore(redis: RedisEvalClient, hashingSecret: string) {
  const key = (state: string) => `zenui:oauth:vercel:state:${keyedHash(state, hashingSecret)}`
  return {
    async create(record: { userId: string; workspaceId: string; returnPath: string }): Promise<string> {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const state = randomBytes(32).toString('base64url')
        const result = await redis.eval(oauthStateCreateScript, 1, key(state), JSON.stringify(record), '600')
        if (result === 'created') return state
      }
      throw new Error('oauth_state_unavailable')
    },

    async consume(state: string): Promise<{ userId: string; workspaceId: string; returnPath: string } | null> {
      if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null
      const result = await redis.eval(oauthStateConsumeScript, 1, key(state))
      return typeof result === 'string' ? oauthStateRecordSchema.parse(result) : null
    },
  }
}
