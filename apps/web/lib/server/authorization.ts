import { ApiError } from './api'

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'
export type WorkspacePermission = 'read' | 'mutateDocument' | 'manageProject'

export interface SessionIdentity {
  userId: string
}

export interface WorkspaceMembership {
  userId: string
  workspaceId: string
  role: WorkspaceRole
}

export interface WorkspaceAccessLookup {
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  projectBelongsToWorkspace(projectId: string, workspaceId: string): Promise<boolean>
}

const rolePermissions: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  viewer: ['read'],
  editor: ['read', 'mutateDocument'],
  owner: ['read', 'mutateDocument', 'manageProject'],
}

export function hasWorkspacePermission(role: WorkspaceRole, permission: WorkspacePermission): boolean {
  return rolePermissions[role].includes(permission)
}

export async function authorizeWorkspaceOperation(
  lookup: WorkspaceAccessLookup,
  session: SessionIdentity,
  workspaceId: string,
  projectId: string,
  permission: WorkspacePermission,
): Promise<WorkspaceMembership> {
  const membership = await lookup.findMembership(session.userId, workspaceId)
  if (!membership || !await lookup.projectBelongsToWorkspace(projectId, workspaceId)) {
    throw new ApiError('not_found', 'Resource not found', 404)
  }
  if (!hasWorkspacePermission(membership.role, permission)) {
    throw new ApiError('forbidden', 'Forbidden', 403)
  }
  return membership
}
