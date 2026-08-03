import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createExportRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { createRemoteImagePolicy } from '@zenui/design-schema'
import { EXPORT_CONTENT_TYPE, EXPORT_QUEUE_NAME, createDeterministicSiteArchive } from '@zenui/export-core'
import { compileStaticSite } from '@zenui/html-compiler'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import { createRedisExportAdmissionGate, createRedisExportQueue } from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { ExportApiDependencies } from './export-api'

let redis: IORedis | undefined
let queue: Queue | undefined
let s3: S3Client | undefined
const e2eArtifacts = new Map<string, Uint8Array>()

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

async function responseBytes(body: unknown): Promise<Uint8Array | null> {
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    return (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
  }
  return null
}

export function createExportRouteDependencies(): ExportApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const runs = createExportRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const trustedOrigin = required('APP_ORIGIN')
  const assetOrigin = new URL(required('ASSET_ORIGIN')).origin
  const imagePolicy = createRemoteImagePolicy(required('REMOTE_IMAGE_HOST_ALLOWLIST'))

  const getSession = getRuntimeSession
  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId))).limit(1)
    return membership ?? null
  }

  if (e2eEnabled) {
    return {
      trustedOrigin, getSession, findMembership,
      findProject: (context, projectId) => projects.findById(context, projectId),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      runs,
      queue: {
        enqueue(job) {
          queueMicrotask(() => {
            void (async () => {
              const context = { userId: job.userId, workspaceId: job.workspaceId }
              const input = await runs.getWorkerInput(context, job.exportRunId)
              if (!input) return
              const claimed = await runs.claim(context, job.exportRunId)
              if (!claimed) return
              const compiled = compileStaticSite(input.document, { imagePolicy, assetOrigin })
              if (!compiled.success) {
                await runs.fail(context, job.exportRunId, compiled.code === 'artifact_too_large' ? compiled.code : 'invalid_document')
                return
              }
              let archive: ReturnType<typeof createDeterministicSiteArchive>
              try {
                archive = createDeterministicSiteArchive(compiled.files.map(file => ({ path: file.path, content: file.html })))
              } catch (error) {
                await runs.fail(context, job.exportRunId, error instanceof Error && error.message === 'archive_too_large'
                  ? 'artifact_too_large'
                  : 'invalid_document')
                return
              }
              const key = `exports/${job.workspaceId}/${job.projectId}/${job.exportRunId}/site.zip`
              e2eArtifacts.set(key, archive.content)
              await runs.complete(context, job.exportRunId, {
                artifactKey: key,
                checksum: archive.checksum,
                bytes: archive.bytes,
                contentType: EXPORT_CONTENT_TYPE,
                routeCount: archive.routeCount,
              })
            })()
          })
          return Promise.resolve()
        },
      },
      store: { get: key => Promise.resolve(e2eArtifacts.get(key) ?? null) },
    }
  }

  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  queue ??= new Queue(EXPORT_QUEUE_NAME, { connection: redis })
  const bucket = required('S3_BUCKET')
  s3 ??= new S3Client({
    endpoint: required('S3_ENDPOINT'),
    region: required('S3_REGION'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: required('S3_ACCESS_KEY'), secretAccessKey: required('S3_SECRET_KEY') },
  })
  return {
    trustedOrigin, getSession, findMembership,
    findProject: (context, projectId) => projects.findById(context, projectId),
    admission: createRedisExportAdmissionGate(redis, {
      userRunsPerMinute: integer('EXPORT_USER_RUNS_PER_MINUTE', 10, 1, 100),
      workspaceRunsPerMinute: integer('EXPORT_WORKSPACE_RUNS_PER_MINUTE', 50, 1, 500),
    }),
    runs,
    queue: createRedisExportQueue(queue),
    store: {
      async get(key) {
        const result = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        return responseBytes(result.Body)
      },
    },
  }
}
