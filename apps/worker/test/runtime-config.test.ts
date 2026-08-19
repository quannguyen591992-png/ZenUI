import { afterEach, describe, expect, it } from 'vitest'

import {
  createSafeWorkerFailureEvent,
  loadWorkerRuntimeConfig,
  shouldSampleAssistantShadow,
} from '../src/runtime.js'

const environment = {
  DATABASE_URL: 'postgresql://example.test/zenui',
  REDIS_URL: 'redis://example.test:6379',
  GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
  GEMINI_MODEL: 'gemini-test',
  GOOGLE_IMAGE_GENERATION_ENABLED: 'true',
  GOOGLE_IMAGE_MODEL: 'imagen-test',
  REMOTE_IMAGE_HOST_ALLOWLIST: 'images.example.com',
  ASSET_ORIGIN: 'https://assets.example.com',
  SHARE_ORIGIN: 'https://share.example.com',
  DEPLOY_PROJECT_NAME_SECRET: 'project-secret',
  PROVIDER_CREDENTIAL_KEYS: JSON.stringify({
    1: Buffer.alloc(32, 1).toString('base64'),
    2: Buffer.alloc(32, 2).toString('base64'),
  }),
  PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION: '2',
  METRICS_BEARER_TOKEN: 'internal-metrics-secret',
  WORKER_SERVICES: 'generation,asset,export,deployment',
  PEXELS_API_KEY: 'pexels-test-key',
  VERCEL_CLIENT_ID: 'client-id',
  VERCEL_CLIENT_SECRET: 'client-secret',
  VERCEL_REDIRECT_URI: 'https://app.example.test/callback',
  S3_ENDPOINT: 'https://s3.example.test',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'zenui',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
}

const previous = { ...process.env }
afterEach(() => {
  process.env = { ...previous }
})

describe('worker runtime configuration', () => {
  it('loads a strict multi-version credential keyring with one active version', () => {
    process.env = { ...previous, ...environment }
    const config = loadWorkerRuntimeConfig()
    expect(config.deployment?.credentialKeys).toEqual(environment.PROVIDER_CREDENTIAL_KEYS)
    expect(config.deployment?.credentialActiveKeyVersion).toBe(2)
    expect(config.deployment?.leadIntakeOrigin).toBe(
      'https://share.example.com',
    )
    expect(config.recoveryIntervalSeconds).toBe(30)
    expect(config.recoveryMaxAttempts).toBe(3)
    expect(config.leadRetentionIntervalSeconds).toBe(3_600)
    expect(config.leadRetentionBatchSize).toBe(100)
    expect(config.databasePoolMax).toBe(8)
    expect(config.remoteImageHostAllowlist).toBe('images.example.com')
    expect(config.assetOrigin).toBe('https://assets.example.com')
    expect(config.asset).toMatchObject({
      providerApiKey: 'pexels-test-key', concurrency: 2, maxInputPixels: 40_000_000,
      maxWidth: 4096, maxHeight: 4096, maxOutputBytes: 8 * 1024 * 1024,
    })
    expect(config.queuePauseAtDepth).toBe(500)
    expect(config.queueResumeAtDepth).toBe(250)
    expect(config.queuePauseAtOldestAgeSeconds).toBe(120)
    expect(config.queueResumeAtOldestAgeSeconds).toBe(60)
  })

  it('rejects invalid pool, retention and backpressure thresholds', () => {
    process.env = { ...previous, ...environment, DATABASE_POOL_MAX: '0' }
    expect(() => loadWorkerRuntimeConfig()).toThrow('DATABASE_POOL_MAX is invalid')

    process.env = {
      ...previous,
      ...environment,
      LEAD_RETENTION_INTERVAL_SECONDS: '59',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow(
      'LEAD_RETENTION_INTERVAL_SECONDS is invalid',
    )

    process.env = {
      ...previous,
      ...environment,
      LEAD_RETENTION_BATCH_SIZE: '501',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow(
      'LEAD_RETENTION_BATCH_SIZE is invalid',
    )

    process.env = {
      ...previous,
      ...environment,
      WORKER_QUEUE_PAUSE_AT_DEPTH: '100',
      WORKER_QUEUE_RESUME_AT_DEPTH: '100',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('WORKER_QUEUE_RESUME_AT_DEPTH must be below WORKER_QUEUE_PAUSE_AT_DEPTH')

    process.env = {
      ...previous,
      ...environment,
      WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS: '60',
      WORKER_QUEUE_RESUME_AT_OLDEST_AGE_SECONDS: '60',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('WORKER_QUEUE_RESUME_AT_OLDEST_AGE_SECONDS must be below WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS')
  })

  it('loads explicit rollout modes and deterministic bounded shadow sampling', () => {
    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'shadow',
      AI_ASSISTANT_SHADOW_SAMPLE_PERCENT: '25',
    }
    expect(loadWorkerRuntimeConfig().generation).toMatchObject({
      assistantRolloutMode: 'shadow',
      assistantShadowSamplePercent: 25,
    })
    const first = shouldSampleAssistantShadow('00000000-0000-4000-8000-000000000001', 25)
    expect(shouldSampleAssistantShadow('00000000-0000-4000-8000-000000000001', 25)).toBe(first)
    expect(shouldSampleAssistantShadow('run', 0)).toBe(false)
    expect(shouldSampleAssistantShadow('run', 100)).toBe(true)

    process.env = { ...previous, ...environment, AI_ASSISTANT_ROLLOUT_MODE: 'default' }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_ROLLOUT_MODE is invalid')
    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_SHADOW_SAMPLE_PERCENT: '1',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_SHADOW_SAMPLE_PERCENT requires shadow rollout mode')
    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'disabled',
      AI_ASSISTANT_V2_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_V2_ENABLED requires opt-in rollout mode')
  })

  it('rejects placeholder provider configuration before generation starts', () => {
    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'generation',
      GOOGLE_GENERATIVE_AI_API_KEY: 'replace-with-provider-key',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('GOOGLE_GENERATIVE_AI_API_KEY is not configured')

    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'generation',
      GEMINI_MODEL: 'replace-with-supported-gemini-model',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('GEMINI_MODEL is not configured')
  })

  it('requires an isolated HTTPS Lead intake origin for deployment compilation', () => {
    process.env = {
      ...previous,
      ...environment,
      SHARE_ORIGIN: '',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow(
      'SHARE_ORIGIN is required',
    )

    process.env = {
      ...previous,
      ...environment,
      SHARE_ORIGIN: 'http://share.example.com',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow(
      'SHARE_ORIGIN must use HTTPS',
    )
  })

  it('loads generation, asset and export services without Vercel configuration', () => {
    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'generation,asset,export',
      VERCEL_CLIENT_ID: '',
      VERCEL_CLIENT_SECRET: '',
      VERCEL_REDIRECT_URI: '',
      PROVIDER_CREDENTIAL_KEYS: '',
      PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION: '',
      DEPLOY_PROJECT_NAME_SECRET: '',
    }
    const config = loadWorkerRuntimeConfig()
    expect(config.services).toEqual(['generation', 'asset', 'export'])
    expect(config.deployment).toBeNull()
    expect(config.generation).toMatchObject({
      model: 'gemini-test',
      imageGenerationEnabled: true,
      imageModel: 'imagen-test',
      maxImagesPerRun: 4,
      assistantV2Enabled: false,
      assistantPlannerEnabled: false,
      assistantMediaJudgeEnabled: false,
      assistantMultiCandidateEnabled: false,
      assistantStyleEnabled: false,
      assistantLayoutEnabled: false,
      generateMaxOutputTokens: 4096,
      editMaxOutputTokens: 2048,
      generateMaxTotalTokens: 12_000,
      editMaxTotalTokens: 8_000,
      generateMaxRepairAttempts: 0,
      editMaxRepairAttempts: 2,
      providerHttpAttempts: 5,
      maxTransientRetries: 1,
    })
    expect(config.export).toMatchObject({ bucket: 'zenui' })
  })

  it('rejects dependent assistant lanes unless the master and prerequisite flags are enabled', () => {
    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_PLANNER_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_PLANNER_ENABLED requires AI_ASSISTANT_V2_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_MEDIA_JUDGE_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_MEDIA_JUDGE_ENABLED requires AI_ASSISTANT_PLANNER_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_STYLE_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_STYLE_ENABLED requires AI_ASSISTANT_PLANNER_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_LAYOUT_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_LAYOUT_ENABLED requires AI_ASSISTANT_PLANNER_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_COMPOSITION_ENABLED: 'true',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_COMPOSITION_ENABLED requires AI_ASSISTANT_PLANNER_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_PLANNER_ENABLED: 'true',
      AI_ASSISTANT_MEDIA_JUDGE_ENABLED: 'true',
      GOOGLE_IMAGE_GENERATION_ENABLED: 'false',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_ASSISTANT_MEDIA_JUDGE_ENABLED requires GOOGLE_IMAGE_GENERATION_ENABLED')

    process.env = {
      ...previous,
      ...environment,
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_PLANNER_ENABLED: 'true',
      AI_ASSISTANT_MULTI_CANDIDATE_ENABLED: 'true',
      AI_IMAGE_MAX_PER_RUN: '1',
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('AI_IMAGE_MAX_PER_RUN must be 4 for Design Directions')
  })

  it('loads generation-only and export-only optional service branches', () => {
    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'generation',
      GOOGLE_IMAGE_GENERATION_ENABLED: 'false',
    }
    const generation = loadWorkerRuntimeConfig()
    expect(generation).toMatchObject({ asset: null, export: null, deployment: null, storage: null })
    expect(generation.generation).toMatchObject({ imageGenerationEnabled: false, imageModel: null })

    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'export',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
      GEMINI_MODEL: '',
    }
    const exportOnly = loadWorkerRuntimeConfig()
    expect(exportOnly).toMatchObject({ generation: null, asset: null, deployment: null })
    expect(exportOnly.export).toMatchObject({ bucket: 'zenui', concurrency: 2 })
    expect(exportOnly.storage).toMatchObject({ bucket: 'zenui' })
  })

  it('loads deployment storage without generation or asset services', () => {
    process.env = {
      ...previous,
      ...environment,
      WORKER_SERVICES: 'deployment',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
      GEMINI_MODEL: '',
      PEXELS_API_KEY: '',
    }
    const config = loadWorkerRuntimeConfig()
    expect(config).toMatchObject({ generation: null, asset: null, export: null })
    expect(config.deployment).toMatchObject({ clientId: 'client-id' })
    expect(config.storage).toMatchObject({ bucket: 'zenui' })
  })

  it('rejects unknown or empty worker service selections', () => {
    process.env = { ...previous, ...environment, WORKER_SERVICES: 'generation,unknown' }
    expect(() => loadWorkerRuntimeConfig()).toThrow('WORKER_SERVICES is invalid')
    process.env = { ...previous, ...environment, WORKER_SERVICES: '' }
    expect(() => loadWorkerRuntimeConfig()).toThrow('WORKER_SERVICES is required')
  })

  it('loads bounded capacity and per-mode AI budget overrides', () => {
    process.env = {
      ...previous,
      ...environment,
      DATABASE_POOL_MAX: '12',
      WORKER_QUEUE_PAUSE_AT_DEPTH: '600',
      WORKER_QUEUE_RESUME_AT_DEPTH: '300',
      WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS: '180',
      WORKER_QUEUE_RESUME_AT_OLDEST_AGE_SECONDS: '90',
      AI_GENERATE_MAX_OUTPUT_TOKENS: '3000',
      AI_EDIT_MAX_OUTPUT_TOKENS: '1500',
      AI_GENERATE_MAX_TOTAL_TOKENS: '9000',
      AI_EDIT_MAX_TOTAL_TOKENS: '5000',
      AI_ASSISTANT_ROLLOUT_MODE: 'opt-in',
      AI_ASSISTANT_V2_ENABLED: 'true',
      AI_ASSISTANT_PLANNER_ENABLED: 'true',
      AI_ASSISTANT_MEDIA_JUDGE_ENABLED: 'true',
      AI_ASSISTANT_MULTI_CANDIDATE_ENABLED: 'true',
      AI_ASSISTANT_STYLE_ENABLED: 'true',
      AI_ASSISTANT_LAYOUT_ENABLED: 'true',
      AI_ASSISTANT_COMPOSITION_ENABLED: 'true',
      AI_GENERATE_MAX_REPAIR_ATTEMPTS: '0',
      AI_EDIT_MAX_REPAIR_ATTEMPTS: '1',
      AI_PROVIDER_HTTP_ATTEMPTS: '1',
      AI_PROVIDER_MAX_TRANSIENT_RETRIES: '0',
    }
    const config = loadWorkerRuntimeConfig()
    expect(config).toMatchObject({
      databasePoolMax: 12,
      queuePauseAtDepth: 600,
      queueResumeAtDepth: 300,
      queuePauseAtOldestAgeSeconds: 180,
      queueResumeAtOldestAgeSeconds: 90,
      generation: {
        assistantV2Enabled: true,
        assistantPlannerEnabled: true,
        assistantMediaJudgeEnabled: true,
        assistantMultiCandidateEnabled: true,
        assistantStyleEnabled: true,
        assistantLayoutEnabled: true,
        assistantCompositionEnabled: true,
        generateMaxOutputTokens: 3000,
        editMaxOutputTokens: 1500,
        generateMaxTotalTokens: 9000,
        editMaxTotalTokens: 5000,
        generateMaxRepairAttempts: 0,
        editMaxRepairAttempts: 1,
        providerHttpAttempts: 1,
        maxTransientRetries: 0,
      },
    })
  })

  it('keeps LangSmith tracing disabled without requiring third-party credentials', () => {
    process.env = {
      ...previous,
      ...environment,
      LANGSMITH_API_KEY: '',
      LANGSMITH_PROJECT: '',
      LANGSMITH_CORRELATION_SECRET: '',
    }

    expect(loadWorkerRuntimeConfig().aiObservability).toEqual({ enabled: false })
  })

  it('loads strict bounded LangSmith tracing configuration when explicitly enabled', () => {
    process.env = {
      ...previous,
      ...environment,
      LANGSMITH_TRACING_ENABLED: 'true',
      LANGSMITH_API_KEY: 'lsv2_test_private_key',
      LANGSMITH_PROJECT: 'zenui-private-beta',
      LANGSMITH_CORRELATION_SECRET: 'correlation-secret-at-least-32-bytes-long',
      LANGSMITH_OTLP_ENDPOINT: 'https://telemetry.example.test/otel/v1/traces',
      LANGSMITH_TRACE_SAMPLE_RATIO: '0.25',
      LANGSMITH_EXPORT_TIMEOUT_MS: '2500',
      LANGSMITH_BATCH_DELAY_MS: '500',
      LANGSMITH_MAX_QUEUE_SIZE: '256',
      LANGSMITH_SHUTDOWN_TIMEOUT_MS: '1500',
    }

    expect(loadWorkerRuntimeConfig().aiObservability).toEqual({
      enabled: true,
      apiKey: 'lsv2_test_private_key',
      project: 'zenui-private-beta',
      correlationSecret: 'correlation-secret-at-least-32-bytes-long',
      endpoint: 'https://telemetry.example.test/otel/v1/traces',
      sampleRatio: 0.25,
      exportTimeoutMs: 2500,
      batchDelayMs: 500,
      maxQueueSize: 256,
      shutdownTimeoutMs: 1500,
    })
  })

  it('rejects unsafe or incomplete LangSmith configuration', () => {
    const enabled = {
      ...previous,
      ...environment,
      LANGSMITH_TRACING_ENABLED: 'true',
      LANGSMITH_API_KEY: 'lsv2_test_private_key',
      LANGSMITH_PROJECT: 'zenui-private-beta',
      LANGSMITH_CORRELATION_SECRET: 'correlation-secret-at-least-32-bytes-long',
    }

    for (const [override, message] of [
      [{ LANGSMITH_API_KEY: '' }, 'LANGSMITH_API_KEY is required'],
      [{ LANGSMITH_API_KEY: 'replace-with-langsmith-key' }, 'LANGSMITH_API_KEY is not configured'],
      [{ LANGSMITH_PROJECT: '' }, 'LANGSMITH_PROJECT is required'],
      [{ LANGSMITH_CORRELATION_SECRET: 'too-short' }, 'LANGSMITH_CORRELATION_SECRET is invalid'],
      [{ LANGSMITH_OTLP_ENDPOINT: 'http://api.smith.langchain.com/otel/v1/traces' }, 'LANGSMITH_OTLP_ENDPOINT is invalid'],
      [{ LANGSMITH_OTLP_ENDPOINT: 'https://user:pass@example.test/otel/v1/traces' }, 'LANGSMITH_OTLP_ENDPOINT is invalid'],
      [{ LANGSMITH_OTLP_ENDPOINT: 'https://example.test/otel/v1/traces?token=secret' }, 'LANGSMITH_OTLP_ENDPOINT is invalid'],
      [{ LANGSMITH_TRACE_SAMPLE_RATIO: '1.1' }, 'LANGSMITH_TRACE_SAMPLE_RATIO is invalid'],
      [{ LANGSMITH_EXPORT_TIMEOUT_MS: '99' }, 'LANGSMITH_EXPORT_TIMEOUT_MS is invalid'],
      [{ LANGSMITH_BATCH_DELAY_MS: '10001' }, 'LANGSMITH_BATCH_DELAY_MS is invalid'],
      [{ LANGSMITH_MAX_QUEUE_SIZE: '0' }, 'LANGSMITH_MAX_QUEUE_SIZE is invalid'],
      [{ LANGSMITH_SHUTDOWN_TIMEOUT_MS: '99' }, 'LANGSMITH_SHUTDOWN_TIMEOUT_MS is invalid'],
    ] as const) {
      process.env = { ...enabled, ...override }
      expect(() => loadWorkerRuntimeConfig()).toThrow(message)
    }
  })

  it('emits bounded failure events without durable resource identifiers', () => {
    const event = createSafeWorkerFailureEvent('generation')
    expect(event).toEqual({
      level: 'error',
      event: 'generation_job_failed',
      code: 'worker_error',
    })
    expect(JSON.stringify(event)).not.toContain('jobId')
  })

  it('rejects malformed or missing active keyring versions', () => {
    process.env = {
      ...previous,
      ...environment,
      PROVIDER_CREDENTIAL_KEYS: JSON.stringify({ 1: Buffer.alloc(32, 1).toString('base64') }),
    }
    expect(() => loadWorkerRuntimeConfig()).toThrow('PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION is missing from PROVIDER_CREDENTIAL_KEYS')

    process.env = { ...previous, ...environment, PROVIDER_CREDENTIAL_KEYS: 'not-json' }
    expect(() => loadWorkerRuntimeConfig()).toThrow('PROVIDER_CREDENTIAL_KEYS is invalid')
  })
})
