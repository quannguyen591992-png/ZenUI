import { createHash, timingSafeEqual } from 'node:crypto'

import {
  healthResponseSchema,
  readinessResponseSchema,
  type ServiceName,
} from '@zenui/operations-core'

const noStoreHeaders = { 'cache-control': 'no-store' }

export function createLivenessHandler(service: ServiceName) {
  return function GET(): Response {
    return Response.json(healthResponseSchema.parse({ service, status: 'live' }), {
      headers: noStoreHeaders,
    })
  }
}

function withTimeout(probe: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return Promise.race([
    probe().catch(() => false),
    new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

export function createReadinessHandler(input: {
  service: ServiceName
  timeoutMs: number
  probes: Partial<Record<'postgres' | 'redis' | 'object_store', () => Promise<boolean>>>
}) {
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 10 || input.timeoutMs > 10_000) {
    throw new Error('invalid_readiness_timeout')
  }
  return async function GET(): Promise<Response> {
    const dependencies = await Promise.all(
      Object.entries(input.probes).map(async ([name, probe]) => ({
        name,
        status: await withTimeout(probe, input.timeoutMs) ? 'ready' : 'degraded',
      })),
    )
    const body = readinessResponseSchema.parse({
      service: input.service,
      status: dependencies.every(dependency => dependency.status === 'ready') ? 'ready' : 'degraded',
      dependencies,
    })
    return Response.json(body, { status: body.status === 'ready' ? 200 : 503, headers: noStoreHeaders })
  }
}

function secretDigest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function createMetricsHandler(input: { secret: string; render(): string }) {
  if (!input.secret) throw new Error('METRICS_BEARER_TOKEN is required')
  const expected = secretDigest(input.secret)
  return function GET(request: Request): Response {
    const authorization = request.headers.get('authorization')
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
    const actual = secretDigest(supplied)
    if (!timingSafeEqual(expected, actual)) {
      return new Response('Not found', { status: 404, headers: noStoreHeaders })
    }
    return new Response(input.render(), {
      status: 200,
      headers: {
        ...noStoreHeaders,
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    })
  }
}
