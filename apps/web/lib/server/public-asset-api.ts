import { createHash } from 'node:crypto'

import { assetIdSchema } from '@zenui/design-schema'

interface PublicAssetRecord {
  id: string
  status: 'ready' | 'queued' | 'importing' | 'failed'
  objectKey: string | null
  contentType: 'image/webp' | null
  bytes: number | null
  checksum: string | null
}

export interface PublicAssetDependencies {
  assetOrigin: string
  assets: { getPublicReady(assetId: string): Promise<PublicAssetRecord | null> }
  store: { get(key: string): Promise<Uint8Array | null> }
}

export function validateAssetOrigin(assetOrigin: string, editorOrigin: string): string {
  const asset = new URL(assetOrigin)
  const editor = new URL(editorOrigin)
  if (asset.protocol !== 'https:' && asset.hostname !== '127.0.0.1' && asset.hostname !== 'localhost') {
    throw new Error('ASSET_ORIGIN must use HTTPS outside local development')
  }
  if (asset.hostname === editor.hostname) throw new Error('ASSET_ORIGIN must be isolated from APP_ORIGIN')
  return asset.origin
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

export function createPublicAssetHandler(deps: PublicAssetDependencies) {
  return async function GET(
    request: Request,
    route: { params: Promise<{ assetId: string }> },
  ): Promise<Response> {
    let expectedOrigin: string
    try { expectedOrigin = new URL(deps.assetOrigin).origin } catch { return plain('Not found', 404) }
    const requestUrl = new URL(request.url)
    const host = request.headers.get('host')
    const requestOrigin = host ? new URL(`${requestUrl.protocol}//${host}`).origin : requestUrl.origin
    if (requestOrigin !== expectedOrigin) return plain('Not found', 404)
    const parsed = assetIdSchema.safeParse((await route.params).assetId)
    if (!parsed.success) return plain('Not found', 404)
    try {
      const asset = await deps.assets.getPublicReady(parsed.data)
      if (!asset || asset.status !== 'ready' || !asset.objectKey || asset.contentType !== 'image/webp' || !asset.bytes || !asset.checksum) return plain('Not found', 404)
      const content = await deps.store.get(asset.objectKey)
      if (!content || content.byteLength !== asset.bytes || createHash('sha256').update(content).digest('hex') !== asset.checksum) {
        return plain('Asset unavailable', 503)
      }
      const body = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
      return new Response(body, {
        headers: {
          'content-type': 'image/webp',
          'content-length': String(content.byteLength),
          etag: `"${asset.checksum}"`,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'cross-origin-resource-policy': 'cross-origin',
          'referrer-policy': 'no-referrer',
        },
      })
    } catch {
      return plain('Asset unavailable', 503)
    }
  }
}
