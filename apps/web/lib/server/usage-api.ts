import {
  usageListQuerySchema,
  usageReportSchema,
  type UsageListQuery,
  type UsageReport,
} from '@zenui/usage-core'
import { z } from 'zod'

import {
  ApiError,
  errorResponse,
  successResponse,
} from './api'

import type { WorkspaceAccessLookup } from './authorization'
import type { AuthContext } from '@zenui/database'

export interface UsageApiDependencies {
  getSession(): Promise<{ userId: string } | null>
  access: WorkspaceAccessLookup
  usage: {
    report(
      context: AuthContext,
      input: UsageListQuery,
      now?: Date,
    ): Promise<UsageReport>
  }
  now?: () => Date
}

type WorkspaceRoute = {
  params: Promise<{ workspaceId: string }>
}

export function createUsageHandlers(
  dependencies: UsageApiDependencies,
) {
  return {
    async GET(request: Request, route: WorkspaceRoute) {
      try {
        const { workspaceId } = await route.params
        const parsedWorkspace = z.string().uuid()
          .safeParse(workspaceId)
        if (!parsedWorkspace.success) {
          throw new ApiError(
            'validation_error',
            'Request validation failed',
            422,
          )
        }
        const query = usageListQuerySchema.safeParse(
          Object.fromEntries(
            new URL(request.url).searchParams.entries(),
          ),
        )
        if (!query.success) {
          throw new ApiError(
            'validation_error',
            'Request validation failed',
            422,
          )
        }
        const session = await dependencies.getSession()
        if (!session) {
          throw new ApiError(
            'unauthorized',
            'Authentication required',
            401,
          )
        }
        const membership = await dependencies.access.findMembership(
          session.userId,
          parsedWorkspace.data,
        )
        if (!membership) {
          throw new ApiError(
            'not_found',
            'Resource not found',
            404,
          )
        }
        if (
          query.data.projectId
          && !await dependencies.access.projectBelongsToWorkspace(
            query.data.projectId,
            parsedWorkspace.data,
          )
        ) {
          throw new ApiError(
            'not_found',
            'Resource not found',
            404,
          )
        }
        const context = {
          userId: session.userId,
          workspaceId: parsedWorkspace.data,
        }
        const report = await dependencies.usage.report(
          context,
          query.data,
          dependencies.now?.() ?? new Date(),
        )
        return successResponse(
          usageReportSchema.parse(report),
        )
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
