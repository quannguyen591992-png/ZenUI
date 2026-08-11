import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect } from 'node:net'

export const DEV_PORTS = [3000, 3001, 9464]
export const VERCEL_CALLBACK_PATH = '/api/v1/provider-connections/vercel/callback'

export function getDevPorts(environment = process.env) {
  const ports = new Set(DEV_PORTS)
  try {
    const assetOrigin = new URL(environment.ASSET_ORIGIN)
    const port = Number(assetOrigin.port || (assetOrigin.protocol === 'https:' ? 443 : 80))
    if (assetOrigin.hostname === '127.0.0.1' || assetOrigin.hostname === 'localhost') ports.add(port)
  } catch {
    // Required runtime configuration reports invalid ASSET_ORIGIN separately.
  }
  return [...ports].sort((left, right) => left - right)
}

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

export async function assertDevPortsAvailable(check = isPortAvailable, environment = process.env) {
  const occupied = []
  for (const port of getDevPorts(environment)) {
    if (!await check(port)) occupied.push(port)
  }
  if (occupied.length > 0) {
    throw new Error(`ZenUI dev ports are already in use: ${occupied.join(', ')}. Stop the previous ZenUI dev process before running pnpm dev.`)
  }
}

export function proxyAssetRequest(request, environment = process.env, requestOverride) {
  const assetOrigin = new URL(environment.ASSET_ORIGIN)
  const upstreamUrl = new URL(request.url ?? '/', new URL(environment.APP_ORIGIN).origin)
  if (
    request.method !== 'GET'
    || !/^\/a\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(upstreamUrl.pathname)
    || upstreamUrl.search
    || upstreamUrl.hash
  ) {
    return Promise.resolve({
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
      body: Buffer.from('Not found'),
    })
  }
  const headers = {}
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (value === undefined || name === 'host' || name === 'cookie') continue
    headers[name] = Array.isArray(value) ? value.join(', ') : value
  }
  headers.host = assetOrigin.host
  const requester = requestOverride
    ?? (upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest)

  return new Promise((resolve, reject) => {
    const upstreamRequest = requester(upstreamUrl, {
      method: request.method,
      headers,
    }, async upstream => {
      try {
        const chunks = []
        for await (const chunk of upstream) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks)
        const responseHeaders = { ...upstream.headers }
        delete responseHeaders['set-cookie']
        delete responseHeaders['content-encoding']
        delete responseHeaders['transfer-encoding']
        responseHeaders['content-length'] = String(body.byteLength)
        resolve({
          status: upstream.statusCode ?? 502,
          headers: responseHeaders,
          body,
        })
      } catch (error) {
        reject(error)
      }
    })
    upstreamRequest.on('error', reject)
    upstreamRequest.end?.()
  })
}

export function isExpectedWorkerInstance(value, instanceId) {
  if (!value || typeof value !== 'object') return false
  const record = value
  return record.service === 'worker'
    && record.instanceId === instanceId
    && Array.isArray(record.services)
    && record.services.includes('generation')
}

export async function waitForDevReadiness(instanceId, fetcher = fetch, attempts = 120, environment = process.env) {
  const assetHealthUrl = `${new URL(environment.ASSET_ORIGIN).origin}/__zenui/asset-health`
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const [web, preview, asset, worker, instance] = await Promise.all([
        fetcher('http://localhost:3000'),
        fetcher('http://127.0.0.1:3001'),
        fetcher(assetHealthUrl),
        fetcher('http://127.0.0.1:9464/health/ready'),
        fetcher('http://127.0.0.1:9464/health/instance'),
      ])
      const identity = instance.ok ? await instance.json() : null
      if (web.ok && preview.ok && asset.ok && worker.ok && isExpectedWorkerInstance(identity, instanceId)) return
    } catch {
      // Services are still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('ZenUI dev topology did not become ready with the expected generation worker.')
}
