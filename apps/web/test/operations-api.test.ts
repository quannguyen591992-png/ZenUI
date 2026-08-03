import { describe, expect, it, vi } from 'vitest'

import {
  createLivenessHandler,
  createMetricsHandler,
  createReadinessHandler,
} from '../lib/server/operations-api'

describe('operations HTTP boundaries', () => {
  it('returns no-store liveness without dependency probes', async () => {
    const response = createLivenessHandler('web')()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ service: 'web', status: 'live' })
  })

  it('returns aggregate readiness with bounded dependency names only', async () => {
    const response = await createReadinessHandler({
      service: 'web',
      timeoutMs: 100,
      probes: {
        postgres: vi.fn().mockResolvedValue(true),
        redis: vi.fn().mockResolvedValue(false),
      },
    })()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toEqual({
      service: 'web',
      status: 'degraded',
      dependencies: [
        { name: 'postgres', status: 'ready' },
        { name: 'redis', status: 'degraded' },
      ],
    })
    expect(JSON.stringify(body)).not.toContain('redis://')
  })

  it('fails closed and uses constant-time bearer comparison for metrics', async () => {
    const metrics = createMetricsHandler({
      secret: 'internal-metrics-secret',
      render: () => '# TYPE zenui_up gauge\nzenui_up{service="web"} 1\n',
    })
    const denied = metrics(new Request('http://localhost/api/internal/metrics'))
    expect(denied.status).toBe(404)
    const wrong = metrics(new Request('http://localhost/api/internal/metrics', {
      headers: { authorization: 'Bearer wrong' },
    }))
    expect(wrong.status).toBe(404)
    const allowed = metrics(new Request('http://localhost/api/internal/metrics', {
      headers: { authorization: 'Bearer internal-metrics-secret' },
    }))
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('content-type')).toContain('text/plain')
    expect(await allowed.text()).toContain('zenui_up')
    expect(() => createMetricsHandler({ secret: '', render: () => '' })).toThrow('METRICS_BEARER_TOKEN is required')
  })
})
