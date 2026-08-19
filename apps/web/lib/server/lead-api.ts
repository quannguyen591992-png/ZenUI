import {
  leadCountSchema,
  leadDetailSchema,
  leadMarkContactedRequestSchema,
  leadSummarySchema,
  workspaceLeadListQuerySchema,
  workspaceLeadListResponseSchema,
  workspaceLeadSummarySchema,
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
  hasWorkspacePermission,
  type WorkspaceAccessLookup,
} from './authorization'

import type {
  AuthContext,
  LeadSummaryRecord,
  WorkspaceLeadSummaryRecord,
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
    listWorkspace(
      context: AuthContext,
      input: {
        projectId?: string | undefined
        status?: 'new' | 'contacted' | undefined
        page: number
        pageSize: number
      },
    ): Promise<{
      items: WorkspaceLeadSummaryRecord[]
      page: number
      pageSize: number
      total: number
      totalPages: number
    }>
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

type WorkspaceRoute = {
  params: Promise<{ workspaceId: string }>
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

async function authorizeWorkspace(
  deps: LeadApiDependencies,
  workspaceId: string,
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
  const membership = await deps.access.findMembership(
    session.userId,
    workspaceId,
  )
  if (!membership) {
    throw new ApiError('not_found', 'Resource not found', 404)
  }
  if (!hasWorkspacePermission(membership.role, permission)) {
    throw new ApiError('forbidden', 'Forbidden', 403)
  }
  return { userId: session.userId, workspaceId }
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

function safeWorkspaceSummary(record: WorkspaceLeadSummaryRecord) {
  return workspaceLeadSummarySchema.parse({
    ...safeSummary(record),
    projectId: record.projectId,
    projectName: record.projectName,
  })
}

export function createLeadHandlers(deps: LeadApiDependencies) {
  return {
    async GET_WORKSPACE(request: Request, route: WorkspaceRoute) {
      try {
        const { workspaceId } = await route.params
        const parsedWorkspaceId = z.string().uuid().safeParse(workspaceId)
        if (!parsedWorkspaceId.success) {
          throw new ApiError(
            'validation_error',
            'Request validation failed',
            422,
          )
        }
        const queryParameters = Object.fromEntries(
          new URL(request.url).searchParams.entries(),
        )
        const query = workspaceLeadListQuerySchema.safeParse(
          queryParameters,
        )
        if (!query.success) {
          throw new ApiError(
            'validation_error',
            'Request validation failed',
            422,
          )
        }
        const context = await authorizeWorkspace(
          deps,
          parsedWorkspaceId.data,
          'readLeads',
        )
        if (
          query.data.projectId
          && !await deps.access.projectBelongsToWorkspace(
            query.data.projectId,
            context.workspaceId,
          )
        ) {
          throw new ApiError('not_found', 'Resource not found', 404)
        }
        const result = await deps.leads.listWorkspace(
          context,
          query.data,
        )
        return successResponse(workspaceLeadListResponseSchema.parse({
          ...result,
          items: result.items.map(safeWorkspaceSummary),
        }))
      } catch (error) {
        return errorResponse(error)
      }
    },
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
