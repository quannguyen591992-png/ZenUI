import { createServer } from 'node:http'

import { proxyAssetRequest } from './dev-runtime.mjs'

const assetOrigin = new URL(process.env.ASSET_ORIGIN)
if (assetOrigin.hostname !== '127.0.0.1' && assetOrigin.hostname !== 'localhost') {
  throw new Error('Local asset server requires a loopback ASSET_ORIGIN')
}

const port = Number(assetOrigin.port || (assetOrigin.protocol === 'https:' ? 443 : 80))

const server = createServer(async (request, response) => {
  if (request.url === '/__zenui/asset-health') {
    response.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    response.end('ready')
    return
  }

  try {
    const upstream = await proxyAssetRequest(request)
    response.writeHead(upstream.status, upstream.headers)
    response.end(upstream.body)
  } catch {
    response.writeHead(503, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    response.end('Asset unavailable')
  }
})

server.listen(port, assetOrigin.hostname)
