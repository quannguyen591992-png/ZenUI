import { applyCommandTransaction, designCommandSchema } from '@zenui/design-commands'
import { createValidDesignFixture, type DesignDocument } from '@zenui/design-schema'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type { AuthContext, ReplaceDocumentResult } from '@zenui/database'

export interface ProjectApiRecord {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  version: number
  document: DesignDocument
}

export interface ProjectRevisionRecord {
  id: string
  projectId: string
  source: 'manual' | 'restore' | 'ai' | 'import'
  summary: string
  createdAt: Date
}

export interface ProjectApiRepository {
  list(context: AuthContext): Promise<ProjectApiRecord[]>
  create(context: AuthContext, input: { name: string; document: unknown }): Promise<ProjectApiRecord>
  findById(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  rename(context: AuthContext, projectId: string, name: string): Promise<ProjectApiRecord | null>
  archive(context: AuthContext, projectId: string): Promise<ProjectApiRecord | null>
  replaceDocument(
    context: AuthContext,
    projectId: string,
    expectedVersion: number,
    document: DesignDocument,
  ): Promise<ReplaceDocumentResult>
  listRevisions(context: AuthContext, projectId: string): Promise<ProjectRevisionRecord[]>
  createRevision(
    context: AuthContext,
    projectId: string,
    input: { source: 'manual'; summary: string },
  ): Promise<ProjectRevisionRecord>
  restoreRevision(
    context: AuthContext,
    projectId: string,
    revisionId: string,
    expectedVersion: number,
  ): Promise<ReplaceDocumentResult>
}

export interface ProjectApiDependencies {
  getSession(): Promise<{ userId: string } | null>
  findCurrentMembership(userId: string): Promise<WorkspaceMembership | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  trustedOrigin: string
  projects: ProjectApiRepository
}

const workspaceIdSchema = z.string().uuid()
const createProjectSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1).max(100),
}).strict()
const commandRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  expectedVersion: z.number().int().positive(),
  commands: z.array(designCommandSchema).min(1),
}).strict()
const projectQuerySchema = z.object({ workspaceId: workspaceIdSchema }).strict()
const renameProjectSchema = z.object({
  workspaceId: workspaceIdSchema,
  name: z.string().trim().min(1).max(100),
}).strict()
const workspaceMutationSchema = z.object({ workspaceId: workspaceIdSchema }).strict()
const createRevisionSchema = z.object({
  workspaceId: workspaceIdSchema,
  summary: z.string().trim().min(1).max(200),
}).strict()
const restoreRevisionSchema = z.object({
  workspaceId: workspaceIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict()

function zodDetails(error: z.ZodError) {
  return error.issues.map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }))
}

function requireTrustedOrigin(request: Request, trustedOrigin: string): void {
  let expected: string
  try {
    expected = new URL(trustedOrigin).origin
  } catch {
    throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500)
  }
  const origin = request.headers.get('origin')
  if (!origin || origin === 'null') {
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
  try {
    if (new URL(origin).origin !== expected) {
      throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function requireSession(dependencies: ProjectApiDependencies) {
  const session = await dependencies.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  return session
}

async function requireWorkspace(
  dependencies: ProjectApiDependencies,
  workspaceId: string,
  permission: 'read' | 'mutateDocument' | 'manageProject',
) {
  const session = await requireSession(dependencies)
  const membership = await dependencies.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, permission)) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function parseWorkspaceQuery(request: Request): string {
  const parsed = projectQuerySchema.safeParse({
    workspaceId: new URL(request.url).searchParams.get('workspaceId'),
  })
  if (!parsed.success) {
    throw new ApiError('validation_error', 'Request validation failed', 422, zodDetails(parsed.error))
  }
  return parsed.data.workspaceId
}

function requireParsed<T>(parsed: z.ZodSafeParseResult<T>): T {
  if (!parsed.success) {
    throw new ApiError('validation_error', 'Request validation failed', 422, zodDetails(parsed.error))
  }
  return parsed.data
}

function notFound(): never {
  throw new ApiError('not_found', 'Resource not found', 404)
}

export function createSessionContextHandler(dependencies: ProjectApiDependencies) {
  return async function GET() {
    try {
      const session = await requireSession(dependencies)
      const membership = await dependencies.findCurrentMembership(session.userId)
      if (!membership) notFound()
      return successResponse({
        userId: session.userId,
        workspaceId: membership.workspaceId,
        role: membership.role,
      })
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createProjectCollectionHandlers(dependencies: ProjectApiDependencies) {
  return {
    async GET(request: Request) {
      try {
        const workspaceId = new URL(request.url).searchParams.get('workspaceId')
        const parsedWorkspaceId = workspaceIdSchema.safeParse(workspaceId)
        if (!parsedWorkspaceId.success) {
          throw new ApiError('validation_error', 'Request validation failed', 422, zodDetails(parsedWorkspaceId.error))
        }
        const context = await requireWorkspace(dependencies, parsedWorkspaceId.data, 'read')
        return successResponse(await dependencies.projects.list(context))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async POST(request: Request) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const parsed = createProjectSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) {
          throw new ApiError('validation_error', 'Request validation failed', 422, zodDetails(parsed.error))
        }
        const context = await requireWorkspace(dependencies, parsed.data.workspaceId, 'manageProject')
        const fixture = createValidDesignFixture()
        const project = await dependencies.projects.create(context, {
          name: parsed.data.name,
          document: fixture,
        })
        return successResponse(project, {
          status: 201,
          headers: { Location: `/api/v1/projects/${project.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createProjectItemHandlers(dependencies: ProjectApiDependencies) {
  type Context = { params: Promise<{ projectId: string }> }
  return {
    async GET(request: Request, context: Context) {
      try {
        const workspaceId = parseWorkspaceQuery(request)
        const authContext = await requireWorkspace(dependencies, workspaceId, 'read')
        const project = await dependencies.projects.findById(authContext, (await context.params).projectId)
        if (!project) notFound()
        return successResponse(project)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async PATCH(request: Request, context: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = requireParsed(renameProjectSchema.safeParse(await parseJsonBody(request)))
        const authContext = await requireWorkspace(dependencies, input.workspaceId, 'manageProject')
        const project = await dependencies.projects.rename(authContext, (await context.params).projectId, input.name)
        if (!project) notFound()
        return successResponse(project)
      } catch (error) {
        return errorResponse(error)
      }
    },

    async DELETE(request: Request, context: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = requireParsed(workspaceMutationSchema.safeParse(await parseJsonBody(request)))
        const authContext = await requireWorkspace(dependencies, input.workspaceId, 'manageProject')
        const project = await dependencies.projects.archive(authContext, (await context.params).projectId)
        if (!project) notFound()
        return successResponse(project)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createProjectDocumentHandler(dependencies: ProjectApiDependencies) {
  return async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
    try {
      const workspaceId = parseWorkspaceQuery(request)
      const authContext = await requireWorkspace(dependencies, workspaceId, 'read')
      const project = await dependencies.projects.findById(authContext, (await context.params).projectId)
      if (!project) notFound()
      return successResponse({ version: project.version, document: project.document })
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createProjectRevisionHandlers(dependencies: ProjectApiDependencies) {
  type Context = { params: Promise<{ projectId: string }> }
  return {
    async GET(request: Request, context: Context) {
      try {
        const workspaceId = parseWorkspaceQuery(request)
        const authContext = await requireWorkspace(dependencies, workspaceId, 'read')
        const { projectId } = await context.params
        if (!await dependencies.projects.findById(authContext, projectId)) notFound()
        return successResponse(await dependencies.projects.listRevisions(authContext, projectId))
      } catch (error) {
        return errorResponse(error)
      }
    },

    async POST(request: Request, context: Context) {
      try {
        requireTrustedOrigin(request, dependencies.trustedOrigin)
        const input = requireParsed(createRevisionSchema.safeParse(await parseJsonBody(request)))
        const authContext = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
        const { projectId } = await context.params
        if (!await dependencies.projects.findById(authContext, projectId)) notFound()
        const revision = await dependencies.projects.createRevision(authContext, projectId, {
          source: 'manual', summary: input.summary,
        })
        return successResponse(revision, {
          status: 201,
          headers: { Location: `/api/v1/projects/${projectId}/revisions/${revision.id}` },
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}

export function createRevisionRestoreHandler(dependencies: ProjectApiDependencies) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ projectId: string; revisionId: string }> },
  ) {
    try {
      requireTrustedOrigin(request, dependencies.trustedOrigin)
      const input = requireParsed(restoreRevisionSchema.safeParse(await parseJsonBody(request)))
      const authContext = await requireWorkspace(dependencies, input.workspaceId, 'mutateDocument')
      const { projectId, revisionId } = await context.params
      const restored = await dependencies.projects.restoreRevision(
        authContext, projectId, revisionId, input.expectedVersion,
      )
      if (!restored.accepted) {
        if (restored.code === 'not_found') notFound()
        throw new ApiError('stale_document_version', 'Document conflict', 409, [{
          path: 'expectedVersion',
          code: 'stale_document_version',
          message: 'The server document has a newer version',
        }])
      }
      return successResponse({ version: restored.version, document: restored.document })
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export function createProjectCommandHandler(dependencies: ProjectApiDependencies) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ projectId: string }> },
  ) {
    try {
      requireTrustedOrigin(request, dependencies.trustedOrigin)
      const parsed = commandRequestSchema.safeParse(await parseJsonBody(request))
      if (!parsed.success) {
        throw new ApiError('validation_error', 'Request validation failed', 422, zodDetails(parsed.error))
      }
      const { projectId } = await context.params
      const authContext = await requireWorkspace(dependencies, parsed.data.workspaceId, 'mutateDocument')
      const project = await dependencies.projects.findById(authContext, projectId)
      if (!project) throw new ApiError('not_found', 'Resource not found', 404)
      if (project.version !== parsed.data.expectedVersion) {
        throw new ApiError('stale_document_version', 'Document conflict', 409, [{
          path: 'expectedVersion',
          code: 'stale_document_version',
          message: `Expected version ${project.version}`,
        }])
      }

      const commands = parsed.data.commands.map(command => ({
        ...command,
        documentVersion: parsed.data.expectedVersion,
      }))
      const transaction = applyCommandTransaction(project.document, parsed.data.expectedVersion, commands)
      if (!transaction.accepted) {
        const status = transaction.error.code === 'stale_document_version' ? 409 : 422
        throw new ApiError(transaction.error.code, transaction.error.message, status, [{
          path: transaction.error.path,
          code: transaction.error.code,
          message: transaction.error.message,
        }])
      }

      const saved = await dependencies.projects.replaceDocument(
        authContext,
        projectId,
        parsed.data.expectedVersion,
        transaction.document,
      )
      if (!saved.accepted) {
        const status = saved.code === 'not_found' ? 404 : 409
        throw new ApiError(saved.code, saved.code === 'not_found' ? 'Resource not found' : 'Document conflict', status)
      }
      return successResponse({ version: saved.version, document: saved.document })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
