import { describe, expect, it } from 'vitest'

import {
  DEPLOYMENT_QUEUE_NAME,
  canTransitionDeployment,
  deploymentCreateRequestSchema,
  deploymentJobSchema,
  deploymentPublicSchema,
  providerConnectionPublicSchema,
} from '../src/index'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const deploymentId = '44444444-4444-4444-8444-444444444444'
const requestId = '55555555-5555-4555-8555-555555555555'
const userId = '66666666-6666-4666-8666-666666666666'

it('accepts only explicit immutable deployment requests', () => {
  const request = { workspaceId, revisionId, requestId, target: 'preview', confirmed: true }
  expect(deploymentCreateRequestSchema.parse(request)).toEqual(request)
  expect(deploymentCreateRequestSchema.safeParse({ ...request, confirmed: false }).success).toBe(false)
  expect(deploymentCreateRequestSchema.safeParse({ ...request, target: 'staging' }).success).toBe(false)
  expect(deploymentCreateRequestSchema.safeParse({ ...request, expectedVersion: 1 }).success).toBe(false)
})

it('keeps queue jobs limited to local identifiers', () => {
  const job = { deploymentId, projectId, workspaceId, userId }
  expect(DEPLOYMENT_QUEUE_NAME).toBe('zenui-deployment-v1')
  expect(deploymentJobSchema.parse(job)).toEqual(job)
  expect(deploymentJobSchema.safeParse({ ...job, token: 'secret', document: {} }).success).toBe(false)
})

describe('deployment state machine', () => {
  it('allows only forward transitions and failures from non-terminal states', () => {
    expect(canTransitionDeployment('queued', 'uploading')).toBe(true)
    expect(canTransitionDeployment('uploading', 'building')).toBe(true)
    expect(canTransitionDeployment('building', 'ready')).toBe(true)
    expect(canTransitionDeployment('queued', 'failed')).toBe(true)
    expect(canTransitionDeployment('uploading', 'failed')).toBe(true)
    expect(canTransitionDeployment('building', 'failed')).toBe(true)
    expect(canTransitionDeployment('queued', 'ready')).toBe(false)
    expect(canTransitionDeployment('ready', 'failed')).toBe(false)
    expect(canTransitionDeployment('failed', 'queued')).toBe(false)
  })
})

it('keeps provider connection responses redacted', () => {
  const value = {
    id: deploymentId,
    provider: 'vercel',
    status: 'connected',
    connectedAt: '2026-07-22T12:00:00.000Z',
    updatedAt: '2026-07-22T12:00:00.000Z',
  }
  expect(providerConnectionPublicSchema.parse(value)).toEqual(value)
  expect(providerConnectionPublicSchema.safeParse({ ...value, configurationId: 'icfg_secret', accessToken: 'secret' }).success).toBe(false)
})

it('keeps public deployment responses redacted and validates ready URLs', () => {
  const value = {
    id: deploymentId,
    revisionId,
    provider: 'vercel',
    target: 'production',
    status: 'ready',
    url: 'https://zenui-test.vercel.app',
    errorCode: null,
    leadFormsLive: true,
    createdAt: '2026-07-22T12:00:00.000Z',
    updatedAt: '2026-07-22T12:01:00.000Z',
  }
  expect(deploymentPublicSchema.parse(value)).toEqual(value)
  expect(deploymentPublicSchema.safeParse({ ...value, workspaceId, providerDeploymentId: 'dpl_secret' }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, url: 'https://example.test' }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, url: 'javascript:alert(1)' }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, status: 'failed', url: null, errorCode: 'raw-provider-secret' }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, status: 'ready', url: null }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, status: 'building', url: value.url }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, status: 'failed', url: null, errorCode: null }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, status: 'building', url: null, errorCode: 'provider_error' }).success).toBe(false)
  expect(deploymentPublicSchema.safeParse({ ...value, url: 'not-a-url' }).success).toBe(false)
})
