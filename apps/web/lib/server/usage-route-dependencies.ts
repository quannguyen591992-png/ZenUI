import {
  createUsageRepository,
  workspaceMembers,
} from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase } from './database'
import { projectBelongsToWorkspace } from './project-route-dependencies'
import { getRuntimeSession } from './runtime-session'

import type { UsageApiDependencies } from './usage-api'

export function createUsageRouteDependencies(): UsageApiDependencies {
  const database = getDatabase()
  return {
    getSession: getRuntimeSession,
    access: {
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
      projectBelongsToWorkspace,
    },
    usage: createUsageRepository(database),
  }
}
