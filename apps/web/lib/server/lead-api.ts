import {
  leadCountSchema,
  leadDetailSchema,
  leadMarkContactedRequestSchema,
  leadSummarySchema,
} from '@zenui/lead-core'
import { z } from 'zod'

import {
  ApiError,
  errorResponse,
  parseJsonBody,
  successResponse,
} from './api'
import {
  authorizeWorkspaceOperation,
  type WorkspaceAccessLookup,
} from './authorization'

import type {
  AuthContext,
  LeadSummaryRecord,
} from '@zenui/database'
import type {
  EncryptedLeadPayload,
  LeadEncryptionContext,
} from '@zenui/lead-core/server'

interface LeadEncryptedRecord {
  summary: LeadSummaryRecord
  envelope: EncryptedLeadPayload
  context: LeadEncryptionContext
}

export interface LeadApiDependencies {
  trustedOrigin: string
  getSession(): Promise<{ userId: string } | null>
  access: WorkspaceAccessLookup
  keyring: {
    decrypt(
      envelope: EncryptedLeadPayload,
      context: LeadEncryptionContext,
    ): {
      formTitle: string
      fields: Array<{
        key: string
        type: 'text' | 'email' | 'tel' | 'textarea' | 'select'
        label: string
        value: string
      }>
    }
  }
  leads: {
    list(
      context: AuthContext,
      projectId: string,
      limit?: number,
    ): Promise<LeadSummaryRecord[]>
    countNew(
      context: AuthContext,
      projectId: string,
    ): Promise<{ newCount: number }>
    findEncryptedById(
      context: AuthContext,
      projectId: string,
      leadId: string,
    ): Promise<LeadEncryptedRecord | null>
    markContacted(
      context: AuthContext,
      projectId: string,
      leadId: string,
      expectedVersion: number,
    ): Promise<
      { accepted: true; lead: LeadSummaryRecord }
      | { accepted: false; code: 'not_found' | 'conflict' }
    >
  }
}

type ProjectRoute = {
  params: Promise<{ projectId: string }>
}

type LeadRoute = {
  params: Promise<{ projectId: string; leadId: string }>
}

function workspaceFrom(request: Request): string {
  const workspaceId = new URL(request.url).searchParams.get(
    'workspaceId',
  )
  const parsed = z.string().uuid().safeParse(workspaceId)
  if (!parsed.success) {
    throw new ApiError(
      'validation_error',
      'Request validation failed',
      422,
    )
  }
  return parsed.data
}

function requireTrustedOrigin(
  request: Request,
  trustedOrigin: string,
): void {
  let expected: string
  try {
    expected = new URL(trustedOrigin).origin
  } catch {
    throw new ApiError(
      'server_misconfigured',
      'An unexpected error occurred',
      500,
    )
  }
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') {
    throw new ApiError(
      'invalid_origin',
      'Request origin is not allowed',
      403,
    )
  }
  try {
    if (new URL(origin).origin !== expected) {
      throw new ApiError(
        'invalid_origin',
        'Request origin is not allowed',
        403,
      )
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(
      'invalid_origin',
      'Request origin is not allowed',
      403,
    )
  }
}

async function authorize(
  deps: LeadApiDependencies,
  workspaceId: string,
  projectId: string,
  permission: 'readLeads' | 'manageLeads',
): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) {
    throw new ApiError(
      'unauthorized',
      'Authentication required',
      401,
    )
  }
  await authorizeWorkspaceOperation(
    deps.access,
    session,
    workspaceId,
    projectId,
    permission,
  )
  return { userId: session.userId, workspaceId }
}

function safeSummary(record: LeadSummaryRecord) {
  return leadSummarySchema.parse({
    id: record.id,
    status: record.status,
    version: record.version,
    formTitle: record.formTitle,
    receivedAt: record.receivedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    contactedAt: record.contactedAt?.toISOString() ?? null,
  })
}

export function createLeadHandlers(deps: LeadApiDependencies) {
  return {
    async GET_LIST(request: Request, route: ProjectRoute) {
      try {
        const { projectId } = await route.params
        const context = await authorize(
          deps,
          workspaceFrom(request),
          projectId,
          'readLeads',
        )
        const leads = await deps.leads.list(context, projectId)
        return successResponse(leads.map(safeSummary))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async GET_COUNT(request: Request, route: ProjectRoute) {
      try {
        const { projectId } = await route.params
        const context = await authorize(
          deps,
          workspaceFrom(request),
          projectId,
          'readLeads',
        )
        const count = await deps.leads.countNew(
          context,
          projectId,
        )
        return successResponse(leadCountSchema.parse(count))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async GET_DETAIL(request: Request, route: LeadRoute) {
      try {
        const { projectId, leadId } = await route.params
        const context = await authorize(
          deps,
          workspaceFrom(request),
          projectId,
          'readLeads',
        )
        const encrypted = await deps.leads.findEncryptedById(
          context,
          projectId,
          leadId,
        )
        if (!encrypted) {
          throw new ApiError(
            'not_found',
            'Resource not found',
            404,
          )
        }
        let payload: ReturnType<
          LeadApiDependencies['keyring']['decrypt']
        >
        try {
          payload = deps.keyring.decrypt(
            encrypted.envelope,
            encrypted.context,
          )
        } catch {
          throw new ApiError(
            'lead_unavailable',
            'An unexpected error occurred',
            500,
          )
        }
        return successResponse(leadDetailSchema.parse({
          ...safeSummary(encrypted.summary),
          fields: payload.fields,
        }))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async PATCH(request: Request, route: LeadRoute) {
      try {
        requireTrustedOrigin(request, deps.trustedOrigin)
        const parsed = leadMarkContactedRequestSchema.safeParse(
          await parseJsonBody(request),
        )
        if (!parsed.success) {
          throw new ApiError(
            'validation_error',
            'Request validation failed',
            422,
          )
        }
        const { projectId, leadId } = await route.params
        const context = await authorize(
          deps,
          parsed.data.workspaceId,
          projectId,
          'manageLeads',
        )
        const result = await deps.leads.markContacted(
          context,
          projectId,
          leadId,
          parsed.data.expectedVersion,
        )
        if (!result.accepted) {
          throw result.code === 'conflict'
            ? new ApiError(
                'lead_version_conflict',
                'Lead conflict',
                409,
              )
            : new ApiError(
                'not_found',
                'Resource not found',
                404,
              )
        }
        return successResponse(safeSummary(result.lead))
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
