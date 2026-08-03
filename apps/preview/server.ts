import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve } from 'node:path'

import { createRemoteImagePolicy } from '@zenui/design-schema'

const port = Number(process.env.PREVIEW_PORT ?? 3001)
const editorOrigin = new URL(process.env.EDITOR_ORIGIN ?? 'http://localhost:3000').origin
const imagePolicy = createRemoteImagePolicy(process.env.REMOTE_IMAGE_HOST_ALLOWLIST ?? '')
const assetOrigin = new URL(process.env.ASSET_ORIGIN ?? 'http://127.0.0.1:3002').origin
const root = resolve(process.cwd(), 'dist')

const types: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

createServer((request, response) => {
  void (async () => {
    try {
    const pathname = new URL(request.url ?? '/', 'http://preview.invalid').pathname
    const filePath = resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1))
    if (!filePath.startsWith(root)) throw new Error('invalid_path')
    let content = await readFile(filePath)
    const nonce = randomBytes(18).toString('base64')
    if (extname(filePath) === '.html') {
      content = Buffer.from(content.toString('utf8').replace(
        '<html lang="en">',
        `<html lang="en" data-nonce="${nonce}" data-remote-image-host-allowlist="${process.env.REMOTE_IMAGE_HOST_ALLOWLIST}" data-asset-origin="${assetOrigin}">`,
      ))
    }
    const csp = [
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      `frame-ancestors ${editorOrigin}`,
      "form-action 'none'",
      "script-src 'self'",
      `style-src 'nonce-${nonce}'`,
      `img-src ${[assetOrigin, ...imagePolicy.sources].join(' ')}`,
      "connect-src 'none'",
      "font-src 'none'",
    ].join('; ')
    response.writeHead(200, {
      'content-type': types[extname(filePath)] ?? 'application/octet-stream',
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'cache-control': 'no-store',
    })
      response.end(content)
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      response.end('Not found')
    }
  })()
}).listen(port, '127.0.0.1')
