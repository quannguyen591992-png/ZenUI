import { z } from 'zod'

export const DEPLOYMENT_QUEUE_NAME = 'zenui-deployment-v1'
export const DEPLOYMENT_RECONCILIATION_QUEUE_NAME = 'zenui-deployment-reconciliation-v1'
export const DEPLOYMENT_CONTENT_TYPE = 'application/zip'

export const deploymentProviderSchema = z.literal('vercel')
export type DeploymentProvider = z.infer<typeof deploymentProviderSchema>

export const providerConnectionStatusSchema = z.enum(['disconnected', 'connected', 'disabled'])
export type ProviderConnectionStatus = z.infer<typeof providerConnectionStatusSchema>

export const providerConnectionPublicSchema = z.object({
  id: z.string().uuid(),
  provider: deploymentProviderSchema,
  status: providerConnectionStatusSchema,
  connectedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
export type ProviderConnectionPublic = z.infer<typeof providerConnectionPublicSchema>

export const providerAuthorizeRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  returnPath: z.string().regex(/^\/projects\/[0-9a-f-]{36}$/),
}).strict()

export const providerDisconnectRequestSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict()

export const deploymentTargetSchema = z.enum(['preview', 'production'])
export type DeploymentTarget = z.infer<typeof deploymentTargetSchema>

export const deploymentStatusSchema = z.enum(['queued', 'uploading', 'building', 'ready', 'failed'])
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>

export const deploymentErrorCodeSchema = z.enum([
  'connection_missing',
  'connection_disabled',
  'invalid_revision',
  'invalid_artifact',
  'artifact_too_large',
  'storage_unavailable',
  'queue_unavailable',
  'provider_auth',
  'provider_rate_limit',
  'provider_transient',
  'provider_timeout',
  'provider_outcome_unknown',
  'provider_error',
])
export type DeploymentErrorCode = z.infer<typeof deploymentErrorCodeSchema>

export const deploymentCreateRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  revisionId: z.string().uuid(),
  requestId: z.string().uuid(),
  target: deploymentTargetSchema,
  confirmed: z.literal(true),
}).strict()
export type DeploymentCreateRequest = z.infer<typeof deploymentCreateRequestSchema>

export const deploymentJobSchema = z.object({
  deploymentId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
}).strict()
export type DeploymentJob = z.infer<typeof deploymentJobSchema>

const vercelDeploymentUrlSchema = z.url({ protocol: /^https$/ }).refine(value => {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname.endsWith('.vercel.app') && hostname !== '.vercel.app'
  } catch {
    return false
  }
}, 'Deployment URL must use a Vercel hostname')

export const deploymentPublicSchema = z.object({
  id: z.string().uuid(),
  revisionId: z.string().uuid(),
  provider: deploymentProviderSchema,
  target: deploymentTargetSchema,
  status: deploymentStatusSchema,
  url: vercelDeploymentUrlSchema.nullable(),
  errorCode: deploymentErrorCodeSchema.nullable(),
  leadFormsLive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().superRefine((value, context) => {
  if (value.status === 'ready' && !value.url) {
    context.addIssue({ code: 'custom', path: ['url'], message: 'Ready deployments require a URL' })
  }
  if (value.status !== 'ready' && value.url) {
    context.addIssue({ code: 'custom', path: ['url'], message: 'Only ready deployments expose a URL' })
  }
  if (value.status === 'failed' && !value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: 'Failed deployments require an error code' })
  }
  if (value.status !== 'failed' && value.errorCode) {
    context.addIssue({ code: 'custom', path: ['errorCode'], message: 'Only failed deployments expose an error code' })
  }
})
export type DeploymentPublic = z.infer<typeof deploymentPublicSchema>

const transitions: Record<DeploymentStatus, readonly DeploymentStatus[]> = {
  queued: ['uploading', 'failed'],
  uploading: ['building', 'failed'],
  building: ['ready', 'failed'],
  ready: [],
  failed: [],
}

export function canTransitionDeployment(from: DeploymentStatus, to: DeploymentStatus): boolean {
  return transitions[from].includes(to)
}
