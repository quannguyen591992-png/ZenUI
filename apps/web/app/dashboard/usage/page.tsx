'use client'

import { useDashboardSession } from '../dashboard-shell'

import { UsageDashboard } from './usage-dashboard'

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export default function DashboardUsagePage() {
  const session = useDashboardSession()

  return (
    <UsageDashboard
      workspaceId={session.workspaceId}
      timezone={browserTimezone()}
    />
  )
}
