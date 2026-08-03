import { createMockLlmProvider, runGeneration } from '@zenui/ai-core'
import { createGenerationRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import { createRedisAdmissionGate, createRedisGenerationQueue } from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { ProposalApiDependencies } from './proposal-api'

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

function deterministicOperations(prompt: string, document: { nodes: Record<string, { type: string; children: string[] }> }, selectedNodeId: string | null) {
  const descendants = (nodeId: string): string[] => {
    const node = document.nodes[nodeId]
    return node ? [nodeId, ...node.children.flatMap(descendants)] : []
  }
  const target = selectedNodeId
    ? descendants(selectedNodeId).find(nodeId => document.nodes[nodeId]?.type === 'heading') ?? selectedNodeId
    : 'heading-1'
  const alternate = /another|khác/i.test(prompt)
  return {
    summary: alternate ? 'AI prepared another option' : 'AI prepared a clearer option',
    operations: [{
      type: 'UPDATE_PROPS',
      nodeId: target,
      patch: { text: alternate ? 'Một lựa chọn rõ ràng khác' : 'Thông điệp rõ ràng và thuyết phục hơn' },
    }],
  }
}

export function createProposalRouteDependencies(): ProposalApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const proposals = createGenerationRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const trustedOrigin = process.env.APP_ORIGIN
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')

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
      getSession: getRuntimeSession,
      findMembership,
      findProject: (context, projectId) => projects.findById(context, projectId),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      proposals,
      queue: {
        async enqueue(job) {
          const context = { userId: job.userId, workspaceId: job.workspaceId }
          const input = await proposals.getWorkerInput(context, job.generationRunId)
          if (!input) return
          const claimed = await proposals.claim(context, input.id, {
            provider: 'mock', model: 'mock-proposal-v1', promptVersion: 'v2',
          })
          if (!claimed) return
          const result = await runGeneration({
            provider: createMockLlmProvider([{ output: deterministicOperations(input.prompt, input.document, input.selectedNodeId) }]),
            job: {
              ...job,
              mode: input.mode,
              prompt: input.prompt,
              expectedVersion: input.expectedVersion,
              ...(input.selectedNodeId ? { selectedNodeId: input.selectedNodeId } : {}),
            },
            document: input.document,
            maxRepairAttempts: 0,
            maxTransientRetries: 0,
          })
          if (!result.accepted) {
            await proposals.fail(context, input.id, {
              errorCode: result.code, usage: result.usage, repairCount: result.repairAttempts,
            })
            return
          }
          await proposals.completeProposal(context, input.id, {
            commands: result.commands,
            proposedDocument: result.document,
            summary: result.summary,
            usage: result.usage,
            repairCount: result.repairAttempts,
          })
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
    getSession: getRuntimeSession,
    findMembership,
    findProject: (context, projectId) => projects.findById(context, projectId),
    admission: createRedisAdmissionGate(redis, {
      userRunsPerMinute: integer('AI_USER_RUNS_PER_MINUTE', 4, 1, 100),
      workspaceRunsPerMinute: integer('AI_WORKSPACE_RUNS_PER_MINUTE', 20, 1, 500),
      workspaceDailyTokens: integer('AI_WORKSPACE_DAILY_TOKENS', 1_000_000, 1_000, 100_000_000),
    }),
    proposals,
    queue: createRedisGenerationQueue(queue, {
      attempts: integer('AI_GENERATION_QUEUE_ATTEMPTS', 3, 1, 3),
    }),
    pollIntervalMs: 500,
    heartbeatMs: 15_000,
  }
}
