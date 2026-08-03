import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import {
  accounts,
  assets,
  brandKits,
  deployments,
  designDocuments,
  exportRuns,
  generationRuns,
  projects,
  providerConnections,
  revisions,
  sessions,
  shareLinks,
  users,
  verificationTokens,
  workspaceMembers,
  workspaces,
} from '../src/schema'

describe('database schema', () => {
  it('registers every SQL migration in the Drizzle journal', async () => {
    const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
    const sqlTags = (await readdir(migrationsDirectory))
      .filter(file => /^\d{4}_.+\.sql$/.test(file))
      .map(file => file.replace(/\.sql$/, ''))
      .sort()
    const journal = JSON.parse(await readFile(join(migrationsDirectory, 'meta', '_journal.json'), 'utf8')) as {
      entries?: Array<{ idx?: number; tag?: string }>
    }
    const journalTags = journal.entries?.map(entry => entry.tag).filter((tag): tag is string => Boolean(tag)) ?? []

    expect(journalTags).toEqual(sqlTags)
    expect(journal.entries?.map(entry => entry.idx)).toEqual(sqlTags.map((_, index) => index))
  })

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
      shareLinks,
      providerConnections,
      deployments,
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
      'share_links',
      'provider_connections',
      'deployments',
    ])
  })

  it('indexes every ownership and optimistic concurrency lookup', () => {
    expect(getTableConfig(workspaceMembers).indexes.map(index => index.config.name)).toEqual(
      expect.arrayContaining(['workspace_members_user_id_idx', 'workspace_members_workspace_id_idx']),
    )
    expect(getTableConfig(projects).indexes.map(index => index.config.name)).toContain('projects_workspace_id_updated_at_idx')
    expect(getTableConfig(designDocuments).indexes.map(index => index.config.name)).toContain('design_documents_project_version_idx')
    expect(getTableConfig(revisions).indexes.map(index => index.config.name)).toContain('revisions_project_created_at_idx')
    expect(getTableConfig(shareLinks).indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'share_links_workspace_created_at_idx',
      'share_links_project_created_at_idx',
      'share_links_revision_id_idx',
      'share_links_status_updated_at_idx',
    ]))
    expect(getTableConfig(providerConnections).indexes.map(index => index.config.name)).toContain('provider_connections_workspace_status_idx')
    expect(getTableConfig(deployments).indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'deployments_workspace_created_at_idx',
      'deployments_project_created_at_idx',
      'deployments_revision_id_idx',
      'deployments_status_updated_at_idx',
      'deployments_status_lease_idx',
    ]))
    expect(getTableConfig(generationRuns).indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'generation_runs_status_lease_idx', 'generation_runs_retention_idx',
    ]))
    expect(getTableConfig(exportRuns).indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'export_runs_status_lease_idx', 'export_runs_retention_idx',
    ]))
    expect(getTableConfig(shareLinks).indexes.map(index => index.config.name)).toContain('share_links_retention_idx')
    expect(getTableConfig(deployments).indexes.map(index => index.config.name)).toContain('deployments_retention_idx')
    expect(getTableConfig(generationRuns).columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'lease_expires_at', 'last_heartbeat_at', 'attempt_count', 'retained_cleanup_at',
      'delivery', 'proposal_action', 'proposal_status', 'previous_proposal_id',
      'proposal_scope', 'proposal_commands', 'proposed_document', 'proposal_summary',
      'proposal_accepted_at', 'proposal_discarded_at',
    ]))
    expect(getTableConfig(generationRuns).indexes.map(index => index.config.name)).toContain(
      'generation_runs_project_proposal_status_idx',
    )
    expect(getTableConfig(generationRuns).columns.find(column => column.name === 'prompt')?.notNull).toBe(false)
    expect(getTableConfig(exportRuns).columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'lease_expires_at', 'last_heartbeat_at', 'attempt_count',
    ]))
    expect(getTableConfig(deployments).columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'lease_expires_at', 'last_heartbeat_at', 'attempt_count',
    ]))
  })

  it('defines durable asset and versioned workspace Brand Kit storage', () => {
    expect(getTableConfig(assets).columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'workspace_id', 'project_id', 'created_by', 'request_id', 'scope', 'source', 'status',
      'parent_asset_id', 'transform', 'source_object_key', 'object_key', 'content_type',
      'width', 'height', 'bytes', 'checksum', 'default_alt', 'attribution', 'provider_result_id',
      'error_code', 'lease_expires_at', 'attempt_count', 'archived_at',
    ]))
    expect(getTableConfig(assets).indexes.map(index => index.config.name)).toEqual(expect.arrayContaining([
      'assets_workspace_created_at_idx', 'assets_project_created_at_idx', 'assets_status_lease_idx',
    ]))
    expect(getTableConfig(brandKits).columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'workspace_id', 'version', 'name', 'logo_asset_id', 'primary_color', 'background_color',
      'text_color', 'heading_font', 'body_font', 'updated_by',
    ]))
    expect(getTableConfig(brandKits).uniqueConstraints).toHaveLength(1)
  })

  it('enforces one membership per user/workspace and one draft per project', () => {
    expect(getTableConfig(workspaceMembers).uniqueConstraints).toHaveLength(1)
    expect(getTableConfig(designDocuments).uniqueConstraints).toHaveLength(1)
  })
})
