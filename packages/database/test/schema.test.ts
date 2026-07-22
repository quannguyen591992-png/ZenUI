import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  accounts,
  designDocuments,
  projects,
  revisions,
  sessions,
  users,
  verificationTokens,
  workspaceMembers,
  workspaces,
} from '../src/schema'

describe('database schema', () => {
  it('defines Auth.js and workspace-scoped domain tables', () => {
    expect([
      users,
      accounts,
      sessions,
      verificationTokens,
      workspaces,
      workspaceMembers,
      projects,
      designDocuments,
      revisions,
    ].map(table => getTableConfig(table).name)).toEqual([
      'users',
      'accounts',
      'sessions',
      'verification_tokens',
      'workspaces',
      'workspace_members',
      'projects',
      'design_documents',
      'revisions',
    ])
  })

  it('indexes every ownership and optimistic concurrency lookup', () => {
    expect(getTableConfig(workspaceMembers).indexes.map(index => index.config.name)).toEqual(
      expect.arrayContaining(['workspace_members_user_id_idx', 'workspace_members_workspace_id_idx']),
    )
    expect(getTableConfig(projects).indexes.map(index => index.config.name)).toContain('projects_workspace_id_updated_at_idx')
    expect(getTableConfig(designDocuments).indexes.map(index => index.config.name)).toContain('design_documents_project_version_idx')
    expect(getTableConfig(revisions).indexes.map(index => index.config.name)).toContain('revisions_project_created_at_idx')
  })

  it('enforces one membership per user/workspace and one draft per project', () => {
    expect(getTableConfig(workspaceMembers).uniqueConstraints).toHaveLength(1)
    expect(getTableConfig(designDocuments).uniqueConstraints).toHaveLength(1)
  })
})
