import { createHash } from 'node:crypto'

import { z } from 'zod'

export const EXPORT_QUEUE_NAME = 'zenui-export-v1'
export const EXPORT_CONTENT_TYPE = 'application/zip'
export const EXPORT_FILENAME = 'zenui-export.zip'
export const DEFAULT_MAX_EXPORT_ARCHIVE_BYTES = 10 * 1024 * 1024

export const exportStatusSchema = z.enum(['queued', 'running', 'completed', 'failed'])
export type ExportStatus = z.infer<typeof exportStatusSchema>

export const exportErrorCodeSchema = z.enum([
  'invalid_document',
  'artifact_too_large',
  'storage_unavailable',
  'export_failed',
  'queue_unavailable',
  'stale_document_version',
])
export type ExportErrorCode = z.infer<typeof exportErrorCodeSchema>

export const exportRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
}).strict()

export const exportJobSchema = z.object({
  exportRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()
export type ExportJob = z.infer<typeof exportJobSchema>

export const exportArtifactSchema = z.object({
  bytes: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  contentType: z.literal(EXPORT_CONTENT_TYPE),
  routeCount: z.number().int().min(1).max(20),
}).strict()
export type ExportArtifact = z.infer<typeof exportArtifactSchema>

export const exportRunPublicSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  status: exportStatusSchema,
  expectedVersion: z.number().int().positive(),
  documentVersion: z.number().int().positive(),
  artifact: exportArtifactSchema.nullable(),
  errorCode: exportErrorCodeSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
export type ExportRunPublic = z.infer<typeof exportRunPublicSchema>

export interface ExportObjectStore {
  put(input: { key: string; content: Uint8Array; contentType: typeof EXPORT_CONTENT_TYPE; checksum: string }): Promise<void>
  get(key: string): Promise<Uint8Array | null>
}

interface ArchiveInputFile {
  path: string
  content: string | Uint8Array
}

interface ArchiveEntry {
  path: string
  content: Uint8Array
  crc32: number
  offset: number
}

function archivePath(path: string): string {
  if (!/^(?:[a-z0-9-]+\/)*[a-z0-9.-]+$/.test(path) || path.includes('..') || path.startsWith('/')) {
    throw new Error('invalid_archive_path')
  }
  return path
}

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of input) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint16(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff])
}

function uint32(value: number): Uint8Array {
  return Uint8Array.from([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

function localHeader(entry: ArchiveEntry, name: Uint8Array): Uint8Array {
  return concat([
    uint32(0x04034b50), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0),
    uint32(entry.crc32), uint32(entry.content.byteLength), uint32(entry.content.byteLength),
    uint16(name.byteLength), uint16(0), name, entry.content,
  ])
}

function centralHeader(entry: ArchiveEntry, name: Uint8Array): Uint8Array {
  return concat([
    uint32(0x02014b50), uint16(20), uint16(20), uint16(0x0800), uint16(0), uint16(0), uint16(0),
    uint32(entry.crc32), uint32(entry.content.byteLength), uint32(entry.content.byteLength),
    uint16(name.byteLength), uint16(0), uint16(0), uint16(0), uint16(0), uint32(0), uint32(entry.offset), name,
  ])
}

export function createDeterministicSiteArchive(
  files: readonly ArchiveInputFile[],
  options: { maxBytes?: number } = {},
): { content: Uint8Array; bytes: number; checksum: string; routeCount: number } {
  if (files.length < 1 || files.length > 20) throw new Error('invalid_archive_file_count')
  const encoder = new TextEncoder()
  const seen = new Set<string>()
  const entries: ArchiveEntry[] = files
    .map(file => ({ path: archivePath(file.path), content: typeof file.content === 'string' ? encoder.encode(file.content) : file.content }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => {
      if (seen.has(file.path)) throw new Error('duplicate_archive_path')
      seen.add(file.path)
      return { ...file, crc32: crc32(file.content), offset: 0 }
    })

  const localParts: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    entry.offset = offset
    const local = localHeader(entry, encoder.encode(entry.path))
    localParts.push(local)
    offset += local.byteLength
  }
  const centralParts = entries.map(entry => centralHeader(entry, encoder.encode(entry.path)))
  const central = concat(centralParts)
  const end = concat([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(central.byteLength), uint32(offset), uint16(0),
  ])
  const content = concat([...localParts, central, end])
  if (content.byteLength > (options.maxBytes ?? DEFAULT_MAX_EXPORT_ARCHIVE_BYTES)) throw new Error('archive_too_large')
  return {
    content,
    bytes: content.byteLength,
    checksum: createHash('sha256').update(content).digest('hex'),
    routeCount: entries.length,
  }
}
