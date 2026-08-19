'use client'

import { useSearchParams } from 'next/navigation'

import { useDashboardSession } from '../dashboard-shell'

import { WorkspaceCustomerLeadsInbox } from './workspace-customer-leads-inbox'

export default function DashboardCustomersPage() {
  const session = useDashboardSession()
  const projectId = useSearchParams().get('projectId')

  return (
    <WorkspaceCustomerLeadsInbox
      workspaceId={session.workspaceId}
      {...(projectId ? { initialProjectId: projectId } : {})}
    />
  )
}
