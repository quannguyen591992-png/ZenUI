import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createAssetRepository } from '@zenui/database'

import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { validateAssetOrigin } from './public-asset-api'

import type { PublicAssetDependencies } from './public-asset-api'

let s3: S3Client | undefined
const e2eAssets = new Map<string, Uint8Array>()

export function setE2ePublicAsset(key: string, bytes: Uint8Array): void {
  if (!isE2eRuntimeEnabled()) throw new Error('e2e_runtime_disabled')
  e2eAssets.set(key, bytes)
}

export function getE2ePublicAsset(key: string): Uint8Array | undefined {
  if (!isE2eRuntimeEnabled()) throw new Error('e2e_runtime_disabled')
  return e2eAssets.get(key)
}

export function resetE2ePublicAssets(): void {
  e2eAssets.clear()
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

async function responseBytes(body: unknown): Promise<Uint8Array | null> {
  if (body && typeof body === 'object' && 'transformToByteArray' in body) {
    return (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray()
  }
  return null
}

export function createPublicAssetRouteDependencies(): PublicAssetDependencies {
  const database = getDatabase()
  const assets = createAssetRepository(database)
  const assetOrigin = validateAssetOrigin(required('ASSET_ORIGIN'), required('APP_ORIGIN'))
  if (isE2eRuntimeEnabled()) {
    return {
      assetOrigin,
      assets: { getPublicReady: assetId => assets.getPublicReady(assetId) },
      store: { get: key => Promise.resolve(e2eAssets.get(key) ?? null) },
    }
  }
  const bucket = required('S3_BUCKET')
  s3 ??= new S3Client({
    endpoint: required('S3_ENDPOINT'),
    region: required('S3_REGION'),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: required('S3_ACCESS_KEY'), secretAccessKey: required('S3_SECRET_KEY') },
  })
  return {
    assetOrigin,
    assets: { getPublicReady: assetId => assets.getPublicReady(assetId) },
    store: {
      async get(key) {
        const result = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        return responseBytes(result.Body)
      },
    },
  }
}
