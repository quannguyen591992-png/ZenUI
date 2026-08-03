import { createProjectRepository, projects, workspaceMembers } from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase } from './database'
import { getRuntimeSession } from './runtime-session'

import type { ProjectApiDependencies } from './project-api'

export function createRouteDependencies(): ProjectApiDependencies {
  const database = getDatabase()
  const repository = createProjectRepository(database)

  const trustedOrigin = process.env.APP_ORIGIN
  const remoteImageHostAllowlist = process.env.REMOTE_IMAGE_HOST_ALLOWLIST
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')
  if (!remoteImageHostAllowlist) throw new Error('REMOTE_IMAGE_HOST_ALLOWLIST is required')

  return {
    trustedOrigin,
    remoteImageHostAllowlist,
    getSession: getRuntimeSession,
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
