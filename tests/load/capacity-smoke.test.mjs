import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCapacityReport,
  parseCapacityConfig,
  runBoundedLoad,
} from './capacity-smoke.mjs'

describe('capacity smoke harness', () => {
  it('rejects unsafe or unbounded targets and arguments', () => {
    assert.throws(() => parseCapacityConfig({ CAPACITY_TARGET_URL: 'https://api.example.test' }), /loopback/)
    assert.throws(() => parseCapacityConfig({
      CAPACITY_TARGET_URL: 'http://127.0.0.1:3000/api/health/live',
      CAPACITY_REQUESTS: '10001',
    }), /CAPACITY_REQUESTS/)
    assert.throws(() => parseCapacityConfig({
      CAPACITY_TARGET_URL: 'http://127.0.0.1:3000/api/health/live',
      CAPACITY_METHOD: 'POST',
    }), /CAPACITY_METHOD/)
  })

  it('runs exactly the requested count at bounded concurrency', async () => {
    let active = 0
    let maxActive = 0
    let calls = 0
    const results = await runBoundedLoad({
      requests: 7,
      concurrency: 3,
      timeoutMs: 1_000,
      request: async () => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
        return { latencyMs: calls, error: false }
      },
    })
    assert.equal(results.length, 7)
    assert.equal(calls, 7)
    assert.ok(maxActive <= 3)
  })

  it('evaluates latency, errors, queue age and elapsed duration against budgets', () => {
    assert.deepEqual(buildCapacityReport({
      operation: 'queue_admission',
      results: [
        { latencyMs: 10, error: false },
        { latencyMs: 20, error: false },
        { latencyMs: 30, error: false },
      ],
      concurrency: 2,
      timeoutMs: 1_000,
      queueOldestAgeSeconds: 0,
      durationMs: 40,
    }), {
      operation: 'queue_admission',
      count: 3,
      errors: 0,
      errorRate: 0,
      p50Ms: 20,
      p95Ms: 30,
      p99Ms: 30,
      concurrency: 2,
      timeoutMs: 1_000,
      queueOldestAgeSeconds: 0,
      durationMs: 40,
      passed: true,
    })

    assert.equal(buildCapacityReport({
      operation: 'queue_admission',
      results: [{ latencyMs: 120, error: true }],
      concurrency: 1,
      timeoutMs: 1_000,
      queueOldestAgeSeconds: 121,
      durationMs: 120,
    }).passed, false)
  })
})
