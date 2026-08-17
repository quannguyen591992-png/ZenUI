import { createHash } from 'node:crypto'

import { fontRequestSchema } from '@zenui/font-library'

import type { FontId, FontSubset } from '@zenui/font-library'

interface PublicFontValue {
  bytes: Uint8Array
  checksum: string
}

export interface PublicFontDependencies {
  assetOrigin: string
  load(fontId: FontId, subset: FontSubset): Promise<PublicFontValue>
}

function plain(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

export function createPublicFontHandler(deps: PublicFontDependencies) {
  return async function GET(
    request: Request,
    route: { params: Promise<{ fontId: string; subset: string }> },
  ): Promise<Response> {
    let expectedOrigin: string
    try { expectedOrigin = new URL(deps.assetOrigin).origin } catch { return plain('Not found', 404) }
    const requestUrl = new URL(request.url)
    const host = request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const protocol = forwardedProto === 'https' || forwardedProto === 'http'
      ? `${forwardedProto}:`
      : requestUrl.protocol
    const requestOrigin = host
      ? new URL(`${protocol}//${host}`).origin
      : requestUrl.origin
    if (requestOrigin !== expectedOrigin) return plain('Not found', 404)

    const raw = await route.params
    const subset = raw.subset.endsWith('.woff2') ? raw.subset.slice(0, -6) : raw.subset
    const parsed = fontRequestSchema.safeParse({ fontId: raw.fontId, subset })
    if (!parsed.success) return plain('Not found', 404)

    try {
      const loaded = await deps.load(parsed.data.fontId, parsed.data.subset)
      const checksum = createHash('sha256').update(loaded.bytes).digest('hex')
      if (checksum !== loaded.checksum) return plain('Font unavailable', 503)
      const body = loaded.bytes.buffer.slice(
        loaded.bytes.byteOffset,
        loaded.bytes.byteOffset + loaded.bytes.byteLength,
      ) as ArrayBuffer
      return new Response(body, {
        headers: {
          'content-type': 'font/woff2',
          'content-length': String(loaded.bytes.byteLength),
          etag: `"${loaded.checksum}"`,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'access-control-allow-origin': '*',
          'cross-origin-resource-policy': 'cross-origin',
          'referrer-policy': 'no-referrer',
        },
      })
    } catch {
      return plain('Font unavailable', 503)
    }
  }
}
