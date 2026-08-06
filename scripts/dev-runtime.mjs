import { connect } from 'node:net'

export const DEV_PORTS = [3000, 3001, 9464]
export const VERCEL_CALLBACK_PATH = '/api/v1/provider-connections/vercel/callback'

export function assertVercelRedirectConfiguration(environment = process.env) {
  if (environment.VERCEL_DEPLOYMENT_ENABLED !== 'true') return
  try {
    const appOrigin = new URL(environment.APP_ORIGIN).origin
    const redirect = new URL(environment.VERCEL_REDIRECT_URI)
    if (redirect.origin !== appOrigin || redirect.pathname !== VERCEL_CALLBACK_PATH || redirect.search || redirect.hash) {
      throw new Error('mismatch')
    }
  } catch {
    throw new Error(`VERCEL_REDIRECT_URI must exactly match APP_ORIGIN plus ${VERCEL_CALLBACK_PATH}`)
  }
}

export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = connect({ port, host })
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => resolve(true))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(true)
    })
  })
}

export async function assertDevPortsAvailable(check = isPortAvailable) {
  const occupied = []
  for (const port of DEV_PORTS) {
    if (!await check(port)) occupied.push(port)
  }
  if (occupied.length > 0) {
    throw new Error(`ZenUI dev ports are already in use: ${occupied.join(', ')}. Stop the previous ZenUI dev process before running pnpm dev.`)
  }
}

export function isExpectedWorkerInstance(value, instanceId) {
  if (!value || typeof value !== 'object') return false
  const record = value
  return record.service === 'worker'
    && record.instanceId === instanceId
    && Array.isArray(record.services)
    && record.services.includes('generation')
}

export async function waitForDevReadiness(instanceId, fetcher = fetch, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [web, preview, worker, instance] = await Promise.all([
        fetcher('http://localhost:3000'),
        fetcher('http://127.0.0.1:3001'),
        fetcher('http://127.0.0.1:9464/health/ready'),
        fetcher('http://127.0.0.1:9464/health/instance'),
      ])
      const identity = instance.ok ? await instance.json() : null
      if (web.ok && preview.ok && worker.ok && isExpectedWorkerInstance(identity, instanceId)) return
    } catch {
      // Services are still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('ZenUI dev topology did not become ready with the expected generation worker.')
}
