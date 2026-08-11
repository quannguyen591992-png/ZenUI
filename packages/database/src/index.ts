import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  designDirectionGenerationPlanSchema,
  designDirectionPresetIdSchema,
  designDirectionRunErrorCodeSchema,
  generationErrorCodeSchema,
  captureRemixConstraints,
  mediaProposalReviewSchema,
  publicMediaProposalReview,
  appendProposalLineageTurn,
  createProposalLineage,
  proposalFeedbackCodeSchema,
  proposalLineageSchema,
  proposalActionSchema,
  proposalIntentSchema,
  proposalScopeSchema,
  proposalSnapshotMatches,
  remixAllowedChangeSchema,
  remixConstraintsSchema,
  siteIntelligenceReviewSchema,
  validateProposalRemix,
  websiteBriefSchema,
  type DesignDirectionRunErrorCode,
  type DesignDirectionRunStatus,
  type GenerationErrorCode,
  type GenerationMode,
  type LlmUsage,
  type MaterializedDesignDirection,
  type PublicMediaProposalReview,
  type ProposalAction,
  type ProposalFeedbackCode,
  type ProposalIntent,
  type ProposalLineage,
  type ProposalScope,
  type RemixConstraints,
  type SiteIntelligenceReview,
  type WebsiteBrief,
} from '@zenui/ai-core'
import {
  assetAttributionSchema,
  assetErrorCodeSchema,
  brandKitSchema,
  brandKitValuesSchema,
  createBrandApplicationCommands,
  cropTransformSchema,
  type AssetAttribution,
  type AssetErrorCode,
  type AssetStatus,
  type BrandKit,
  type CropTransform,
} from '@zenui/asset-core'
import {
  DEPLOYMENT_CONTENT_TYPE,
  deploymentErrorCodeSchema,
  deploymentTargetSchema,
  type DeploymentErrorCode,
  type DeploymentStatus,
  type DeploymentTarget,
} from '@zenui/deployment-core'
import { applyCommandTransaction, type DesignCommand } from '@zenui/design-commands'
import { parseDesignDocument, validateDesignDocument, type DesignDocument } from '@zenui/design-schema'
import {
  EXPORT_CONTENT_TYPE,
  exportArtifactSchema,
  exportErrorCodeSchema,
  type ExportArtifact,
  type ExportErrorCode,
} from '@zenui/export-core'
import { resolveShareStatus, shareSlugSchema, type ShareStatus, type ShareStoredStatus } from '@zenui/share-core'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import {
  assets,
  brandKits,
  deployments,
  designDirectionRuns,
  designDocuments,
  exportRuns,
  generationRuns,
  projectBriefs,
  projects,
  providerConnections,
  revisions,
  shareLinks,
  siteIntelligenceDismissals,
  siteIntelligenceReviews,
  usageRecords,
  workspaceMembers,
} from './schema'

import type * as schema from './schema'
import type { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

export * from './schema'

export interface AuthContext {
  userId: string
  workspaceId: string
}

export interface LeaseInput {
  now: Date
  leaseSeconds: number
}

function leaseValues(input: LeaseInput) {
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 30 || input.leaseSeconds > 3_600) {
    throw new Error('invalid_lease_input')
  }
  return {
    leaseExpiresAt: new Date(input.now.getTime() + input.leaseSeconds * 1_000),
    lastHeartbeatAt: input.now,
    updatedAt: input.now,
  }
}

export interface ProjectRecord {
  id: string
  workspaceId: string
  name: string
  status: 'active' | 'archived'
  creationState: 'onboarding' | 'accepted'
  version: number
  document: DesignDocument
}

export type ReplaceDocumentResult =
  | { accepted: true; version: number; document: DesignDocument }
  | { accepted: false; code: 'not_found' | 'stale_document_version' }

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  document: z.unknown(),
  creationState: z.enum(['onboarding', 'accepted']).default('accepted'),
}).strict()

function normalizeDocument(input: unknown, projectId: string, version: number): DesignDocument {
  if (typeof input !== 'object' || input === null) throw new Error('invalid_design_document')
  const candidate = structuredClone(input) as Record<string, unknown>
  candidate.projectId = projectId
  candidate.version = version
  const validation = parseDesignDocument(candidate)
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
    creationState: row.project.creationState,
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
    async create(context: AuthContext, input: {
      name: string
      document: unknown
      creationState?: 'onboarding' | 'accepted'
    }): Promise<ProjectRecord> {
      const parsed = createProjectSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_project')
      if (!await hasMembership(context)) throw new Error('forbidden')

      return db.transaction(async transaction => {
        const [project] = await transaction.insert(projects).values({
          workspaceId: context.workspaceId,
          name: parsed.data.name,
          creationState: parsed.data.creationState,
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
      return updated ? {
        ...project,
        name: updated.name,
        status: updated.status,
        creationState: updated.creationState,
      } : null
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
      return updated ? {
        ...project,
        name: updated.name,
        status: updated.status,
        creationState: updated.creationState,
      } : null
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
      return {
        id: revision.id,
        projectId: revision.projectId,
        documentVersion: revision.documentSnapshot.version,
        source: revision.source,
        summary: revision.summary,
        createdAt: revision.createdAt,
      }
    },

    async listRevisions(context: AuthContext, projectId: string) {
      if (!await this.findById(context, projectId)) return []
      const rows = await db.select().from(revisions)
        .where(eq(revisions.projectId, projectId))
        .orderBy(desc(revisions.createdAt))
      return rows.map(revision => ({
        id: revision.id,
        projectId: revision.projectId,
        documentVersion: revision.documentSnapshot.version,
        source: revision.source,
        summary: revision.summary,
        createdAt: revision.createdAt,
      }))
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

export interface AssetRecord {
  id: string
  workspaceId: string
  projectId: string | null
  createdBy: string
  requestId: string
  scope: 'project' | 'workspace'
  source: 'upload' | 'pexels' | 'generated' | 'derivative'
  status: AssetStatus
  parentAssetId: string | null
  transform: CropTransform | null
  sourceObjectKey: string | null
  objectKey: string | null
  contentType: 'image/webp' | null
  width: number | null
  height: number | null
  bytes: number | null
  checksum: string | null
  defaultAlt: string
  attribution: AssetAttribution | null
  providerResultId: string | null
  errorCode: AssetErrorCode | null
  attemptCount: number
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

function mapAsset(row: typeof assets.$inferSelect): AssetRecord {
  const attribution = assetAttributionSchema.safeParse(row.attribution)
  const transform = cropTransformSchema.safeParse(row.transform)
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    createdBy: row.createdBy,
    requestId: row.requestId,
    scope: row.scope,
    source: row.source,
    status: row.status,
    parentAssetId: row.parentAssetId,
    transform: transform.success ? transform.data : null,
    sourceObjectKey: row.sourceObjectKey,
    objectKey: row.objectKey,
    contentType: row.contentType === 'image/webp' ? row.contentType : null,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    checksum: row.checksum,
    defaultAlt: row.defaultAlt,
    attribution: attribution.success ? attribution.data : null,
    providerResultId: row.providerResultId,
    errorCode: row.errorCode,
    attemptCount: row.attemptCount,
    archived: row.archivedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const assetCreateSchema = z.object({
  projectId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
  scope: z.enum(['project', 'workspace']),
  source: z.enum(['upload', 'pexels', 'generated']),
  defaultAlt: z.string().max(300),
  sourceObjectKey: z.string().min(1).max(500).optional(),
  providerResultId: z.string().min(1).max(100).optional(),
  attribution: assetAttributionSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.scope === 'project' && !value.projectId) context.addIssue({ code: 'custom', path: ['projectId'], message: 'Project assets require a project' })
  if (value.scope === 'workspace' && value.projectId) context.addIssue({ code: 'custom', path: ['projectId'], message: 'Workspace assets cannot belong to one project' })
  if ((value.source === 'upload' || value.source === 'generated') && !value.sourceObjectKey) {
    context.addIssue({ code: 'custom', path: ['sourceObjectKey'], message: 'Private image sources require a source object' })
  }
  if (value.source === 'pexels' && !value.providerResultId) context.addIssue({ code: 'custom', path: ['providerResultId'], message: 'Pexels imports require a result ID' })
  if (value.source !== 'pexels' && value.providerResultId) context.addIssue({ code: 'custom', path: ['providerResultId'], message: 'Only Pexels imports may carry a result ID' })
})

export function createAssetRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const projectAuthorized = async (context: AuthContext, projectId: string): Promise<boolean> => (
    await createProjectRepository(db).findById(context, projectId)
  ) !== null
  const selectAuthorized = async (context: AuthContext, assetId: string) => {
    const [row] = await db.select({ asset: assets }).from(assets)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, assets.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(eq(assets.id, assetId), eq(assets.workspaceId, context.workspaceId)))
      .limit(1)
    return row?.asset ?? null
  }
  return {
    async create(context: AuthContext, input: z.input<typeof assetCreateSchema>): Promise<AssetRecord> {
      const parsed = assetCreateSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_asset_input')
      if (parsed.data.projectId && !await projectAuthorized(context, parsed.data.projectId)) throw new Error('not_found')
      if (!parsed.data.projectId) {
        const [membership] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
          eq(workspaceMembers.workspaceId, context.workspaceId), eq(workspaceMembers.userId, context.userId),
        )).limit(1)
        if (!membership) throw new Error('not_found')
      }
      const [existing] = await db.select().from(assets).where(and(
        eq(assets.workspaceId, context.workspaceId), eq(assets.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return mapAsset(existing)
      const [created] = await db.insert(assets).values({
        workspaceId: context.workspaceId,
        projectId: parsed.data.projectId ?? null,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        scope: parsed.data.scope,
        source: parsed.data.source,
        defaultAlt: parsed.data.defaultAlt,
        sourceObjectKey: parsed.data.sourceObjectKey ?? null,
        providerResultId: parsed.data.providerResultId ?? null,
        attribution: parsed.data.attribution ?? null,
      }).returning()
      if (!created) throw new Error('asset_create_failed')
      return mapAsset(created)
    },

    async createDerivative(context: AuthContext, projectId: string, parentAssetId: string, input: {
      requestId: string
      transform: CropTransform
    }): Promise<AssetRecord> {
      const transform = cropTransformSchema.safeParse(input.transform)
      if (!transform.success || !z.string().uuid().safeParse(input.requestId).success) throw new Error('invalid_asset_input')
      if (!await projectAuthorized(context, projectId)) throw new Error('not_found')
      const parent = await selectAuthorized(context, parentAssetId)
      if (!parent || parent.projectId !== projectId) throw new Error('not_found')
      if (parent.status !== 'ready') throw new Error('asset_not_ready')
      const [existing] = await db.select().from(assets).where(and(
        eq(assets.workspaceId, context.workspaceId), eq(assets.requestId, input.requestId),
      )).limit(1)
      if (existing) return mapAsset(existing)
      const [created] = await db.insert(assets).values({
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: input.requestId,
        scope: 'project',
        source: 'derivative',
        parentAssetId,
        transform: transform.data,
        defaultAlt: parent.defaultAlt,
      }).returning()
      if (!created) throw new Error('asset_create_failed')
      return mapAsset(created)
    },

    async findById(context: AuthContext, assetId: string): Promise<AssetRecord | null> {
      const row = await selectAuthorized(context, assetId)
      return row ? mapAsset(row) : null
    },

    async getWorkerInput(context: AuthContext, assetId: string): Promise<(AssetRecord & { parentObjectKey: string | null }) | null> {
      const row = await selectAuthorized(context, assetId)
      if (!row) return null
      let parentObjectKey: string | null = null
      if (row.parentAssetId) {
        const [parent] = await db.select({ objectKey: assets.objectKey, status: assets.status }).from(assets).where(and(
          eq(assets.id, row.parentAssetId), eq(assets.workspaceId, context.workspaceId),
        )).limit(1)
        if (!parent || parent.status !== 'ready') return null
        parentObjectKey = parent.objectKey
      }
      return { ...mapAsset(row), parentObjectKey }
    },

    async getPublicReady(assetId: string): Promise<AssetRecord | null> {
      const [row] = await db.select().from(assets).where(and(
        eq(assets.id, assetId), eq(assets.status, 'ready'),
      )).limit(1)
      return row ? mapAsset(row) : null
    },

    async getPublicationAssets(context: AuthContext, projectId: string, assetIds: readonly string[]): Promise<Array<{
      id: string
      objectKey: string
      contentType: 'image/webp'
      bytes: number
      checksum: string
    }>> {
      if (!await projectAuthorized(context, projectId)) throw new Error('not_found')
      const ids = [...new Set(assetIds)].sort()
      if (ids.length === 0) return []
      if (!ids.every(id => z.string().uuid().safeParse(id).success)) throw new Error('asset_not_publishable')
      const rows = await db.select().from(assets).where(and(
        eq(assets.workspaceId, context.workspaceId),
        inArray(assets.id, ids),
        or(eq(assets.projectId, projectId), isNull(assets.projectId)),
        eq(assets.status, 'ready'),
        isNull(assets.archivedAt),
        eq(assets.contentType, 'image/webp'),
        isNotNull(assets.objectKey),
        isNotNull(assets.bytes),
        isNotNull(assets.checksum),
      ))
      if (rows.length !== ids.length) throw new Error('asset_not_publishable')
      return rows.map(row => {
        if (!row.objectKey || row.contentType !== 'image/webp' || !row.bytes || !row.checksum) {
          throw new Error('asset_not_publishable')
        }
        return {
          id: row.id,
          objectKey: row.objectKey,
          contentType: row.contentType,
          bytes: row.bytes,
          checksum: row.checksum,
        }
      }).sort((left, right) => left.id.localeCompare(right.id))
    },

    async list(context: AuthContext, projectId: string): Promise<AssetRecord[]> {
      if (!await projectAuthorized(context, projectId)) return []
      const rows = await db.select().from(assets).where(and(
        eq(assets.workspaceId, context.workspaceId),
        or(eq(assets.projectId, projectId), isNull(assets.projectId)),
      )).orderBy(desc(assets.createdAt))
      return rows.map(mapAsset)
    },

    async claim(context: AuthContext, assetId: string, lease: LeaseInput = { now: new Date(), leaseSeconds: 120 }): Promise<AssetRecord | null> {
      const [updated] = await db.update(assets).set({
        status: 'importing',
        leaseExpiresAt: leaseValues(lease).leaseExpiresAt,
        lastHeartbeatAt: lease.now,
        attemptCount: sql`${assets.attemptCount} + 1`,
        updatedAt: lease.now,
      }).where(and(
        eq(assets.id, assetId), eq(assets.workspaceId, context.workspaceId), eq(assets.createdBy, context.userId), eq(assets.status, 'queued'),
      )).returning()
      return updated ? mapAsset(updated) : null
    },

    async complete(context: AuthContext, assetId: string, input: {
      objectKey: string
      contentType: 'image/webp'
      width: number
      height: number
      bytes: number
      checksum: string
      attribution?: AssetAttribution
    }): Promise<AssetRecord | null> {
      const parsed = z.object({
        objectKey: z.string().min(1).max(500), contentType: z.literal('image/webp'),
        width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
        bytes: z.number().int().positive().max(20 * 1024 * 1024), checksum: z.string().regex(/^[a-f0-9]{64}$/),
        attribution: assetAttributionSchema.optional(),
      }).strict().safeParse(input)
      if (!parsed.success) return null
      const [updated] = await db.update(assets).set({
        status: 'ready', objectKey: parsed.data.objectKey, contentType: parsed.data.contentType,
        width: parsed.data.width, height: parsed.data.height, bytes: parsed.data.bytes, checksum: parsed.data.checksum,
        attribution: parsed.data.attribution ?? null,
        errorCode: null, leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(assets.id, assetId), eq(assets.workspaceId, context.workspaceId), eq(assets.createdBy, context.userId), eq(assets.status, 'importing'),
      )).returning()
      return updated ? mapAsset(updated) : null
    },

    async fail(context: AuthContext, assetId: string, code: AssetErrorCode): Promise<AssetRecord | null> {
      const error = assetErrorCodeSchema.safeParse(code)
      if (!error.success) return null
      const [updated] = await db.update(assets).set({
        status: 'failed', errorCode: error.data, leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(assets.id, assetId), eq(assets.workspaceId, context.workspaceId), eq(assets.createdBy, context.userId),
        inArray(assets.status, ['queued', 'importing']),
      )).returning()
      return updated ? mapAsset(updated) : null
    },

    async archive(context: AuthContext, assetId: string): Promise<AssetRecord | null> {
      const [updated] = await db.update(assets).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(assets.id, assetId), eq(assets.workspaceId, context.workspaceId), eq(assets.createdBy, context.userId),
      )).returning()
      return updated ? mapAsset(updated) : null
    },
  }
}

export interface BrandKitRecord extends BrandKit {
  id: string
  workspaceId: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

function mapBrandKit(row: typeof brandKits.$inferSelect): BrandKitRecord {
  const kit = brandKitSchema.parse({
    version: row.version,
    name: row.name,
    logoAssetId: row.logoAssetId,
    colors: { primary: row.primaryColor, background: row.backgroundColor, text: row.textColor },
    fonts: { heading: row.headingFont, body: row.bodyFont },
  })
  return { ...kit, id: row.id, workspaceId: row.workspaceId, updatedBy: row.updatedBy, createdAt: row.createdAt, updatedAt: row.updatedAt }
}

export function createBrandKitRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const membership = async (context: AuthContext) => {
    const [row] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(
      eq(workspaceMembers.workspaceId, context.workspaceId), eq(workspaceMembers.userId, context.userId),
    )).limit(1)
    return row
  }
  return {
    async load(context: AuthContext): Promise<BrandKitRecord | null> {
      if (!await membership(context)) return null
      const [row] = await db.select().from(brandKits).where(eq(brandKits.workspaceId, context.workspaceId)).limit(1)
      return row ? mapBrandKit(row) : null
    },

    async save(context: AuthContext, input: Omit<BrandKit, 'version'> & { expectedVersion: number }): Promise<BrandKitRecord> {
      if (!await membership(context)) throw new Error('not_found')
      const { expectedVersion, ...valuesInput } = input
      const parsed = brandKitValuesSchema.safeParse(valuesInput)
      if (!parsed.success || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error('invalid_brand_kit')
      if (parsed.data.logoAssetId) {
        const logo = await createAssetRepository(db).findById(context, parsed.data.logoAssetId)
        if (!logo || logo.scope !== 'workspace' || logo.status !== 'ready') throw new Error('invalid_brand_logo')
      }
      const current = await this.load(context)
      if ((current?.version ?? 0) !== expectedVersion) throw new Error('stale_brand_kit_version')
      const nextVersion = expectedVersion + 1
      const values = {
        version: nextVersion, name: parsed.data.name, logoAssetId: parsed.data.logoAssetId ?? null,
        primaryColor: parsed.data.colors.primary, backgroundColor: parsed.data.colors.background, textColor: parsed.data.colors.text,
        headingFont: parsed.data.fonts.heading, bodyFont: parsed.data.fonts.body,
        updatedBy: context.userId, updatedAt: new Date(),
      }
      const row = current
        ? (await db.update(brandKits).set(values).where(and(
            eq(brandKits.workspaceId, context.workspaceId), eq(brandKits.version, expectedVersion),
          )).returning())[0]
        : (await db.insert(brandKits).values({ workspaceId: context.workspaceId, ...values }).returning())[0]
      if (!row) throw new Error('stale_brand_kit_version')
      return mapBrandKit(row)
    },

    async applyToProject(context: AuthContext, projectId: string, input: {
      expectedBrandKitVersion: number
      expectedDocumentVersion: number
    }): Promise<ReplaceDocumentResult> {
      return db.transaction(async transaction => {
        const project = await createProjectRepository(transaction).findById(context, projectId)
        if (!project) return { accepted: false, code: 'not_found' } as const
        if (project.version !== input.expectedDocumentVersion) return { accepted: false, code: 'stale_document_version' } as const
        const [row] = await transaction.select().from(brandKits).where(and(
          eq(brandKits.workspaceId, context.workspaceId), eq(brandKits.version, input.expectedBrandKitVersion),
        )).limit(1)
        if (!row) return { accepted: false, code: 'not_found' } as const
        const kit = mapBrandKit(row)
        const applied = applyCommandTransaction(project.document, project.version, createBrandApplicationCommands({
          document: project.document,
          documentVersion: project.version,
          brandKit: {
            version: kit.version,
            name: kit.name,
            logoAssetId: kit.logoAssetId ?? null,
            colors: kit.colors,
            fonts: kit.fonts,
          },
        }))
        if (!applied.accepted) throw new Error('invalid_brand_kit')
        const [draft] = await transaction.update(designDocuments).set({
          documentJson: applied.document, schemaVersion: applied.document.schemaVersion,
          version: applied.version, updatedAt: new Date(),
        }).where(and(eq(designDocuments.projectId, projectId), eq(designDocuments.version, project.version))).returning()
        if (!draft) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({ currentDocumentVersion: applied.version, updatedAt: new Date() }).where(and(
          eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId),
        ))
        return { accepted: true, version: applied.version, document: applied.document } as const
      })
    },
  }
}

export interface SiteIntelligenceReviewRecord {
  id: string
  projectId: string
  documentVersion: number
  policyVersion: string
  analysis: SiteIntelligenceReview
  dismissedFindingFingerprints: string[]
  stale: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SiteIntelligenceDismissalRecord {
  findingFingerprint: string
  evidenceFingerprint: string
  policyVersion: string
  active: boolean
  dismissedAt: Date
  restoredAt: Date | null
}

const siteIntelligenceCreateSchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  analysis: siteIntelligenceReviewSchema,
}).strict().superRefine((value, context) => {
  if (value.analysis.documentVersion !== value.expectedVersion) {
    context.addIssue({ code: 'custom', path: ['analysis', 'documentVersion'], message: 'Analysis version must match expected version' })
  }
})

const findingFingerprintSchema = z.string().regex(/^[a-f0-9]{16}$/)

export function createSiteIntelligenceRepository(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
) {
  const selectAuthorizedReview = async (context: AuthContext, reviewId: string) => {
    const [row] = await db.select({ review: siteIntelligenceReviews, version: designDocuments.version })
      .from(siteIntelligenceReviews)
      .innerJoin(designDocuments, eq(designDocuments.projectId, siteIntelligenceReviews.projectId))
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, siteIntelligenceReviews.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(
        eq(siteIntelligenceReviews.id, reviewId),
        eq(siteIntelligenceReviews.workspaceId, context.workspaceId),
      )).limit(1)
    return row ?? null
  }

  const dismissals = async (context: AuthContext, projectId: string): Promise<string[]> => {
    const rows = await db.select({ fingerprint: siteIntelligenceDismissals.findingFingerprint })
      .from(siteIntelligenceDismissals)
      .where(and(
        eq(siteIntelligenceDismissals.projectId, projectId),
        eq(siteIntelligenceDismissals.workspaceId, context.workspaceId),
        eq(siteIntelligenceDismissals.userId, context.userId),
        isNull(siteIntelligenceDismissals.restoredAt),
      ))
    return rows.map(row => row.fingerprint).sort()
  }

  const mapReview = async (
    context: AuthContext,
    row: { review: typeof siteIntelligenceReviews.$inferSelect; version: number },
  ): Promise<SiteIntelligenceReviewRecord | null> => {
    const analysis = siteIntelligenceReviewSchema.safeParse(row.review.analysisSnapshot)
    if (!analysis.success) return null
    return {
      id: row.review.id,
      projectId: row.review.projectId,
      documentVersion: row.review.documentVersion,
      policyVersion: row.review.policyVersion,
      analysis: analysis.data,
      dismissedFindingFingerprints: await dismissals(context, row.review.projectId),
      stale: row.review.documentVersion !== row.version,
      createdAt: row.review.createdAt,
      updatedAt: row.review.updatedAt,
    }
  }

  const findProject = (context: AuthContext, projectId: string) => createProjectRepository(db).findById(context, projectId)

  return {
    async create(
      context: AuthContext,
      projectId: string,
      input: z.input<typeof siteIntelligenceCreateSchema>,
    ): Promise<SiteIntelligenceReviewRecord> {
      const parsed = siteIntelligenceCreateSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_site_intelligence_input')
      const project = await findProject(context, projectId)
      if (!project) throw new Error('not_found')
      if (project.version !== parsed.data.expectedVersion) throw new Error('stale_document_version')
      const [existing] = await db.select().from(siteIntelligenceReviews).where(and(
        eq(siteIntelligenceReviews.projectId, projectId),
        eq(siteIntelligenceReviews.requestId, parsed.data.requestId),
      )).limit(1)
      const review = existing ?? (await db.insert(siteIntelligenceReviews).values({
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        documentVersion: parsed.data.expectedVersion,
        policyVersion: parsed.data.analysis.policyVersion,
        documentFingerprint: parsed.data.analysis.documentFingerprint,
        briefFingerprint: parsed.data.analysis.briefFingerprint,
        analysisSnapshot: parsed.data.analysis,
      }).returning())[0]
      if (!review) throw new Error('site_intelligence_create_failed')
      const mapped = await mapReview(context, { review, version: project.version })
      if (!mapped) throw new Error('site_intelligence_create_failed')
      return mapped
    },

    async findById(context: AuthContext, reviewId: string): Promise<SiteIntelligenceReviewRecord | null> {
      const row = await selectAuthorizedReview(context, reviewId)
      return row ? mapReview(context, row) : null
    },

    async findLatest(context: AuthContext, projectId: string): Promise<SiteIntelligenceReviewRecord | null> {
      if (!await findProject(context, projectId)) return null
      const [row] = await db.select({ review: siteIntelligenceReviews, version: designDocuments.version })
        .from(siteIntelligenceReviews)
        .innerJoin(designDocuments, eq(designDocuments.projectId, siteIntelligenceReviews.projectId))
        .where(and(
          eq(siteIntelligenceReviews.projectId, projectId),
          eq(siteIntelligenceReviews.workspaceId, context.workspaceId),
        )).orderBy(desc(siteIntelligenceReviews.createdAt)).limit(1)
      return row ? mapReview(context, row) : null
    },

    async dismiss(context: AuthContext, projectId: string, fingerprintInput: string): Promise<SiteIntelligenceDismissalRecord | null> {
      const fingerprint = findingFingerprintSchema.safeParse(fingerprintInput)
      const latest = await this.findLatest(context, projectId)
      if (!fingerprint.success || !latest) return null
      const finding = latest.analysis.findings.find(item => item.fingerprint === fingerprint.data)
      if (!finding) return null
      const now = new Date()
      const [row] = await db.insert(siteIntelligenceDismissals).values({
        workspaceId: context.workspaceId,
        projectId,
        userId: context.userId,
        findingFingerprint: finding.fingerprint,
        evidenceFingerprint: finding.evidenceFingerprint,
        policyVersion: latest.policyVersion,
        dismissedAt: now,
        restoredAt: null,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [
          siteIntelligenceDismissals.projectId,
          siteIntelligenceDismissals.userId,
          siteIntelligenceDismissals.findingFingerprint,
        ],
        set: {
          evidenceFingerprint: finding.evidenceFingerprint,
          policyVersion: latest.policyVersion,
          restoredAt: null,
          updatedAt: now,
        },
      }).returning()
      return row ? {
        findingFingerprint: row.findingFingerprint,
        evidenceFingerprint: row.evidenceFingerprint,
        policyVersion: row.policyVersion,
        active: row.restoredAt === null,
        dismissedAt: row.dismissedAt,
        restoredAt: row.restoredAt,
      } : null
    },

    async restore(context: AuthContext, projectId: string, fingerprintInput: string): Promise<SiteIntelligenceDismissalRecord | null> {
      const fingerprint = findingFingerprintSchema.safeParse(fingerprintInput)
      if (!fingerprint.success || !await findProject(context, projectId)) return null
      const existing = await db.select().from(siteIntelligenceDismissals).where(and(
        eq(siteIntelligenceDismissals.projectId, projectId),
        eq(siteIntelligenceDismissals.workspaceId, context.workspaceId),
        eq(siteIntelligenceDismissals.userId, context.userId),
        eq(siteIntelligenceDismissals.findingFingerprint, fingerprint.data),
      )).limit(1)
      if (!existing[0]) return null
      const row = existing[0].restoredAt ? existing[0] : (await db.update(siteIntelligenceDismissals).set({
        restoredAt: new Date(), updatedAt: new Date(),
      }).where(eq(siteIntelligenceDismissals.id, existing[0].id)).returning())[0]
      return row ? {
        findingFingerprint: row.findingFingerprint,
        evidenceFingerprint: row.evidenceFingerprint,
        policyVersion: row.policyVersion,
        active: false,
        dismissedAt: row.dismissedAt,
        restoredAt: row.restoredAt,
      } : null
    },
  }
}

export interface DesignDirectionRunRecord {
  id: string
  projectId: string
  workspaceId: string
  createdBy: string
  expectedVersion: number
  round: number
  status: DesignDirectionRunStatus
  provider: string | null
  model: string | null
  promptVersion: string | null
  errorCode: DesignDirectionRunErrorCode | null
  usage: LlmUsage
  directions: MaterializedDesignDirection[] | null
  selectedDirectionId: string | null
  documentVersion: number | null
  revisionId: string | null
  createdAt: Date
  updatedAt: Date
}

function validDirectionSnapshots(input: unknown): MaterializedDesignDirection[] | null {
  if (!Array.isArray(input) || input.length !== 3) return null
  const directions: MaterializedDesignDirection[] = []
  const ids = new Set<string>()
  for (const value of input) {
    if (typeof value !== 'object' || value === null) return null
    const direction = value as Partial<MaterializedDesignDirection>
    if (typeof direction.id !== 'string' || direction.id.length < 1 || direction.id.length > 100 || ids.has(direction.id)) return null
    if (typeof direction.name !== 'string' || typeof direction.character !== 'string' || typeof direction.rationale !== 'string') return null
    const document = validateDesignDocument(direction.document)
    if (!document.success || typeof direction.contract !== 'object' || direction.contract === null) return null
    ids.add(direction.id)
    directions.push({
      id: direction.id,
      name: direction.name,
      character: direction.character,
      rationale: direction.rationale,
      contract: structuredClone(direction.contract),
      document: document.data,
    })
  }
  return directions
}

function mapDesignDirectionRun(run: typeof designDirectionRuns.$inferSelect): DesignDirectionRunRecord {
  return {
    id: run.id,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    createdBy: run.createdBy,
    expectedVersion: run.expectedVersion,
    round: run.round,
    status: run.status,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    errorCode: run.errorCode,
    usage: {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      totalTokens: run.totalTokens,
    },
    directions: run.status === 'completed' || run.status === 'accepted'
      ? validDirectionSnapshots(run.directionSnapshots)
      : null,
    selectedDirectionId: run.selectedDirectionId,
    documentVersion: run.documentVersion,
    revisionId: run.revisionId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

const designDirectionCreateSchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  brief: websiteBriefSchema,
  round: z.number().int().min(0).max(100),
}).strict()

export function createDesignDirectionRepository(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
) {
  const selectAuthorizedRun = async (context: AuthContext, runId: string) => {
    const [row] = await db.select({ run: designDirectionRuns })
      .from(designDirectionRuns)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, designDirectionRuns.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(
        eq(designDirectionRuns.id, runId),
        eq(designDirectionRuns.workspaceId, context.workspaceId),
      ))
      .limit(1)
    return row?.run ?? null
  }

  return {
    async saveBrief(context: AuthContext, projectId: string, input: unknown): Promise<WebsiteBrief> {
      const brief = websiteBriefSchema.safeParse(input)
      if (!brief.success) throw new Error('invalid_website_brief')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      await db.insert(projectBriefs).values({
        projectId,
        workspaceId: context.workspaceId,
        briefJson: brief.data,
        updatedBy: context.userId,
      }).onConflictDoUpdate({
        target: projectBriefs.projectId,
        set: { briefJson: brief.data, updatedBy: context.userId, updatedAt: new Date() },
      })
      return brief.data
    },

    async loadBrief(context: AuthContext, projectId: string): Promise<WebsiteBrief | null> {
      if (!await createProjectRepository(db).findById(context, projectId)) return null
      const [row] = await db.select({ brief: projectBriefs.briefJson }).from(projectBriefs).where(and(
        eq(projectBriefs.projectId, projectId),
        eq(projectBriefs.workspaceId, context.workspaceId),
      )).limit(1)
      if (!row) return null
      const parsed = websiteBriefSchema.safeParse(row.brief)
      return parsed.success ? parsed.data : null
    },

    async create(
      context: AuthContext,
      projectId: string,
      input: z.infer<typeof designDirectionCreateSchema>,
    ): Promise<DesignDirectionRunRecord> {
      const parsed = designDirectionCreateSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_design_direction_input')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      if (project.creationState !== 'onboarding') throw new Error('project_already_accepted')
      if (project.version !== parsed.data.expectedVersion) throw new Error('stale_document_version')
      const [existing] = await db.select().from(designDirectionRuns).where(and(
        eq(designDirectionRuns.projectId, projectId),
        eq(designDirectionRuns.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return mapDesignDirectionRun(existing)
      const [created] = await db.insert(designDirectionRuns).values({
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        expectedVersion: parsed.data.expectedVersion,
        round: parsed.data.round,
        briefSnapshot: parsed.data.brief,
      }).returning()
      if (!created) throw new Error('design_direction_run_create_failed')
      await this.saveBrief(context, projectId, parsed.data.brief)
      return mapDesignDirectionRun(created)
    },

    async findById(context: AuthContext, runId: string): Promise<DesignDirectionRunRecord | null> {
      const run = await selectAuthorizedRun(context, runId)
      return run ? mapDesignDirectionRun(run) : null
    },

    async getWorkerInput(context: AuthContext, runId: string) {
      const run = await selectAuthorizedRun(context, runId)
      if (!run) return null
      const [draft] = await db.select({ document: designDocuments.documentJson })
        .from(designDocuments)
        .where(eq(designDocuments.projectId, run.projectId))
        .limit(1)
      const brief = websiteBriefSchema.safeParse(run.briefSnapshot)
      const [previousRun] = await db.select({ directionSnapshots: designDirectionRuns.directionSnapshots })
        .from(designDirectionRuns)
        .where(and(
          eq(designDirectionRuns.workspaceId, context.workspaceId),
          eq(designDirectionRuns.projectId, run.projectId),
          sql`${designDirectionRuns.id} <> ${run.id}`,
          inArray(designDirectionRuns.status, ['completed', 'superseded', 'accepted']),
          isNotNull(designDirectionRuns.directionSnapshots),
        ))
        .orderBy(desc(designDirectionRuns.createdAt))
        .limit(1)
      const previousDirectionIds = (validDirectionSnapshots(previousRun?.directionSnapshots) ?? [])
        .map(direction => designDirectionPresetIdSchema.safeParse(direction.id))
        .filter(result => result.success)
        .map(result => result.data)
        .slice(0, 3)
      return draft && brief.success
        ? {
            ...mapDesignDirectionRun(run),
            brief: brief.data,
            document: draft.document,
            previousDirectionIds,
          }
        : null
    },

    async claim(
      context: AuthContext,
      runId: string,
      input: { provider: string; model: string; promptVersion: string },
      lease: LeaseInput = { now: new Date(), leaseSeconds: 120 },
    ): Promise<DesignDirectionRunRecord | null> {
      const metadata = z.object({
        provider: z.string().min(1).max(100),
        model: z.string().min(1).max(200),
        promptVersion: z.string().min(1).max(100),
      }).strict().safeParse(input)
      if (!metadata.success) return null
      const [updated] = await db.update(designDirectionRuns).set({
        status: 'running',
        provider: metadata.data.provider,
        model: metadata.data.model,
        promptVersion: metadata.data.promptVersion,
        startedAt: lease.now,
        ...leaseValues(lease),
        attemptCount: sql`${designDirectionRuns.attemptCount} + 1`,
      }).where(and(
        eq(designDirectionRuns.id, runId),
        eq(designDirectionRuns.workspaceId, context.workspaceId),
        eq(designDirectionRuns.createdBy, context.userId),
        eq(designDirectionRuns.status, 'queued'),
      )).returning()
      return updated ? mapDesignDirectionRun(updated) : null
    },

    async complete(
      context: AuthContext,
      runId: string,
      input: { blueprint: unknown; directions: unknown; usage: LlmUsage },
    ): Promise<{
      accepted: true
      run: DesignDirectionRunRecord
    } | {
      accepted: false
      code: 'not_found' | 'invalid_output' | 'stale_document_version'
    }> {
      const blueprint = designDirectionGenerationPlanSchema.safeParse(input.blueprint)
      const usage = usageInputSchema.safeParse(input.usage)
      const directions = validDirectionSnapshots(input.directions)
      if (!usage.success || !directions) return { accepted: false, code: 'invalid_output' }
      if (!blueprint.success) {
        return await selectAuthorizedRun(context, runId)
          ? { accepted: false, code: 'invalid_output' }
          : { accepted: false, code: 'not_found' }
      }
      return db.transaction(async transaction => {
        const [run] = await transaction.select().from(designDirectionRuns).where(and(
          eq(designDirectionRuns.id, runId),
          eq(designDirectionRuns.workspaceId, context.workspaceId),
          eq(designDirectionRuns.createdBy, context.userId),
          eq(designDirectionRuns.status, 'running'),
        )).limit(1)
        if (!run) return { accepted: false, code: 'not_found' } as const
        const [draft] = await transaction.select({ version: designDocuments.version })
          .from(designDocuments)
          .where(eq(designDocuments.projectId, run.projectId))
          .limit(1)
        if (!draft || draft.version !== run.expectedVersion) {
          await transaction.update(designDirectionRuns).set({
            status: 'failed',
            errorCode: 'stale_document_version',
            inputTokens: usage.data.inputTokens,
            outputTokens: usage.data.outputTokens,
            totalTokens: usage.data.totalTokens,
            completedAt: new Date(),
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
            updatedAt: new Date(),
          }).where(eq(designDirectionRuns.id, run.id))
          return { accepted: false, code: 'stale_document_version' } as const
        }
        const [updated] = await transaction.update(designDirectionRuns).set({
          status: 'completed',
          contentBlueprint: blueprint.data,
          directionSnapshots: directions,
          inputTokens: usage.data.inputTokens,
          outputTokens: usage.data.outputTokens,
          totalTokens: usage.data.totalTokens,
          completedAt: new Date(),
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          updatedAt: new Date(),
        }).where(eq(designDirectionRuns.id, run.id)).returning()
        if (!updated) return { accepted: false, code: 'not_found' } as const
        if (run.provider && run.model) {
          await transaction.insert(usageRecords).values({
            designDirectionRunId: run.id,
            workspaceId: run.workspaceId,
            projectId: run.projectId,
            userId: run.createdBy,
            provider: run.provider,
            model: run.model,
            inputTokens: usage.data.inputTokens,
            outputTokens: usage.data.outputTokens,
            totalTokens: usage.data.totalTokens,
          }).onConflictDoNothing()
        }
        return { accepted: true, run: mapDesignDirectionRun(updated) } as const
      })
    },

    async fail(
      context: AuthContext,
      runId: string,
      input: { errorCode: string; usage: LlmUsage },
    ): Promise<DesignDirectionRunRecord | null> {
      const error = designDirectionRunErrorCodeSchema.safeParse(input.errorCode)
      const usage = usageInputSchema.safeParse(input.usage)
      if (!error.success || !usage.success) return null
      const [updated] = await db.update(designDirectionRuns).set({
        status: 'failed',
        errorCode: error.data,
        inputTokens: usage.data.inputTokens,
        outputTokens: usage.data.outputTokens,
        totalTokens: usage.data.totalTokens,
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(designDirectionRuns.id, runId),
        eq(designDirectionRuns.workspaceId, context.workspaceId),
        eq(designDirectionRuns.createdBy, context.userId),
        inArray(designDirectionRuns.status, ['queued', 'running']),
      )).returning()
      return updated ? mapDesignDirectionRun(updated) : null
    },

    async cancel(context: AuthContext, runId: string): Promise<DesignDirectionRunRecord | null> {
      const [updated] = await db.update(designDirectionRuns).set({
        status: 'cancelled', completedAt: new Date(), updatedAt: new Date(),
      }).where(and(
        eq(designDirectionRuns.id, runId),
        eq(designDirectionRuns.workspaceId, context.workspaceId),
        eq(designDirectionRuns.createdBy, context.userId),
        eq(designDirectionRuns.status, 'queued'),
      )).returning()
      return updated ? mapDesignDirectionRun(updated) : null
    },

    async supersede(context: AuthContext, runId: string): Promise<DesignDirectionRunRecord | null> {
      const [updated] = await db.update(designDirectionRuns).set({
        status: 'superseded', updatedAt: new Date(),
      }).where(and(
        eq(designDirectionRuns.id, runId),
        eq(designDirectionRuns.workspaceId, context.workspaceId),
        eq(designDirectionRuns.createdBy, context.userId),
        eq(designDirectionRuns.status, 'completed'),
      )).returning()
      return updated ? mapDesignDirectionRun(updated) : null
    },

    async accept(
      context: AuthContext,
      projectId: string,
      runId: string,
      directionId: string,
    ): Promise<
      | { accepted: true; version: number; revisionId: string; directionId: string; document: DesignDocument }
      | { accepted: false; code: 'not_found' | 'run_not_selectable' | 'direction_not_found' | 'stale_document_version' | 'invalid_design_document' }
    > {
      return db.transaction(async transaction => {
        const [row] = await transaction.select({ run: designDirectionRuns, draft: designDocuments })
          .from(designDirectionRuns)
          .innerJoin(designDocuments, eq(designDocuments.projectId, designDirectionRuns.projectId))
          .innerJoin(workspaceMembers, and(
            eq(workspaceMembers.workspaceId, designDirectionRuns.workspaceId),
            eq(workspaceMembers.userId, context.userId),
          ))
          .where(and(
            eq(designDirectionRuns.id, runId),
            eq(designDirectionRuns.projectId, projectId),
            eq(designDirectionRuns.workspaceId, context.workspaceId),
          )).limit(1)
        if (!row) return { accepted: false, code: 'not_found' } as const
        if (row.run.status === 'accepted') {
          if (row.run.selectedDirectionId !== directionId || !row.run.revisionId || !row.run.documentVersion) {
            return { accepted: false, code: 'run_not_selectable' } as const
          }
          return {
            accepted: true,
            version: row.run.documentVersion,
            revisionId: row.run.revisionId,
            directionId,
            document: row.draft.documentJson,
          } as const
        }
        if (row.run.status !== 'completed') return { accepted: false, code: 'run_not_selectable' } as const
        if (row.draft.version !== row.run.expectedVersion) return { accepted: false, code: 'stale_document_version' } as const
        const direction = validDirectionSnapshots(row.run.directionSnapshots)?.find(item => item.id === directionId)
        if (!direction) return { accepted: false, code: 'direction_not_found' } as const
        const command = {
          commandId: `choose-${row.run.id}`,
          documentVersion: row.run.expectedVersion,
          source: 'ai' as const,
          type: 'REPLACE_DOCUMENT' as const,
          document: direction.document,
        }
        const applied = applyCommandTransaction(row.draft.documentJson, row.run.expectedVersion, [command])
        if (!applied.accepted) return { accepted: false, code: 'invalid_design_document' } as const
        const [updatedDraft] = await transaction.update(designDocuments).set({
          documentJson: applied.document,
          schemaVersion: applied.document.schemaVersion,
          version: applied.version,
          updatedAt: new Date(),
        }).where(and(
          eq(designDocuments.id, row.draft.id),
          eq(designDocuments.version, row.run.expectedVersion),
        )).returning()
        if (!updatedDraft) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({
          creationState: 'accepted',
          currentDocumentVersion: applied.version,
          updatedAt: new Date(),
        }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId)))
        const [revision] = await transaction.insert(revisions).values({
          projectId,
          documentSnapshot: structuredClone(applied.document),
          source: 'ai',
          summary: `Đã chọn hướng ${direction.name}`,
          createdBy: context.userId,
          designDirectionRunId: row.run.id,
        }).returning()
        if (!revision) throw new Error('revision_create_failed')
        const [acceptedRun] = await transaction.update(designDirectionRuns).set({
          status: 'accepted',
          selectedDirectionId: direction.id,
          documentVersion: applied.version,
          revisionId: revision.id,
          updatedAt: new Date(),
        }).where(and(
          eq(designDirectionRuns.id, row.run.id),
          eq(designDirectionRuns.status, 'completed'),
        )).returning()
        if (!acceptedRun) throw new Error('design_direction_accept_failed')
        return {
          accepted: true,
          version: applied.version,
          revisionId: revision.id,
          directionId: direction.id,
          document: applied.document,
        } as const
      })
    },
  }
}

export interface GenerationRunRecord {
  id: string
  projectId: string
  workspaceId: string
  createdBy: string
  mode: GenerationMode
  selectedNodeId: string | null
  expectedVersion: number
  status: 'queued' | 'running' | 'repairing' | 'completed' | 'failed'
  provider: string | null
  model: string | null
  promptVersion: string | null
  repairCount: number
  errorCode: GenerationErrorCode | null
  usage: LlmUsage
  documentVersion: number | null
  revisionId: string | null
  createdAt: Date
  updatedAt: Date
  delivery: 'apply' | 'proposal'
  proposalAction: ProposalAction | null
  proposalIntent: ProposalIntent
  proposalConstraints: RemixConstraints | null
  proposalStatus: 'preparing' | 'ready' | 'accepted' | 'discarded' | 'superseded' | 'cancelled' | 'stale' | 'invalid-scope' | 'failed' | null
  previousProposalId: string | null
  scope: ProposalScope | null
  proposedDocument: DesignDocument | null
  proposalSummary: string | null
  originalRequest: string | null
  feedbackCodes: ProposalFeedbackCode[]
  lineage: ProposalLineage | null
  mediaReview: PublicMediaProposalReview | null
}

function mapGenerationRun(run: typeof generationRuns.$inferSelect): GenerationRunRecord {
  const scope = proposalScopeSchema.safeParse(run.proposalScope)
  const proposedDocument = validateDesignDocument(run.proposedDocument)
  const proposalIntent = proposalIntentSchema.safeParse(run.proposalIntent ?? 'standard')
  const proposalConstraints = remixConstraintsSchema.safeParse(run.proposalConstraints)
  const feedbackCodes = z.array(proposalFeedbackCodeSchema).max(3).safeParse(run.proposalFeedbackCodes)
  const mediaReview = mediaProposalReviewSchema.safeParse(run.proposalMediaReview)
  return {
    id: run.id,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    createdBy: run.createdBy,
    mode: run.mode,
    selectedNodeId: run.selectedNodeId,
    expectedVersion: run.expectedVersion,
    status: run.status,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    repairCount: run.repairCount,
    errorCode: run.errorCode,
    usage: {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      totalTokens: run.totalTokens,
    },
    documentVersion: run.documentVersion,
    revisionId: run.revisionId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    delivery: run.delivery,
    proposalAction: run.proposalAction,
    proposalIntent: proposalIntent.success ? proposalIntent.data : 'standard',
    proposalConstraints: proposalConstraints.success ? proposalConstraints.data : null,
    proposalStatus: run.proposalStatus,
    previousProposalId: run.previousProposalId,
    scope: scope.success ? scope.data : null,
    proposedDocument: (run.proposalStatus === 'ready' || run.proposalStatus === 'accepted') && proposedDocument.success
      ? proposedDocument.data
      : null,
    proposalSummary: run.proposalSummary,
    originalRequest: run.originalRequest,
    feedbackCodes: feedbackCodes.success ? feedbackCodes.data : [],
    lineage: null,
    mediaReview: (run.proposalStatus === 'ready' || run.proposalStatus === 'accepted') && mediaReview.success
      ? publicMediaProposalReview(mediaReview.data)
      : null,
  }
}

const generationInputSchema = z.object({
  requestId: z.string().uuid(),
  mode: z.enum(['generate', 'edit-page', 'edit-selection']),
  selectedNodeId: z.string().min(1).max(100).optional(),
  prompt: z.string().trim().min(3).max(4000),
  expectedVersion: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.mode === 'edit-selection' && !value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selected node is required' })
  }
  if (value.mode !== 'edit-selection' && value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selected node is not allowed' })
  }
})

const proposalCreateInputSchema = z.object({
  requestId: z.string().uuid(),
  action: proposalActionSchema,
  intent: proposalIntentSchema.default('standard'),
  allowedChanges: z.array(remixAllowedChangeSchema).max(3).default([]),
  feedbackCodes: z.array(z.enum(['wrong_topic', 'style_mismatch', 'layout_mismatch', 'unwanted_detail', 'copy_mismatch', 'other'])).max(3).optional(),
  selectedNodeId: z.string().min(1).max(100).optional(),
  prompt: z.string().trim().min(3).max(4000),
  expectedVersion: z.number().int().positive(),
  previousProposalId: z.string().uuid().optional(),
  scope: proposalScopeSchema,
}).strict().superRefine((value, context) => {
  if (value.action === 'request' && value.previousProposalId) {
    context.addIssue({ code: 'custom', path: ['previousProposalId'], message: 'Initial requests cannot replace a proposal' })
  }
  if (value.action !== 'request' && !value.previousProposalId) {
    context.addIssue({ code: 'custom', path: ['previousProposalId'], message: 'Replacement requests require a proposal' })
  }
  if (value.scope.kind === 'page' && value.selectedNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Page scope cannot include selection' })
  }
  if (value.scope.kind !== 'page' && value.selectedNodeId !== value.scope.rootNodeId) {
    context.addIssue({ code: 'custom', path: ['selectedNodeId'], message: 'Selection must match scope root' })
  }
  if (value.intent === 'remix-section' && value.scope.kind !== 'section') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Remix requires section scope' })
  }
  if (value.intent === 'replace-media' && value.scope.kind !== 'element') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Media replacement requires element scope' })
  }
  if (value.intent === 'style' && value.scope.kind !== 'element') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Style changes require element scope' })
  }
  if (value.intent === 'layout' && value.scope.kind !== 'section') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Layout changes require section scope' })
  }
  if (value.intent === 'composition' && value.scope.kind !== 'section') {
    context.addIssue({ code: 'custom', path: ['scope'], message: 'Composition changes require section scope' })
  }
  if (value.intent === 'standard' && value.allowedChanges.length > 0) {
    context.addIssue({ code: 'custom', path: ['allowedChanges'], message: 'Allowed changes require Remix intent' })
  }
  if (new Set(value.allowedChanges).size !== value.allowedChanges.length) {
    context.addIssue({ code: 'custom', path: ['allowedChanges'], message: 'Allowed changes must be unique' })
  }
})

const proposalCompletionSchema = z.object({
  commands: z.array(z.unknown()).min(1).max(100),
  proposedDocument: z.unknown(),
  summary: z.string().trim().min(1).max(200),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).strict(),
  repairCount: z.number().int().min(0).max(2),
  mediaReview: mediaProposalReviewSchema.optional(),
}).strict()

const usageInputSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).strict()

export function createGenerationRepository(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
) {
  const selectAuthorizedRun = async (context: AuthContext, runId: string) => {
    const [run] = await db.select({ run: generationRuns })
      .from(generationRuns)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, generationRuns.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
      ))
      .limit(1)
    return run?.run ?? null
  }

  const persistUsage = async (
    transaction: PgDatabase<PgQueryResultHKT, typeof schema>,
    run: typeof generationRuns.$inferSelect,
    usage: LlmUsage,
  ) => {
    if (!run.provider || !run.model) return
    await transaction.insert(usageRecords).values({
      generationRunId: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      userId: run.createdBy,
      provider: run.provider,
      model: run.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    }).onConflictDoNothing()
  }

  return {
    async create(
      context: AuthContext,
      projectId: string,
      input: {
        requestId: string
        mode: GenerationMode
        selectedNodeId?: string
        prompt: string
        expectedVersion: number
      },
    ): Promise<GenerationRunRecord> {
      const parsed = generationInputSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_generation_input')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      const existing = await db.select().from(generationRuns).where(and(
        eq(generationRuns.projectId, projectId),
        eq(generationRuns.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing[0]) return mapGenerationRun(existing[0])
      const [created] = await db.insert(generationRuns).values({
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        mode: parsed.data.mode,
        ...(parsed.data.selectedNodeId ? { selectedNodeId: parsed.data.selectedNodeId } : {}),
        prompt: parsed.data.prompt,
        expectedVersion: parsed.data.expectedVersion,
      }).returning()
      if (!created) throw new Error('generation_run_create_failed')
      return mapGenerationRun(created)
    },

    async createProposal(
      context: AuthContext,
      projectId: string,
      input: z.input<typeof proposalCreateInputSchema>,
    ): Promise<GenerationRunRecord> {
      const parsed = proposalCreateInputSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_proposal_input')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      if (project.version !== parsed.data.expectedVersion) throw new Error('stale_document_version')
      const derivedScope = proposalScopeSchema.safeParse(parsed.data.scope)
      if (!derivedScope.success) throw new Error('invalid_proposal_input')
      const proposalConstraints = parsed.data.intent === 'remix-section'
        ? captureRemixConstraints({
            document: project.document,
            sectionNodeId: parsed.data.scope.rootNodeId,
            allowedChanges: parsed.data.allowedChanges,
          })
        : null
      if (proposalConstraints && !proposalConstraints.accepted) throw new Error('invalid_proposal_input')
      let previousRun: typeof generationRuns.$inferSelect | null = null
      if (parsed.data.previousProposalId) {
        const previous = await selectAuthorizedRun(context, parsed.data.previousProposalId)
        if (
          !previous
          || previous.projectId !== projectId
          || previous.delivery !== 'proposal'
          || previous.proposalStatus !== 'ready'
          || previous.expectedVersion !== project.version
          || JSON.stringify(proposalScopeSchema.parse(previous.proposalScope)) !== JSON.stringify(parsed.data.scope)
        ) throw new Error('proposal_not_replaceable')
        previousRun = previous
      }
      const [existing] = await db.select().from(generationRuns).where(and(
        eq(generationRuns.projectId, projectId),
        eq(generationRuns.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return mapGenerationRun(existing)
      const mode: GenerationMode = parsed.data.scope.kind === 'page' ? 'edit-page' : 'edit-selection'
      const proposalId = randomUUID()
      const originalRequest = previousRun?.originalRequest ?? parsed.data.prompt
      const previousLineage = proposalLineageSchema.safeParse(previousRun?.proposalLineage)
      const contextFingerprint = createHash('sha256')
        .update(JSON.stringify({
          projectId,
          documentVersion: project.version,
          targetNodeId: parsed.data.selectedNodeId ?? null,
          scope: parsed.data.scope,
        }))
        .digest('hex')
        .slice(0, 16)
      const proposalLineage = previousLineage.success
        ? appendProposalLineageTurn({
            lineage: previousLineage.data,
            proposalId,
            action: parsed.data.action as Exclude<ProposalAction, 'request'>,
            ...(parsed.data.feedbackCodes?.length
              ? { feedback: { codes: parsed.data.feedbackCodes } }
              : {}),
          })
        : createProposalLineage({
            rootRequestId: proposalId,
            originalRequest,
            targetNodeId: parsed.data.selectedNodeId ?? null,
            scope: parsed.data.scope,
            contextFingerprint,
            proposalId,
          })
      const [created] = await db.insert(generationRuns).values({
        id: proposalId,
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        mode,
        ...(parsed.data.selectedNodeId ? { selectedNodeId: parsed.data.selectedNodeId } : {}),
        prompt: parsed.data.prompt,
        originalRequest,
        expectedVersion: parsed.data.expectedVersion,
        delivery: 'proposal',
        proposalAction: parsed.data.action,
        proposalIntent: parsed.data.intent,
        ...(proposalConstraints?.accepted ? { proposalConstraints: proposalConstraints.constraints } : {}),
        proposalStatus: 'preparing',
        ...(parsed.data.previousProposalId ? { previousProposalId: parsed.data.previousProposalId } : {}),
        proposalScope: parsed.data.scope,
        proposalFeedbackCodes: parsed.data.feedbackCodes ?? [],
        proposalLineage,
      }).returning()
      if (!created) throw new Error('proposal_create_failed')
      return mapGenerationRun(created)
    },

    async findById(context: AuthContext, runId: string): Promise<GenerationRunRecord | null> {
      const run = await selectAuthorizedRun(context, runId)
      return run ? mapGenerationRun(run) : null
    },

    async getWorkerInput(context: AuthContext, runId: string) {
      const run = await selectAuthorizedRun(context, runId)
      if (!run) return null
      const [draft] = await db.select({ document: designDocuments.documentJson })
        .from(designDocuments)
        .where(eq(designDocuments.projectId, run.projectId))
        .limit(1)
      if (!draft) return null
      if (!run.prompt) return null
      return {
        ...mapGenerationRun(run),
        prompt: run.prompt,
        document: draft.document,
      }
    },

    async list(context: AuthContext, projectId: string, limit = 20): Promise<GenerationRunRecord[]> {
      if (!await createProjectRepository(db).findById(context, projectId)) return []
      const rows = await db.select().from(generationRuns).where(and(
        eq(generationRuns.projectId, projectId),
        eq(generationRuns.workspaceId, context.workspaceId),
      )).orderBy(desc(generationRuns.createdAt)).limit(Math.max(1, Math.min(limit, 50)))
      return rows.map(mapGenerationRun)
    },

    async claim(
      context: AuthContext,
      runId: string,
      input: { provider: string; model: string; promptVersion: string },
      lease: LeaseInput = { now: new Date(), leaseSeconds: 120 },
    ): Promise<GenerationRunRecord | null> {
      const values = leaseValues(lease)
      const [updated] = await db.update(generationRuns).set({
        status: 'running',
        provider: input.provider,
        model: input.model,
        promptVersion: input.promptVersion,
        startedAt: lease.now,
        ...values,
        attemptCount: sql`${generationRuns.attemptCount} + 1`,
      }).where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
        eq(generationRuns.createdBy, context.userId),
        eq(generationRuns.status, 'queued'),
      )).returning()
      return updated ? mapGenerationRun(updated) : null
    },

    async heartbeat(
      context: AuthContext,
      runId: string,
      lease: LeaseInput,
    ): Promise<boolean> {
      const values = leaseValues(lease)
      const [updated] = await db.update(generationRuns).set(values).where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
        eq(generationRuns.createdBy, context.userId),
        inArray(generationRuns.status, ['running', 'repairing']),
      )).returning({ id: generationRuns.id })
      return Boolean(updated)
    },

    async markRepairing(context: AuthContext, runId: string, repairCount: number): Promise<GenerationRunRecord | null> {
      if (!Number.isInteger(repairCount) || repairCount < 1 || repairCount > 2) return null
      const [updated] = await db.update(generationRuns).set({
        status: 'repairing', repairCount, updatedAt: new Date(),
      }).where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
        eq(generationRuns.createdBy, context.userId),
        inArray(generationRuns.status, ['running', 'repairing']),
      )).returning()
      return updated ? mapGenerationRun(updated) : null
    },

    async fail(
      context: AuthContext,
      runId: string,
      input: { errorCode: string; usage: LlmUsage; repairCount: number },
    ): Promise<GenerationRunRecord | null> {
      const error = generationErrorCodeSchema.safeParse(input.errorCode)
      const usage = usageInputSchema.safeParse(input.usage)
      if (!error.success || !usage.success) return null
      return db.transaction(async transaction => {
        const [run] = await transaction.select().from(generationRuns).where(and(
          eq(generationRuns.id, runId),
          eq(generationRuns.workspaceId, context.workspaceId),
          eq(generationRuns.createdBy, context.userId),
          inArray(generationRuns.status, ['queued', 'running', 'repairing']),
        )).limit(1)
        if (!run) return null
        const [updated] = await transaction.update(generationRuns).set({
          status: 'failed',
          ...(run.delivery === 'proposal' && run.proposalStatus === 'preparing'
            ? { proposalStatus: 'failed' as const }
            : {}),
          errorCode: error.data,
          repairCount: input.repairCount,
          inputTokens: usage.data.inputTokens,
          outputTokens: usage.data.outputTokens,
          totalTokens: usage.data.totalTokens,
          completedAt: new Date(),
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          updatedAt: new Date(),
        }).where(eq(generationRuns.id, run.id)).returning()
        await persistUsage(transaction, run, usage.data)
        return updated ? mapGenerationRun(updated) : null
      })
    },

    async completeProposal(
      context: AuthContext,
      runId: string,
      input: z.input<typeof proposalCompletionSchema>,
    ): Promise<
      | { accepted: true; run: GenerationRunRecord }
      | { accepted: false; code: 'not_found' | 'stale_document_version' | 'invalid_design_document' | 'scope_violation' }
    > {
      const parsed = proposalCompletionSchema.safeParse(input)
      if (!parsed.success) return { accepted: false, code: 'invalid_design_document' }
      return db.transaction(async transaction => {
        const [run] = await transaction.select().from(generationRuns).where(and(
          eq(generationRuns.id, runId),
          eq(generationRuns.workspaceId, context.workspaceId),
          eq(generationRuns.createdBy, context.userId),
          eq(generationRuns.delivery, 'proposal'),
          eq(generationRuns.proposalStatus, 'preparing'),
          inArray(generationRuns.status, ['running', 'repairing']),
        )).limit(1)
        if (!run) return { accepted: false, code: 'not_found' } as const
        const [draft] = await transaction.select().from(designDocuments)
          .where(eq(designDocuments.projectId, run.projectId)).limit(1)
        if (!draft || draft.version !== run.expectedVersion) {
          await transaction.update(generationRuns).set({
            status: 'failed', proposalStatus: 'stale', errorCode: 'stale_document_version',
            completedAt: new Date(), leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
          }).where(eq(generationRuns.id, run.id))
          return { accepted: false, code: 'stale_document_version' } as const
        }
        const scope = proposalScopeSchema.safeParse(run.proposalScope)
        const proposed = validateDesignDocument(parsed.data.proposedDocument)
        if (!scope.success || !proposed.success) return { accepted: false, code: 'invalid_design_document' } as const
        if (run.proposalIntent !== 'replace-media' && parsed.data.mediaReview) {
          return { accepted: false, code: 'invalid_design_document' } as const
        }
        const commands = parsed.data.commands as DesignCommand[]
        if ((run.proposalIntent === 'style' || run.proposalIntent === 'layout') && commands.some(command => (
          command.type !== 'UPDATE_STYLE'
          && command.type !== 'UPDATE_RESPONSIVE_STYLE'
        ))) {
          return { accepted: false, code: 'scope_violation' } as const
        }
        if (!proposalSnapshotMatches(draft.documentJson, commands, proposed.data)) {
          return { accepted: false, code: 'invalid_design_document' } as const
        }
        const remix = validateProposalRemix({
          intent: proposalIntentSchema.catch('standard').parse(run.proposalIntent ?? 'standard'),
          base: draft.documentJson,
          proposed: proposed.data,
          ...(run.proposalConstraints ? { constraints: run.proposalConstraints } : {}),
        })
        if (!remix.accepted) {
          await transaction.update(generationRuns).set({
            status: 'failed', proposalStatus: 'invalid-scope', updatedAt: new Date(),
          }).where(eq(generationRuns.id, run.id))
          return { accepted: false, code: 'scope_violation' } as const
        }
        const [updated] = await transaction.update(generationRuns).set({
          status: 'completed', proposalStatus: 'ready',
          proposalCommands: commands, proposedDocument: proposed.data,
          proposalSummary: parsed.data.summary, repairCount: parsed.data.repairCount,
          ...(parsed.data.mediaReview ? { proposalMediaReview: parsed.data.mediaReview } : {}),
          inputTokens: parsed.data.usage.inputTokens, outputTokens: parsed.data.usage.outputTokens,
          totalTokens: parsed.data.usage.totalTokens, completedAt: new Date(),
          leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
        }).where(and(
          eq(generationRuns.id, run.id),
          eq(generationRuns.proposalStatus, 'preparing'),
        )).returning()
        if (!updated) return { accepted: false, code: 'not_found' } as const
        await persistUsage(transaction, run, parsed.data.usage)
        if (run.previousProposalId) {
          await transaction.update(generationRuns).set({
            proposalStatus: 'superseded', updatedAt: new Date(),
          }).where(and(
            eq(generationRuns.id, run.previousProposalId),
            eq(generationRuns.projectId, run.projectId),
            eq(generationRuns.proposalStatus, 'ready'),
          ))
        }
        return { accepted: true, run: mapGenerationRun(updated) } as const
      })
    },

    async discardProposal(context: AuthContext, runId: string): Promise<GenerationRunRecord | null> {
      const run = await selectAuthorizedRun(context, runId)
      if (!run || run.delivery !== 'proposal') return null
      if (run.proposalStatus === 'discarded') return mapGenerationRun(run)
      const now = new Date()
      const [updated] = await db.update(generationRuns).set({
        proposalStatus: 'discarded', proposalDiscardedAt: now, updatedAt: now,
      }).where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
        inArray(generationRuns.proposalStatus, ['ready', 'stale', 'invalid-scope']),
      )).returning()
      return updated ? mapGenerationRun(updated) : null
    },

    async cancelProposal(context: AuthContext, runId: string): Promise<GenerationRunRecord | null> {
      const [updated] = await db.update(generationRuns).set({
        status: 'failed', proposalStatus: 'cancelled', completedAt: new Date(),
        leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(generationRuns.id, runId),
        eq(generationRuns.workspaceId, context.workspaceId),
        eq(generationRuns.createdBy, context.userId),
        eq(generationRuns.delivery, 'proposal'),
        eq(generationRuns.proposalStatus, 'preparing'),
        inArray(generationRuns.status, ['queued', 'running', 'repairing']),
      )).returning()
      return updated ? mapGenerationRun(updated) : null
    },

    async acceptProposal(
      context: AuthContext,
      projectId: string,
      runId: string,
    ): Promise<
      | { accepted: true; version: number; revisionId: string; document: DesignDocument }
      | { accepted: false; code: 'not_found' | 'proposal_not_ready' | 'stale_document_version' | 'invalid_design_document' | 'scope_violation' }
    > {
      return db.transaction(async transaction => {
        const [row] = await transaction.select({ run: generationRuns, draft: designDocuments })
          .from(generationRuns)
          .innerJoin(designDocuments, eq(designDocuments.projectId, generationRuns.projectId))
          .innerJoin(workspaceMembers, and(
            eq(workspaceMembers.workspaceId, generationRuns.workspaceId),
            eq(workspaceMembers.userId, context.userId),
          ))
          .where(and(
            eq(generationRuns.id, runId),
            eq(generationRuns.projectId, projectId),
            eq(generationRuns.workspaceId, context.workspaceId),
            eq(generationRuns.delivery, 'proposal'),
          )).limit(1)
        if (!row) return { accepted: false, code: 'not_found' } as const
        if (row.run.proposalStatus === 'accepted') {
          if (!row.run.revisionId || !row.run.documentVersion) return { accepted: false, code: 'proposal_not_ready' } as const
          return {
            accepted: true, version: row.run.documentVersion,
            revisionId: row.run.revisionId, document: row.draft.documentJson,
          } as const
        }
        if (row.run.proposalStatus !== 'ready' || row.run.status !== 'completed') {
          return { accepted: false, code: 'proposal_not_ready' } as const
        }
        if (row.draft.version !== row.run.expectedVersion) {
          await transaction.update(generationRuns).set({ proposalStatus: 'stale', updatedAt: new Date() })
            .where(eq(generationRuns.id, row.run.id))
          return { accepted: false, code: 'stale_document_version' } as const
        }
        const scope = proposalScopeSchema.safeParse(row.run.proposalScope)
        const proposed = validateDesignDocument(row.run.proposedDocument)
        const commands = Array.isArray(row.run.proposalCommands) ? row.run.proposalCommands : []
        if (!scope.success || !proposed.success || commands.length === 0) {
          return { accepted: false, code: 'invalid_design_document' } as const
        }
        if (!proposalSnapshotMatches(row.draft.documentJson, commands, proposed.data)) {
          return { accepted: false, code: 'invalid_design_document' } as const
        }
        const remix = validateProposalRemix({
          intent: proposalIntentSchema.catch('standard').parse(row.run.proposalIntent ?? 'standard'),
          base: row.draft.documentJson,
          proposed: proposed.data,
          ...(row.run.proposalConstraints ? { constraints: row.run.proposalConstraints } : {}),
        })
        if (!remix.accepted) {
          await transaction.update(generationRuns).set({ proposalStatus: 'invalid-scope', updatedAt: new Date() })
            .where(eq(generationRuns.id, row.run.id))
          return { accepted: false, code: 'scope_violation' } as const
        }
        const applied = applyCommandTransaction(row.draft.documentJson, row.run.expectedVersion, commands)
        if (!applied.accepted) {
          return {
            accepted: false,
            code: applied.error.code === 'stale_document_version' ? 'stale_document_version' : 'invalid_design_document',
          } as const
        }
        const [updatedDraft] = await transaction.update(designDocuments).set({
          documentJson: applied.document, schemaVersion: applied.document.schemaVersion,
          version: applied.version, updatedAt: new Date(),
        }).where(and(
          eq(designDocuments.id, row.draft.id),
          eq(designDocuments.version, row.run.expectedVersion),
        )).returning()
        if (!updatedDraft) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({
          currentDocumentVersion: applied.version, updatedAt: new Date(),
        }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, context.workspaceId)))
        const [revision] = await transaction.insert(revisions).values({
          projectId, documentSnapshot: structuredClone(applied.document), source: 'ai',
          summary: row.run.proposalSummary ?? 'AI proposed change', createdBy: context.userId,
          generationRunId: row.run.id,
        }).returning()
        if (!revision) throw new Error('revision_create_failed')
        const now = new Date()
        const [accepted] = await transaction.update(generationRuns).set({
          proposalStatus: 'accepted', proposalAcceptedAt: now,
          documentVersion: applied.version, revisionId: revision.id, updatedAt: now,
        }).where(and(
          eq(generationRuns.id, row.run.id),
          eq(generationRuns.proposalStatus, 'ready'),
        )).returning()
        if (!accepted) throw new Error('proposal_accept_failed')
        return {
          accepted: true, version: applied.version, revisionId: revision.id, document: applied.document,
        } as const
      })
    },

    async complete(
      context: AuthContext,
      runId: string,
      input: { document: unknown; summary: string; usage: LlmUsage; repairCount: number },
    ): Promise<
      | { accepted: true; run: GenerationRunRecord }
      | { accepted: false; code: 'not_found' | 'stale_document_version' | 'invalid_design_document' }
    > {
      const usage = usageInputSchema.safeParse(input.usage)
      const summary = z.string().trim().min(1).max(200).safeParse(input.summary)
      if (!usage.success || !summary.success) return { accepted: false, code: 'invalid_design_document' }
      return db.transaction(async transaction => {
        const [run] = await transaction.select().from(generationRuns).where(and(
          eq(generationRuns.id, runId),
          eq(generationRuns.workspaceId, context.workspaceId),
          eq(generationRuns.createdBy, context.userId),
          inArray(generationRuns.status, ['running', 'repairing']),
        )).limit(1)
        if (!run) return { accepted: false, code: 'not_found' } as const
        const [draft] = await transaction.select().from(designDocuments)
          .where(eq(designDocuments.projectId, run.projectId)).limit(1)
        if (!draft) return { accepted: false, code: 'not_found' } as const
        if (draft.version !== run.expectedVersion) {
          await transaction.update(generationRuns).set({
            status: 'failed', errorCode: 'stale_document_version',
            inputTokens: usage.data.inputTokens, outputTokens: usage.data.outputTokens,
            totalTokens: usage.data.totalTokens, repairCount: input.repairCount,
            completedAt: new Date(), leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
          }).where(eq(generationRuns.id, run.id))
          await persistUsage(transaction, run, usage.data)
          return { accepted: false, code: 'stale_document_version' } as const
        }
        let document: DesignDocument
        try {
          document = normalizeDocument(input.document, run.projectId, run.expectedVersion + 1)
        } catch {
          return { accepted: false, code: 'invalid_design_document' } as const
        }
        const [updatedDraft] = await transaction.update(designDocuments).set({
          documentJson: document,
          schemaVersion: document.schemaVersion,
          version: document.version,
          updatedAt: new Date(),
        }).where(and(
          eq(designDocuments.id, draft.id),
          eq(designDocuments.version, run.expectedVersion),
        )).returning()
        if (!updatedDraft) return { accepted: false, code: 'stale_document_version' } as const
        await transaction.update(projects).set({
          currentDocumentVersion: document.version,
          updatedAt: new Date(),
        }).where(and(eq(projects.id, run.projectId), eq(projects.workspaceId, context.workspaceId)))
        const [revision] = await transaction.insert(revisions).values({
          projectId: run.projectId,
          documentSnapshot: structuredClone(document),
          source: 'ai',
          summary: summary.data,
          createdBy: context.userId,
          generationRunId: run.id,
        }).returning()
        if (!revision) throw new Error('revision_create_failed')
        const [completed] = await transaction.update(generationRuns).set({
          status: 'completed',
          repairCount: input.repairCount,
          inputTokens: usage.data.inputTokens,
          outputTokens: usage.data.outputTokens,
          totalTokens: usage.data.totalTokens,
          documentVersion: document.version,
          revisionId: revision.id,
          completedAt: new Date(),
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          updatedAt: new Date(),
        }).where(eq(generationRuns.id, run.id)).returning()
        if (!completed) throw new Error('generation_run_complete_failed')
        await persistUsage(transaction, run, usage.data)
        return { accepted: true, run: mapGenerationRun(completed) } as const
      })
    },
  }
}

export interface ExportRunRecord {
  id: string
  projectId: string
  workspaceId: string
  createdBy: string
  expectedVersion: number
  documentVersion: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  artifact: ExportArtifact | null
  errorCode: ExportErrorCode | null
  createdAt: Date
  updatedAt: Date
}

function mapExportRun(run: typeof exportRuns.$inferSelect): ExportRunRecord {
  const artifact = run.artifactBytes && run.artifactChecksum && run.artifactContentType === EXPORT_CONTENT_TYPE && run.artifactRouteCount
    ? exportArtifactSchema.parse({
        bytes: run.artifactBytes,
        checksum: run.artifactChecksum,
        contentType: run.artifactContentType,
        routeCount: run.artifactRouteCount,
      })
    : null
  return {
    id: run.id,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    createdBy: run.createdBy,
    expectedVersion: run.expectedVersion,
    documentVersion: run.documentVersion,
    status: run.status,
    artifact,
    errorCode: run.errorCode,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

export function createExportRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const selectAuthorized = async (context: AuthContext, runId: string) => {
    const [row] = await db.select({ run: exportRuns }).from(exportRuns)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, exportRuns.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(eq(exportRuns.id, runId), eq(exportRuns.workspaceId, context.workspaceId)))
      .limit(1)
    return row?.run ?? null
  }

  return {
    async create(context: AuthContext, projectId: string, input: { requestId: string; expectedVersion: number }) {
      const parsed = z.object({ requestId: z.string().uuid(), expectedVersion: z.number().int().positive() }).strict().safeParse(input)
      if (!parsed.success) throw new Error('invalid_export_input')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      const [existing] = await db.select().from(exportRuns).where(and(
        eq(exportRuns.projectId, projectId), eq(exportRuns.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return { created: false, run: mapExportRun(existing) }
      if (project.version !== parsed.data.expectedVersion) throw new Error('stale_document_version')
      const [created] = await db.insert(exportRuns).values({
        workspaceId: context.workspaceId,
        projectId,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        expectedVersion: project.version,
        documentVersion: project.version,
        documentSnapshot: structuredClone(project.document),
      }).returning()
      if (!created) throw new Error('export_run_create_failed')
      return { created: true, run: mapExportRun(created) }
    },

    async findById(context: AuthContext, runId: string): Promise<ExportRunRecord | null> {
      const run = await selectAuthorized(context, runId)
      return run ? mapExportRun(run) : null
    },

    async getWorkerInput(context: AuthContext, runId: string) {
      const run = await selectAuthorized(context, runId)
      return run ? { ...mapExportRun(run), document: run.documentSnapshot } : null
    },

    async claim(
      context: AuthContext,
      runId: string,
      lease: LeaseInput = { now: new Date(), leaseSeconds: 120 },
    ): Promise<ExportRunRecord | null> {
      const values = leaseValues(lease)
      const [updated] = await db.update(exportRuns).set({
        status: 'running',
        startedAt: lease.now,
        ...values,
        attemptCount: sql`${exportRuns.attemptCount} + 1`,
      }).where(and(
          eq(exportRuns.id, runId), eq(exportRuns.workspaceId, context.workspaceId),
          eq(exportRuns.createdBy, context.userId), eq(exportRuns.status, 'queued'),
        )).returning()
      return updated ? mapExportRun(updated) : null
    },

    async heartbeat(context: AuthContext, runId: string, lease: LeaseInput): Promise<boolean> {
      const values = leaseValues(lease)
      const [updated] = await db.update(exportRuns).set(values).where(and(
        eq(exportRuns.id, runId),
        eq(exportRuns.workspaceId, context.workspaceId),
        eq(exportRuns.createdBy, context.userId),
        eq(exportRuns.status, 'running'),
      )).returning({ id: exportRuns.id })
      return Boolean(updated)
    },

    async complete(context: AuthContext, runId: string, artifactInput: unknown): Promise<ExportRunRecord | null> {
      const artifact = exportArtifactSchema.extend({ artifactKey: z.string().min(1).max(500) }).safeParse(artifactInput)
      if (!artifact.success) return null
      const [updated] = await db.update(exportRuns).set({
        status: 'completed', artifactKey: artifact.data.artifactKey,
        artifactChecksum: artifact.data.checksum, artifactBytes: artifact.data.bytes,
        artifactContentType: artifact.data.contentType, artifactRouteCount: artifact.data.routeCount,
        completedAt: new Date(),
        leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(exportRuns.id, runId), eq(exportRuns.workspaceId, context.workspaceId),
        eq(exportRuns.createdBy, context.userId), eq(exportRuns.status, 'running'),
      )).returning()
      return updated ? mapExportRun(updated) : null
    },

    async fail(context: AuthContext, runId: string, errorInput: string): Promise<ExportRunRecord | null> {
      const error = exportErrorCodeSchema.safeParse(errorInput)
      if (!error.success) return null
      const [updated] = await db.update(exportRuns).set({
        status: 'failed', errorCode: error.data, completedAt: new Date(),
        leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(exportRuns.id, runId), eq(exportRuns.workspaceId, context.workspaceId),
        eq(exportRuns.createdBy, context.userId), inArray(exportRuns.status, ['queued', 'running']),
      )).returning()
      return updated ? mapExportRun(updated) : null
    },

    async getArtifactKey(context: AuthContext, runId: string): Promise<string | null> {
      const run = await selectAuthorized(context, runId)
      return run?.status === 'completed' ? run.artifactKey : null
    },
  }
}

export interface ShareLinkRecord {
  id: string
  projectId: string
  revisionId: string
  slug: string
  status: ShareStatus
  storedStatus: ShareStoredStatus
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function mapShareLink(row: typeof shareLinks.$inferSelect, now = new Date()): ShareLinkRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    revisionId: row.revisionId,
    slug: row.slug,
    status: resolveShareStatus(row.status, row.expiresAt, now),
    storedStatus: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const shareCreateSchema = z.object({
  requestId: z.string().uuid(),
  revisionId: z.string().uuid(),
  slug: shareSlugSchema,
  expiresAt: z.date().nullable(),
}).strict()

export function createShareLinkRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const selectAuthorized = (context: AuthContext, projectId?: string, shareLinkId?: string) => db
    .select({ link: shareLinks })
    .from(shareLinks)
    .innerJoin(workspaceMembers, and(
      eq(workspaceMembers.workspaceId, shareLinks.workspaceId),
      eq(workspaceMembers.userId, context.userId),
    ))
    .where(and(
      eq(shareLinks.workspaceId, context.workspaceId),
      projectId ? eq(shareLinks.projectId, projectId) : undefined,
      shareLinkId ? eq(shareLinks.id, shareLinkId) : undefined,
    ))

  return {
    async create(
      context: AuthContext,
      projectId: string,
      input: { requestId: string; revisionId: string; slug: string; expiresAt: Date | null },
    ): Promise<{ created: boolean; link: ShareLinkRecord }> {
      const parsed = shareCreateSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_share_input')
      const project = await createProjectRepository(db).findById(context, projectId)
      if (!project) throw new Error('not_found')
      const [existing] = await db.select().from(shareLinks).where(and(
        eq(shareLinks.projectId, projectId),
        eq(shareLinks.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return { created: false, link: mapShareLink(existing) }
      const [revision] = await db.select({ id: revisions.id }).from(revisions).where(and(
        eq(revisions.id, parsed.data.revisionId),
        eq(revisions.projectId, projectId),
      )).limit(1)
      if (!revision) throw new Error('not_found')
      const [slugOwner] = await db.select({ id: shareLinks.id }).from(shareLinks)
        .where(eq(shareLinks.slug, parsed.data.slug)).limit(1)
      if (slugOwner) throw new Error('share_slug_conflict')
      try {
        const [created] = await db.insert(shareLinks).values({
          workspaceId: context.workspaceId,
          projectId,
          revisionId: revision.id,
          createdBy: context.userId,
          requestId: parsed.data.requestId,
          slug: parsed.data.slug,
          expiresAt: parsed.data.expiresAt,
        }).returning()
        if (!created) throw new Error('share_link_create_failed')
        return { created: true, link: mapShareLink(created) }
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('share_links_slug_unique') || message.includes('share_links_slug_key')) {
          throw new Error('share_slug_conflict')
        }
        throw error
      }
    },

    async list(context: AuthContext, projectId: string): Promise<ShareLinkRecord[]> {
      if (!await createProjectRepository(db).findById(context, projectId)) return []
      const rows = await selectAuthorized(context, projectId).orderBy(desc(shareLinks.createdAt))
      return rows.map(row => mapShareLink(row.link))
    },

    async findById(context: AuthContext, linkId: string): Promise<ShareLinkRecord | null> {
      const [row] = await selectAuthorized(context, undefined, linkId).limit(1)
      return row ? mapShareLink(row.link) : null
    },

    async disable(context: AuthContext, projectId: string, linkId: string): Promise<ShareLinkRecord | null> {
      const [authorized] = await selectAuthorized(context, projectId, linkId).limit(1)
      if (!authorized) return null
      if (authorized.link.status === 'disabled') return mapShareLink(authorized.link)
      const now = new Date()
      const [updated] = await db.update(shareLinks).set({
        status: 'disabled', disabledAt: now, updatedAt: now,
      }).where(and(
        eq(shareLinks.id, linkId),
        eq(shareLinks.projectId, projectId),
        eq(shareLinks.workspaceId, context.workspaceId),
        eq(shareLinks.status, 'active'),
      )).returning()
      return updated ? mapShareLink(updated) : null
    },

    async findPublicBySlug(slugInput: string, now = new Date()) {
      const slug = shareSlugSchema.safeParse(slugInput)
      if (!slug.success) return null
      const [row] = await db.select({ link: shareLinks, document: revisions.documentSnapshot })
        .from(shareLinks)
        .innerJoin(revisions, eq(revisions.id, shareLinks.revisionId))
        .where(and(eq(shareLinks.slug, slug.data), eq(shareLinks.status, 'active')))
        .limit(1)
      if (!row || resolveShareStatus(row.link.status, row.link.expiresAt, now) !== 'active') return null
      const validation = validateDesignDocument(row.document)
      if (!validation.success) return null
      return { document: validation.data }
    },
  }
}

export interface EncryptedProviderCredential {
  ciphertext: string
  iv: string
  authTag: string
  keyVersion: number
}

export interface ProviderConnectionRecord {
  id: string
  workspaceId: string
  provider: 'vercel'
  status: 'connected' | 'disconnected' | 'disabled'
  connectedAt: Date
  disconnectedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ProviderConnectionInternalRecord extends ProviderConnectionRecord {
  configurationId: string
  teamId: string | null
  scopes: string[]
  encryptedCredential: EncryptedProviderCredential | null
}

const encryptedCredentialSchema = z.object({
  ciphertext: z.string().min(1).max(10_000),
  iv: z.string().min(1).max(200),
  authTag: z.string().min(1).max(200),
  keyVersion: z.number().int().positive(),
}).strict()

const providerConnectionInputSchema = z.object({
  id: z.string().uuid(),
  provider: z.literal('vercel'),
  configurationId: z.string().min(1).max(200),
  teamId: z.string().min(1).max(200).nullable(),
  scopes: z.array(z.string().min(1).max(100)).min(1).max(20),
  encryptedCredential: encryptedCredentialSchema,
}).strict()

function mapProviderConnection(row: typeof providerConnections.$inferSelect): ProviderConnectionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    status: row.status,
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function encryptedCredential(row: typeof providerConnections.$inferSelect): EncryptedProviderCredential | null {
  if (!row.credentialCiphertext || !row.credentialIv || !row.credentialAuthTag || !row.credentialKeyVersion) return null
  return encryptedCredentialSchema.parse({
    ciphertext: row.credentialCiphertext,
    iv: row.credentialIv,
    authTag: row.credentialAuthTag,
    keyVersion: row.credentialKeyVersion,
  })
}

function mapProviderConnectionInternal(row: typeof providerConnections.$inferSelect): ProviderConnectionInternalRecord {
  return {
    ...mapProviderConnection(row),
    configurationId: row.configurationId,
    teamId: row.teamId,
    scopes: row.scopes,
    encryptedCredential: encryptedCredential(row),
  }
}

export function createProviderConnectionRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const selectAuthorized = async (context: AuthContext, provider: 'vercel', id?: string) => {
    const [row] = await db.select({ connection: providerConnections }).from(providerConnections)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, providerConnections.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(
        eq(providerConnections.workspaceId, context.workspaceId),
        eq(providerConnections.provider, provider),
        id ? eq(providerConnections.id, id) : undefined,
      )).limit(1)
    return row?.connection ?? null
  }

  return {
    async connect(context: AuthContext, input: z.infer<typeof providerConnectionInputSchema>): Promise<ProviderConnectionRecord> {
      const parsed = providerConnectionInputSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_provider_connection_input')
      const existing = await selectAuthorized(context, parsed.data.provider)
      if (existing?.status === 'connected' && existing.id !== parsed.data.id) throw new Error('provider_connection_exists')
      const now = new Date()
      if (existing) {
        const [updated] = await db.update(providerConnections).set({
          configurationId: parsed.data.configurationId,
          teamId: parsed.data.teamId,
          scopes: parsed.data.scopes,
          status: 'connected',
          credentialCiphertext: parsed.data.encryptedCredential.ciphertext,
          credentialIv: parsed.data.encryptedCredential.iv,
          credentialAuthTag: parsed.data.encryptedCredential.authTag,
          credentialKeyVersion: parsed.data.encryptedCredential.keyVersion,
          connectedAt: now,
          disconnectedAt: null,
          updatedAt: now,
        }).where(and(
          eq(providerConnections.id, existing.id),
          eq(providerConnections.workspaceId, context.workspaceId),
        )).returning()
        if (!updated) throw new Error('provider_connection_update_failed')
        return mapProviderConnection(updated)
      }
      const [created] = await db.insert(providerConnections).values({
        id: parsed.data.id,
        workspaceId: context.workspaceId,
        createdBy: context.userId,
        provider: parsed.data.provider,
        configurationId: parsed.data.configurationId,
        teamId: parsed.data.teamId,
        scopes: parsed.data.scopes,
        credentialCiphertext: parsed.data.encryptedCredential.ciphertext,
        credentialIv: parsed.data.encryptedCredential.iv,
        credentialAuthTag: parsed.data.encryptedCredential.authTag,
        credentialKeyVersion: parsed.data.encryptedCredential.keyVersion,
      }).returning()
      if (!created) throw new Error('provider_connection_create_failed')
      return mapProviderConnection(created)
    },

    async findPublic(context: AuthContext, provider: 'vercel'): Promise<ProviderConnectionRecord | null> {
      const row = await selectAuthorized(context, provider)
      return row ? mapProviderConnection(row) : null
    },

    async getInternal(context: AuthContext, id: string): Promise<ProviderConnectionInternalRecord | null> {
      const row = await selectAuthorized(context, 'vercel', id)
      return row ? mapProviderConnectionInternal(row) : null
    },

    async listCredentialsByKeyVersion(keyVersion: number, limit = 100) {
      if (!Number.isInteger(keyVersion) || keyVersion < 1) return []
      const rows = await db.select().from(providerConnections).where(and(
        eq(providerConnections.status, 'connected'),
        eq(providerConnections.credentialKeyVersion, keyVersion),
      )).orderBy(asc(providerConnections.updatedAt)).limit(Math.max(1, Math.min(limit, 500)))
      return rows.flatMap(row => {
        const credential = encryptedCredential(row)
        return credential ? [{
          provider: row.provider,
          workspaceId: row.workspaceId,
          connectionId: row.id,
          configurationId: row.configurationId,
          encryptedCredential: credential,
        }] : []
      })
    },

    async rotateCredential(
      connectionId: string,
      expectedKeyVersion: number,
      credentialInput: EncryptedProviderCredential,
    ): Promise<boolean> {
      const credential = encryptedCredentialSchema.safeParse(credentialInput)
      if (!credential.success) return false
      const [updated] = await db.update(providerConnections).set({
        credentialCiphertext: credential.data.ciphertext,
        credentialIv: credential.data.iv,
        credentialAuthTag: credential.data.authTag,
        credentialKeyVersion: credential.data.keyVersion,
        updatedAt: new Date(),
      }).where(and(
        eq(providerConnections.id, connectionId),
        eq(providerConnections.status, 'connected'),
        eq(providerConnections.credentialKeyVersion, expectedKeyVersion),
      )).returning({ id: providerConnections.id })
      return Boolean(updated)
    },

    async countCredentialsByKeyVersion(keyVersion: number): Promise<number> {
      if (!Number.isInteger(keyVersion) || keyVersion < 1) return 0
      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(providerConnections).where(and(
        eq(providerConnections.status, 'connected'),
        eq(providerConnections.credentialKeyVersion, keyVersion),
      ))
      return Number(result?.count ?? 0)
    },

    async disconnect(context: AuthContext, id: string): Promise<ProviderConnectionRecord | null> {
      const row = await selectAuthorized(context, 'vercel', id)
      if (!row) return null
      if (row.status === 'disconnected') return mapProviderConnection(row)
      const now = new Date()
      const [updated] = await db.update(providerConnections).set({
        status: 'disconnected',
        credentialCiphertext: null,
        credentialIv: null,
        credentialAuthTag: null,
        credentialKeyVersion: null,
        disconnectedAt: now,
        updatedAt: now,
      }).where(and(
        eq(providerConnections.id, id),
        eq(providerConnections.workspaceId, context.workspaceId),
        inArray(providerConnections.status, ['connected', 'disabled']),
      )).returning()
      return updated ? mapProviderConnection(updated) : null
    },

    async disableByConfiguration(configurationId: string): Promise<ProviderConnectionRecord | null> {
      const [updated] = await db.update(providerConnections).set({
        status: 'disabled', updatedAt: new Date(),
      }).where(and(
        eq(providerConnections.configurationId, configurationId),
        eq(providerConnections.status, 'connected'),
      )).returning()
      return updated ? mapProviderConnection(updated) : null
    },
  }
}

export interface DeploymentRecord {
  id: string
  projectId: string
  workspaceId: string
  revisionId: string
  provider: 'vercel'
  target: DeploymentTarget
  status: DeploymentStatus
  url: string | null
  errorCode: DeploymentErrorCode | null
  createdAt: Date
  updatedAt: Date
}

export interface DeploymentWorkerInput extends DeploymentRecord {
  document: DesignDocument
  connection: ProviderConnectionInternalRecord & { encryptedCredential: EncryptedProviderCredential }
}

function safeDeploymentUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.toLowerCase().endsWith('.vercel.app')) return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function mapDeployment(row: typeof deployments.$inferSelect): DeploymentRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    workspaceId: row.workspaceId,
    revisionId: row.revisionId,
    provider: row.provider,
    target: row.target,
    status: row.status,
    url: safeDeploymentUrl(row.url),
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const deploymentCreateSchema = z.object({
  revisionId: z.string().uuid(),
  connectionId: z.string().uuid(),
  requestId: z.string().uuid(),
  target: deploymentTargetSchema,
}).strict()

const deploymentArtifactSchema = z.object({
  artifactKey: z.string().min(1).max(500),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  contentType: z.literal(DEPLOYMENT_CONTENT_TYPE),
  providerProjectName: z.string().regex(/^zenui-[a-z0-9]{8,32}$/),
  providerDeploymentId: z.string().min(1).max(200),
}).strict()

export function createDeploymentRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  const selectAuthorized = async (context: AuthContext, deploymentId: string) => {
    const [row] = await db.select({ deployment: deployments }).from(deployments)
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, deployments.workspaceId),
        eq(workspaceMembers.userId, context.userId),
      ))
      .where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
      )).limit(1)
    return row?.deployment ?? null
  }

  return {
    async create(context: AuthContext, projectId: string, input: z.infer<typeof deploymentCreateSchema>) {
      const parsed = deploymentCreateSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_deployment_input')
      if (!await createProjectRepository(db).findById(context, projectId)) throw new Error('not_found')
      const [existing] = await db.select().from(deployments).where(and(
        eq(deployments.projectId, projectId), eq(deployments.requestId, parsed.data.requestId),
      )).limit(1)
      if (existing) return { created: false, deployment: mapDeployment(existing) }
      const [revision] = await db.select({ id: revisions.id }).from(revisions).where(and(
        eq(revisions.id, parsed.data.revisionId), eq(revisions.projectId, projectId),
      )).limit(1)
      if (!revision) throw new Error('not_found')
      const [connection] = await db.select().from(providerConnections).where(and(
        eq(providerConnections.id, parsed.data.connectionId),
        eq(providerConnections.workspaceId, context.workspaceId),
        eq(providerConnections.provider, 'vercel'),
        eq(providerConnections.status, 'connected'),
      )).limit(1)
      if (!connection || !encryptedCredential(connection)) throw new Error('connection_missing')
      const [created] = await db.insert(deployments).values({
        workspaceId: context.workspaceId,
        projectId,
        revisionId: revision.id,
        connectionId: connection.id,
        createdBy: context.userId,
        requestId: parsed.data.requestId,
        provider: 'vercel',
        target: parsed.data.target,
      }).returning()
      if (!created) throw new Error('deployment_create_failed')
      return { created: true, deployment: mapDeployment(created) }
    },

    async findRevision(context: AuthContext, projectId: string, revisionId: string): Promise<{ id: string; projectId: string } | null> {
      if (!await createProjectRepository(db).findById(context, projectId)) return null
      const [revision] = await db.select({ id: revisions.id, projectId: revisions.projectId }).from(revisions).where(and(
        eq(revisions.id, revisionId), eq(revisions.projectId, projectId),
      )).limit(1)
      return revision ?? null
    },

    async list(context: AuthContext, projectId: string): Promise<DeploymentRecord[]> {
      if (!await createProjectRepository(db).findById(context, projectId)) return []
      const rows = await db.select().from(deployments).where(and(
        eq(deployments.workspaceId, context.workspaceId), eq(deployments.projectId, projectId),
      )).orderBy(desc(deployments.createdAt))
      return rows.map(mapDeployment)
    },

    async findById(context: AuthContext, deploymentId: string): Promise<DeploymentRecord | null> {
      const row = await selectAuthorized(context, deploymentId)
      return row ? mapDeployment(row) : null
    },

    async getWorkerInput(context: AuthContext, deploymentId: string): Promise<DeploymentWorkerInput | null> {
      const [row] = await db.select({
        deployment: deployments,
        document: revisions.documentSnapshot,
        connection: providerConnections,
      }).from(deployments)
        .innerJoin(revisions, eq(revisions.id, deployments.revisionId))
        .innerJoin(providerConnections, eq(providerConnections.id, deployments.connectionId))
        .innerJoin(workspaceMembers, and(
          eq(workspaceMembers.workspaceId, deployments.workspaceId),
          eq(workspaceMembers.userId, context.userId),
        ))
        .where(and(
          eq(deployments.id, deploymentId),
          eq(deployments.workspaceId, context.workspaceId),
          eq(deployments.createdBy, context.userId),
        )).limit(1)
      if (!row) return null
      const validation = validateDesignDocument(row.document)
      const credential = encryptedCredential(row.connection)
      if (!validation.success || !credential || row.connection.status !== 'connected') return null
      return {
        ...mapDeployment(row.deployment),
        document: validation.data,
        connection: { ...mapProviderConnectionInternal(row.connection), encryptedCredential: credential },
      }
    },

    async getReconciliationInput(context: AuthContext, deploymentId: string) {
      const [row] = await db.select({
        deployment: deployments,
        connection: providerConnections,
      }).from(deployments)
        .innerJoin(providerConnections, eq(providerConnections.id, deployments.connectionId))
        .innerJoin(workspaceMembers, and(
          eq(workspaceMembers.workspaceId, deployments.workspaceId),
          eq(workspaceMembers.userId, context.userId),
        ))
        .where(and(
          eq(deployments.id, deploymentId),
          eq(deployments.workspaceId, context.workspaceId),
          eq(deployments.createdBy, context.userId),
        )).limit(1)
      if (!row) return null
      const credential = encryptedCredential(row.connection)
      if (!credential || row.connection.status !== 'connected') return null
      return {
        ...mapDeployment(row.deployment),
        providerProjectName: row.deployment.providerProjectName,
        providerDeploymentId: row.deployment.providerDeploymentId,
        connection: { ...mapProviderConnectionInternal(row.connection), encryptedCredential: credential },
      }
    },

    async attachProviderDeployment(
      context: AuthContext,
      deploymentId: string,
      input: { providerProjectName: string; providerDeploymentId: string },
    ): Promise<DeploymentRecord | null> {
      const parsed = z.object({
        providerProjectName: z.string().regex(/^zenui-[a-z0-9]{8,32}$/),
        providerDeploymentId: z.string().min(1).max(200),
      }).strict().safeParse(input)
      if (!parsed.success) return null
      const [updated] = await db.update(deployments).set({
        status: 'building',
        providerProjectName: parsed.data.providerProjectName,
        providerDeploymentId: parsed.data.providerDeploymentId,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        eq(deployments.status, 'failed'),
        eq(deployments.errorCode, 'provider_outcome_unknown'),
        isNull(deployments.providerDeploymentId),
      )).returning()
      return updated ? mapDeployment(updated) : null
    },

    async claimUploading(
      context: AuthContext,
      deploymentId: string,
      lease: LeaseInput = { now: new Date(), leaseSeconds: 120 },
    ): Promise<DeploymentRecord | null> {
      const values = leaseValues(lease)
      const [updated] = await db.update(deployments).set({
        status: 'uploading',
        startedAt: lease.now,
        ...values,
        attemptCount: sql`${deployments.attemptCount} + 1`,
      }).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        eq(deployments.status, 'queued'),
      )).returning()
      return updated ? mapDeployment(updated) : null
    },

    async heartbeat(context: AuthContext, deploymentId: string, lease: LeaseInput): Promise<boolean> {
      const values = leaseValues(lease)
      const [updated] = await db.update(deployments).set(values).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        inArray(deployments.status, ['uploading', 'building']),
      )).returning({ id: deployments.id })
      return Boolean(updated)
    },

    async recordArtifact(context: AuthContext, deploymentId: string, input: unknown): Promise<DeploymentRecord | null> {
      const artifact = deploymentArtifactSchema.safeParse(input)
      if (!artifact.success) return null
      const [updated] = await db.update(deployments).set({
        status: 'building',
        artifactKey: artifact.data.artifactKey,
        artifactChecksum: artifact.data.checksum,
        artifactBytes: artifact.data.bytes,
        artifactContentType: artifact.data.contentType,
        providerProjectName: artifact.data.providerProjectName,
        providerDeploymentId: artifact.data.providerDeploymentId,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        eq(deployments.status, 'uploading'),
      )).returning()
      return updated ? mapDeployment(updated) : null
    },

    async completeReady(context: AuthContext, deploymentId: string, urlInput: string): Promise<DeploymentRecord | null> {
      const url = safeDeploymentUrl(urlInput)
      if (!url) return null
      const [updated] = await db.update(deployments).set({
        status: 'ready', url, completedAt: new Date(),
        leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        eq(deployments.status, 'building'),
      )).returning()
      return updated ? mapDeployment(updated) : null
    },

    async fail(context: AuthContext, deploymentId: string, errorInput: string): Promise<DeploymentRecord | null> {
      const error = deploymentErrorCodeSchema.safeParse(errorInput)
      if (!error.success) return null
      const [updated] = await db.update(deployments).set({
        status: 'failed', errorCode: error.data, completedAt: new Date(),
        leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: new Date(),
      }).where(and(
        eq(deployments.id, deploymentId),
        eq(deployments.workspaceId, context.workspaceId),
        eq(deployments.createdBy, context.userId),
        inArray(deployments.status, ['queued', 'uploading', 'building']),
      )).returning()
      return updated ? mapDeployment(updated) : null
    },
  }
}

export type QueueRecoveryAction = {
  kind: 'asset' | 'generation' | 'export' | 'deployment'
  action: 'enqueue' | 'failed' | 'reconcile'
  id: string
  projectId?: string
  workspaceId: string
  userId: string
}

const recoveryInputSchema = z.object({
  now: z.date(),
  staleQueuedBefore: z.date(),
  batchSize: z.number().int().min(1).max(500),
  maxAttempts: z.number().int().min(1).max(10),
}).strict()

export function createQueueRecoveryRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  return {
    async recover(input: z.infer<typeof recoveryInputSchema>): Promise<QueueRecoveryAction[]> {
      const parsed = recoveryInputSchema.parse(input)
      const actions: QueueRecoveryAction[] = []
      await db.transaction(async transaction => {
        const staleAssets = await transaction.select().from(assets).where(or(
          and(
            eq(assets.status, 'queued'),
            lt(assets.updatedAt, parsed.staleQueuedBefore),
            lt(assets.attemptCount, parsed.maxAttempts),
          ),
          and(
            eq(assets.status, 'importing'),
            isNotNull(assets.leaseExpiresAt),
            lte(assets.leaseExpiresAt, parsed.now),
            lt(assets.attemptCount, parsed.maxAttempts),
          ),
        )).orderBy(asc(assets.updatedAt)).limit(parsed.batchSize)
        for (const asset of staleAssets) {
          if (asset.status === 'importing') {
            await transaction.update(assets).set({
              status: 'queued', leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: parsed.now,
            }).where(and(
              eq(assets.id, asset.id),
              eq(assets.status, 'importing'),
              isNotNull(assets.leaseExpiresAt),
              lte(assets.leaseExpiresAt, parsed.now),
            ))
          }
          actions.push({
            kind: 'asset', action: 'enqueue', id: asset.id,
            ...(asset.projectId ? { projectId: asset.projectId } : {}),
            workspaceId: asset.workspaceId, userId: asset.createdBy,
          })
        }

        const staleGenerations = await transaction.select().from(generationRuns).where(or(
          and(
            eq(generationRuns.status, 'queued'),
            lt(generationRuns.updatedAt, parsed.staleQueuedBefore),
            lt(generationRuns.attemptCount, parsed.maxAttempts),
          ),
          and(
            inArray(generationRuns.status, ['running', 'repairing']),
            isNotNull(generationRuns.leaseExpiresAt),
            lte(generationRuns.leaseExpiresAt, parsed.now),
          ),
        )).orderBy(asc(generationRuns.updatedAt)).limit(parsed.batchSize)
        for (const run of staleGenerations) {
          if (run.status === 'queued') {
            actions.push({
              kind: 'generation', action: 'enqueue', id: run.id, projectId: run.projectId,
              workspaceId: run.workspaceId, userId: run.createdBy,
            })
            continue
          }
          const [failed] = await transaction.update(generationRuns).set({
            status: 'failed', errorCode: 'provider_error', completedAt: parsed.now,
            leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: parsed.now,
          }).where(and(
            eq(generationRuns.id, run.id),
            inArray(generationRuns.status, ['running', 'repairing']),
            isNotNull(generationRuns.leaseExpiresAt),
            lte(generationRuns.leaseExpiresAt, parsed.now),
          )).returning({ id: generationRuns.id })
          if (failed) actions.push({
            kind: 'generation', action: 'failed', id: run.id, projectId: run.projectId,
            workspaceId: run.workspaceId, userId: run.createdBy,
          })
        }

        const staleExports = await transaction.select().from(exportRuns).where(or(
          and(
            eq(exportRuns.status, 'queued'),
            lt(exportRuns.updatedAt, parsed.staleQueuedBefore),
            lt(exportRuns.attemptCount, parsed.maxAttempts),
          ),
          and(
            eq(exportRuns.status, 'running'),
            isNotNull(exportRuns.leaseExpiresAt),
            lte(exportRuns.leaseExpiresAt, parsed.now),
            lt(exportRuns.attemptCount, parsed.maxAttempts),
          ),
        )).orderBy(asc(exportRuns.updatedAt)).limit(parsed.batchSize)
        for (const run of staleExports) {
          if (run.status === 'running') {
            await transaction.update(exportRuns).set({
              status: 'queued', startedAt: null, leaseExpiresAt: null, lastHeartbeatAt: null,
              updatedAt: parsed.now,
            }).where(and(
              eq(exportRuns.id, run.id),
              eq(exportRuns.status, 'running'),
              isNotNull(exportRuns.leaseExpiresAt),
              lte(exportRuns.leaseExpiresAt, parsed.now),
            ))
          }
          actions.push({
            kind: 'export', action: 'enqueue', id: run.id, projectId: run.projectId,
            workspaceId: run.workspaceId, userId: run.createdBy,
          })
        }

        const staleDeployments = await transaction.select().from(deployments).where(or(
          and(
            eq(deployments.status, 'queued'),
            lt(deployments.updatedAt, parsed.staleQueuedBefore),
            lt(deployments.attemptCount, parsed.maxAttempts),
          ),
          and(
            inArray(deployments.status, ['uploading', 'building']),
            or(lte(deployments.leaseExpiresAt, parsed.now), isNull(deployments.leaseExpiresAt)),
          ),
          and(
            eq(deployments.status, 'failed'),
            eq(deployments.errorCode, 'provider_outcome_unknown'),
            lt(deployments.updatedAt, parsed.staleQueuedBefore),
          ),
        )).orderBy(asc(deployments.updatedAt)).limit(parsed.batchSize)
        for (const deployment of staleDeployments) {
          if (deployment.status === 'queued') {
            actions.push({
              kind: 'deployment', action: 'enqueue', id: deployment.id, projectId: deployment.projectId,
              workspaceId: deployment.workspaceId, userId: deployment.createdBy,
            })
            continue
          }
          if (deployment.status === 'failed' && deployment.errorCode === 'provider_outcome_unknown') {
            actions.push({
              kind: 'deployment', action: 'reconcile', id: deployment.id, projectId: deployment.projectId,
              workspaceId: deployment.workspaceId, userId: deployment.createdBy,
            })
            continue
          }
          if (deployment.status === 'building' && deployment.providerDeploymentId) {
            actions.push({
              kind: 'deployment', action: 'reconcile', id: deployment.id, projectId: deployment.projectId,
              workspaceId: deployment.workspaceId, userId: deployment.createdBy,
            })
            continue
          }
          const [failed] = await transaction.update(deployments).set({
            status: 'failed', errorCode: 'provider_outcome_unknown', completedAt: parsed.now,
            leaseExpiresAt: null, lastHeartbeatAt: null, updatedAt: parsed.now,
          }).where(and(
            eq(deployments.id, deployment.id),
            inArray(deployments.status, ['uploading', 'building']),
          )).returning({ id: deployments.id })
          if (failed) actions.push({
            kind: 'deployment', action: 'failed', id: deployment.id, projectId: deployment.projectId,
            workspaceId: deployment.workspaceId, userId: deployment.createdBy,
          })
        }
      })
      return actions
    },
  }
}

const retentionCleanupInputSchema = z.object({
  now: z.date(),
  batchSize: z.number().int().min(1).max(500),
  dryRun: z.boolean(),
}).strict()

type RetentionCandidateCounts = {
  generationPrompts: number
  failedExports: number
  disabledShares: number
  failedDeployments: number
}

export function createRetentionRepository(db: PgDatabase<PgQueryResultHKT, typeof schema>) {
  return {
    async cleanup(input: z.input<typeof retentionCleanupInputSchema>) {
      const parsed = retentionCleanupInputSchema.safeParse(input)
      if (!parsed.success) throw new Error('invalid_retention_cleanup_input')
      const generationBefore = new Date(parsed.data.now.getTime() - 30 * 86_400_000)
      const publicBefore = new Date(parsed.data.now.getTime() - 90 * 86_400_000)
      /* v8 ignore next -- schema validation above guarantees a positive batch size */
      const remaining = { value: parsed.data.batchSize }
      const take = (value: number) => {
        const count = Math.min(value, remaining.value)
        remaining.value -= count
        return count
      }

      /* v8 ignore start -- aggregate fallbacks guard adapters that may omit a count row; PostgreSQL always returns one */
      const [generationCount] = await db.select({ count: sql<number>`count(*)::int` }).from(generationRuns).where(and(
        inArray(generationRuns.status, ['completed', 'failed']),
        lte(generationRuns.completedAt, generationBefore),
        isNull(generationRuns.retainedCleanupAt),
        isNotNull(generationRuns.prompt),
      ))
      const generationPrompts = take(Number(generationCount?.count ?? 0))
      const [exportCount] = await db.select({ count: sql<number>`count(*)::int` }).from(exportRuns).where(and(
        eq(exportRuns.status, 'failed'),
        lte(exportRuns.completedAt, generationBefore),
        isNull(exportRuns.retainedCleanupAt),
      ))
      const failedExports = take(Number(exportCount?.count ?? 0))
      const [shareCount] = await db.select({ count: sql<number>`count(*)::int` }).from(shareLinks).where(and(
        eq(shareLinks.status, 'disabled'),
        lte(shareLinks.disabledAt, publicBefore),
        isNull(shareLinks.retainedCleanupAt),
      ))
      const disabledShares = take(Number(shareCount?.count ?? 0))
      const [deploymentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(deployments).where(and(
        eq(deployments.status, 'failed'),
        lte(deployments.completedAt, generationBefore),
        isNull(deployments.retainedCleanupAt),
        or(isNull(deployments.errorCode), sql`${deployments.errorCode} <> 'provider_outcome_unknown'`),
      ))
      const failedDeployments = take(Number(deploymentCount?.count ?? 0))
      /* v8 ignore stop */
      const candidates: RetentionCandidateCounts = {
        generationPrompts, failedExports, disabledShares, failedDeployments,
      }
      const scanned = Object.values(candidates).reduce((sum, count) => sum + count, 0)
      if (!parsed.data.dryRun) {
        await db.transaction(async transaction => {
          if (generationPrompts > 0) {
            const rows = await transaction.select({ id: generationRuns.id }).from(generationRuns).where(and(
              inArray(generationRuns.status, ['completed', 'failed']),
              lte(generationRuns.completedAt, generationBefore),
              isNull(generationRuns.retainedCleanupAt),
              isNotNull(generationRuns.prompt),
            )).orderBy(asc(generationRuns.completedAt)).limit(generationPrompts)
            if (rows.length) await transaction.update(generationRuns).set({
              prompt: null, retainedCleanupAt: parsed.data.now, updatedAt: parsed.data.now,
            }).where(inArray(generationRuns.id, rows.map(row => row.id)))
          }
          if (failedExports > 0) {
            const rows = await transaction.select({ id: exportRuns.id }).from(exportRuns).where(and(
              eq(exportRuns.status, 'failed'), lte(exportRuns.completedAt, generationBefore),
              isNull(exportRuns.retainedCleanupAt),
            )).orderBy(asc(exportRuns.completedAt)).limit(failedExports)
            if (rows.length) await transaction.update(exportRuns).set({
              documentSnapshot: sql`'{}'::jsonb`, retainedCleanupAt: parsed.data.now, updatedAt: parsed.data.now,
            }).where(inArray(exportRuns.id, rows.map(row => row.id)))
          }
          if (disabledShares > 0) {
            const rows = await transaction.select({ id: shareLinks.id }).from(shareLinks).where(and(
              eq(shareLinks.status, 'disabled'), lte(shareLinks.disabledAt, publicBefore),
              isNull(shareLinks.retainedCleanupAt),
            )).orderBy(asc(shareLinks.disabledAt)).limit(disabledShares)
            if (rows.length) await transaction.update(shareLinks).set({
              retainedCleanupAt: parsed.data.now, updatedAt: parsed.data.now,
            }).where(inArray(shareLinks.id, rows.map(row => row.id)))
          }
          if (failedDeployments > 0) {
            const rows = await transaction.select({ id: deployments.id }).from(deployments).where(and(
              eq(deployments.status, 'failed'), lte(deployments.completedAt, generationBefore),
              isNull(deployments.retainedCleanupAt),
              or(isNull(deployments.errorCode), sql`${deployments.errorCode} <> 'provider_outcome_unknown'`),
            )).orderBy(asc(deployments.completedAt)).limit(failedDeployments)
            if (rows.length) await transaction.update(deployments).set({
              artifactKey: null, artifactChecksum: null, artifactBytes: null, artifactContentType: null,
              providerProjectName: null, providerDeploymentId: null, url: null,
              retainedCleanupAt: parsed.data.now, updatedAt: parsed.data.now,
            }).where(inArray(deployments.id, rows.map(row => row.id)))
          }
        })
      }
      return {
        operation: 'retention_cleanup' as const,
        outcome: 'completed' as const,
        scanned,
        changed: parsed.data.dryRun ? 0 : scanned,
        failed: 0,
        candidates,
      }
    },
  }
}

export async function migrateTestDatabase(client: PGlite): Promise<void> {
  const migrationDirectory = dirname(fileURLToPath(new URL('../migrations/0000_keen_gateway.sql', import.meta.url)))
  const files = (await readdir(migrationDirectory))
    .filter(file => /^\d{4}_.+\.sql$/.test(file))
    .sort()
  for (const file of files) {
    const sql = await readFile(join(migrationDirectory, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement)
    }
  }
}
