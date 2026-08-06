import { afterEach, describe, expect, it, vi } from 'vitest'

import { createWorkerOperationsServer } from '../src/operations-server.js'

const servers: { close(): Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.close()))
})

describe('worker operations server', () => {
  it('serves liveness, aggregate readiness and protected metrics', async () => {
    const server = createWorkerOperationsServer({
      host: '127.0.0.1',
      port: 0,
      metricsSecret: 'internal-secret',
      instanceId: '11111111111111111111111111111111',
      services: ['generation', 'export'],
      probes: {
        postgres: vi.fn().mockResolvedValue(true),
        redis: vi.fn().mockResolvedValue(true),
        object_store: vi.fn().mockResolvedValue(false),
      },
      renderMetrics: () => '# TYPE zenui_service_up gauge\nzenui_service_up{service="worker"} 1\n',
    })
    servers.push(server)
    const address = await server.start()
    const base = `http://127.0.0.1:${address.port}`

    await expect(fetch(`${base}/health/live`).then(response => response.json()))
      .resolves.toEqual({ service: 'worker', status: 'live' })
    await expect(fetch(`${base}/health/instance`).then(response => response.json())).resolves.toEqual({
      service: 'worker', instanceId: '11111111111111111111111111111111', services: ['generation', 'export'],
    })
    const readiness = await fetch(`${base}/health/ready`)
    expect(readiness.status).toBe(503)
    await expect(readiness.json()).resolves.toEqual({
      service: 'worker', status: 'degraded', dependencies: [
        { name: 'postgres', status: 'ready' },
        { name: 'redis', status: 'ready' },
        { name: 'object_store', status: 'degraded' },
      ],
    })
    expect((await fetch(`${base}/metrics`)).status).toBe(404)
    expect((await fetch(`${base}/metrics`, { headers: { authorization: 'Basic internal-secret' } })).status).toBe(404)
    expect((await fetch(`${base}/missing`)).status).toBe(404)
    expect((await fetch(`${base}/health/live`, { method: 'POST' })).status).toBe(404)
    const metrics = await fetch(`${base}/metrics`, { headers: { authorization: 'Bearer internal-secret' } })
    expect(metrics.status).toBe(200)
    expect(await metrics.text()).toContain('zenui_service_up')
  })

  it('reports ready when every configured dependency probe succeeds', async () => {
    const server = createWorkerOperationsServer({
      host: '127.0.0.1', port: 0, metricsSecret: 'secret',
      instanceId: '33333333333333333333333333333333', services: ['generation'],
      probes: {
        postgres: vi.fn().mockResolvedValue(true),
        redis: vi.fn().mockResolvedValue(true),
      },
      renderMetrics: () => '',
    })
    servers.push(server)
    const address = await server.start()
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      service: 'worker', status: 'ready',
      dependencies: [
        { name: 'postgres', status: 'ready' },
        { name: 'redis', status: 'ready' },
      ],
    })
  })

  it('rejects invalid configuration and duplicate starts', async () => {
    expect(() => createWorkerOperationsServer({
      host: '127.0.0.1', port: 0, metricsSecret: '', instanceId: '22222222222222222222222222222222', services: [], probes: {}, renderMetrics: () => '',
    })).toThrow('METRICS_BEARER_TOKEN is required')
    expect(() => createWorkerOperationsServer({
      host: '127.0.0.1', port: 65_536, metricsSecret: 'secret', instanceId: '22222222222222222222222222222222', services: [], probes: {}, renderMetrics: () => '',
    })).toThrow('invalid_operations_port')

    const server = createWorkerOperationsServer({
      host: '127.0.0.1', port: 0, metricsSecret: 'secret', instanceId: '22222222222222222222222222222222', services: [],
      probes: { postgres: vi.fn().mockRejectedValue(new Error('unavailable')) }, renderMetrics: () => '',
    })
    servers.push(server)
    const address = await server.start()
    expect(() => server.start()).toThrow('operations_server_started')
    expect((await fetch(`http://127.0.0.1:${address.port}/health/ready`)).status).toBe(503)
  })

  it('stops accepting requests on close', async () => {
    const server = createWorkerOperationsServer({
      host: '127.0.0.1', port: 0, metricsSecret: 'secret', instanceId: '22222222222222222222222222222222', services: [],
      probes: { postgres: vi.fn().mockResolvedValue(true) }, renderMetrics: () => '',
    })
    const address = await server.start()
    await server.close()
    await expect(fetch(`http://127.0.0.1:${address.port}/health/live`)).rejects.toThrow()
  })
})
