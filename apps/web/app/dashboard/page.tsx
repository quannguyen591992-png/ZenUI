import { redirect } from 'next/navigation'

import { createConfiguredAuth } from '../../lib/server/configured-auth'
import { isLocalAuthRuntimeEnabled } from '../../lib/server/e2e-runtime'
import { getRuntimeSession } from '../../lib/server/runtime-session'
import { Dashboard } from '../dashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  if (!await getRuntimeSession()) {
    redirect('/login?callbackUrl=%2Fdashboard')
  }

  const localAuth = isLocalAuthRuntimeEnabled()
  const signOutAction = localAuth ? undefined : async () => {
    'use server'
    await createConfiguredAuth().signOut({ redirectTo: '/' })
  }

  return <Dashboard localAuth={localAuth} {...(signOutAction ? { signOutAction } : {})} />
}
