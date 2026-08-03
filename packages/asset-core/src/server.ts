import { createHash } from 'node:crypto'
import { promises as dns } from 'node:dns'
import { isIP } from 'node:net'

import sharp from 'sharp'
import { z } from 'zod'

import { assetAttributionSchema } from './index'

import type { AssetErrorCode } from './index'

export class AssetPipelineError extends Error {
  constructor(public readonly code: AssetErrorCode) {
    super(code)
    this.name = 'AssetPipelineError'
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

export function validateImageSourceUrl(input: string, allowedHosts: readonly string[]): URL {
  let url: URL
  try {
    if (input.startsWith('//')) throw new Error('protocol_relative')
    url = new URL(input)
  } catch {
    throw new AssetPipelineError('invalid_source')
  }
  const hostname = normalizeHostname(url.hostname)
  const allowed = new Set(allowedHosts.map(normalizeHostname))
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.hash
    || isIP(hostname) !== 0
    || hostname === 'localhost'
    || !allowed.has(hostname)
  ) throw new AssetPipelineError('invalid_source')
  return url
}

function ipv4Number(input: string): number {
  return input.split('.').reduce((total, value) => total * 256 + Number(value), 0) >>> 0
}

function inIpv4Range(input: string, base: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4Number(input) & mask) === (ipv4Number(base) & mask)
}

const deniedIpv4Ranges = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const

function mappedIpv4(input: string): string | null {
  const match = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(input)
  return match?.[1] ?? null
}

function isGlobalAddress(input: string): boolean {
  const kind = isIP(input)
  if (kind === 4) return !deniedIpv4Ranges.some(([base, prefix]) => inIpv4Range(input, base, prefix))
  if (kind !== 6) return false
  const normalized = input.toLowerCase()
  const mapped = mappedIpv4(normalized)
  if (mapped) return isGlobalAddress(mapped)
  return normalized !== '::'
    && normalized !== '::1'
    && !normalized.startsWith('fc')
    && !normalized.startsWith('fd')
    && !/^fe[89ab]/.test(normalized)
    && !normalized.startsWith('ff')
    && !normalized.startsWith('2001:db8:')
}

export function assertGlobalAddresses(addresses: readonly string[]): string[] {
  if (addresses.length === 0 || addresses.some(address => !isGlobalAddress(address))) {
    throw new AssetPipelineError('invalid_source')
  }
  return [...addresses]
}

export async function readBoundedBody(chunks: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new AssetPipelineError('image_too_large')
  const parts: Uint8Array[] = []
  let total = 0
  for await (const chunk of chunks) {
    total += chunk.byteLength
    if (total > maxBytes) throw new AssetPipelineError('image_too_large')
    parts.push(chunk)
  }
  if (total === 0) throw new AssetPipelineError('invalid_image')
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

export type RasterType = 'jpeg' | 'png' | 'webp'

function magicType(bytes: Uint8Array): RasterType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp'
  return null
}

const rasterMime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const

export function detectRasterType(bytes: Uint8Array, contentType: string): RasterType {
  const type = magicType(bytes)
  if (!type || rasterMime[type] !== contentType.toLowerCase()) throw new AssetPipelineError('invalid_image')
  return type
}

export interface NormalizedRaster {
  bytes: Uint8Array
  width: number
  height: number
  checksum: string
  contentType: 'image/webp'
}

export async function normalizeRasterImage(input: Uint8Array, limits: {
  maxInputPixels: number
  maxWidth: number
  maxHeight: number
  maxOutputBytes: number
  transform?: {
    x: number
    y: number
    width: number
    height: number
    outputWidth: number
    outputHeight: number
  }
}): Promise<NormalizedRaster> {
  try {
    const metadata = await sharp(input, { limitInputPixels: limits.maxInputPixels, animated: false }).metadata()
    if (!metadata.width || !metadata.height || metadata.pages && metadata.pages > 1) {
      throw new AssetPipelineError('invalid_image')
    }
    if (metadata.width * metadata.height > limits.maxInputPixels) {
      throw new AssetPipelineError('image_dimensions_exceeded')
    }
    let pipeline = sharp(input, { limitInputPixels: limits.maxInputPixels, animated: false }).rotate()
    if (limits.transform) {
      const left = Math.floor(limits.transform.x * metadata.width)
      const top = Math.floor(limits.transform.y * metadata.height)
      const width = Math.max(1, Math.min(metadata.width - left, Math.floor(limits.transform.width * metadata.width)))
      const height = Math.max(1, Math.min(metadata.height - top, Math.floor(limits.transform.height * metadata.height)))
      pipeline = pipeline.extract({ left, top, width, height }).resize({
        width: limits.transform.outputWidth,
        height: limits.transform.outputHeight,
        fit: 'fill',
      })
    } else {
      pipeline = pipeline.resize({ width: limits.maxWidth, height: limits.maxHeight, fit: 'inside', withoutEnlargement: true })
    }
    const result = await pipeline
      .webp({ quality: 82, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })
    if (result.data.byteLength > limits.maxOutputBytes) throw new AssetPipelineError('image_too_large')
    return {
      bytes: new Uint8Array(result.data),
      width: result.info.width,
      height: result.info.height,
      checksum: createHash('sha256').update(result.data).digest('hex'),
      contentType: 'image/webp',
    }
  } catch (error) {
    if (error instanceof AssetPipelineError) throw error
    const message = error instanceof Error ? error.message.toLowerCase() : ''
    if (message.includes('pixel limit') || message.includes('input image exceeds')) {
      throw new AssetPipelineError('image_dimensions_exceeded')
    }
    throw new AssetPipelineError('invalid_image')
  }
}

const pexelsPhotoSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().min(1)]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  photographer: z.string().min(1).max(200),
  photographer_url: z.url({ protocol: /^https$/ }),
  src: z.object({
    medium: z.url({ protocol: /^https$/ }),
    large2x: z.url({ protocol: /^https$/ }),
  }).passthrough(),
  alt: z.string().trim().min(1).max(300),
}).passthrough()

const pexelsSearchSchema = z.object({ photos: z.array(pexelsPhotoSchema).max(80) }).passthrough()

export function createPexelsAdapter(config: {
  apiKey: string
  fetch?: typeof globalThis.fetch
  resolveHost?: (hostname: string) => Promise<string[]>
  timeoutMs?: number
  maxDownloadBytes?: number
}) {
  if (!config.apiKey) throw new AssetPipelineError('provider_auth')
  const fetcher = config.fetch ?? globalThis.fetch
  const resolveHost = config.resolveHost ?? (async hostname => (
    await dns.lookup(hostname, { all: true, verbatim: true })
  ).map(result => result.address))
  const timeoutMs = config.timeoutMs ?? 15_000
  const maxDownloadBytes = config.maxDownloadBytes ?? 8 * 1024 * 1024

  const request = async (url: URL, headers: HeadersInit): Promise<Response> => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetcher(url, { headers, redirect: 'manual', signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) throw new AssetPipelineError('provider_timeout')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  const providerPhoto = async (resultId: string) => {
    const id = z.string().regex(/^\d{1,20}$/).parse(resultId)
    const response = await request(new URL(`https://api.pexels.com/v1/photos/${id}`), {
      authorization: config.apiKey, accept: 'application/json',
    })
    if (!response.ok) {
      const code: AssetErrorCode = response.status === 401 || response.status === 403
        ? 'provider_auth'
        : response.status === 429 ? 'provider_rate_limit' : 'provider_error'
      throw new AssetPipelineError(code)
    }
    const parsed = pexelsPhotoSchema.safeParse(await response.json())
    if (!parsed.success || String(parsed.data.id) !== id) throw new AssetPipelineError('provider_error')
    return parsed.data
  }

  return {
    async search(query: string, limit = 12) {
      const normalized = z.string().trim().min(2).max(200).parse(query)
      const boundedLimit = Math.max(1, Math.min(limit, 30))
      try {
        const url = new URL('https://api.pexels.com/v1/search')
        url.searchParams.set('query', normalized)
        url.searchParams.set('per_page', String(boundedLimit))
        const response = await request(url, { authorization: config.apiKey, accept: 'application/json' })
        if (!response.ok) {
          const code: AssetErrorCode = response.status === 401 || response.status === 403
            ? 'provider_auth'
            : response.status === 429 ? 'provider_rate_limit' : 'provider_error'
          throw new AssetPipelineError(code)
        }
        const parsed = pexelsSearchSchema.safeParse(await response.json())
        if (!parsed.success) throw new AssetPipelineError('provider_error')
        return parsed.data.photos.slice(0, boundedLimit).map(photo => ({
          resultId: String(photo.id),
          width: photo.width,
          height: photo.height,
          previewUrl: photo.src.medium,
          alt: photo.alt,
          attribution: assetAttributionSchema.parse({
            provider: 'pexels', creatorName: photo.photographer, creatorUrl: photo.photographer_url,
          }),
        }))
      } catch (error) {
        if (error instanceof AssetPipelineError) throw error
        throw new AssetPipelineError('provider_error')
      }
    },

    async resolve(resultId: string) {
      try {
        const photo = await providerPhoto(resultId)
        const sourceUrl = validateImageSourceUrl(photo.src.large2x, ['images.pexels.com'])
        assertGlobalAddresses(await resolveHost(sourceUrl.hostname))
        const response = await request(sourceUrl, { accept: 'image/jpeg,image/png,image/webp' })
        if (response.status >= 300 && response.status < 400) throw new AssetPipelineError('invalid_source')
        if (!response.ok || !response.body) throw new AssetPipelineError('provider_error')
        const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
        const declaredLength = Number(response.headers.get('content-length'))
        if (Number.isFinite(declaredLength) && declaredLength > maxDownloadBytes) throw new AssetPipelineError('image_too_large')
        const chunks = (async function* () {
          const reader = response.body!.getReader()
          try {
            while (true) {
              const result = await reader.read()
              if (result.done) return
              yield result.value
            }
          } finally {
            reader.releaseLock()
          }
        })()
        const bytes = await readBoundedBody(chunks, maxDownloadBytes)
        detectRasterType(bytes, contentType)
        return {
          bytes,
          contentType,
          attribution: assetAttributionSchema.parse({
            provider: 'pexels', creatorName: photo.photographer, creatorUrl: photo.photographer_url,
          }),
        }
      } catch (error) {
        if (error instanceof AssetPipelineError) throw error
        throw new AssetPipelineError('provider_error')
      }
    },
  }
}
