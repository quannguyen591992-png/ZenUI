import { createBrandKitRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase } from './database'
import { getRuntimeSession } from './runtime-session'

import type { BrandKitApiDependencies } from './brand-kit-api'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function createBrandKitRouteDependencies(): BrandKitApiDependencies {
  const database = getDatabase()
  const brands = createBrandKitRepository(database)
  const projects = createProjectRepository(database)
  return {
    trustedOrigin: required('APP_ORIGIN'),
    getSession: getRuntimeSession,
    findMembership: async (userId, workspaceId) => {
      const [membership] = await database.select({
        userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role,
      }).from(workspaceMembers).where(and(
        eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId),
      )).limit(1)
      return membership ?? null
    },
    findProject: (context, projectId) => projects.findById(context, projectId),
    brands,
  }
}
