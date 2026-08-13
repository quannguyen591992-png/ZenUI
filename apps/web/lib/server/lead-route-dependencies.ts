import {
  createLeadRepository,
  workspaceMembers,
} from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase } from './database'
import { projectBelongsToWorkspace } from './project-route-dependencies'
import { createRuntimeLeadKeyring } from './runtime-lead-keyring'
import { getRuntimeSession } from './runtime-session'

import type { LeadApiDependencies } from './lead-api'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function createLeadRouteDependencies(): LeadApiDependencies {
  const trustedOrigin = required('APP_ORIGIN')
  const keyring = createRuntimeLeadKeyring()
  const database = getDatabase()
  const repository = createLeadRepository(database)

  return {
    trustedOrigin,
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
    keyring,
    leads: repository,
  }
}
