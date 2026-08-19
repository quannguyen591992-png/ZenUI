import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac } from 'node:crypto'

import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Span,
} from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from '@opentelemetry/sdk-trace-base'

export interface LlmUsageMetadata {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type AiRunOperation = 'generation' | 'proposal' | 'design_directions'
export type AiProviderOperation =
  | 'landing_blueprint'
  | 'edit_operations'
  | 'design_direction_plan'
  | 'assistant_plan'
  | 'layout_recipe'
  | 'section_composition'
  | 'style_edit'
  | 'visual_brief'
  | 'media_judge'
  | 'image_generation'
export type AiRunOutcome = 'accepted' | 'completed' | 'failed' | 'rejected'
export type AiSafeErrorCode =
  | 'invalid_model_output'
  | 'provider_auth'
  | 'provider_bad_request'
  | 'provider_error'
  | 'provider_rate_limit'
  | 'provider_timeout'
  | 'provider_transient'
  | 'scope_violation'
  | 'stale_document_version'
  | 'token_budget_exceeded'
  | 'worker_error'

export type AiStageEvent = {
  lane?: 'copy' | 'media' | 'style' | 'layout' | 'composition'
  stage:
    | 'candidate'
    | 'image_generation'
    | 'judge'
    | 'planner'
    | 'proposal'
    | 'repair'
    | 'semantic_gate'
    | 'text_tokens'
  outcome: AiRunOutcome | 'started'
  count: number
  source?: 'generated' | 'stock'
}

export type AiObservabilityConfig =
  | { enabled: false }
  | {
      enabled: true
      endpoint: string
      apiKey: string
      project: string
      correlationSecret: string
      sampleRatio: number
      exportTimeoutMs: number
      batchDelayMs: number
      maxQueueSize: number
      shutdownTimeoutMs: number
    }

export interface AiRunInput {
  operation: AiRunOperation
  runId: string
  provider: string
  model: string
  promptVersion: string
  mode?: 'generate' | 'edit-page' | 'edit-selection'
  delivery?: 'apply' | 'proposal'
  lane?: 'copy' | 'media' | 'style' | 'layout' | 'composition'
  round?: number
}

export interface AiRunFinish {
  outcome: AiRunOutcome
  usage: LlmUsageMetadata
  errorCode?: AiSafeErrorCode
  repairCount?: number
  mediaCount?: number
}

export interface AiRunTrace {
  event(input: AiStageEvent): void
  finish(input: AiRunFinish): void
}

export interface AiProviderInput {
  operation: AiProviderOperation
  provider: string
  model: string
}

export interface AiProviderResult<T> {
  value: T
  usage?: LlmUsageMetadata
}

export interface AiObservability {
  run<T>(input: AiRunInput, execute: (trace: AiRunTrace) => Promise<T>): Promise<T>
  provider<T>(input: AiProviderInput, execute: () => Promise<AiProviderResult<T>>): Promise<T>
  flush(): Promise<void>
  shutdown(): Promise<void>
}

interface AiObservabilityDependencies {
  createExporter?: (config: Extract<AiObservabilityConfig, { enabled: true }>) => SpanExporter
  processor?: 'batch' | 'simple'
}

const safeErrorCodes = new Set<AiSafeErrorCode>([
  'invalid_model_output',
  'provider_auth',
  'provider_bad_request',
  'provider_error',
  'provider_rate_limit',
  'provider_timeout',
  'provider_transient',
  'scope_violation',
  'stale_document_version',
  'token_budget_exceeded',
  'worker_error',
])

function safeErrorCode(error: unknown): AiSafeErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code)
    if (safeErrorCodes.has(code as AiSafeErrorCode)) return code as AiSafeErrorCode
  }
  return 'worker_error'
}

function usageAttributes(usage: LlmUsageMetadata): Record<string, number> {
  return {
    'gen_ai.usage.input_tokens': usage.inputTokens,
    'gen_ai.usage.output_tokens': usage.outputTokens,
    'gen_ai.usage.total_tokens': usage.totalTokens,
  }
}

function withTimeout(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined
  return Promise.race([
    operation.catch(() => undefined),
    new Promise<void>(resolve => {
      timer = setTimeout(resolve, timeoutMs)
      timer.unref()
    }),
  ]).then(() => {
    if (timer) clearTimeout(timer)
  })
}

const noOpObservability: AiObservability = {
  async run(_input, execute) {
    return execute({ event: () => undefined, finish: () => undefined })
  },
  async provider(_input, execute) {
    return (await execute()).value
  },
  flush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
}

export function createAiObservability(
  config: AiObservabilityConfig,
  dependencies: AiObservabilityDependencies = {},
): AiObservability {
  if (!config.enabled) return noOpObservability

  const exporter = dependencies.createExporter?.(config) ?? new OTLPTraceExporter({
    url: config.endpoint,
    headers: {
      'x-api-key': config.apiKey,
      'Langsmith-Project': config.project,
    },
    timeoutMillis: config.exportTimeoutMs,
  })
  const spanProcessor = dependencies.processor === 'simple'
    ? new SimpleSpanProcessor(exporter)
    : new BatchSpanProcessor(exporter, {
        maxQueueSize: config.maxQueueSize,
        scheduledDelayMillis: config.batchDelayMs,
        exportTimeoutMillis: config.exportTimeoutMs,
      })
  const provider = new BasicTracerProvider({
    sampler: new TraceIdRatioBasedSampler(config.sampleRatio),
    spanProcessors: [spanProcessor],
  })
  const tracer = provider.getTracer('zenui-worker-ai', '1.0.0')
  const activeRun = new AsyncLocalStorage<Span>()
  let stopped = false

  return {
    async run(input, execute) {
      const spanName = `zenui.ai.${input.operation}`
      const span = tracer.startSpan(spanName, {
        attributes: {
          'langsmith.trace.name': spanName,
          'langsmith.span.kind': 'chain',
          'zenui.ai.operation': input.operation,
          'zenui.ai.correlation_id': createHmac('sha256', config.correlationSecret)
            .update(input.runId)
            .digest('hex'),
          'gen_ai.system': input.provider,
          'gen_ai.request.model': input.model,
          'zenui.ai.prompt_version': input.promptVersion,
          ...(input.mode ? { 'zenui.ai.mode': input.mode } : {}),
          ...(input.delivery ? { 'zenui.ai.delivery': input.delivery } : {}),
          ...(input.lane ? { 'zenui.ai.lane': input.lane } : {}),
          ...(input.round !== undefined ? { 'zenui.ai.round': input.round } : {}),
        },
      })
      let finished = false
      const finish = (result: AiRunFinish): void => {
        if (finished) return
        finished = true
        span.setAttributes({
          'zenui.ai.outcome': result.outcome,
          ...usageAttributes(result.usage),
          ...(result.errorCode ? { 'error.type': result.errorCode } : {}),
          ...(result.repairCount !== undefined
            ? { 'zenui.ai.repair_count': result.repairCount }
            : {}),
          ...(result.mediaCount !== undefined
            ? { 'zenui.ai.media_count': result.mediaCount }
            : {}),
        })
        span.setStatus({
          code: result.outcome === 'failed' || result.outcome === 'rejected'
            ? SpanStatusCode.ERROR
            : SpanStatusCode.OK,
        })
        span.end()
      }
      const runTrace: AiRunTrace = {
        event(event) {
          span.addEvent('zenui.ai.stage', {
            ...(event.lane ? { 'zenui.ai.lane': event.lane } : {}),
            'zenui.ai.stage': event.stage,
            'zenui.ai.outcome': event.outcome,
            'zenui.ai.count': event.count,
            ...(event.source ? { 'zenui.ai.source': event.source } : {}),
          })
        },
        finish,
      }
      try {
        const result = await activeRun.run(span, () => execute(runTrace))
        if (!finished) {
          finish({
            outcome: 'completed',
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          })
        }
        return result
      } catch (error) {
        finish({
          outcome: 'failed',
          errorCode: safeErrorCode(error),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        })
        throw error
      }
    },

    async provider(input, execute) {
      const parent = activeRun.getStore()
      const span = tracer.startSpan(
        `zenui.ai.provider.${input.operation}`,
        {
          attributes: {
            'langsmith.span.kind': 'llm',
            'gen_ai.operation.name': input.operation,
            'gen_ai.system': input.provider,
            'gen_ai.request.model': input.model,
          },
        },
        parent ? trace.setSpan(ROOT_CONTEXT, parent) : ROOT_CONTEXT,
      )
      try {
        const result = await execute()
        if (result.usage) span.setAttributes(usageAttributes(result.usage))
        span.setStatus({ code: SpanStatusCode.OK })
        return result.value
      } catch (error) {
        span.setAttribute('error.type', safeErrorCode(error))
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        span.end()
      }
    },

    async flush() {
      if (stopped) return
      await withTimeout(provider.forceFlush(), config.exportTimeoutMs)
    },

    async shutdown() {
      if (stopped) return
      stopped = true
      await withTimeout(provider.shutdown(), config.shutdownTimeoutMs)
    },
  }
}
