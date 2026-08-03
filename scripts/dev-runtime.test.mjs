import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertDevPortsAvailable,
  isExpectedWorkerInstance,
  waitForDevReadiness,
} from './dev-runtime.mjs'

test('rejects an occupied development port before spawning services', async () => {
  await assert.rejects(
    assertDevPortsAvailable(port => Promise.resolve(port !== 9464)),
    /9464/,
  )
})

test('requires the expected generation worker instance', () => {
  assert.equal(isExpectedWorkerInstance({
    service: 'worker', instanceId: 'current', services: ['generation', 'asset'],
  }, 'current'), true)
  assert.equal(isExpectedWorkerInstance({
    service: 'worker', instanceId: 'old', services: ['generation'],
  }, 'current'), false)
  assert.equal(isExpectedWorkerInstance({
    service: 'worker', instanceId: 'current', services: ['asset'],
  }, 'current'), false)
})

test('waits for Web, Preview and the expected Worker identity', async () => {
  const calls = []
  const response = (ok, data = null) => ({ ok, json: () => Promise.resolve(data) })
  await waitForDevReadiness('current', url => {
    calls.push(url)
    if (url.endsWith('/health/instance')) return Promise.resolve(response(true, {
      service: 'worker', instanceId: 'current', services: ['generation'],
    }))
    return Promise.resolve(response(true))
  }, 1)
  assert.equal(calls.length, 4)
})
