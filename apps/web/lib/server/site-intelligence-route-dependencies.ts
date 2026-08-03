import {
  createDesignDirectionRepository,
  createProjectRepository,
  createSiteIntelligenceRepository,
  workspaceMembers,
} from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase } from './database'
import { getRuntimeSession } from './runtime-session'

import type { SiteIntelligenceApiDependencies } from './site-intelligence-api'

export function createSiteIntelligenceRouteDependencies(): SiteIntelligenceApiDependencies {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const directions = createDesignDirectionRepository(database)
  const reviews = createSiteIntelligenceRepository(database)
  const trustedOrigin = process.env.APP_ORIGIN
  if (!trustedOrigin) throw new Error('APP_ORIGIN is required')
  return {
    trustedOrigin,
    getSession: getRuntimeSession,
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
    findProject: (context, projectId) => projects.findById(context, projectId),
    loadBrief: (context, projectId) => directions.loadBrief(context, projectId),
    reviews,
  }
}
