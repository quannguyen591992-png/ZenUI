import { createHash, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'

import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@zenui/operations-core'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

function boundedProbe(probe: () => Promise<boolean>, timeoutMs = 1_000): Promise<boolean> {
  return Promise.race([
    probe().catch(() => false),
    new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

export type WorkerService = 'generation' | 'asset' | 'export' | 'deployment'

export function createWorkerOperationsServer(input: {
  host: string
  port: number
  metricsSecret: string
  instanceId: string
  services: WorkerService[]
  probes: Partial<Record<'postgres' | 'redis' | 'object_store', () => Promise<boolean>>>
  renderMetrics(): string
}) {
  if (!input.metricsSecret) throw new Error('METRICS_BEARER_TOKEN is required')
  if (!/^[a-f0-9]{32}$/.test(input.instanceId)) throw new Error('invalid_worker_instance_id')
  if (new Set(input.services).size !== input.services.length) throw new Error('invalid_worker_services')
  if (!Number.isInteger(input.port) || input.port < 0 || input.port > 65_535) throw new Error('invalid_operations_port')
  const expected = digest(input.metricsSecret)
  let server: Server | undefined

  return {
    start(): Promise<{ port: number }> {
      if (server) throw new Error('operations_server_started')
      server = createServer((request, response) => {
        void (async () => {
          const pathname = new URL(request.url ?? '/', 'http://operations.invalid').pathname
          const headers = { 'cache-control': 'no-store' }
          if (request.method !== 'GET') {
            response.writeHead(404, headers).end('Not found')
            return
          }
          if (pathname === '/health/live') {
            response.writeHead(200, { ...headers, 'content-type': 'application/json' })
              .end(JSON.stringify(healthResponseSchema.parse({ service: 'worker', status: 'live' })))
            return
          }
          if (pathname === '/health/instance') {
            response.writeHead(200, { ...headers, 'content-type': 'application/json' }).end(JSON.stringify({
              service: 'worker',
              instanceId: input.instanceId,
              services: input.services,
            }))
            return
          }
          if (pathname === '/health/ready') {
            const dependencies = await Promise.all(Object.entries(input.probes).map(async ([name, probe]) => ({
              name,
              status: await boundedProbe(probe) ? 'ready' : 'degraded',
            })))
            const body = readinessResponseSchema.parse({
              service: 'worker',
              status: dependencies.every(dependency => dependency.status === 'ready') ? 'ready' : 'degraded',
              dependencies,
            })
            response.writeHead(body.status === 'ready' ? 200 : 503, { ...headers, 'content-type': 'application/json' })
              .end(JSON.stringify(body))
            return
          }
          if (pathname === '/metrics') {
            const authorization = request.headers.authorization
            const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
            if (!timingSafeEqual(expected, digest(supplied))) {
              response.writeHead(404, headers).end('Not found')
              return
            }
            response.writeHead(200, {
              ...headers,
              'content-type': 'text/plain; version=0.0.4; charset=utf-8',
            }).end(input.renderMetrics())
            return
          }
          response.writeHead(404, headers).end('Not found')
        })().catch(() => {
          if (!response.headersSent) response.writeHead(503, { 'cache-control': 'no-store' })
          response.end('Unavailable')
        })
      })
      return new Promise((resolve, reject) => {
        server!.once('error', reject)
        server!.listen(input.port, input.host, () => {
          const address = server!.address()
          if (!address || typeof address === 'string') {
            reject(new Error('operations_server_address_unavailable'))
            return
          }
          resolve({ port: address.port })
        })
      })
    },
    close(): Promise<void> {
      if (!server) return Promise.resolve()
      const active = server
      server = undefined
      return new Promise((resolve, reject) => active.close(error => error ? reject(error) : resolve()))
    },
  }
}
