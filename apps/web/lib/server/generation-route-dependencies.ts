import { createMockLlmProvider, runGeneration } from '@zenui/ai-core'
import { createGenerationRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import { createRedisAdmissionGate, createRedisGenerationQueue } from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { GenerationApiDependencies } from './generation-api'
import type { GenerationJob } from '@zenui/ai-core'

const GENERATION_QUEUE_NAME = 'zenui-generation-v1'
let redis: IORedis | undefined
let queue: Queue | undefined

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`)
  return parsed
}

function deterministicE2eOutput(prompt: string) {
  if (prompt.toLowerCase().includes('invalid')) return { invalid: true }
  return {
    version: 1,
    brand: 'ZenUI',
    theme: {
      primary: '#2563eb', background: '#ffffff', text: '#0f172a',
      headingFont: 'Manrope', bodyFont: 'Manrope',
    },
    hero: {
      heading: 'AI generated landing page',
      paragraph: 'Launch an accessible product with a safe structured page.',
      cta: { text: 'Get started', href: '#start' },
    },
    features: [
      { icon: 'star', heading: 'Structured', paragraph: 'Server-owned layout and metadata.' },
      { icon: 'check', heading: 'Accessible', paragraph: 'Clear content and safe components.' },
    ],
    closingCta: {
      heading: 'Ready to launch?', paragraph: 'Create your product page today.',
      cta: { text: 'Start now', href: '#start' },
    },
  }
}

function deterministicE2eOperations(job: GenerationJob & {
  mode: 'generate' | 'edit-page' | 'edit-selection'
  prompt: string
  selectedNodeId?: string
}) {
  if (job.prompt.toLowerCase().includes('invalid')) return { invalid: true }
  const nodeId = job.mode === 'edit-selection' ? job.selectedNodeId : 'heading-1'
  return {
    summary: job.mode === 'edit-selection' ? 'AI edited selected node' : 'AI edited whole page',
    operations: [{
      type: 'UPDATE_PROPS',
      nodeId,
      patch: { text: job.mode === 'edit-selection' ? 'AI selected heading' : 'AI edited landing page' },
    }],
  }
}

export function createGenerationRouteDependencies(): GenerationApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const runs = createGenerationRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const trustedOrigin = process.env.APP_ORIGIN
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')

  const getSession = getRuntimeSession

  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
    )).limit(1)
    return membership ?? null
  }

  if (e2eEnabled) {
    return {
      trustedOrigin,
      getSession,
      findMembership,
      findProject: (context, projectId) => projects.findById(context, projectId),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      runs,
      queue: {
        async enqueue(job) {
          const process = async () => {
            const context = { userId: job.userId, workspaceId: job.workspaceId }
            const input = await runs.getWorkerInput(context, job.generationRunId)
            if (!input) return
            const claimed = await runs.claim(context, job.generationRunId, {
              provider: 'mock', model: 'mock-structured-v1', promptVersion: 'v1',
            })
            if (!claimed) return
            const runtimeJob = {
              ...job,
              mode: input.mode,
              prompt: input.prompt,
              expectedVersion: input.expectedVersion,
              ...(input.selectedNodeId ? { selectedNodeId: input.selectedNodeId } : {}),
            }
            const output = runtimeJob.mode === 'generate'
              ? deterministicE2eOutput(runtimeJob.prompt)
              : deterministicE2eOperations(runtimeJob)
            const provider = createMockLlmProvider(runtimeJob.prompt.toLowerCase().includes('invalid')
              ? [{ output }, { output }, { output }]
              : [{ output }])
            const result = await runGeneration({
              provider, job: runtimeJob, document: input.document,
              onRepairAttempt: attempt => runs.markRepairing(context, job.generationRunId, attempt).then(() => undefined),
            })
            if (!result.accepted) {
              await runs.fail(context, job.generationRunId, {
                errorCode: result.code, usage: result.usage, repairCount: result.repairAttempts,
              })
              return
            }
            const completed = await runs.complete(context, job.generationRunId, {
              document: result.document, summary: result.summary,
              usage: result.usage, repairCount: result.repairAttempts,
            })
            if (!completed.accepted) {
              await runs.fail(context, job.generationRunId, {
                errorCode: completed.code === 'stale_document_version' ? completed.code : 'provider_error',
                usage: result.usage, repairCount: result.repairAttempts,
              })
            }
          }
          if (job.generationRunId && (await runs.getWorkerInput(
            { userId: job.userId, workspaceId: job.workspaceId }, job.generationRunId,
          ))?.prompt.toLowerCase().includes('delayed stale')) {
            setTimeout(() => { void process() }, 4_000)
            return
          }
          await process()
        },
      },
      pollIntervalMs: 10,
      heartbeatMs: 1_000,
    }
  }

  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL is required')
  redis ??= new IORedis(redisUrl, { maxRetriesPerRequest: 1 })
  queue ??= new Queue(GENERATION_QUEUE_NAME, { connection: redis })
  return {
    trustedOrigin,
    getSession,
    findMembership,
    findProject: (context, projectId) => projects.findById(context, projectId),
    admission: createRedisAdmissionGate(redis, {
      userRunsPerMinute: integer('AI_USER_RUNS_PER_MINUTE', 4, 1, 100),
      workspaceRunsPerMinute: integer('AI_WORKSPACE_RUNS_PER_MINUTE', 20, 1, 500),
      workspaceDailyTokens: integer('AI_WORKSPACE_DAILY_TOKENS', 1_000_000, 1_000, 100_000_000),
    }),
    runs,
    queue: createRedisGenerationQueue(queue, {
      attempts: integer('AI_GENERATION_QUEUE_ATTEMPTS', 3, 1, 3),
    }),
    pollIntervalMs: 500,
    heartbeatMs: 15_000,
  }
}
