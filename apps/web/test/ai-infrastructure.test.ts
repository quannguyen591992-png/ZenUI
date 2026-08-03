import { describe, expect, it } from 'vitest'

import {
  createRedisAdmissionGate,
  createRedisDeploymentAdmissionGate,
  createRedisDeploymentQueue,
  createRedisOAuthStateStore,
  createRedisExportAdmissionGate,
  createRedisExportQueue,
  createRedisGenerationQueue,
  createRedisPublicShareAdmissionGate,
  createRedisShareAdmissionGate,
} from '../lib/server/ai-infrastructure'

const userId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'

class FakeRedis {
  calls: { script: string; keys: string[]; args: string[] }[] = []
  result: unknown = [1, 0]
  eval(script: string, keys: number, ...values: string[]): Promise<unknown> {
    this.calls.push({ script, keys: values.slice(0, keys), args: values.slice(keys) })
    return Promise.resolve(this.result)
  }
}

describe('AI Redis infrastructure', () => {
  it('uses one atomic admission script with scoped TTL keys', async () => {
    const redis = new FakeRedis()
    const gate = createRedisAdmissionGate(redis, {
      userRunsPerMinute: 4,
      workspaceRunsPerMinute: 20,
      workspaceDailyTokens: 100_000,
    })

    await expect(gate.acquire({ userId, workspaceId, reservedTokens: 16_384 })).resolves.toEqual({ accepted: true })
    expect(redis.calls).toHaveLength(1)
    expect(redis.calls[0]?.keys).toEqual([
      `zenui:ai:rate:user:${userId}`,
      `zenui:ai:rate:workspace:${workspaceId}`,
      `zenui:ai:budget:workspace:${workspaceId}`,
    ])
    expect(redis.calls[0]?.script).toContain('EXPIRE')
    expect(redis.calls[0]?.script).not.toContain('KEYS *')
  })

  it('maps rate and budget denial to stable retry metadata', async () => {
    const redis = new FakeRedis()
    const gate = createRedisAdmissionGate(redis, {
      userRunsPerMinute: 4, workspaceRunsPerMinute: 20, workspaceDailyTokens: 100_000,
    })
    redis.result = [0, 37, 'rate']
    await expect(gate.acquire({ userId, workspaceId, reservedTokens: 10 })).resolves.toEqual({
      accepted: false, code: 'ai_rate_limit_exceeded', retryAfterSeconds: 37,
    })
    redis.result = [0, 300, 'budget']
    await expect(gate.acquire({ userId, workspaceId, reservedTokens: 10 })).resolves.toEqual({
      accepted: false, code: 'ai_budget_exceeded', retryAfterSeconds: 300,
    })
    redis.result = 'malformed'
    await expect(gate.acquire({ userId, workspaceId, reservedTokens: 10 })).resolves.toEqual({
      accepted: false, code: 'ai_rate_limit_exceeded', retryAfterSeconds: 60,
    })
    redis.result = [0, 0]
    await expect(gate.acquire({ userId, workspaceId, reservedTokens: 10 })).resolves.toEqual({
      accepted: false, code: 'ai_rate_limit_exceeded', retryAfterSeconds: 60,
    })
  })

  it('uses scoped export rate limits and idempotent metadata-only jobs', async () => {
    const redis = new FakeRedis()
    const gate = createRedisExportAdmissionGate(redis, { userRunsPerMinute: 10, workspaceRunsPerMinute: 50 })
    await expect(gate.acquire({ userId, workspaceId })).resolves.toEqual({ accepted: true })
    expect(redis.calls[0]?.keys).toEqual([
      `zenui:export:rate:user:${userId}`,
      `zenui:export:rate:workspace:${workspaceId}`,
    ])
    redis.result = [0, 19]
    await expect(gate.acquire({ userId, workspaceId })).resolves.toEqual({ accepted: false, retryAfterSeconds: 19 })
    redis.result = 'malformed'
    await expect(gate.acquire({ userId, workspaceId })).resolves.toEqual({ accepted: false, retryAfterSeconds: 60 })

    const additions: unknown[][] = []
    const queue = createRedisExportQueue({
      add: (...args: unknown[]) => { additions.push(args); return Promise.resolve() },
    })
    const job = {
      exportRunId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
      workspaceId,
      userId,
    }
    await queue.enqueue(job)
    expect(additions).toEqual([[
      'export', job,
      expect.objectContaining({
        jobId: job.exportRunId, attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100, removeOnFail: 500,
      }),
    ]])
  })

  it('uses scoped management and hashed public share rate limits', async () => {
    const redis = new FakeRedis()
    const management = createRedisShareAdmissionGate(redis, { userRunsPerMinute: 10, workspaceRunsPerMinute: 50 })
    await expect(management.acquire({ userId, workspaceId })).resolves.toEqual({ accepted: true })
    expect(redis.calls[0]?.keys).toEqual([
      `zenui:share:manage:user:${userId}`,
      `zenui:share:manage:workspace:${workspaceId}`,
    ])

    const publicGate = createRedisPublicShareAdmissionGate(redis, { viewerViewsPerMinute: 60, linkViewsPerMinute: 600 }, 'hashing-secret')
    await expect(publicGate.acquire({ slug: 'A'.repeat(32), fingerprint: '203.0.113.1' })).resolves.toEqual({ accepted: true })
    expect(redis.calls[1]?.keys).toHaveLength(2)
    expect(redis.calls[1]?.keys.join(':')).not.toContain('A'.repeat(32))
    expect(redis.calls[1]?.keys.join(':')).not.toContain('203.0.113.1')
    redis.result = [0, 17]
    await expect(publicGate.acquire({ slug: 'A'.repeat(32), fingerprint: '203.0.113.1' })).resolves.toEqual({
      accepted: false, retryAfterSeconds: 17,
    })
  })

  it('uses scoped deploy admission, metadata-only queue jobs and one-time hashed OAuth states', async () => {
    const redis = new FakeRedis()
    const gate = createRedisDeploymentAdmissionGate(redis, { userRunsPerMinute: 5, workspaceRunsPerMinute: 20 })
    await expect(gate.acquire({ userId, workspaceId })).resolves.toEqual({ accepted: true })
    expect(redis.calls[0]?.keys).toEqual([
      `zenui:deploy:rate:user:${userId}`,
      `zenui:deploy:rate:workspace:${workspaceId}`,
    ])

    const additions: unknown[][] = []
    const deploymentQueue = createRedisDeploymentQueue({
      add: (...args: unknown[]) => { additions.push(args); return Promise.resolve() },
    })
    const deploymentJob = {
      deploymentId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
      workspaceId,
      userId,
    }
    await deploymentQueue.enqueue(deploymentJob)
    expect(additions).toEqual([[
      'deploy', deploymentJob,
      expect.objectContaining({ jobId: deploymentJob.deploymentId, attempts: 1 }),
    ]])

    const states = createRedisOAuthStateStore(redis, 'oauth-hashing-secret')
    redis.result = 'created'
    const state = await states.create({ userId, workspaceId, returnPath: `/projects/${deploymentJob.projectId}` })
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(redis.calls[1]?.keys[0]).not.toContain(state)
    expect(redis.calls[1]?.script).toContain('SET')
    expect(redis.calls[1]?.args).toContain('600')

    redis.result = JSON.stringify({ userId, workspaceId, returnPath: `/projects/${deploymentJob.projectId}` })
    await expect(states.consume(state)).resolves.toEqual({ userId, workspaceId, returnPath: `/projects/${deploymentJob.projectId}` })
    expect(redis.calls[2]?.script).toContain('DEL')
    redis.result = null
    await expect(states.consume(state)).resolves.toBeNull()
  })

  it('adds idempotent metadata-only generation jobs with configurable attempts without retaining prompts', async () => {
    const additions: unknown[][] = []
    const queue = createRedisGenerationQueue({
      add: (...args: unknown[]) => { additions.push(args); return Promise.resolve() },
    }, { attempts: 1 })
    const job = {
      generationRunId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
      workspaceId,
      userId,
    }

    await queue.enqueue(job)

    expect(additions).toEqual([[
      'generate',
      job,
      expect.objectContaining({
        jobId: job.generationRunId, attempts: 1,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 100, removeOnFail: 500,
      }),
    ]])
  })
})
