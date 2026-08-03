import { describe, expect, it } from 'vitest'

import {
  resolveShareStatus,
  shareCreateRequestSchema,
  shareDisableRequestSchema,
  shareLinkPublicSchema,
  shareSlugSchema,
} from '../src/index'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const revisionId = '33333333-3333-4333-8333-333333333333'
const requestId = '44444444-4444-4444-8444-444444444444'

it('accepts only strict share management requests', () => {
  expect(shareCreateRequestSchema.parse({ workspaceId, revisionId, requestId })).toEqual({ workspaceId, revisionId, requestId })
  expect(shareCreateRequestSchema.safeParse({ workspaceId, revisionId, requestId, expiresAt: null }).success).toBe(false)
  expect(shareDisableRequestSchema.parse({ workspaceId })).toEqual({ workspaceId })
  expect(shareDisableRequestSchema.safeParse({ workspaceId, status: 'disabled' }).success).toBe(false)
})

describe('share slug', () => {
  it('requires an exact 192-bit base64url representation', () => {
    expect(shareSlugSchema.safeParse('a'.repeat(32)).success).toBe(true)
    expect(shareSlugSchema.safeParse('a'.repeat(31)).success).toBe(false)
    expect(shareSlugSchema.safeParse(`${'a'.repeat(31)}+`).success).toBe(false)
  })
})

describe('share status', () => {
  it('derives disabled and expired states without changing persistence state', () => {
    const now = new Date('2026-07-22T12:00:00.000Z')
    expect(resolveShareStatus('disabled', null, now)).toBe('disabled')
    expect(resolveShareStatus('active', new Date('2026-07-22T11:59:59.000Z'), now)).toBe('expired')
    expect(resolveShareStatus('active', null, now)).toBe('active')
    expect(resolveShareStatus('active', new Date('2026-07-22T12:00:01.000Z'), now)).toBe('active')
  })
})

it('keeps management responses redacted and validates the public URL', () => {
  const value = {
    id: '55555555-5555-4555-8555-555555555555',
    revisionId,
    url: `https://share.example.test/s/${'a'.repeat(32)}`,
    status: 'active',
    expiresAt: null,
    createdAt: '2026-07-22T12:00:00.000Z',
    updatedAt: '2026-07-22T12:00:00.000Z',
  }
  expect(shareLinkPublicSchema.parse(value)).toEqual(value)
  expect(shareLinkPublicSchema.safeParse({ ...value, workspaceId, projectId: requestId }).success).toBe(false)
  expect(shareLinkPublicSchema.safeParse({ ...value, url: 'javascript:alert(1)' }).success).toBe(false)
})
