import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { validateDesignDocument, type DesignDocument } from '@zenui/design-schema'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { designDocuments, projects, revisions, workspaceMembers } from './schema'

import type * as schema from './schema'
import type { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

export * from './schema'

export interface AuthContext {
  userId: string
  workspaceId: string
}

export interface ProjectRecord {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  version: number
  document: DesignDocument
}

export type ReplaceDocumentResult =
  | { accepted: true; version: number; document: DesignDocument }
  | { accepted: false; code: 'not_found' | 'stale_document_version' }

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  document: z.unknown(),
}).strict()

function normalizeDocument(input: unknown, projectId: string, version: number): DesignDocument {
  if (typeof input !== 'object' || input === null) throw new Error('invalid_design_document')
  const candidate = structuredClone(input) as Record<string, unknown>
  candidate.projectId = projectId
  candidate.version = version
  const validation = validateDesignDocument(candidate)
  if (!validation.success) throw new Error('invalid_design_document')
  return validation.data
}

function mapProject(row: {
  project: typeof projects.$inferSelect
  draft: typeof designDocuments.$inferSelect
}): ProjectRecord {
  return {
    id: row.project.id,
    workspaceId: row.project.workspaceId,
    name: row.project.name,
    status: row.project.status,
    version: row.draft.version,
    document: row.draft.documentJson,
  }
}

export function createProjectRepository(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
) {
  const hasMembership = async (context: AuthContext): Promise<boolean> => {
    const membership = await db.select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .limit(1)
    return membership.length === 1
  }

  const selectAuthorizedProjects = (context: AuthContext, projectId?: string) => db
    .select({ project: projects, draft: designDocuments })
    .from(projects)
    .innerJoin(designDocuments, eq(designDocuments.projectId, projects.id))
    .innerJoin(workspaceMembers, and(
      eq(workspaceMembers.workspaceId, projects.workspaceId),
      eq(workspaceMembers.userId, context.userId),
    ))
    .where(and(
      eq(projects.workspaceId, context.workspaceId),
      projectId ? eq(projects.id, projectId) : eq(projects.status, 'active'),
    ))

  return {
    async create(context: AuthContext, input: { name: string; document: unknown }): Promise<ProjectRecord> {
      const parsed = createProjectSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_project')
      if (!await hasMembership(context)) throw new Error('forbidden')

      return db.transaction(async transaction => {
        const [project] = await transaction.insert(projects).values({
          workspaceId: context.workspaceId,
          name: parsed.data.name,
          createdBy: context.userId,
        }).returning()
        if (!project) throw new Error('project_create_failed')
        const document = normalizeDocument(parsed.data.document, project.id, 1)
        const [draft] = await transaction.insert(designDocuments).values({
          projectId: project.id,
          schemaVersion: document.schemaVersion,
          documentJson: document,
          version: 1,
        }).returning()
        if (!draft) throw new Error('document_create_failed')
        return mapProject({ project, draft })
      })
    },

    async list(context: AuthContext): Promise<ProjectRecord[]> {
      const rows = await selectAuthorizedProjects(context)
      return rows.map(mapProject)
    },

    async findById(context: AuthContext, projectId: string): Promise<ProjectRecord | null> {
      const [row] = await selectAuthorizedProjects(context, projectId).limit(1)
      return row ? mapProject(row) : null
    },

    async rename(context: AuthContext, projectId: string, name: string): Promise<ProjectRecord | null> {
      const parsed = z.string().trim().min(1).max(100).safeParse(name)
      if (!parsed.success) throw new Error('invalid_project')
      const project = await this.findById(context, projectId)
      if (!project) return null
      const [updated] = await db.update(projects).set({
        name: parsed.data,
        updatedAt: new Date(),
      }).where(and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, context.workspaceId),
      )).returning()
      return updated ? { ...project, name: updated.name, status: updated.status } : null
    },

    async archive(context: AuthContext, projectId: string): Promise<ProjectRecord | null> {
      const project = await this.findById(context, projectId)
      if (!project) return null
      const [updated] = await db.update(projects).set({
        status: 'archived',
        updatedAt: new Date(),
      }).where(and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, context.workspaceId),
      )).returning()
      return updated ? { ...project, name: updated.name, status: updated.status } : null
    },

    async replaceDocument(
      context: AuthContext,
      projectId: string,
      expectedVersion: number,
      input: unknown,
    ): Promise<ReplaceDocumentResult> {
      return db.transaction(async transaction => {
        const [authorized] = await transaction.select({ draftId: designDocuments.id, version: designDocuments.version })
          .from(projects)
          .innerJoin(designDocuments, eq(designDocuments.projectId, projects.id))
          .innerJoin(workspaceMembers, and(
            eq(workspaceMembers.workspaceId, projects.workspaceId),
            eq(workspaceMembers.userId, context.userId),
          ))
          .where(and(eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId)))
          .limit(1)
        if (!authorized) return { accepted: false, code: 'not_found' } as const
        if (authorized.version !== expectedVersion) {
          return { accepted: false, code: 'stale_document_version' } as const
        }

        const document = normalizeDocument(input, projectId, expectedVersion + 1)
        const [updated] = await transaction.update(designDocuments).set({
          documentJson: document,
          schemaVersion: document.schemaVersion,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        }).where(and(
          eq(designDocuments.id, authorized.draftId),
          eq(designDocuments.version, expectedVersion),
        )).returning({ version: designDocuments.version, document: designDocuments.documentJson })
        if (!updated) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({
          currentDocumentVersion: updated.version,
          updatedAt: new Date(),
        }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId)))
        return { accepted: true, version: updated.version, document: updated.document } as const
      })
    },

    async createRevision(
      context: AuthContext,
      projectId: string,
      input: { source: 'manual' | 'restore'; summary: string },
    ) {
      const project = await this.findById(context, projectId)
      if (!project) throw new Error('not_found')
      const [revision] = await db.insert(revisions).values({
        projectId,
        documentSnapshot: structuredClone(project.document),
        source: input.source,
        summary: input.summary,
        createdBy: context.userId,
      }).returning()
      if (!revision) throw new Error('revision_create_failed')
      return revision
    },

    async listRevisions(context: AuthContext, projectId: string) {
      if (!await this.findById(context, projectId)) return []
      return db.select().from(revisions)
        .where(eq(revisions.projectId, projectId))
        .orderBy(desc(revisions.createdAt))
    },

    async restoreRevision(
      context: AuthContext,
      projectId: string,
      revisionId: string,
      expectedVersion: number,
    ) {
      const project = await this.findById(context, projectId)
      if (!project) return { accepted: false, code: 'not_found' } as const
      if (project.version !== expectedVersion) {
        return { accepted: false, code: 'stale_document_version' } as const
      }
      const [revision] = await db.select().from(revisions).where(and(
        eq(revisions.id, revisionId),
        eq(revisions.projectId, projectId),
      )).limit(1)
      if (!revision) return { accepted: false, code: 'not_found' } as const

      return db.transaction(async transaction => {
        const document = normalizeDocument(revision.documentSnapshot, projectId, expectedVersion + 1)
        const [updated] = await transaction.update(designDocuments).set({
          documentJson: document,
          version: expectedVersion + 1,
          updatedAt: new Date(),
        }).where(and(
          eq(designDocuments.projectId, projectId),
          eq(designDocuments.version, expectedVersion),
        )).returning({ version: designDocuments.version, document: designDocuments.documentJson })
        if (!updated) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({
          currentDocumentVersion: updated.version,
          updatedAt: new Date(),
        }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId)))
        await transaction.insert(revisions).values({
          projectId,
          documentSnapshot: structuredClone(updated.document),
          source: 'restore',
          summary: `Restored ${revision.id}`,
          createdBy: context.userId,
        })
        return { accepted: true, version: updated.version, document: updated.document } as const
      })
    },
  }
}

export async function migrateTestDatabase(client: PGlite): Promise<void> {
  const path = fileURLToPath(new URL('../migrations/0000_keen_gateway.sql', import.meta.url))
  const sql = await readFile(path, 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.exec(statement)
  }
}
