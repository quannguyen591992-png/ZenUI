import {
  leadFormPropsSchema,
  type LeadFormProps,
} from '@zenui/design-schema'
import { z } from 'zod'

export const LEAD_LIMITS = {
  maxFields: 12,
  maxFieldKeyLength: 64,
  maxFieldValueLength: 2_000,
  maxPayloadBytes: 16 * 1_024,
  maxFormTitleLength: 160,
  maxFieldLabelLength: 120,
} as const

const nodeIdSchema = z.string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

const pageRouteSchema = z.string()
  .min(1)
  .max(325)
  .regex(/^\/(?!\/)(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/)

const fieldKeySchema = z.string()
  .min(1)
  .max(LEAD_LIMITS.maxFieldKeyLength)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)

const fieldValueSchema = z.string()
  .max(LEAD_LIMITS.maxFieldValueLength)

const fieldValuesSchema = z.record(
  fieldKeySchema,
  fieldValueSchema,
).superRefine((value, context) => {
  if (Object.keys(value).length > LEAD_LIMITS.maxFields) {
    context.addIssue({
      code: 'custom',
      message: 'Lead submission has too many fields',
    })
  }
})

export const leadSubmissionRequestSchema = z.object({
  requestId: z.string().uuid(),
  formNodeId: nodeIdSchema,
  pageRoute: pageRouteSchema,
  fields: fieldValuesSchema,
  consent: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (
    Buffer.byteLength(
      JSON.stringify(value),
      'utf8',
    ) > LEAD_LIMITS.maxPayloadBytes
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Lead submission is too large',
    })
  }
})
export type LeadSubmissionRequest = z.infer<
  typeof leadSubmissionRequestSchema
>

export const leadFieldTypeSchema = z.enum([
  'text',
  'email',
  'tel',
  'textarea',
  'select',
])
export type LeadFieldType = z.infer<typeof leadFieldTypeSchema>

export const leadPayloadFieldSchema = z.object({
  key: fieldKeySchema,
  type: leadFieldTypeSchema,
  label: z.string()
    .trim()
    .min(1)
    .max(LEAD_LIMITS.maxFieldLabelLength),
  value: fieldValueSchema,
}).strict()
export type LeadPayloadField = z.infer<
  typeof leadPayloadFieldSchema
>

export const leadPayloadSchema = z.object({
  formTitle: z.string()
    .trim()
    .min(1)
    .max(LEAD_LIMITS.maxFormTitleLength),
  fields: z.array(leadPayloadFieldSchema)
    .min(1)
    .max(LEAD_LIMITS.maxFields),
}).strict()
export type LeadPayload = z.infer<typeof leadPayloadSchema>

const leadStatusSchema = z.enum(['new', 'contacted'])
const isoTimestampSchema = z.string().datetime()

export const leadSummarySchema = z.object({
  id: z.string().uuid(),
  status: leadStatusSchema,
  version: z.number().int().min(1),
  formTitle: z.string()
    .trim()
    .min(1)
    .max(LEAD_LIMITS.maxFormTitleLength),
  receivedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
  contactedAt: isoTimestampSchema.nullable(),
}).strict()
export type LeadSummary = z.infer<typeof leadSummarySchema>

export const workspaceLeadSummarySchema = leadSummarySchema.extend({
  projectId: z.string().uuid(),
  projectName: z.string().trim().min(1).max(100),
}).strict()
export type WorkspaceLeadSummary = z.infer<
  typeof workspaceLeadSummarySchema
>

export const workspaceLeadListQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  status: leadStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict()
export type WorkspaceLeadListQuery = z.infer<
  typeof workspaceLeadListQuerySchema
>

export const workspaceLeadListResponseSchema = z.object({
  items: z.array(workspaceLeadSummarySchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
}).strict()
export type WorkspaceLeadListResponse = z.infer<
  typeof workspaceLeadListResponseSchema
>

export const leadDetailSchema = leadSummarySchema.extend({
  fields: z.array(leadPayloadFieldSchema)
    .min(1)
    .max(LEAD_LIMITS.maxFields),
}).strict()
export type LeadDetail = z.infer<typeof leadDetailSchema>

export const leadCountSchema = z.object({
  newCount: z.number().int().min(0),
}).strict()
export type LeadCount = z.infer<typeof leadCountSchema>

export const leadMarkContactedRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
}).strict()
export type LeadMarkContactedRequest = z.infer<
  typeof leadMarkContactedRequestSchema
>

export type ValidateLeadSubmissionResult =
  | { success: true; data: LeadPayload }
  | {
    success: false
    code:
      | 'invalid_submission'
      | 'invalid_form'
      | 'field_mismatch'
  }

function fieldValueIsValid(
  type: LeadFieldType,
  value: string,
): boolean {
  if (type === 'email') {
    return z.string().email().max(320).safeParse(value).success
  }
  if (type === 'tel') {
    return /^\+?[0-9 ()-]{3,40}$/.test(value)
  }
  return true
}

export function validateLeadSubmission(
  requestInput: unknown,
  formInput: unknown,
): ValidateLeadSubmissionResult {
  const request = leadSubmissionRequestSchema.safeParse(
    requestInput,
  )
  if (!request.success) {
    return { success: false, code: 'invalid_submission' }
  }

  const form = leadFormPropsSchema.safeParse(formInput)
  if (!form.success) {
    return { success: false, code: 'invalid_form' }
  }

  const expectedKeys = new Set(
    form.data.fields.map(field => field.key),
  )
  if (
    Object.keys(request.data.fields).some(
      key => !expectedKeys.has(key),
    )
    || (
      form.data.consent?.required === true
      && request.data.consent !== true
    )
  ) {
    return { success: false, code: 'field_mismatch' }
  }

  const fields: LeadPayloadField[] = []
  for (const field of form.data.fields) {
    const rawValue = request.data.fields[field.key]
    const value = rawValue?.trim() ?? ''
    if (
      (field.required && !value)
      || (
        value
        && !fieldValueIsValid(field.type, value)
      )
    ) {
      return { success: false, code: 'field_mismatch' }
    }
    if (!value) continue

    if (field.type === 'select') {
      const option = field.options.find(
        candidate => candidate.value === value,
      )
      if (!option) {
        return { success: false, code: 'field_mismatch' }
      }
      fields.push({
        key: field.key,
        type: field.type,
        label: field.label,
        value: option.label,
      })
      continue
    }

    fields.push({
      key: field.key,
      type: field.type,
      label: field.label,
      value,
    })
  }

  const payload = leadPayloadSchema.safeParse({
    formTitle: form.data.title,
    fields,
  })
  if (!payload.success) {
    return { success: false, code: 'field_mismatch' }
  }
  return { success: true, data: payload.data }
}

export type { LeadFormProps }
