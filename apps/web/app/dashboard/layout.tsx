import { workspaceMembers } from '@zenui/database'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { createConfiguredAuth } from '../../lib/server/configured-auth'
import {
  getDatabase,
  waitForDatabase,
} from '../../lib/server/database'
import { isLocalAuthRuntimeEnabled } from '../../lib/server/e2e-runtime'
import { getRuntimeSession } from '../../lib/server/runtime-session'

import { DashboardShell } from './dashboard-shell'

import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getRuntimeSession()
  if (!session) redirect('/login?callbackUrl=%2Fdashboard')

  await waitForDatabase()
  const database = getDatabase()
  const [membership] = await database.select({
    userId: workspaceMembers.userId,
    workspaceId: workspaceMembers.workspaceId,
    role: workspaceMembers.role,
  }).from(workspaceMembers).where(
    eq(workspaceMembers.userId, session.userId),
  ).limit(1)
  if (!membership) redirect('/login?callbackUrl=%2Fdashboard')

  const localAuth = isLocalAuthRuntimeEnabled()
  const signOutAction = localAuth ? undefined : async () => {
    'use server'
    await createConfiguredAuth().signOut({ redirectTo: '/' })
  }

  return (
    <DashboardShell
      session={membership}
      localAuth={localAuth}
      {...(signOutAction ? { signOutAction } : {})}
    >
      {children}
    </DashboardShell>
  )
}
