import { createHash, createHmac, randomBytes } from 'node:crypto'

import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { GoogleGenAI } from '@google/genai'
import { ASSET_QUEUE_NAME } from '@zenui/asset-core'
import { createPexelsAdapter, detectRasterType, normalizeRasterImage } from '@zenui/asset-core/server'
import {
  createAssetRepository,
  createDeploymentRepository,
  createDesignDirectionRepository,
  createExportRepository,
  createGenerationRepository,
  createQueueRecoveryRepository,
} from '@zenui/database'
import * as schema from '@zenui/database/schema'
import {
  DEPLOYMENT_QUEUE_NAME,
  DEPLOYMENT_RECONCILIATION_QUEUE_NAME,
} from '@zenui/deployment-core'
import { createCredentialKeyring, createVercelAdapter } from '@zenui/deployment-core/server'
import { createRemoteImagePolicy } from '@zenui/design-schema'
import { EXPORT_QUEUE_NAME } from '@zenui/export-core'
import { createMetricRegistry } from '@zenui/operations-core'
import { Queue, Worker } from 'bullmq'
import { drizzle } from 'drizzle-orm/node-postgres'
import IORedis from 'ioredis'
import { Pool } from 'pg'

import { createDeploymentReconciler } from './deployment-reconciliation.js'
import { createWorkerOperationsServer } from './operations-server.js'
import { createRecoverySweep } from './recovery.js'

import {
  DESIGN_DIRECTION_QUEUE_NAME,
  GENERATION_QUEUE_NAME,
  createAssetProcessor,
  createDeploymentProcessor,
  createDesignDirectionProcessor,
  createExportProcessor,
  createGeminiImageGenerator,
  createGeminiProvider,
  createGenerationProcessor,
  createHybridMediaResolver,
} from './index.js'

import type { GenerateContentParameters } from '@google/genai'

type WorkerService = 'generation' | 'asset' | 'export' | 'deployment'

interface AssetRuntimeConfig {
  providerApiKey: string
  concurrency: number
  maxInputPixels: number
  maxWidth: number
  maxHeight: number
  maxOutputBytes: number
}

interface GenerationRuntimeConfig {
  apiKey: string
  model: string
  imageGenerationEnabled: boolean
  imageModel: string | null
  maxImagesPerRun: number
  concurrency: number
  timeoutMs: number
  generateMaxOutputTokens: number
  editMaxOutputTokens: number
  generateMaxTotalTokens: number
  editMaxTotalTokens: number
  generateMaxRepairAttempts: number
  editMaxRepairAttempts: number
  providerHttpAttempts: number
  maxTransientRetries: number
}

interface StorageRuntimeConfig {
  endpoint: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  forcePathStyle: boolean
  maxArtifactBytes: number
}

interface DeploymentRuntimeConfig {
  concurrency: number
  pollIntervalMs: number
  maxPollAttempts: number
  providerTimeoutMs: number
  projectNameSecret: string
  credentialKeys: string
  credentialActiveKeyVersion: number
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface WorkerRuntimeConfig {
  services: WorkerService[]
  databaseUrl: string
  redisUrl: string
  databasePoolMax: number
  remoteImageHostAllowlist: string
  assetOrigin: string
  asset: AssetRuntimeConfig | null
  generation: GenerationRuntimeConfig | null
  export: (StorageRuntimeConfig & { concurrency: number }) | null
  deployment: DeploymentRuntimeConfig | null
  storage: StorageRuntimeConfig | null
  recoveryIntervalSeconds: number
  recoveryStaleQueuedSeconds: number
  recoveryBatchSize: number
  recoveryMaxAttempts: number
  queuePauseAtDepth: number
  queueResumeAtDepth: number
  queuePauseAtOldestAgeSeconds: number
  queueResumeAtOldestAgeSeconds: number
  operationsHost: string
  operationsPort: number
  metricsBearerToken: string
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

function boolean(name: string, fallback = false): boolean {
  const value = process.env[name]
  if (!value) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} is invalid`)
}

function digestUuid(digest: string): string {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function workerServices(): WorkerService[] {
  const raw = required('WORKER_SERVICES')
  const values = raw.split(',').map(value => value.trim()).filter(Boolean)
  const allowed = new Set<WorkerService>(['generation', 'asset', 'export', 'deployment'])
  if (values.length === 0 || new Set(values).size !== values.length || values.some(value => !allowed.has(value as WorkerService))) {
    throw new Error('WORKER_SERVICES is invalid')
  }
  return values as WorkerService[]
}

function credentialKeyringEnvironment(): { credentialKeys: string; credentialActiveKeyVersion: number } {
  const credentialKeys = required('PROVIDER_CREDENTIAL_KEYS')
  const credentialActiveKeyVersion = integer('PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION', 1, 1, 1_000_000)
  try {
    const parsed = JSON.parse(credentialKeys) as Record<string, unknown>
    const key = parsed[String(credentialActiveKeyVersion)]
    if (typeof key !== 'string') {
      throw new Error('PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION is missing from PROVIDER_CREDENTIAL_KEYS')
    }
    return { credentialKeys, credentialActiveKeyVersion }
  } catch (error) {
    if (error instanceof Error && error.message.includes('is missing from')) throw error
    throw new Error('PROVIDER_CREDENTIAL_KEYS is invalid')
  }
}

const workerFailureEventNames = {
  generation: 'generation_job_failed',
  asset: 'asset_job_failed',
  export: 'export_job_failed',
  deployment: 'deployment_job_failed',
  reconciliation: 'deployment_reconciliation_failed',
  recovery: 'queue_recovery_failed',
} as const

export function createSafeWorkerFailureEvent(kind: keyof typeof workerFailureEventNames) {
  return {
    level: 'error' as const,
    event: workerFailureEventNames[kind],
    code: 'worker_error' as const,
  }
}

export function loadWorkerRuntimeConfig(): WorkerRuntimeConfig {
  const services = workerServices()
  const queuePauseAtDepth = integer('WORKER_QUEUE_PAUSE_AT_DEPTH', 500, 1, 1_000_000)
  const queueResumeAtDepth = integer('WORKER_QUEUE_RESUME_AT_DEPTH', 250, 0, 999_999)
  if (queueResumeAtDepth >= queuePauseAtDepth) {
    throw new Error('WORKER_QUEUE_RESUME_AT_DEPTH must be below WORKER_QUEUE_PAUSE_AT_DEPTH')
  }
  const queuePauseAtOldestAgeSeconds = integer('WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS', 120, 1, 86_400)
  const queueResumeAtOldestAgeSeconds = integer('WORKER_QUEUE_RESUME_AT_OLDEST_AGE_SECONDS', 60, 0, 86_399)
  if (queueResumeAtOldestAgeSeconds >= queuePauseAtOldestAgeSeconds) {
    throw new Error('WORKER_QUEUE_RESUME_AT_OLDEST_AGE_SECONDS must be below WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS')
  }
  const storageRequired = services.includes('asset') || services.includes('export') || services.includes('deployment')
  const storage: StorageRuntimeConfig | null = storageRequired ? {
    endpoint: required('S3_ENDPOINT'),
    region: required('S3_REGION'),
    bucket: required('S3_BUCKET'),
    accessKey: required('S3_ACCESS_KEY'),
    secretKey: required('S3_SECRET_KEY'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    maxArtifactBytes: integer('EXPORT_MAX_ARTIFACT_BYTES', 2 * 1024 * 1024, 1024, 10 * 1024 * 1024),
  } : null
  const asset: AssetRuntimeConfig | null = services.includes('asset') ? {
    providerApiKey: required('PEXELS_API_KEY'),
    concurrency: integer('ASSET_WORKER_CONCURRENCY', 2, 1, 16),
    maxInputPixels: integer('ASSET_MAX_INPUT_PIXELS', 40_000_000, 1_000_000, 100_000_000),
    maxWidth: integer('ASSET_MAX_WIDTH', 4096, 64, 8192),
    maxHeight: integer('ASSET_MAX_HEIGHT', 4096, 64, 8192),
    maxOutputBytes: integer('ASSET_MAX_OUTPUT_BYTES', 8 * 1024 * 1024, 1024, 20 * 1024 * 1024),
  } : null
  const imageGenerationEnabled = services.includes('generation') && boolean('GOOGLE_IMAGE_GENERATION_ENABLED')
  const generation: GenerationRuntimeConfig | null = services.includes('generation') ? {
    apiKey: required('GOOGLE_GENERATIVE_AI_API_KEY'),
    model: required('GEMINI_MODEL'),
    imageGenerationEnabled,
    imageModel: imageGenerationEnabled ? required('GOOGLE_IMAGE_MODEL') : null,
    maxImagesPerRun: integer('AI_IMAGE_MAX_PER_RUN', 4, 1, 4),
    concurrency: integer('AI_WORKER_CONCURRENCY', 2, 1, 16),
    timeoutMs: integer('AI_PROVIDER_TIMEOUT_MS', 30_000, 1_000, 120_000),
    generateMaxOutputTokens: integer('AI_GENERATE_MAX_OUTPUT_TOKENS', 4096, 256, 8192),
    editMaxOutputTokens: integer('AI_EDIT_MAX_OUTPUT_TOKENS', 2048, 256, 8192),
    generateMaxTotalTokens: integer('AI_GENERATE_MAX_TOTAL_TOKENS', 12_000, 512, 32_768),
    editMaxTotalTokens: integer('AI_EDIT_MAX_TOTAL_TOKENS', 8_000, 512, 32_768),
    generateMaxRepairAttempts: integer('AI_GENERATE_MAX_REPAIR_ATTEMPTS', 0, 0, 1),
    editMaxRepairAttempts: integer('AI_EDIT_MAX_REPAIR_ATTEMPTS', 2, 0, 2),
    providerHttpAttempts: integer('AI_PROVIDER_HTTP_ATTEMPTS', 5, 1, 5),
    maxTransientRetries: integer('AI_PROVIDER_MAX_TRANSIENT_RETRIES', 1, 0, 3),
  } : null
  const exportConfig = services.includes('export') && storage ? {
    ...storage,
    concurrency: integer('EXPORT_WORKER_CONCURRENCY', 2, 1, 16),
  } : null
  let deployment: DeploymentRuntimeConfig | null = null
  if (services.includes('deployment')) {
    const keyring = credentialKeyringEnvironment()
    deployment = {
      concurrency: integer('DEPLOY_WORKER_CONCURRENCY', 2, 1, 16),
      pollIntervalMs: integer('DEPLOY_POLL_INTERVAL_MS', 2_000, 250, 30_000),
      maxPollAttempts: integer('DEPLOY_MAX_POLL_ATTEMPTS', 30, 1, 300),
      providerTimeoutMs: integer('DEPLOY_PROVIDER_TIMEOUT_MS', 30_000, 1_000, 120_000),
      projectNameSecret: required('DEPLOY_PROJECT_NAME_SECRET'),
      ...keyring,
      clientId: required('VERCEL_CLIENT_ID'),
      clientSecret: required('VERCEL_CLIENT_SECRET'),
      redirectUri: required('VERCEL_REDIRECT_URI'),
    }
  }
  return {
    services,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: required('REDIS_URL'),
    databasePoolMax: integer('DATABASE_POOL_MAX', 8, 1, 100),
    remoteImageHostAllowlist: required('REMOTE_IMAGE_HOST_ALLOWLIST'),
    assetOrigin: new URL(required('ASSET_ORIGIN')).origin,
    asset,
    generation,
    export: exportConfig,
    deployment,
    storage,
    recoveryIntervalSeconds: integer('WORKER_RECOVERY_INTERVAL_SECONDS', 30, 5, 3_600),
    recoveryStaleQueuedSeconds: integer('WORKER_RECOVERY_STALE_QUEUED_SECONDS', 60, 30, 86_400),
    recoveryBatchSize: integer('WORKER_RECOVERY_BATCH_SIZE', 50, 1, 500),
    recoveryMaxAttempts: integer('WORKER_RECOVERY_MAX_ATTEMPTS', 3, 1, 10),
    queuePauseAtDepth,
    queueResumeAtDepth,
    queuePauseAtOldestAgeSeconds,
    queueResumeAtOldestAgeSeconds,
    operationsHost: process.env.WORKER_OPERATIONS_HOST ?? '127.0.0.1',
    operationsPort: integer('WORKER_OPERATIONS_PORT', 9464, 1, 65_535),
    metricsBearerToken: required('METRICS_BEARER_TOKEN'),
  }
}

/* v8 ignore start -- production wiring is covered by integration/startup gates; adapters are unit tested separately */
export function startWorker(config = loadWorkerRuntimeConfig()) {
  const pool = new Pool({ connectionString: config.databaseUrl, max: config.databasePoolMax })
  const imagePolicy = createRemoteImagePolicy(config.remoteImageHostAllowlist)
  const redis = new IORedis(config.redisUrl, { maxRetriesPerRequest: null })
  const database = drizzle(pool, { schema })
  const s3 = config.storage ? new S3Client({
    endpoint: config.storage.endpoint,
    region: config.storage.region,
    forcePathStyle: config.storage.forcePathStyle,
    credentials: { accessKeyId: config.storage.accessKey, secretAccessKey: config.storage.secretKey },
  }) : null
  const putArtifact = async (input: { key: string; content: Uint8Array; contentType: string; checksum: string }) => {
    if (!s3 || !config.storage) throw new Error('object_store_disabled')
    await s3.send(new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: input.key,
      Body: input.content,
      ContentType: input.contentType,
      Metadata: { checksum: input.checksum },
    }))
  }
  const getObject = async (key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> => {
    if (!s3 || !config.storage) throw new Error('object_store_disabled')
    const result = await s3.send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }))
    if (!result.Body || typeof result.Body !== 'object' || !('transformToByteArray' in result.Body)) return null
    const bytes = await (result.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
    return { bytes, contentType: result.ContentType ?? 'application/octet-stream' }
  }

  const workers: Worker[] = []
  const queues: Queue[] = []
  let generationWorker: Worker | null = null
  let designDirectionWorker: Worker | null = null
  let assetWorker: Worker | null = null
  let exportWorker: Worker | null = null
  let deploymentWorker: Worker | null = null
  let reconciliationWorker: Worker | null = null

  const assetRepository = createAssetRepository(database)
  const assetProvider = config.asset ? createPexelsAdapter({
    apiKey: config.asset.providerApiKey,
    maxDownloadBytes: config.asset.maxOutputBytes,
  }) : null
  const assetStore = config.asset && config.storage ? {
    async get(key: string): Promise<Uint8Array | null> {
      return (await getObject(key))?.bytes ?? null
    },
    async put(input: { key: string; bytes: Uint8Array; contentType: 'image/webp'; checksum: string }): Promise<void> {
      await putArtifact({ key: input.key, content: input.bytes, contentType: input.contentType, checksum: input.checksum })
    },
  } : null
  const assetProcessor = config.asset && config.storage && assetProvider && assetStore
    ? createAssetProcessor({
        repository: assetRepository,
        provider: assetProvider,
        sourceStore: {
          get: getObject,
          async delete(key) {
            await s3!.send(new DeleteObjectCommand({ Bucket: config.storage!.bucket, Key: key }))
          },
        },
        assetStore,
        importer: async (bytes, contentType, options) => {
          detectRasterType(bytes, contentType)
          return normalizeRasterImage(bytes, {
            maxInputPixels: config.asset!.maxInputPixels,
            maxWidth: config.asset!.maxWidth,
            maxHeight: config.asset!.maxHeight,
            maxOutputBytes: config.asset!.maxOutputBytes,
            ...(options.transform ? { transform: options.transform } : {}),
          })
        },
      })
    : null

  if (config.generation) {
    const ai = new GoogleGenAI({
      apiKey: config.generation.apiKey,
      httpOptions: { retryOptions: { attempts: config.generation.providerHttpAttempts } },
    })
    const provider = createGeminiProvider({
      model: config.generation.model,
      generateMaxOutputTokens: config.generation.generateMaxOutputTokens,
      editMaxOutputTokens: config.generation.editMaxOutputTokens,
      generateContent: (input: GenerateContentParameters) => ai.models.generateContent(input),
    })
    const generationRepository = createGenerationRepository(database)
    const imageGenerator = config.generation.imageGenerationEnabled && config.generation.imageModel
      ? createGeminiImageGenerator({
          model: config.generation.imageModel,
          generateContent: (input, signal) => ai.models.generateContent({
            ...input,
            config: { ...input.config, ...(signal ? { abortSignal: signal } : {}) },
          }),
        })
      : null
    const canResolveMedia = Boolean(assetProvider && assetProcessor && s3 && config.storage)
    const resolveOwnedMedia = canResolveMedia
      ? async (input: {
          context: { userId: string; workspaceId: string }
          projectId: string
          runId: string
          intent: { slot: 'hero' | 'feature-1' | 'feature-2' | 'feature-3'; query: string; alt: string }
        }) => {
          const { context, projectId, runId, intent } = input
          const processAsset = async (asset: Awaited<ReturnType<typeof assetRepository.create>>) => {
            const settled = asset.status === 'ready' ? asset : await assetProcessor!({ data: {
              assetId: asset.id,
              projectId,
              workspaceId: context.workspaceId,
              userId: context.userId,
            } })
            return settled.status === 'ready'
              ? { assetId: settled.id, alt: intent.alt, decorative: false as const }
              : null
          }
          return createHybridMediaResolver({
            async generateOwned() {
              if (!imageGenerator) return null
              const generated = await imageGenerator.generate({
                prompt: `${intent.query}. Create a polished editorial website image with no text, lettering, logos, UI labels, or brand marks.`,
                aspectRatio: intent.slot === 'hero' ? '16:9' : '4:3',
                signal: new AbortController().signal,
              })
              const digest = createHash('sha256').update(`${runId}:${intent.slot}:generated`).digest('hex')
              const sourceObjectKey = `asset-sources/${context.workspaceId}/${digest.slice(0, 32)}`
              await s3!.send(new PutObjectCommand({
                Bucket: config.storage!.bucket,
                Key: sourceObjectKey,
                Body: generated.bytes,
                ContentType: generated.mimeType,
              }))
              return processAsset(await assetRepository.create(context, {
                projectId,
                requestId: digestUuid(digest),
                scope: 'project',
                source: 'generated',
                defaultAlt: intent.alt,
                sourceObjectKey,
              }))
            },
            async resolvePexels() {
              const results = await assetProvider!.search(intent.query, 12)
              const selected = results.find(result => result.width > result.height) ?? results[0]
              if (!selected) return null
              const digest = createHash('sha256').update(`${runId}:${intent.slot}:pexels`).digest('hex')
              return processAsset(await assetRepository.create(context, {
                projectId,
                requestId: digestUuid(digest),
                scope: 'project',
                source: 'pexels',
                defaultAlt: intent.alt,
                providerResultId: selected.resultId,
              }))
            },
          })(intent)
        }
      : null
    generationWorker = new Worker(GENERATION_QUEUE_NAME, createGenerationProcessor({
      provider,
      repository: generationRepository,
      ...(resolveOwnedMedia ? {
        resolveProposalMedia: ({ context, projectId, runId, prompt, document, targetNodeId }) => {
          const target = document.nodes[targetNodeId]
          const featureSlot = target?.type === 'feature-card' && 'mediaSlot' in target.props
            ? target.props.mediaSlot
            : undefined
          const slot = featureSlot === 'feature-1' || featureSlot === 'feature-2' || featureSlot === 'feature-3'
            ? featureSlot
            : 'hero' as const
          const alt = target?.type === 'image' && 'alt' in target.props && target.props.alt.trim()
            ? target.props.alt
            : 'Relevant website image'
          return resolveOwnedMedia({ context, projectId, runId, intent: { slot, query: prompt, alt } })
        },
      } : {}),
      timeoutMs: config.generation.timeoutMs,
      generateMaxRepairAttempts: config.generation.generateMaxRepairAttempts,
      editMaxRepairAttempts: config.generation.editMaxRepairAttempts,
      maxTransientRetries: config.generation.maxTransientRetries,
      generateMaxTotalTokens: config.generation.generateMaxTotalTokens,
      editMaxTotalTokens: config.generation.editMaxTotalTokens,
      imagePolicy,
    }), { connection: redis, concurrency: config.generation.concurrency, autorun: true })
    designDirectionWorker = new Worker(DESIGN_DIRECTION_QUEUE_NAME, createDesignDirectionProcessor({
      provider,
      repository: createDesignDirectionRepository(database),
      ...(resolveOwnedMedia ? { resolveMedia: resolveOwnedMedia } : {}),
      timeoutMs: config.generation.timeoutMs,
      imagePolicy,
    }), { connection: redis, concurrency: config.generation.concurrency, autorun: true })
    generationWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('generation'))))
    designDirectionWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('generation'))))
    workers.push(generationWorker, designDirectionWorker)
  }

  if (config.asset && config.storage && assetProcessor) {
    assetWorker = new Worker(ASSET_QUEUE_NAME, assetProcessor, { connection: redis, concurrency: config.asset.concurrency, autorun: true })
    assetWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('asset'))))
    workers.push(assetWorker)
  }

  if (config.export) {
    exportWorker = new Worker(EXPORT_QUEUE_NAME, createExportProcessor({
      repository: createExportRepository(database),
      imagePolicy,
      assetOrigin: config.assetOrigin,
      maxArtifactBytes: config.export.maxArtifactBytes,
      store: { put: putArtifact, get: () => Promise.resolve(null) },
    }), { connection: redis, concurrency: config.export.concurrency, autorun: true })
    exportWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('export'))))
    workers.push(exportWorker)
  }

  if (config.deployment && config.storage) {
    const credentialKeyring = createCredentialKeyring({
      activeKeyVersion: config.deployment.credentialActiveKeyVersion,
      keys: JSON.parse(config.deployment.credentialKeys) as Record<number, string>,
    })
    const deploymentRepository = createDeploymentRepository(database)
    const deploymentProvider = createVercelAdapter({
      clientId: config.deployment.clientId,
      clientSecret: config.deployment.clientSecret,
      redirectUri: config.deployment.redirectUri,
      timeoutMs: config.deployment.providerTimeoutMs,
    })
    const decryptCredential = (connection: {
      workspaceId: string
      id: string
      configurationId: string
      encryptedCredential: Parameters<typeof credentialKeyring.decrypt>[0]
    }) => credentialKeyring.decrypt(connection.encryptedCredential, {
      provider: 'vercel', workspaceId: connection.workspaceId,
      connectionId: connection.id, configurationId: connection.configurationId,
    })
    const deriveProjectName = (projectId: string) => `zenui-${createHmac('sha256', config.deployment!.projectNameSecret).update(projectId).digest('hex').slice(0, 16)}`
    deploymentWorker = new Worker(DEPLOYMENT_QUEUE_NAME, createDeploymentProcessor({
      repository: deploymentRepository,
      imagePolicy,
      assetOrigin: config.assetOrigin,
      maxArtifactBytes: config.storage.maxArtifactBytes,
      projectNameSecret: config.deployment.projectNameSecret,
      pollIntervalMs: config.deployment.pollIntervalMs,
      maxPollAttempts: config.deployment.maxPollAttempts,
      provider: deploymentProvider,
      decryptCredential,
      store: { put: putArtifact, get: () => Promise.resolve(null) },
    }), { connection: redis, concurrency: config.deployment.concurrency, autorun: true })
    reconciliationWorker = new Worker(DEPLOYMENT_RECONCILIATION_QUEUE_NAME, createDeploymentReconciler({
      repository: deploymentRepository, provider: deploymentProvider, decryptCredential, deriveProjectName,
    }), { connection: redis, concurrency: 1, autorun: true })
    deploymentWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('deployment'))))
    reconciliationWorker.on('failed', () => console.error(JSON.stringify(createSafeWorkerFailureEvent('reconciliation'))))
    workers.push(deploymentWorker, reconciliationWorker)
  }

  const queueOptions = { attempts: 3, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: 100, removeOnFail: 500 }
  const disabledQueue = { enqueue: () => Promise.resolve() }
  const generationQueue = config.generation ? new Queue(GENERATION_QUEUE_NAME, { connection: redis }) : null
  const assetQueue = config.asset ? new Queue(ASSET_QUEUE_NAME, { connection: redis }) : null
  const exportQueue = config.export ? new Queue(EXPORT_QUEUE_NAME, { connection: redis }) : null
  const deploymentQueue = config.deployment ? new Queue(DEPLOYMENT_QUEUE_NAME, { connection: redis }) : null
  const reconciliationQueue = config.deployment ? new Queue(DEPLOYMENT_RECONCILIATION_QUEUE_NAME, { connection: redis }) : null
  queues.push(...[generationQueue, assetQueue, exportQueue, deploymentQueue, reconciliationQueue].filter((queue): queue is Queue => queue !== null))
  const sweepRecovery = createRecoverySweep({
    repository: createQueueRecoveryRepository(database),
    queues: {
      asset: assetQueue ? { enqueue: job => assetQueue.add('asset', job, { ...queueOptions, jobId: job.assetId }).then(() => undefined) } : disabledQueue,
      generation: generationQueue ? { enqueue: job => generationQueue.add('generate', job, { ...queueOptions, jobId: job.generationRunId }).then(() => undefined) } : disabledQueue,
      export: exportQueue ? { enqueue: job => exportQueue.add('export', job, { ...queueOptions, jobId: job.exportRunId }).then(() => undefined) } : disabledQueue,
      deployment: deploymentQueue ? { enqueue: job => deploymentQueue.add('deploy', job, { ...queueOptions, jobId: job.deploymentId }).then(() => undefined) } : disabledQueue,
      reconciliation: reconciliationQueue ? { enqueue: job => reconciliationQueue.add('reconcile', job, { ...queueOptions, jobId: `reconcile-${job.deploymentId}` }).then(() => undefined) } : disabledQueue,
    },
    policy: {
      intervalSeconds: config.recoveryIntervalSeconds,
      staleQueuedSeconds: config.recoveryStaleQueuedSeconds,
      batchSize: config.recoveryBatchSize,
      maxAttempts: config.recoveryMaxAttempts,
    },
  })
  const runRecovery = (): void => {
    void sweepRecovery().catch(() => console.error(JSON.stringify(createSafeWorkerFailureEvent('recovery'))))
  }
  const recoveryTimer = setInterval(runRecovery, config.recoveryIntervalSeconds * 1_000)
  recoveryTimer.unref()
  const metrics = createMetricRegistry('worker')
  metrics.setGauge('zenui_service_up', { service: 'worker', operation: 'health_probe', outcome: 'completed' }, 1)
  const probes: Partial<Record<'postgres' | 'redis' | 'object_store', () => Promise<boolean>>> = {
    postgres: async () => { await pool.query('SELECT 1'); return true },
    redis: async () => await redis.ping() === 'PONG',
  }
  if (s3 && config.storage) {
    probes.object_store = async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: config.storage!.bucket }))
        return true
      } catch { return false }
    }
  }
  const operationsServer = createWorkerOperationsServer({
    host: config.operationsHost,
    port: config.operationsPort,
    metricsSecret: config.metricsBearerToken,
    instanceId: process.env.ZENUI_WORKER_INSTANCE_ID ?? randomBytes(16).toString('hex'),
    services: config.services,
    probes,
    renderMetrics: () => metrics.render(),
  })
  const operationsReady = operationsServer.start()
  const close = async (): Promise<void> => {
    clearInterval(recoveryTimer)
    await operationsReady
    await operationsServer.close()
    await Promise.all(workers.map(worker => worker.close()))
    await Promise.all(queues.map(queue => queue.close()))
    await redis.quit()
    s3?.destroy()
    await pool.end()
  }
  return {
    worker: generationWorker,
    designDirectionWorker,
    assetWorker,
    exportWorker,
    deploymentWorker,
    reconciliationWorker,
    operationsReady,
    close,
  }
}
/* v8 ignore stop */
