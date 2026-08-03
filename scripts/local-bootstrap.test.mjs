import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bootstrapLocalRuntime, parseLocalBootstrapConfig } from './local-bootstrap.mjs'

const environment = {
  NODE_ENV: 'development',
  ZENUI_LOCAL_AUTH_ENABLED: 'true',
  DATABASE_URL: 'postgresql://local.invalid/zenui',
  S3_ENDPOINT: 'http://127.0.0.1:59000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'zenui',
  S3_ACCESS_KEY: 'local-access',
  S3_SECRET_KEY: 'local-secret',
  S3_FORCE_PATH_STYLE: 'true',
}

describe('local runtime bootstrap', () => {
  it('requires explicit non-production local auth mode', () => {
    assert.throws(() => parseLocalBootstrapConfig({ ...environment, NODE_ENV: 'production' }), /local_bootstrap_disabled/)
    assert.throws(() => parseLocalBootstrapConfig({ ...environment, ZENUI_LOCAL_AUTH_ENABLED: 'false' }), /local_bootstrap_disabled/)
  })

  it('validates required database and object-store configuration without returning secrets in the summary', () => {
    assert.throws(() => parseLocalBootstrapConfig({ ...environment, DATABASE_URL: '' }), /DATABASE_URL/)
    const config = parseLocalBootstrapConfig(environment)
    assert.equal(config.bucket, 'zenui')
    assert.equal(config.forcePathStyle, true)
    assert.equal(JSON.stringify(config.summary), '{"database":"configured","objectStore":"configured","bucket":"zenui"}')
    assert.doesNotMatch(JSON.stringify(config.summary), /local-access|local-secret|postgresql:/)
  })

  it('idempotently seeds the fixed owner and accepts an existing bucket', async () => {
    const statements = []
    const database = {
      query(text, values) {
        statements.push({ text, values })
        return Promise.resolve({ rowCount: 1 })
      },
      end() { return Promise.resolve() },
    }
    const objectStore = {
      headBucket() { return Promise.resolve() },
      createBucket() { throw new Error('should_not_create_existing_bucket') },
    }

    const result = await bootstrapLocalRuntime(parseLocalBootstrapConfig(environment), { database, objectStore })

    assert.deepEqual(result, { database: 'ready', objectStore: 'ready', bucketCreated: false })
    assert.equal(statements.length, 3)
    assert.match(statements[0].text, /ON CONFLICT/)
    assert.match(statements[1].text, /ON CONFLICT/)
    assert.match(statements[2].text, /ON CONFLICT/)
  })

  it('creates a missing bucket once', async () => {
    let created = 0
    const database = { query: () => Promise.resolve({ rowCount: 1 }), end: () => Promise.resolve() }
    const objectStore = {
      headBucket() { return Promise.reject(Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } })) },
      createBucket() { created += 1; return Promise.resolve() },
    }

    const result = await bootstrapLocalRuntime(parseLocalBootstrapConfig(environment), { database, objectStore })
    assert.equal(result.bucketCreated, true)
    assert.equal(created, 1)
  })
})
