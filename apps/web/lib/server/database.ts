import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import * as schema from '@zenui/database/schema'
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { Pool } from 'pg'

import { E2E_IDENTITIES, isE2eRuntimeEnabled } from './e2e-runtime'

let pool: Pool | undefined
let e2eClient: PGlite | undefined
let e2eDatabase: ReturnType<typeof drizzlePglite<typeof schema>> | undefined
let e2eReady: Promise<void> | undefined

async function initializeE2eDatabase(client: PGlite): Promise<void> {
  const migrationPath = resolve(process.cwd(), '../../packages/database/migrations/0000_keen_gateway.sql')
  const migration = await readFile(migrationPath, 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement)
  }
  const owner = E2E_IDENTITIES.owner
  const outsider = E2E_IDENTITIES.outsider
  await client.exec(`
    INSERT INTO users (id, name, email) VALUES
      ('${owner.userId}', 'Owner', 'owner@example.test'),
      ('${outsider.userId}', 'Outsider', 'outsider@example.test');
    INSERT INTO workspaces (id, name, created_by) VALUES
      ('${owner.workspaceId}', 'Owner Workspace', '${owner.userId}'),
      ('${outsider.workspaceId}', 'Outsider Workspace', '${outsider.userId}');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
      ('${owner.workspaceId}', '${owner.userId}', '${owner.role}'),
      ('${outsider.workspaceId}', '${outsider.userId}', '${outsider.role}');
  `)
}

export function getDatabase() {
  if (isE2eRuntimeEnabled()) {
    e2eClient ??= new PGlite()
    e2eDatabase ??= drizzlePglite(e2eClient, { schema })
    e2eReady ??= initializeE2eDatabase(e2eClient)
    return e2eDatabase
  }
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  pool ??= new Pool({ connectionString: databaseUrl, max: 10 })
  return drizzlePostgres(pool, { schema })
}

export async function waitForDatabase(): Promise<void> {
  getDatabase()
  if (e2eReady) await e2eReady
}

export async function resetE2eDatabase(): Promise<void> {
  if (!isE2eRuntimeEnabled()) throw new Error('e2e_runtime_disabled')
  await waitForDatabase()
  await e2eClient!.exec('TRUNCATE revisions, design_documents, projects RESTART IDENTITY CASCADE;')
}
