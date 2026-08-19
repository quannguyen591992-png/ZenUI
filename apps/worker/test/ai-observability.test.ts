import { describe, expect, it, vi } from 'vitest'

import {
  createAiObservability,
  type AiObservabilityConfig,
} from '../src/ai-observability.js'

const enabledConfig = {
  enabled: true,
  endpoint: 'https://api.smith.langchain.com/otel/v1/traces',
  apiKey: 'lsv2_test_private_key',
  project: 'zenui-test',
  correlationSecret: 'correlation-secret-at-least-32-bytes-long',
  sampleRatio: 1,
  exportTimeoutMs: 1_000,
  batchDelayMs: 100,
  maxQueueSize: 64,
  shutdownTimeoutMs: 50,
} as const satisfies AiObservabilityConfig

function collectingExporter() {
  const spans: Array<{
    name: string
    parentSpanContext?: { spanId: string }
    attributes: Record<string, unknown>
    events: Array<{ name: string; attributes?: Record<string, unknown> }>
    status: { code: number }
    spanContext(): { spanId: string }
  }> = []
  return {
    spans,
    exporter: {
      export(batch: typeof spans, done: (result: { code: number }) => void) {
        spans.push(...batch)
        done({ code: 0 })
      },
      shutdown: vi.fn().mockResolvedValue(undefined),
    },
  }
}

function serializeExportedMetadata(spans: ReturnType<typeof collectingExporter>['spans']): string {
  return JSON.stringify(spans.map(span => ({
    name: span.name,
    parentSpanId: span.parentSpanContext?.spanId,
    attributes: span.attributes,
    events: span.events,
    status: span.status,
    spanId: span.spanContext().spanId,
  })))
}

describe('AI observability', () => {
  it('is a no-op by default and never creates an exporter', async () => {
    const createExporter = vi.fn()
    const observability = createAiObservability(
      { enabled: false },
      { createExporter },
    )

    const result = await observability.run({
      operation: 'generation',
      runId: '11111111-1111-4111-8111-111111111111',
      mode: 'generate',
      provider: 'google-gemini',
      model: 'gemini-test',
      promptVersion: 'generation-v1',
    }, run => {
      run.event({ stage: 'proposal', outcome: 'started', count: 1 })
      run.finish({
        outcome: 'accepted',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        repairCount: 0,
      })
      return Promise.resolve('completed')
    })

    expect(result).toBe('completed')
    expect(createExporter).not.toHaveBeenCalled()
    await expect(observability.flush()).resolves.toBeUndefined()
    await expect(observability.shutdown()).resolves.toBeUndefined()
  })

  it('exports a parented metadata-only run and provider span', async () => {
    const collected = collectingExporter()
    const observability = createAiObservability(enabledConfig, {
      createExporter: () => collected.exporter,
      processor: 'simple',
    })
    const privateProviderOutput = {
      text: 'private generated landing page',
      rawRequest: 'private user request',
    }

    const result = await observability.run({
      operation: 'generation',
      runId: '11111111-1111-4111-8111-111111111111',
      mode: 'generate',
      provider: 'google-gemini',
      model: 'gemini-test',
      promptVersion: 'generation-v1',
    }, async run => {
      const providerResult = await observability.provider({
        operation: 'landing_blueprint',
        provider: 'google-gemini',
        model: 'gemini-test',
      }, () => Promise.resolve({
        value: privateProviderOutput,
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      }))
      run.event({
        lane: 'copy',
        stage: 'semantic_gate',
        outcome: 'accepted',
        count: 1,
      })
      run.finish({
        outcome: 'accepted',
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
        repairCount: 0,
      })
      return providerResult
    })

    expect(result).toBe(privateProviderOutput)
    await observability.flush()
    expect(collected.spans).toHaveLength(2)
    const provider = collected.spans.find(span => span.name === 'zenui.ai.provider.landing_blueprint')!
    const root = collected.spans.find(span => span.name === 'zenui.ai.generation')!
    expect(provider.parentSpanContext?.spanId).toBe(root.spanContext().spanId)
    expect(root.attributes).toMatchObject({
      'langsmith.trace.name': 'zenui.ai.generation',
      'langsmith.span.kind': 'chain',
      'zenui.ai.operation': 'generation',
      'zenui.ai.mode': 'generate',
      'zenui.ai.outcome': 'accepted',
      'zenui.ai.repair_count': 0,
      'gen_ai.usage.input_tokens': 11,
      'gen_ai.usage.output_tokens': 7,
      'gen_ai.usage.total_tokens': 18,
    })
    expect(root.attributes['zenui.ai.correlation_id']).toMatch(/^[a-f0-9]{64}$/)
    expect(root.attributes['zenui.ai.correlation_id']).not.toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(provider.attributes).toMatchObject({
      'langsmith.span.kind': 'llm',
      'gen_ai.operation.name': 'landing_blueprint',
      'gen_ai.system': 'google-gemini',
      'gen_ai.request.model': 'gemini-test',
      'gen_ai.usage.input_tokens': 11,
      'gen_ai.usage.output_tokens': 7,
      'gen_ai.usage.total_tokens': 18,
    })
    expect(root.events).toEqual([
      expect.objectContaining({
        name: 'zenui.ai.stage',
        attributes: expect.objectContaining({
          'zenui.ai.lane': 'copy',
          'zenui.ai.stage': 'semantic_gate',
          'zenui.ai.outcome': 'accepted',
          'zenui.ai.count': 1,
        }),
      }),
    ])

    const serialized = serializeExportedMetadata(collected.spans)
    expect(serialized).not.toContain('private generated landing page')
    expect(serialized).not.toContain('private user request')
    expect(serialized).not.toContain('11111111-1111-4111-8111-111111111111')
    expect(serialized).not.toContain(enabledConfig.apiKey)
    expect(serialized).not.toContain(enabledConfig.correlationSecret)
    await observability.shutdown()
  })

  it('uses a stable correlation digest without exposing resource identifiers', async () => {
    const first = collectingExporter()
    const second = collectingExporter()
    const runId = '22222222-2222-4222-8222-222222222222'
    const firstObservability = createAiObservability(enabledConfig, {
      createExporter: () => first.exporter,
      processor: 'simple',
    })
    const secondObservability = createAiObservability(enabledConfig, {
      createExporter: () => second.exporter,
      processor: 'simple',
    })
    const trace = async (observability: ReturnType<typeof createAiObservability>) => {
      await observability.run({
        operation: 'design_directions', runId, provider: 'google-gemini',
        model: 'gemini-test', promptVersion: 'directions-v2', round: 2,
      }, run => {
        run.finish({
          outcome: 'rejected', errorCode: 'invalid_model_output',
          usage: { inputTokens: 5, outputTokens: 4, totalTokens: 9 },
          mediaCount: 4,
        })
        return Promise.resolve()
      })
      await observability.flush()
    }

    await trace(firstObservability)
    await trace(secondObservability)
    const firstDigest = first.spans[0]!.attributes['zenui.ai.correlation_id']
    const secondDigest = second.spans[0]!.attributes['zenui.ai.correlation_id']
    expect(firstDigest).toBe(secondDigest)
    expect(serializeExportedMetadata(first.spans)).not.toContain(runId)
    await firstObservability.shutdown()
    await secondObservability.shutdown()
  })

  it('records only safe error codes and exporter failures never reject AI work', async () => {
    const exportFailure = {
      export(_batch: unknown[], done: (result: { code: number; error?: Error }) => void) {
        done({ code: 1, error: new Error('collector included private transport details') })
      },
      shutdown: vi.fn().mockRejectedValue(new Error('private shutdown detail')),
    }
    const observability = createAiObservability(enabledConfig, {
      createExporter: () => exportFailure,
      processor: 'simple',
    })

    await expect(observability.run({
      operation: 'proposal',
      runId: '33333333-3333-4333-8333-333333333333',
      mode: 'edit-selection',
      delivery: 'proposal',
      lane: 'style',
      provider: 'google-gemini',
      model: 'gemini-test',
      promptVersion: 'generation-v1',
    }, async run => {
      await expect(observability.provider({
        operation: 'style_edit', provider: 'google-gemini', model: 'gemini-test',
      }, () => Promise.reject(
        Object.assign(new Error('raw provider body'), { code: 'provider_timeout' }),
      ))).rejects.toMatchObject({ code: 'provider_timeout' })
      run.finish({
        outcome: 'rejected', errorCode: 'provider_timeout',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        repairCount: 0,
      })
      return 'business-result'
    })).resolves.toBe('business-result')
    await expect(observability.flush()).resolves.toBeUndefined()
    await expect(observability.shutdown()).resolves.toBeUndefined()
  })

  it('bounds shutdown when the exporter never settles', async () => {
    const observability = createAiObservability(
      { ...enabledConfig, shutdownTimeoutMs: 10 },
      {
        createExporter: () => ({
          export(_batch: unknown[], done: (result: { code: number }) => void) {
            done({ code: 0 })
          },
          shutdown: () => new Promise<void>(() => undefined),
        }),
        processor: 'simple',
      },
    )

    await expect(observability.shutdown()).resolves.toBeUndefined()
  })
})
