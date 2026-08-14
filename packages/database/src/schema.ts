import {
  index,
  integer,
  jsonb,
  pgEnum,
  type AnyPgColumn,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import type {
  DesignDirectionGenerationPlan,
  DesignDirectionRunErrorCode,
  DesignDirectionRunStatus,
  GenerationErrorCode,
  GenerationMode,
  GenerationStatus,
  ProposalAction,
  ProposalFeedbackCode,
  ProposalIntent,
  ProposalLineage,
  ProposalScope,
  MaterializedDesignDirection,
  MediaProposalReview,
  RemixConstraints,
  SiteIntelligenceReview,
  WebsiteBrief,
} from '@zenui/ai-core'
import type { AssetAttribution, AssetErrorCode, AssetStatus, BrandKit, CropTransform } from '@zenui/asset-core'
import type { DeploymentErrorCode, DeploymentStatus, DeploymentTarget } from '@zenui/deployment-core'
import type { DesignCommand } from '@zenui/design-commands'
import type { DesignDocument, LeadFormProps } from '@zenui/design-schema'
import type { ExportErrorCode, ExportStatus } from '@zenui/export-core'
import type { ShareStoredStatus } from '@zenui/share-core'

export const workspaceRole = pgEnum('workspace_role', ['owner', 'editor', 'viewer'])
export const projectStatus = pgEnum('project_status', ['active', 'archived'])
export const revisionSource = pgEnum('revision_source', ['manual', 'restore', 'ai', 'import'])
export const generationMode = pgEnum('generation_mode', ['generate', 'edit-page', 'edit-selection'])
export const generationStatus = pgEnum('generation_status', ['queued', 'running', 'repairing', 'completed', 'failed'])
export const generationDelivery = pgEnum('generation_delivery', ['apply', 'proposal'])
export const proposalAction = pgEnum('proposal_action', ['request', 'refine', 'try-another'])
export const proposalStatus = pgEnum('proposal_status', [
  'preparing', 'ready', 'accepted', 'discarded', 'superseded', 'cancelled', 'stale', 'invalid-scope', 'failed',
])
export const projectCreationState = pgEnum('project_creation_state', ['onboarding', 'accepted'])
export const designDirectionStatus = pgEnum('design_direction_status', [
  'queued', 'running', 'completed', 'failed', 'cancelled', 'superseded', 'accepted',
])
export const exportStatus = pgEnum('export_status', ['queued', 'running', 'completed', 'failed'])
export const shareLinkStatus = pgEnum('share_link_status', ['active', 'disabled'])
export const leadBindingStatus = pgEnum('lead_binding_status', ['pending', 'active', 'disabled'])
export const leadSubmissionStatus = pgEnum('lead_submission_status', ['new', 'contacted'])
export const providerConnectionStatus = pgEnum('provider_connection_status', ['connected', 'disconnected', 'disabled'])
export const deploymentTarget = pgEnum('deployment_target', ['preview', 'production'])
export const deploymentStatus = pgEnum('deployment_status', ['queued', 'uploading', 'building', 'ready', 'failed'])
export const assetScope = pgEnum('asset_scope', ['project', 'workspace'])
export const assetSource = pgEnum('asset_source', ['upload', 'pexels', 'generated', 'derivative'])
export const assetStatus = pgEnum('asset_status', ['queued', 'importing', 'ready', 'failed'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<'oauth' | 'oidc' | 'email' | 'credentials' | 'webauthn'>().notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, table => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
  index('accounts_user_id_idx').on(table.userId),
])

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, table => [index('sessions_user_id_idx').on(table.userId)])

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, table => [primaryKey({ columns: [table.identifier, table.token] })])

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable('workspace_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: workspaceRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('workspace_members_workspace_user_unique').on(table.workspaceId, table.userId),
  index('workspace_members_user_id_idx').on(table.userId),
  index('workspace_members_workspace_id_idx').on(table.workspaceId),
])

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: projectStatus('status').notNull().default('active'),
  creationState: projectCreationState('creation_state').notNull().default('accepted'),
  currentDocumentVersion: integer('current_document_version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('projects_workspace_id_updated_at_idx').on(table.workspaceId, table.updatedAt),
])

export const designDocuments = pgTable('design_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull(),
  documentJson: jsonb('document_json').$type<DesignDocument>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('design_documents_project_unique').on(table.projectId),
  index('design_documents_project_version_idx').on(table.projectId, table.version),
])

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  scope: assetScope('scope').$type<'project' | 'workspace'>().notNull(),
  source: assetSource('source').$type<'upload' | 'pexels' | 'generated' | 'derivative'>().notNull(),
  status: assetStatus('status').$type<AssetStatus>().notNull().default('queued'),
  parentAssetId: uuid('parent_asset_id').references((): AnyPgColumn => assets.id, { onDelete: 'restrict' }),
  transform: jsonb('transform').$type<CropTransform>(),
  sourceObjectKey: text('source_object_key'),
  objectKey: text('object_key'),
  contentType: text('content_type').$type<'image/webp'>(),
  width: integer('width'),
  height: integer('height'),
  bytes: integer('bytes'),
  checksum: text('checksum'),
  defaultAlt: text('default_alt').notNull().default(''),
  attribution: jsonb('attribution').$type<AssetAttribution>(),
  providerResultId: text('provider_result_id'),
  errorCode: text('error_code').$type<AssetErrorCode>(),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('assets_workspace_request_unique').on(table.workspaceId, table.requestId),
  index('assets_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('assets_project_created_at_idx').on(table.projectId, table.createdAt),
  index('assets_status_lease_idx').on(table.status, table.leaseExpiresAt),
])

export const brandKits = pgTable('brand_kits', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  name: text('name').notNull(),
  logoAssetId: uuid('logo_asset_id').references(() => assets.id, { onDelete: 'restrict' }),
  primaryColor: text('primary_color').notNull(),
  backgroundColor: text('background_color').notNull(),
  textColor: text('text_color').notNull(),
  headingFont: text('heading_font').$type<BrandKit['fonts']['heading']>().notNull(),
  bodyFont: text('body_font').$type<BrandKit['fonts']['body']>().notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('brand_kits_workspace_unique').on(table.workspaceId),
  index('brand_kits_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt),
])

export const generationRuns = pgTable('generation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  mode: generationMode('mode').$type<GenerationMode>().notNull(),
  selectedNodeId: text('selected_node_id'),
  prompt: text('prompt'),
  originalRequest: text('original_request'),
  expectedVersion: integer('expected_version').notNull(),
  status: generationStatus('status').$type<GenerationStatus>().notNull().default('queued'),
  delivery: generationDelivery('delivery').$type<'apply' | 'proposal'>().notNull().default('apply'),
  proposalAction: proposalAction('proposal_action').$type<ProposalAction>(),
  proposalIntent: text('proposal_intent').$type<ProposalIntent>(),
  proposalConstraints: jsonb('proposal_constraints').$type<RemixConstraints>(),
  proposalStatus: proposalStatus('proposal_status').$type<
    'preparing' | 'ready' | 'accepted' | 'discarded' | 'superseded' | 'cancelled' | 'stale' | 'invalid-scope' | 'failed'
  >(),
  previousProposalId: uuid('previous_proposal_id'),
  proposalScope: jsonb('proposal_scope').$type<ProposalScope>(),
  proposalCommands: jsonb('proposal_commands').$type<DesignCommand[]>(),
  proposedDocument: jsonb('proposed_document').$type<DesignDocument>(),
  proposalSummary: text('proposal_summary'),
  proposalFeedbackCodes: jsonb('proposal_feedback_codes').$type<ProposalFeedbackCode[]>(),
  proposalLineage: jsonb('proposal_lineage').$type<ProposalLineage>(),
  proposalMediaReview: jsonb('proposal_media_review').$type<MediaProposalReview>(),
  proposalAcceptedAt: timestamp('proposal_accepted_at', { withTimezone: true }),
  proposalDiscardedAt: timestamp('proposal_discarded_at', { withTimezone: true }),
  provider: text('provider'),
  model: text('model'),
  promptVersion: text('prompt_version'),
  repairCount: integer('repair_count').notNull().default(0),
  errorCode: text('error_code').$type<GenerationErrorCode>(),
  retainedCleanupAt: timestamp('retained_cleanup_at', { withTimezone: true }),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  documentVersion: integer('document_version'),
  revisionId: uuid('revision_id'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('generation_runs_project_request_unique').on(table.projectId, table.requestId),
  index('generation_runs_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('generation_runs_project_created_at_idx').on(table.projectId, table.createdAt),
  index('generation_runs_status_updated_at_idx').on(table.status, table.updatedAt),
  index('generation_runs_status_lease_idx').on(table.status, table.leaseExpiresAt),
  index('generation_runs_retention_idx').on(table.status, table.completedAt, table.retainedCleanupAt),
  index('generation_runs_project_proposal_status_idx').on(table.projectId, table.proposalStatus, table.updatedAt),
])

export const projectBriefs = pgTable('project_briefs', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  briefJson: jsonb('brief_json').$type<WebsiteBrief>().notNull(),
  updatedBy: uuid('updated_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('project_briefs_workspace_updated_at_idx').on(table.workspaceId, table.updatedAt)])

export const siteIntelligenceReviews = pgTable('site_intelligence_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  documentVersion: integer('document_version').notNull(),
  policyVersion: text('policy_version').notNull(),
  documentFingerprint: text('document_fingerprint').notNull(),
  briefFingerprint: text('brief_fingerprint').notNull(),
  analysisSnapshot: jsonb('analysis_snapshot').$type<SiteIntelligenceReview>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('site_intelligence_reviews_project_request_unique').on(table.projectId, table.requestId),
  index('site_intelligence_reviews_project_version_created_idx').on(table.projectId, table.documentVersion, table.createdAt),
  index('site_intelligence_reviews_workspace_created_idx').on(table.workspaceId, table.createdAt),
])

export const siteIntelligenceDismissals = pgTable('site_intelligence_dismissals', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  findingFingerprint: text('finding_fingerprint').notNull(),
  evidenceFingerprint: text('evidence_fingerprint').notNull(),
  policyVersion: text('policy_version').notNull(),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  restoredAt: timestamp('restored_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('site_intelligence_dismissals_actor_finding_unique').on(table.projectId, table.userId, table.findingFingerprint),
  index('site_intelligence_dismissals_actor_active_idx').on(table.projectId, table.userId, table.restoredAt),
])

export const designDirectionRuns = pgTable('design_direction_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  expectedVersion: integer('expected_version').notNull(),
  round: integer('round').notNull().default(0),
  briefSnapshot: jsonb('brief_snapshot').$type<WebsiteBrief>().notNull(),
  status: designDirectionStatus('status').$type<DesignDirectionRunStatus>().notNull().default('queued'),
  provider: text('provider'),
  model: text('model'),
  promptVersion: text('prompt_version'),
  errorCode: text('error_code').$type<DesignDirectionRunErrorCode>(),
  contentBlueprint: jsonb('content_blueprint').$type<DesignDirectionGenerationPlan>(),
  directionSnapshots: jsonb('direction_snapshots').$type<MaterializedDesignDirection[]>(),
  selectedDirectionId: text('selected_direction_id'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  documentVersion: integer('document_version'),
  revisionId: uuid('revision_id'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  retainedCleanupAt: timestamp('retained_cleanup_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('design_direction_runs_project_request_unique').on(table.projectId, table.requestId),
  index('design_direction_runs_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('design_direction_runs_project_created_at_idx').on(table.projectId, table.createdAt),
  index('design_direction_runs_status_lease_idx').on(table.status, table.leaseExpiresAt),
])

export const exportRuns = pgTable('export_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  expectedVersion: integer('expected_version').notNull(),
  documentVersion: integer('document_version').notNull(),
  documentSnapshot: jsonb('document_snapshot').$type<DesignDocument>().notNull(),
  status: exportStatus('status').$type<ExportStatus>().notNull().default('queued'),
  artifactKey: text('artifact_key'),
  artifactChecksum: text('artifact_checksum'),
  artifactBytes: integer('artifact_bytes'),
  artifactContentType: text('artifact_content_type'),
  artifactRouteCount: integer('artifact_route_count'),
  errorCode: text('error_code').$type<ExportErrorCode>(),
  retainedCleanupAt: timestamp('retained_cleanup_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('export_runs_project_request_unique').on(table.projectId, table.requestId),
  index('export_runs_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('export_runs_project_created_at_idx').on(table.projectId, table.createdAt),
  index('export_runs_status_updated_at_idx').on(table.status, table.updatedAt),
  index('export_runs_status_lease_idx').on(table.status, table.leaseExpiresAt),
  index('export_runs_retention_idx').on(table.status, table.completedAt, table.retainedCleanupAt),
])

export const revisions = pgTable('revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  documentSnapshot: jsonb('document_snapshot').$type<DesignDocument>().notNull(),
  source: revisionSource('source').notNull(),
  summary: text('summary').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  generationRunId: uuid('generation_run_id').references(() => generationRuns.id, { onDelete: 'set null' }),
  designDirectionRunId: uuid('design_direction_run_id').references(() => designDirectionRuns.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('revisions_project_created_at_idx').on(table.projectId, table.createdAt)])

export const shareLinks = pgTable('share_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull().references(() => revisions.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  slug: text('slug').notNull().unique(),
  status: shareLinkStatus('status').$type<ShareStoredStatus>().notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  retainedCleanupAt: timestamp('retained_cleanup_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('share_links_project_request_unique').on(table.projectId, table.requestId),
  index('share_links_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('share_links_project_created_at_idx').on(table.projectId, table.createdAt),
  index('share_links_revision_id_idx').on(table.revisionId),
  index('share_links_status_updated_at_idx').on(table.status, table.updatedAt),
  index('share_links_retention_idx').on(table.status, table.disabledAt, table.retainedCleanupAt),
])

export const leadFormBindings = pgTable('lead_form_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  shareLinkId: uuid('share_link_id').references(() => shareLinks.id, { onDelete: 'cascade' }),
  deploymentId: uuid('deployment_id').references((): AnyPgColumn => deployments.id, { onDelete: 'cascade' }),
  publicBindingId: text('public_binding_id').notNull(),
  revisionId: uuid('revision_id').notNull().references(() => revisions.id, { onDelete: 'restrict' }),
  formNodeId: text('form_node_id').notNull(),
  pageRoute: text('page_route').notNull(),
  formTitle: text('form_title').notNull(),
  formSnapshot: jsonb('form_snapshot').$type<LeadFormProps>().notNull(),
  status: leadBindingStatus('status').notNull().default('active'),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('lead_form_bindings_share_form_unique').on(table.shareLinkId, table.formNodeId),
  unique('lead_form_bindings_deployment_form_unique').on(table.deploymentId, table.formNodeId),
  unique('lead_form_bindings_public_binding_unique').on(table.publicBindingId),
  index('lead_form_bindings_project_idx').on(table.projectId),
  index('lead_form_bindings_share_idx').on(table.shareLinkId),
  index('lead_form_bindings_deployment_idx').on(table.deploymentId),
  index('lead_form_bindings_revision_idx').on(table.revisionId),
])

export const leadSubmissions = pgTable('lead_submissions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  bindingId: uuid('binding_id').notNull().references(() => leadFormBindings.id, { onDelete: 'cascade' }),
  shareLinkId: uuid('share_link_id').references(() => shareLinks.id, { onDelete: 'cascade' }),
  deploymentId: uuid('deployment_id').references((): AnyPgColumn => deployments.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull().references(() => revisions.id, { onDelete: 'restrict' }),
  requestId: uuid('request_id').notNull(),
  formNodeId: text('form_node_id').notNull(),
  formTitle: text('form_title').notNull(),
  status: leadSubmissionStatus('status').notNull().default('new'),
  version: integer('version').notNull().default(1),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  keyVersion: integer('key_version').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  contactedAt: timestamp('contacted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  unique('lead_submissions_binding_request_unique').on(table.bindingId, table.requestId),
  index('lead_submissions_project_status_received_idx').on(table.projectId, table.status, table.receivedAt),
  index('lead_submissions_project_received_idx').on(table.projectId, table.receivedAt),
  index('lead_submissions_expiry_idx').on(table.expiresAt),
])

export const providerConnections = pgTable('provider_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  provider: text('provider').$type<'vercel'>().notNull(),
  configurationId: text('configuration_id').notNull().unique(),
  teamId: text('team_id'),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  status: providerConnectionStatus('status').notNull().default('connected'),
  credentialCiphertext: text('credential_ciphertext'),
  credentialIv: text('credential_iv'),
  credentialAuthTag: text('credential_auth_tag'),
  credentialKeyVersion: integer('credential_key_version'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('provider_connections_workspace_provider_unique').on(table.workspaceId, table.provider),
  index('provider_connections_workspace_status_idx').on(table.workspaceId, table.status),
])

export const deployments = pgTable('deployments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull().references(() => revisions.id, { onDelete: 'restrict' }),
  connectionId: uuid('connection_id').notNull().references(() => providerConnections.id, { onDelete: 'restrict' }),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  requestId: uuid('request_id').notNull(),
  provider: text('provider').$type<'vercel'>().notNull(),
  target: deploymentTarget('target').$type<DeploymentTarget>().notNull(),
  status: deploymentStatus('status').$type<DeploymentStatus>().notNull().default('queued'),
  artifactKey: text('artifact_key'),
  artifactChecksum: text('artifact_checksum'),
  artifactBytes: integer('artifact_bytes'),
  artifactContentType: text('artifact_content_type'),
  providerProjectName: text('provider_project_name'),
  providerDeploymentId: text('provider_deployment_id').unique(),
  url: text('url'),
  errorCode: text('error_code').$type<DeploymentErrorCode>(),
  retainedCleanupAt: timestamp('retained_cleanup_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('deployments_project_request_unique').on(table.projectId, table.requestId),
  index('deployments_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
  index('deployments_project_created_at_idx').on(table.projectId, table.createdAt),
  index('deployments_revision_id_idx').on(table.revisionId),
  index('deployments_status_updated_at_idx').on(table.status, table.updatedAt),
  index('deployments_status_lease_idx').on(table.status, table.leaseExpiresAt),
  index('deployments_retention_idx').on(table.status, table.completedAt, table.retainedCleanupAt),
])

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  generationRunId: uuid('generation_run_id').references(() => generationRuns.id, { onDelete: 'cascade' }),
  designDirectionRunId: uuid('design_direction_run_id').references(() => designDirectionRuns.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('usage_records_generation_run_unique').on(table.generationRunId),
  unique('usage_records_design_direction_run_unique').on(table.designDirectionRunId),
  index('usage_records_workspace_created_at_idx').on(table.workspaceId, table.createdAt),
])
