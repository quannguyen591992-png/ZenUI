import { describe, expect, it } from 'vitest'

import {
  authorizeWorkspaceOperation,
  hasWorkspacePermission,
  type WorkspaceAccessLookup,
} from '../lib/server/authorization'

const membership = {
  userId: 'user-1',
  workspaceId: 'workspace-1',
  role: 'editor' as const,
}

function lookup(overrides: Partial<WorkspaceAccessLookup> = {}): WorkspaceAccessLookup {
  return {
    findMembership: () => Promise.resolve(membership),
    projectBelongsToWorkspace: () => Promise.resolve(true),
    ...overrides,
  }
}

describe('workspace authorization', () => {
  it.each([
    ['viewer', 'read', true],
    ['viewer', 'mutateDocument', false],
    ['editor', 'mutateDocument', true],
    ['editor', 'manageProject', false],
    ['owner', 'manageProject', true],
  ] as const)('maps role %s to permission %s', (role, permission, allowed) => {
    expect(hasWorkspacePermission(role, permission)).toBe(allowed)
  })

  it('returns a trusted context for an authorized project operation', async () => {
    await expect(authorizeWorkspaceOperation(
      lookup(),
      { userId: 'user-1' },
      'workspace-1',
      'project-1',
      'mutateDocument',
    )).resolves.toEqual(membership)
  })

  it('uses not_found for missing membership or cross-workspace project reads', async () => {
    await expect(authorizeWorkspaceOperation(
      lookup({ findMembership: () => Promise.resolve(null) }),
      { userId: 'user-1' },
      'workspace-1',
      'project-1',
      'read',
    )).rejects.toMatchObject({ code: 'not_found', status: 404 })

    await expect(authorizeWorkspaceOperation(
      lookup({ projectBelongsToWorkspace: () => Promise.resolve(false) }),
      { userId: 'user-1' },
      'workspace-1',
      'project-1',
      'read',
    )).rejects.toMatchObject({ code: 'not_found', status: 404 })
  })

  it('returns forbidden without leaking resource detail when a role lacks permission', async () => {
    await expect(authorizeWorkspaceOperation(
      lookup(),
      { userId: 'user-1' },
      'workspace-1',
      'project-1',
      'manageProject',
    )).rejects.toMatchObject({ code: 'forbidden', status: 403, message: 'Forbidden' })
  })
})
