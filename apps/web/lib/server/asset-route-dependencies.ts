import { createHash } from 'node:crypto'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ASSET_QUEUE_NAME } from '@zenui/asset-core'
import { createPexelsAdapter, normalizeRasterImage } from '@zenui/asset-core/server'
import { createAssetRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { Queue } from 'bullmq'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import { createRedisAssetAdmissionGate, createRedisAssetQueue } from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getE2ePublicAsset, setE2ePublicAsset } from './public-asset-route-dependencies'
import { getRuntimeSession } from './runtime-session'

import type { AssetApiDependencies } from './asset-api'

let redis: IORedis | undefined
let queue: Queue | undefined
let s3: S3Client | undefined

const e2eSources = new Map<string, Uint8Array>()

export function resetE2eAssetSources(): void {
  e2eSources.clear()
}

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

export function createAssetRouteDependencies(): AssetApiDependencies {
  const database = getDatabase()
  const assets = createAssetRepository(database)
  const projects = createProjectRepository(database)
  const trustedOrigin = required('APP_ORIGIN')
  const maxUploadBytes = integer('ASSET_MAX_UPLOAD_BYTES', 8 * 1024 * 1024, 1024, 20 * 1024 * 1024)
  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(
      eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId),
    )).limit(1)
    return membership ?? null
  }
  const base = {
    trustedOrigin,
    maxUploadBytes,
    getSession: getRuntimeSession,
    findMembership,
    findProject: (context: Parameters<typeof projects.findById>[0], projectId: string) => projects.findById(context, projectId),
    assets,
  }

  if (isE2eRuntimeEnabled()) {
    const queue = {
      enqueue(job: Parameters<AssetApiDependencies['queue']['enqueue']>[0]) {
        queueMicrotask(() => {
          void (async () => {
            const context = { userId: job.userId, workspaceId: job.workspaceId }
            const input = await assets.getWorkerInput(context, job.assetId)
            if (!input || !await assets.claim(context, job.assetId)) return
            try {
              const source = input.sourceObjectKey ? e2eSources.get(input.sourceObjectKey) : undefined
              const parent = input.parentObjectKey ? getE2ePublicAsset(input.parentObjectKey) : undefined
              const image = source ?? parent ?? new Uint8Array(Buffer.from(
                'UklGRkYAAABXRUJQVlA4IDoAAAAQAwCdASogABAAPm0skUWkIqGYBABABsSgB2APwAAQigAA/u1N3//7B39B39B3+qZ//8guWF1xGAAA',
                'base64',
              ))
              const normalized = await normalizeRasterImage(image, {
                maxInputPixels: 1_000_000, maxWidth: 1600, maxHeight: 1600, maxOutputBytes: 1_000_000,
                ...(input.transform ? { transform: input.transform } : {}),
              })
              const bytes = normalized.bytes
              const objectKey = `assets/${input.id}/image.webp`
              const checksum = createHash('sha256').update(bytes).digest('hex')
              setE2ePublicAsset(objectKey, bytes)
              await assets.complete(context, input.id, {
                objectKey, contentType: 'image/webp', width: normalized.width,
                height: normalized.height, bytes: bytes.byteLength, checksum,
                ...(input.source === 'pexels' ? { attribution: { provider: 'pexels', creatorName: 'ZenUI Fixture', creatorUrl: 'https://www.pexels.com/@zenui-fixture' } as const } : {}),
              })
            } catch {
              await assets.fail(context, input.id, 'import_failed')
            }
          })()
        })
        return Promise.resolve()
      },
    }
    return {
      ...base,
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      sourceStore: { put: input => { e2eSources.set(input.key, input.bytes); return Promise.resolve() } },
      queue,
      search: createPexelsAdapter({
        apiKey: 'e2e-only',
        fetch: () => Promise.resolve(Response.json({ photos: [{
          id: 42, width: 1200, height: 800, photographer: 'ZenUI Fixture',
          photographer_url: 'https://www.pexels.com/@zenui-fixture',
          src: {
            medium: 'https://images.pexels.com/photos/42/medium.jpeg',
            large2x: 'https://images.pexels.com/photos/42/large.jpeg',
          },
          alt: 'Bảng lập kế hoạch ra mắt',
        }] })),
      }),
    }
  }

  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  queue ??= new Queue(ASSET_QUEUE_NAME, { connection: redis })
  const bucket = required('S3_BUCKET')
  s3 ??= new S3Client({
    endpoint: required('S3_ENDPOINT'),
    region: required('S3_REGION'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: required('S3_ACCESS_KEY'), secretAccessKey: required('S3_SECRET_KEY') },
  })
  return {
    ...base,
    admission: createRedisAssetAdmissionGate(redis, {
      userRunsPerMinute: integer('ASSET_USER_RUNS_PER_MINUTE', 10, 1, 100),
      workspaceRunsPerMinute: integer('ASSET_WORKSPACE_RUNS_PER_MINUTE', 50, 1, 500),
    }),
    sourceStore: {
      async put(input) {
        await s3!.send(new PutObjectCommand({
          Bucket: bucket, Key: input.key, Body: input.bytes, ContentType: input.contentType,
        }))
      },
    },
    queue: createRedisAssetQueue(queue),
    search: createPexelsAdapter({ apiKey: required('PEXELS_API_KEY') }),
  }
}
