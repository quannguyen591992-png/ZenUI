import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RETENTION_POLICY,
  BETA_PERFORMANCE_BUDGETS,
  createBackpressureController,
  evaluateLoadSample,
  healthResponseSchema,
  leasePolicySchema,
  metricLabelsSchema,
  createMetricRegistry,
  operatorResultSchema,
  queueKindSchema,
  readinessResponseSchema,
  reconciliationOutcomeSchema,
  retentionPolicySchema,
} from '../src/index.js'

describe('operations contracts', () => {
  it('exposes strict redacted liveness and readiness responses', () => {
    expect(healthResponseSchema.parse({ service: 'web', status: 'live' })).toEqual({
      service: 'web',
      status: 'live',
    })
    expect(healthResponseSchema.safeParse({ service: 'web', status: 'live', databaseUrl: 'secret' }).success).toBe(false)

    const ready = {
      service: 'worker',
      status: 'degraded',
      dependencies: [
        { name: 'postgres', status: 'ready' },
        { name: 'redis', status: 'degraded' },
        { name: 'object_store', status: 'ready' },
      ],
    }
    expect(readinessResponseSchema.parse(ready)).toEqual(ready)
    expect(readinessResponseSchema.safeParse({
      ...ready,
      dependencies: [{ name: 'redis', status: 'degraded', url: 'redis://secret' }],
    }).success).toBe(false)
    expect(readinessResponseSchema.safeParse({
      service: 'web',
      status: 'ready',
      dependencies: [{ name: 'postgres', status: 'ready' }, { name: 'postgres', status: 'ready' }],
    }).success).toBe(false)
    expect(readinessResponseSchema.safeParse({
      service: 'web',
      status: 'ready',
      dependencies: [{ name: 'postgres', status: 'degraded' }],
    }).success).toBe(false)
  })

  it('bounds queue leases and reconciliation outcomes', () => {
    expect(queueKindSchema.options).toEqual(['generation', 'export', 'deployment'])
    expect(leasePolicySchema.parse({ leaseSeconds: 60, heartbeatSeconds: 20, batchSize: 50, maxAttempts: 3 })).toEqual({
      leaseSeconds: 60,
      heartbeatSeconds: 20,
      batchSize: 50,
      maxAttempts: 3,
    })
    expect(leasePolicySchema.safeParse({ leaseSeconds: 10, heartbeatSeconds: 20, batchSize: 50, maxAttempts: 3 }).success).toBe(false)
    expect(reconciliationOutcomeSchema.options).toEqual([
      'noop', 'requeued', 'failed', 'attached', 'completed', 'manual_review',
    ])
  })

  it('allows only bounded-cardinality metric labels', () => {
    expect(metricLabelsSchema.parse({
      service: 'worker',
      operation: 'reconcile',
      outcome: 'failed',
      queue: 'deployment',
      provider: 'vercel',
      status: 'building',
      errorCode: 'provider_timeout',
    })).toEqual({
      service: 'worker',
      operation: 'reconcile',
      outcome: 'failed',
      queue: 'deployment',
      provider: 'vercel',
      status: 'building',
      errorCode: 'provider_timeout',
    })
    for (const forbidden of ['userId', 'workspaceId', 'projectId', 'jobId', 'requestId', 'slug', 'url']) {
      expect(metricLabelsSchema.safeParse({ service: 'web', [forbidden]: crypto.randomUUID() }).success).toBe(false)
    }
    expect(metricLabelsSchema.parse({
      service: 'worker',
      operation: 'ai_provider_call',
      outcome: 'completed',
      assistantLane: 'media',
      assistantStage: 'judge',
      source: 'generated',
    })).toEqual({
      service: 'worker',
      operation: 'ai_provider_call',
      outcome: 'completed',
      assistantLane: 'media',
      assistantStage: 'judge',
      source: 'generated',
    })
    expect(metricLabelsSchema.safeParse({ service: 'worker', assistantLane: 'raw-user-intent' }).success).toBe(false)
    expect(metricLabelsSchema.safeParse({ service: 'worker', source: 'https://private.example/image' }).success).toBe(false)
    expect(metricLabelsSchema.safeParse({ service: 'worker', errorCode: 'raw provider body' }).success).toBe(false)
  })

  it('renders bounded Prometheus metrics deterministically without resource identifiers', () => {
    const metrics = createMetricRegistry('web')
    metrics.increment('zenui_operations_total', {
      service: 'web', operation: 'api_request', outcome: 'completed',
    })
    metrics.increment('zenui_operations_total', {
      service: 'web', operation: 'api_request', outcome: 'completed',
    })
    metrics.setGauge('zenui_queue_oldest_age_seconds', {
      service: 'web', operation: 'process', queue: 'generation', status: 'queued',
    }, 12)
    const rendered = metrics.render()
    expect(rendered).toContain('# TYPE zenui_operations_total counter')
    expect(rendered).toContain('zenui_operations_total{operation="api_request",outcome="completed",service="web"} 2')
    expect(rendered).toContain('zenui_queue_oldest_age_seconds{operation="process",queue="generation",service="web",status="queued"} 12')
    expect(rendered).not.toMatch(/userId|workspaceId|projectId|jobId/)
    expect(() => metrics.increment('bad-name', { service: 'web' })).toThrow('invalid_metric_name')
    expect(() => metrics.setGauge('zenui_queue_depth', { service: 'web' }, Number.NaN)).toThrow('invalid_metric_value')
  })

  it('evaluates measured load samples against explicit beta performance budgets', () => {
    expect(BETA_PERFORMANCE_BUDGETS).toEqual({
      authenticatedReadP95Ms: 500,
      authenticatedWriteP95Ms: 750,
      publicShareP95Ms: 750,
      queueAdmissionP95Ms: 100,
      artifactProcessingP95Ms: 5_000,
      queueOldestAgeMaxSeconds: 120,
      errorRateMax: 0.01,
    })
    expect(evaluateLoadSample({
      operation: 'authenticated_read', count: 100, errors: 0,
      latenciesMs: [10, 20, 30, 40, 50], queueOldestAgeSeconds: 0,
    })).toMatchObject({ passed: true, p95Ms: 50, errorRate: 0 })
    expect(evaluateLoadSample({
      operation: 'queue_admission', count: 100, errors: 2,
      latenciesMs: [20, 50, 120], queueOldestAgeSeconds: 121,
    })).toMatchObject({ passed: false, p95Ms: 120, errorRate: 0.02 })
    expect(() => evaluateLoadSample({
      operation: 'queue_admission', count: 0, errors: 0, latenciesMs: [], queueOldestAgeSeconds: 0,
    })).toThrow('invalid_load_sample')
  })

  it('applies hysteresis to bounded queue backpressure without dropping accepted work', () => {
    const controller = createBackpressureController({
      pauseAtDepth: 100,
      resumeAtDepth: 50,
      pauseAtOldestAgeSeconds: 120,
      resumeAtOldestAgeSeconds: 60,
    })

    expect(controller.observe({ depth: 99, oldestAgeSeconds: 119 })).toEqual({
      state: 'accepting',
      changed: false,
      reason: 'within_budget',
    })
    expect(controller.observe({ depth: 100, oldestAgeSeconds: 30 })).toEqual({
      state: 'paused',
      changed: true,
      reason: 'queue_depth',
    })
    expect(controller.observe({ depth: 20, oldestAgeSeconds: 70 })).toEqual({
      state: 'paused',
      changed: false,
      reason: 'recovering',
    })
    expect(controller.observe({ depth: 50, oldestAgeSeconds: 60 })).toEqual({
      state: 'accepting',
      changed: true,
      reason: 'recovered',
    })
    expect(controller.observe({ depth: 1, oldestAgeSeconds: 121 })).toMatchObject({
      state: 'paused', reason: 'queue_age',
    })
    expect(() => createBackpressureController({
      pauseAtDepth: 50,
      resumeAtDepth: 50,
      pauseAtOldestAgeSeconds: 120,
      resumeAtOldestAgeSeconds: 60,
    })).toThrow('invalid_backpressure_policy')
    expect(() => controller.observe({ depth: -1, oldestAgeSeconds: 0 })).toThrow('invalid_queue_pressure')
  })

  it('fixes the conservative beta retention tiers and count-only operator results', () => {
    expect(DEFAULT_RETENTION_POLICY).toEqual({
      operationalLogsDays: 14,
      aiRunMetadataDays: 30,
      failedJobMetadataDays: 30,
      disabledPublicMetadataDays: 90,
      projectContent: 'owner_deleted',
    })
    expect(retentionPolicySchema.parse(DEFAULT_RETENTION_POLICY)).toEqual(DEFAULT_RETENTION_POLICY)
    expect(operatorResultSchema.parse({
      operation: 'retention_cleanup',
      outcome: 'completed',
      scanned: 12,
      changed: 4,
      failed: 0,
    })).toEqual({
      operation: 'retention_cleanup',
      outcome: 'completed',
      scanned: 12,
      changed: 4,
      failed: 0,
    })
    expect(operatorResultSchema.safeParse({
      operation: 'retention_cleanup', outcome: 'completed', scanned: 1, changed: 1, failed: 0,
      resourceIds: [crypto.randomUUID()],
    }).success).toBe(false)
    expect(operatorResultSchema.safeParse({
      operation: 'retention_cleanup', outcome: 'completed', scanned: 1, changed: 1, failed: 1,
    }).success).toBe(false)
  })
})
