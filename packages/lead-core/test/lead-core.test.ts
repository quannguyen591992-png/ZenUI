import { describe, expect, it } from 'vitest'

import {
  LEAD_LIMITS,
  leadCountSchema,
  leadDetailSchema,
  leadMarkContactedRequestSchema,
  leadSubmissionRequestSchema,
  leadSummarySchema,
  validateLeadSubmission,
} from '../src/index'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const leadId = '33333333-3333-4333-8333-333333333333'
const requestId = '44444444-4444-4444-8444-444444444444'
const timestamp = '2026-08-13T12:00:00.000Z'

const form = {
  title: 'Yêu cầu tư vấn',
  description: 'Hãy cho chúng tôi biết nhu cầu của bạn.',
  submitLabel: 'Gửi yêu cầu',
  successCopy: 'Cảm ơn bạn. Chúng tôi sẽ liên hệ lại.',
  fields: [
    { key: 'name', type: 'text' as const, label: 'Họ tên', required: true },
    { key: 'email', type: 'email' as const, label: 'Email', required: true },
    { key: 'phone', type: 'tel' as const, label: 'Điện thoại', required: false },
    {
      key: 'need',
      type: 'select' as const,
      label: 'Nhu cầu',
      required: true,
      options: [
        { label: 'Tư vấn', value: 'consulting' },
        { label: 'Báo giá', value: 'quote' },
      ],
    },
  ],
  consent: { label: 'Tôi đồng ý được liên hệ.', required: true },
}

const validRequest = {
  requestId,
  formNodeId: 'lead-form-1',
  pageRoute: '/',
  fields: {
    name: 'Nguyễn Văn A',
    email: 'visitor@example.test',
    phone: '+84 900 000 000',
    need: 'quote',
  },
  consent: true,
}

describe('public lead submission contract', () => {
  it('accepts only a strict bounded request shape', () => {
    expect(leadSubmissionRequestSchema.parse(validRequest)).toEqual(validRequest)
    expect(leadSubmissionRequestSchema.safeParse({ ...validRequest, workspaceId }).success).toBe(false)
    expect(leadSubmissionRequestSchema.safeParse({ ...validRequest, formNodeId: '../lead' }).success).toBe(false)
    expect(leadSubmissionRequestSchema.safeParse({ ...validRequest, pageRoute: '//evil.example' }).success).toBe(false)
    expect(leadSubmissionRequestSchema.safeParse({
      ...validRequest,
      fields: { ...validRequest.fields, name: 'x'.repeat(LEAD_LIMITS.maxFieldValueLength + 1) },
    }).success).toBe(false)
  })

  it('materializes a canonical field snapshot from the immutable form', () => {
    expect(validateLeadSubmission(validRequest, form)).toEqual({
      success: true,
      data: {
        formTitle: form.title,
        fields: [
          { key: 'name', type: 'text', label: 'Họ tên', value: 'Nguyễn Văn A' },
          { key: 'email', type: 'email', label: 'Email', value: 'visitor@example.test' },
          { key: 'phone', type: 'tel', label: 'Điện thoại', value: '+84 900 000 000' },
          { key: 'need', type: 'select', label: 'Nhu cầu', value: 'Báo giá' },
        ],
      },
    })
  })

  it('rejects missing, unknown, malformed, and non-consented values', () => {
    expect(validateLeadSubmission({ ...validRequest, fields: { ...validRequest.fields, name: '' } }, form)).toMatchObject({ success: false })
    expect(validateLeadSubmission({ ...validRequest, fields: { ...validRequest.fields, extra: 'unexpected' } }, form)).toMatchObject({ success: false })
    expect(validateLeadSubmission({ ...validRequest, fields: { ...validRequest.fields, email: 'not-an-email' } }, form)).toMatchObject({ success: false })
    expect(validateLeadSubmission({ ...validRequest, fields: { ...validRequest.fields, phone: 'javascript:alert(1)' } }, form)).toMatchObject({ success: false })
    expect(validateLeadSubmission({ ...validRequest, fields: { ...validRequest.fields, need: 'other' } }, form)).toMatchObject({ success: false })
    expect(validateLeadSubmission({ ...validRequest, consent: false }, form)).toMatchObject({ success: false })
  })
})

describe('Inbox contracts', () => {
  const summary = {
    id: leadId,
    status: 'new' as const,
    version: 1,
    formTitle: form.title,
    receivedAt: timestamp,
    expiresAt: '2026-11-11T12:00:00.000Z',
    contactedAt: null,
  }

  it('keeps list and count DTOs redacted', () => {
    expect(leadSummarySchema.parse(summary)).toEqual(summary)
    expect(leadSummarySchema.safeParse({ ...summary, ciphertext: 'secret' }).success).toBe(false)
    expect(leadCountSchema.parse({ newCount: 3 })).toEqual({ newCount: 3 })
    expect(leadCountSchema.safeParse({ newCount: -1 }).success).toBe(false)
  })

  it('validates authorized detail and transition requests strictly', () => {
    const detail = {
      ...summary,
      fields: [{ key: 'email', type: 'email', label: 'Email', value: 'visitor@example.test' }],
    }
    expect(leadDetailSchema.parse(detail)).toEqual(detail)
    expect(leadDetailSchema.safeParse({ ...detail, authTag: 'secret' }).success).toBe(false)
    expect(leadMarkContactedRequestSchema.parse({ workspaceId, expectedVersion: 1 })).toEqual({ workspaceId, expectedVersion: 1 })
    expect(leadMarkContactedRequestSchema.safeParse({ workspaceId, expectedVersion: 0 }).success).toBe(false)
  })
})
