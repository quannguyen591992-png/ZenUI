import { createDeploymentRepository, createProjectRepository, createProviderConnectionRepository, workspaceMembers } from '@zenui/database'
import { DEPLOYMENT_QUEUE_NAME } from '@zenui/deployment-core'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import {
  createRedisDeploymentAdmissionGate,
  createRedisDeploymentQueue,
} from './ai-infrastructure'
import { getDatabase } from './database'
import { createE2eDeploymentQueue } from './e2e-deployment-runtime'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { DeploymentApiDependencies } from './deployment-api'

let redis: IORedis | undefined
let queue: Queue | undefined

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`)
  return parsed
}

export function createDeploymentRouteDependencies(): DeploymentApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const deployments = createDeploymentRepository(database)
  const connections = createProviderConnectionRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const getSession = getRuntimeSession
  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(
      eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId),
    )).limit(1)
    return membership ?? null
  }
  const base = {
    trustedOrigin: required('APP_ORIGIN'),
    getSession,
    findMembership,
    findProject: (context: Parameters<typeof projects.findById>[0], projectId: string) => projects.findById(context, projectId),
    findRevision: (context: Parameters<typeof deployments.findRevision>[0], projectId: string, revisionId: string) => deployments.findRevision(context, projectId, revisionId),
    findConnection: (context: Parameters<typeof connections.findPublic>[0]) => connections.findPublic(context, 'vercel'),
    deployments,
  }
  if (e2eEnabled) {
    return {
      ...base,
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      queue: createE2eDeploymentQueue(database),
    }
  }
  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  queue ??= new Queue(DEPLOYMENT_QUEUE_NAME, { connection: redis })
  return {
    ...base,
    admission: createRedisDeploymentAdmissionGate(redis, {
      userRunsPerMinute: integer('DEPLOY_USER_RUNS_PER_MINUTE', 5, 1, 100),
      workspaceRunsPerMinute: integer('DEPLOY_WORKSPACE_RUNS_PER_MINUTE', 20, 1, 500),
    }),
    queue: createRedisDeploymentQueue(queue),
  }
}
