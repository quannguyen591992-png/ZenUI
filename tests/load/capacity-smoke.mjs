import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

import {
  BETA_PERFORMANCE_BUDGETS,
  evaluateLoadSample,
} from '../../packages/operations-core/dist/index.js'

const operations = new Set([
  'authenticated_read',
  'authenticated_write',
  'public_share',
  'queue_admission',
  'artifact_processing',
])

function boundedInteger(environment, name, fallback, min, max) {
  const value = environment[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`)
  return parsed
}

export function parseCapacityConfig(environment = process.env) {
  const target = environment.CAPACITY_TARGET_URL
  if (!target) throw new Error('CAPACITY_TARGET_URL is required')
  const url = new URL(target)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error('CAPACITY_TARGET_URL must use HTTP loopback')
  }
  const method = environment.CAPACITY_METHOD ?? 'GET'
  if (method !== 'GET') throw new Error('CAPACITY_METHOD must be GET')
  const operation = environment.CAPACITY_OPERATION ?? 'queue_admission'
  if (!operations.has(operation)) throw new Error('CAPACITY_OPERATION is invalid')
  return {
    target: url.toString(),
    token: environment.CAPACITY_BEARER_TOKEN,
    operation,
    method,
    concurrency: boundedInteger(environment, 'CAPACITY_CONCURRENCY', 10, 1, 100),
    requests: boundedInteger(environment, 'CAPACITY_REQUESTS', 100, 1, 10_000),
    warmupRequests: boundedInteger(environment, 'CAPACITY_WARMUP_REQUESTS', 10, 0, 1_000),
    timeoutMs: boundedInteger(environment, 'CAPACITY_TIMEOUT_MS', 5_000, 100, 30_000),
    queueOldestAgeSeconds: boundedInteger(environment, 'CAPACITY_QUEUE_OLDEST_AGE_SECONDS', 0, 0, 86_400),
  }
}

export async function runBoundedLoad({ requests, concurrency, timeoutMs, request }) {
  const results = []
  let index = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, async () => {
    while (index < requests) {
      index += 1
      results.push(await request(timeoutMs))
    }
  }))
  return results
}

function percentile(ordered, value) {
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * value) - 1)]
}

export function buildCapacityReport({
  operation,
  results,
  concurrency,
  timeoutMs,
  queueOldestAgeSeconds,
  durationMs,
}) {
  if (!results.length) throw new Error('capacity_results_empty')
  const latenciesMs = results.map(result => Number(result.latencyMs.toFixed(2)))
  const errors = results.filter(result => result.error).length
  const ordered = [...latenciesMs].sort((left, right) => left - right)
  const evaluated = evaluateLoadSample({
    operation,
    count: results.length,
    errors,
    latenciesMs,
    queueOldestAgeSeconds,
  })
  return {
    operation,
    count: results.length,
    errors,
    errorRate: errors / results.length,
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
    p99Ms: percentile(ordered, 0.99),
    concurrency,
    timeoutMs,
    queueOldestAgeSeconds,
    durationMs: Number(durationMs.toFixed(2)),
    passed: evaluated.passed,
  }
}

function createHttpRequest(config) {
  return async timeoutMs => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const started = performance.now()
    try {
      const response = await fetch(config.target, {
        method: config.method,
        headers: config.token ? { authorization: `Bearer ${config.token}` } : undefined,
        redirect: 'error',
        signal: controller.signal,
      })
      await response.arrayBuffer()
      return { latencyMs: performance.now() - started, error: response.status >= 500 }
    } catch {
      return { latencyMs: performance.now() - started, error: true }
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function main() {
  const config = parseCapacityConfig()
  const request = createHttpRequest(config)
  if (config.warmupRequests > 0) {
    await runBoundedLoad({
      requests: config.warmupRequests,
      concurrency: Math.min(config.concurrency, config.warmupRequests),
      timeoutMs: config.timeoutMs,
      request,
    })
  }
  const started = performance.now()
  const results = await runBoundedLoad({
    requests: config.requests,
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    request,
  })
  const report = buildCapacityReport({
    operation: config.operation,
    results,
    concurrency: config.concurrency,
    timeoutMs: config.timeoutMs,
    queueOldestAgeSeconds: config.queueOldestAgeSeconds,
    durationMs: performance.now() - started,
  })
  console.log(JSON.stringify({
    ...report,
    budgets: BETA_PERFORMANCE_BUDGETS,
  }))
  if (!report.passed) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
