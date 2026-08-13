import { z } from 'zod'

export const SHARE_SLUG_BYTES = 24
export const SHARE_SLUG_LENGTH = 32
export const SHARE_ROBOTS_POLICY = 'noindex, nofollow, noarchive'

export const shareSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/)
export const shareStoredStatusSchema = z.enum(['active', 'disabled'])
export type ShareStoredStatus = z.infer<typeof shareStoredStatusSchema>
export const shareStatusSchema = z.enum(['active', 'disabled', 'expired'])
export type ShareStatus = z.infer<typeof shareStatusSchema>

export const shareCreateRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  revisionId: z.string().uuid(),
  requestId: z.string().uuid(),
}).strict()

export const shareDisableRequestSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict()

export const shareLinkPublicSchema = z.object({
  id: z.string().uuid(),
  revisionId: z.string().uuid(),
  url: z.url({ protocol: /^https?$/ }),
  status: shareStatusSchema,
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  leadFormsLive: z.boolean(),
}).strict()
export type ShareLinkPublic = z.infer<typeof shareLinkPublicSchema>

export function resolveShareStatus(
  status: ShareStoredStatus,
  expiresAt: Date | null,
  now = new Date(),
): ShareStatus {
  if (status === 'disabled') return 'disabled'
  return expiresAt && expiresAt <= now ? 'expired' : 'active'
}
