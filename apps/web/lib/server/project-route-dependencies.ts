import { createProjectRepository, projects, workspaceMembers } from '@zenui/database'
import { and, eq } from 'drizzle-orm'
import { cookies } from 'next/headers'

import { createConfiguredAuth } from './configured-auth'
import { getDatabase, waitForDatabase } from './database'
import {
  E2E_SESSION_COOKIE,
  isE2eRuntimeEnabled,
  verifyE2eSessionToken,
} from './e2e-runtime'

import type { ProjectApiDependencies } from './project-api'

export function createRouteDependencies(): ProjectApiDependencies {
  const database = getDatabase()
  const repository = createProjectRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const auth = e2eEnabled ? null : createConfiguredAuth().auth

  const trustedOrigin = process.env.APP_ORIGIN
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')

  return {
    trustedOrigin,
    async getSession() {
      await waitForDatabase()
      if (e2eEnabled) {
        const secret = process.env.AUTH_SECRET
        if (!secret) throw new Error('AUTH_SECRET is required')
        const token = (await cookies()).get(E2E_SESSION_COOKIE)?.value
        const identity = token ? verifyE2eSessionToken(token, secret) : null
        return identity ? { userId: identity.userId } : null
      }
      const session = await auth!()
      return session?.user.id ? { userId: session.user.id } : null
    },
    async findCurrentMembership(userId) {
      const [membership] = await database.select({
        userId: workspaceMembers.userId,
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      }).from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1)
      return membership ?? null
    },
    async findMembership(userId, workspaceId) {
      const [membership] = await database.select({
        userId: workspaceMembers.userId,
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
      }).from(workspaceMembers).where(and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      )).limit(1)
      return membership ?? null
    },
    projects: {
      list: context => repository.list(context),
      create: (context, input) => repository.create(context, input),
      findById: (context, projectId) => repository.findById(context, projectId),
      rename: (context, projectId, name) => repository.rename(context, projectId, name),
      archive: (context, projectId) => repository.archive(context, projectId),
      replaceDocument: (context, projectId, expectedVersion, document) => repository.replaceDocument(
        context,
        projectId,
        expectedVersion,
        document,
      ),
      listRevisions: (context, projectId) => repository.listRevisions(context, projectId),
      createRevision: (context, projectId, input) => repository.createRevision(context, projectId, input),
      restoreRevision: (context, projectId, revisionId, expectedVersion) => repository.restoreRevision(
        context,
        projectId,
        revisionId,
        expectedVersion,
      ),
    },
  }
}

export async function projectBelongsToWorkspace(projectId: string, workspaceId: string): Promise<boolean> {
  const database = getDatabase()
  const [project] = await database.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1)
  return Boolean(project)
}
