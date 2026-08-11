import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertDevPortsAvailable,
  assertVercelRedirectConfiguration,
  getDevPorts,
  isExpectedWorkerInstance,
  proxyAssetRequest,
  waitForDevReadiness,
} from './dev-runtime.mjs'

test('includes the configured cookie-free asset port in development preflight', () => {
  assert.deepEqual(getDevPorts({ ASSET_ORIGIN: 'http://127.0.0.1:3002' }), [3000, 3001, 3002, 9464])
  assert.deepEqual(getDevPorts({ ASSET_ORIGIN: 'http://127.0.0.1:3000' }), [3000, 3001, 9464])
})

test('rejects an occupied development port before spawning services', async () => {
  await assert.rejects(
    assertDevPortsAvailable(port => Promise.resolve(port !== 3002), {
      ASSET_ORIGIN: 'http://127.0.0.1:3002',
    }),
    /3002/,
  )
})

test('proxies an asset request with an exact isolated Host header and no cookie', async () => {
  let requestOptions
  const result = await proxyAssetRequest({
    url: '/a/11111111-1111-4111-8111-111111111111',
    method: 'GET',
    headers: { host: '127.0.0.1:3002', cookie: 'session=secret', accept: 'image/webp' },
  }, {
    ASSET_ORIGIN: 'http://127.0.0.1:3002',
    APP_ORIGIN: 'http://localhost:3000',
  }, (url, options, onResponse) => {
    requestOptions = { url: url.href, options }
    onResponse({
      statusCode: 200,
      headers: { 'content-type': 'image/webp', 'set-cookie': 'session=secret' },
      [Symbol.asyncIterator]: async function * iterator() {
        yield new Uint8Array([1, 2, 3])
      },
    })
    return { on() {} }
  })

  assert.deepEqual(requestOptions, {
    url: 'http://localhost:3000/a/11111111-1111-4111-8111-111111111111',
    options: {
      method: 'GET',
      headers: { accept: 'image/webp', host: '127.0.0.1:3002' },
    },
  })
  assert.equal(result.status, 200)
  assert.equal(result.headers['content-type'], 'image/webp')
  assert.equal(result.headers['set-cookie'], undefined)
  assert.deepEqual(result.body, Buffer.from([1, 2, 3]))
})

test('rejects non-asset paths and state-changing methods before proxying', async () => {
  let requests = 0
  const requester = () => {
    requests += 1
    throw new Error('request should not be sent')
  }
  const environment = {
    ASSET_ORIGIN: 'http://127.0.0.1:3002',
    APP_ORIGIN: 'http://localhost:3000',
  }

  const wrongPath = await proxyAssetRequest({
    url: '/api/v1/session',
    method: 'GET',
    headers: { authorization: 'Bearer secret' },
  }, environment, requester)
  const wrongMethod = await proxyAssetRequest({
    url: '/a/11111111-1111-4111-8111-111111111111',
    method: 'POST',
    headers: {},
  }, environment, requester)

  assert.equal(wrongPath.status, 404)
  assert.equal(wrongMethod.status, 404)
  assert.equal(requests, 0)
})

test('requires the exact Vercel callback when deployment is enabled', () => {
  assert.doesNotThrow(() => assertVercelRedirectConfiguration({
    APP_ORIGIN: 'http://localhost:3000',
    VERCEL_DEPLOYMENT_ENABLED: 'true',
    VERCEL_REDIRECT_URI: 'http://localhost:3000/api/v1/provider-connections/vercel/callback',
  }))
  assert.throws(() => assertVercelRedirectConfiguration({
    APP_ORIGIN: 'http://localhost:3000',
    VERCEL_DEPLOYMENT_ENABLED: 'true',
    VERCEL_REDIRECT_URI: 'http://localhost:3000/',
  }), /VERCEL_REDIRECT_URI/)
  assert.doesNotThrow(() => assertVercelRedirectConfiguration({
    VERCEL_DEPLOYMENT_ENABLED: 'false',
  }))
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

test('waits for Web, Preview, Asset and the expected Worker identity', async () => {
  const calls = []
  const response = (ok, data = null) => ({ ok, json: () => Promise.resolve(data) })
  await waitForDevReadiness('current', url => {
    calls.push(url)
    if (url.endsWith('/health/instance')) return Promise.resolve(response(true, {
      service: 'worker', instanceId: 'current', services: ['generation'],
    }))
    return Promise.resolve(response(true))
  }, 1, { ASSET_ORIGIN: 'http://127.0.0.1:3002' })
  assert.deepEqual(calls, [
    'http://localhost:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002/__zenui/asset-health',
    'http://127.0.0.1:9464/health/ready',
    'http://127.0.0.1:9464/health/instance',
  ])
})
