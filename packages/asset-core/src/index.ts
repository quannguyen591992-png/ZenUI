import { FONT_ALLOWLIST, type DesignDocument } from '@zenui/design-schema'
import { z } from 'zod'

import type { DesignCommand } from '@zenui/design-commands'

export const ASSET_QUEUE_NAME = 'zenui-assets-v1'
export const ASSET_CONTENT_TYPE = 'image/webp'

export const assetScopeSchema = z.enum(['project', 'workspace'])
export const assetSourceSchema = z.enum(['upload', 'pexels', 'generated', 'derivative'])
export const assetStatusSchema = z.enum(['queued', 'importing', 'ready', 'failed'])
export const assetErrorCodeSchema = z.enum([
  'invalid_source',
  'invalid_image',
  'image_too_large',
  'image_dimensions_exceeded',
  'provider_auth',
  'provider_rate_limit',
  'provider_timeout',
  'provider_error',
  'storage_unavailable',
  'queue_unavailable',
  'import_failed',
])

export type AssetStatus = z.infer<typeof assetStatusSchema>
export type AssetErrorCode = z.infer<typeof assetErrorCodeSchema>

export const assetJobSchema = z.object({
  assetId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()
export type AssetJob = z.infer<typeof assetJobSchema>

export const assetAttributionSchema = z.object({
  provider: z.literal('pexels'),
  creatorName: z.string().min(1).max(200),
  creatorUrl: z.url({ protocol: /^https$/ }),
}).strict()

export const assetPublicSchema = z.object({
  id: z.string().uuid(),
  scope: assetScopeSchema,
  status: assetStatusSchema,
  source: assetSourceSchema,
  width: z.number().int().positive().max(8192).nullable(),
  height: z.number().int().positive().max(8192).nullable(),
  bytes: z.number().int().positive().max(20 * 1024 * 1024).nullable(),
  contentType: z.literal(ASSET_CONTENT_TYPE).nullable(),
  defaultAlt: z.string().max(300),
  attribution: assetAttributionSchema.nullable(),
  errorCode: assetErrorCodeSchema.nullable(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  const normalized = value.width !== null && value.height !== null && value.bytes !== null && value.contentType !== null
  if (value.status === 'ready' && !normalized) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Ready assets require normalized metadata' })
  }
  if (value.status !== 'ready' && normalized) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Only ready assets expose normalized metadata' })
  }
  if (value.status === 'failed' && !value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: 'Failed assets require an error code' })
  }
  if (value.status !== 'failed' && value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: 'Only failed assets expose an error code' })
  }
})
export type AssetAttribution = z.infer<typeof assetAttributionSchema>
export type AssetPublic = z.infer<typeof assetPublicSchema>

export const assetUploadQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  scope: assetScopeSchema,
  filename: z.string().trim().min(1).max(200).regex(/\.(?:jpe?g|png|webp)$/i),
  defaultAlt: z.string().trim().min(1).max(300),
}).strict()

export const assetImportRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  resultId: z.string().regex(/^\d{1,20}$/),
  defaultAlt: z.string().trim().min(1).max(300),
}).strict()

export const assetSearchQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  query: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(12),
}).strict()

export const cropTransformSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
  outputWidth: z.number().int().min(64).max(4096),
  outputHeight: z.number().int().min(64).max(4096),
}).strict().superRefine((value, context) => {
  if (value.x + value.width > 1) context.addIssue({ code: 'custom', path: ['width'], message: 'Crop exceeds source width' })
  if (value.y + value.height > 1) context.addIssue({ code: 'custom', path: ['height'], message: 'Crop exceeds source height' })
})
export type CropTransform = z.infer<typeof cropTransformSchema>

export const assetDerivativeRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestId: z.string().uuid(),
  transform: cropTransformSchema,
}).strict()

export const assetArchiveRequestSchema = z.object({ workspaceId: z.string().uuid() }).strict()

function channel(hex: string): number {
  const value = Number.parseInt(hex, 16) / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(color: string): number {
  const parsed = /^#([0-9a-f]{6})$/i.exec(color)
  if (!parsed?.[1]) return Number.NaN
  return 0.2126 * channel(parsed[1].slice(0, 2))
    + 0.7152 * channel(parsed[1].slice(2, 4))
    + 0.0722 * channel(parsed[1].slice(4, 6))
}

export function contrastRatio(left: string, right: string): number {
  const leftValue = luminance(left)
  const rightValue = luminance(right)
  if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0
  const lighter = Math.max(leftValue, rightValue)
  const darker = Math.min(leftValue, rightValue)
  return (lighter + 0.05) / (darker + 0.05)
}

export function meetsContrast(left: string, right: string, minimum: number): boolean {
  return contrastRatio(left, right) >= minimum
}

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const brandKitValuesSchema = z.object({
  name: z.string().trim().min(1).max(100),
  logoAssetId: z.string().uuid().nullable().optional(),
  colors: z.object({
    primary: hexColorSchema,
    background: hexColorSchema,
    text: hexColorSchema,
  }).strict(),
  fonts: z.object({
    heading: z.enum(FONT_ALLOWLIST),
    body: z.enum(FONT_ALLOWLIST),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (!meetsContrast(value.colors.text, value.colors.background, 4.5)) {
    context.addIssue({ code: 'custom', path: ['colors', 'text'], message: 'Text and background require at least 4.5:1 contrast' })
  }
  if (!meetsContrast(value.colors.primary, value.colors.background, 3)) {
    context.addIssue({ code: 'custom', path: ['colors', 'primary'], message: 'Primary and background require at least 3:1 contrast' })
  }
})
export const brandKitSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(100),
  logoAssetId: z.string().uuid().nullable().optional(),
  colors: z.object({
    primary: hexColorSchema,
    background: hexColorSchema,
    text: hexColorSchema,
  }).strict(),
  fonts: z.object({
    heading: z.enum(FONT_ALLOWLIST),
    body: z.enum(FONT_ALLOWLIST),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (!meetsContrast(value.colors.text, value.colors.background, 4.5)) {
    context.addIssue({ code: 'custom', path: ['colors', 'text'], message: 'Text and background require at least 4.5:1 contrast' })
  }
  if (!meetsContrast(value.colors.primary, value.colors.background, 3)) {
    context.addIssue({ code: 'custom', path: ['colors', 'primary'], message: 'Primary and background require at least 3:1 contrast' })
  }
})
export type BrandKit = z.infer<typeof brandKitSchema>

export const brandKitUpdateRequestSchema = brandKitValuesSchema.extend({
  expectedVersion: z.number().int().nonnegative(),
}).strict()

export const brandKitApplyRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  expectedBrandKitVersion: z.number().int().positive(),
  expectedDocumentVersion: z.number().int().positive(),
}).strict()

export function createBrandApplicationCommands(input: {
  document: DesignDocument
  documentVersion: number
  brandKit: BrandKit
}): DesignCommand[] {
  const brandKit = brandKitSchema.parse(input.brandKit)
  const metadata = { documentVersion: input.documentVersion, source: 'user' as const }
  const commands: DesignCommand[] = [{
    ...metadata,
    commandId: `brand-${brandKit.version}-theme`,
    type: 'UPDATE_THEME',
    patch: {
      colors: brandKit.colors,
      fonts: brandKit.fonts,
      radius: input.document.theme.radius,
    },
  }]
  for (const node of Object.values(input.document.nodes)) {
    if (node.type === 'navbar') {
      commands.push({
        ...metadata,
        commandId: `brand-${brandKit.version}-${node.id}`,
        type: 'UPDATE_PROPS',
        nodeId: node.id,
        patch: { brand: brandKit.name },
      })
    }
    if (node.type === 'link' && 'brandSlot' in node.props && node.props.brandSlot === true) {
      commands.push({
        ...metadata,
        commandId: `brand-${brandKit.version}-${node.id}`,
        type: 'UPDATE_PROPS',
        nodeId: node.id,
        patch: {
          text: brandKit.name,
          logoAssetId: brandKit.logoAssetId ?? undefined,
          logoAlt: brandKit.logoAssetId ? brandKit.name : undefined,
        },
      })
    }
  }
  return commands
}
