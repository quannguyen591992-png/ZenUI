import { createMetricRegistry } from '@zenui/operations-core'
import IORedis from 'ioredis'

import { probeDatabase } from './database'
import {
  createLivenessHandler,
  createMetricsHandler,
  createReadinessHandler,
} from './operations-api'

let redis: IORedis | undefined
const metrics = createMetricRegistry('web')
metrics.setGauge('zenui_service_up', { service: 'web', operation: 'health_probe', outcome: 'completed' }, 1)

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function redisClient(): IORedis {
  redis ??= new IORedis(required('REDIS_URL'), {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
  })
  return redis
}

export const webLivenessHandler = createLivenessHandler('web')

export function createWebReadinessHandler() {
  return createReadinessHandler({
    service: 'web',
    timeoutMs: 1_000,
    probes: {
      postgres: probeDatabase,
      redis: async () => {
        const client = redisClient()
        if (client.status === 'wait') await client.connect()
        return await client.ping() === 'PONG'
      },
    },
  })
}

export function createWebMetricsHandler() {
  return createMetricsHandler({
    secret: required('METRICS_BEARER_TOKEN'),
    render: () => metrics.render(),
  })
}
