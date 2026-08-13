import { createHmac, randomUUID } from 'node:crypto'

import {
  createLeadRepository,
  createProjectRepository,
  createShareLinkRepository,
  workspaceMembers,
} from '@zenui/database'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import {
  createRedisLeadAdmissionGate,
  createRedisPublicShareAdmissionGate,
  createRedisShareAdmissionGate,
} from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { validateAssetOrigin } from './public-asset-api'
import { createRuntimeLeadKeyring } from './runtime-lead-keyring'
import { getRuntimeSession } from './runtime-session'
import { createRandomShareSlug, validateShareOrigin } from './share-api'

import type { PublicShareDependencies, ShareApiDependencies } from './share-api'

let redis: IORedis | undefined

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function integer(name: string, fallback: number, min: number, max: number): number {
  const value = process.env[name]
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} is invalid`)
  return parsed
}

function shared() {
  const database = getDatabase()
  const projects = createProjectRepository(database)
  const links = createShareLinkRepository(database)
  const leads = createLeadRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const trustedOrigin = required('APP_ORIGIN')
  const shareOrigin = validateShareOrigin(required('SHARE_ORIGIN'), trustedOrigin)

  const getSession = getRuntimeSession
  const findMembership = async (userId: string, workspaceId: string) => {
    const [membership] = await database.select({
      userId: workspaceMembers.userId,
      workspaceId: workspaceMembers.workspaceId,
      role: workspaceMembers.role,
    }).from(workspaceMembers).where(and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.workspaceId, workspaceId),
    )).limit(1)
    return membership ?? null
  }

  return {
    database,
    projects,
    links,
    leads,
    e2eEnabled,
    trustedOrigin,
    shareOrigin,
    getSession,
    findMembership,
  }
}

export function createShareRouteDependencies(): ShareApiDependencies {
  const context = shared()
  if (context.e2eEnabled) {
    return {
      trustedOrigin: context.trustedOrigin,
      shareOrigin: context.shareOrigin,
      getSession: context.getSession,
      findMembership: context.findMembership,
      findProject: (authContext, projectId) => context.projects.findById(authContext, projectId),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      createSlug: createRandomShareSlug,
      leads: context.leads,
      links: context.links,
    }
  }
  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  return {
    trustedOrigin: context.trustedOrigin,
    shareOrigin: context.shareOrigin,
    getSession: context.getSession,
    findMembership: context.findMembership,
    findProject: (authContext, projectId) => context.projects.findById(authContext, projectId),
    admission: createRedisShareAdmissionGate(redis, {
      userRunsPerMinute: integer('SHARE_USER_RUNS_PER_MINUTE', 10, 1, 100),
      workspaceRunsPerMinute: integer('SHARE_WORKSPACE_RUNS_PER_MINUTE', 50, 1, 500),
    }),
    createSlug: createRandomShareSlug,
    leads: context.leads,
    links: context.links,
  }
}

export function createPublicShareRouteDependencies(): PublicShareDependencies {
  const database = getDatabase()
  const links = createShareLinkRepository(database)
  const leads = createLeadRepository(database)
  const appOrigin = required('APP_ORIGIN')
  const shareOrigin = validateShareOrigin(
    required('SHARE_ORIGIN'),
    appOrigin,
  )
  const assetOrigin = validateAssetOrigin(
    required('ASSET_ORIGIN'),
    appOrigin,
  )
  const e2eEnabled = isE2eRuntimeEnabled()
  const keyring = createRuntimeLeadKeyring()
  const common = {
    shareOrigin,
    assetOrigin,
    remoteImageHostAllowlist: required(
      'REMOTE_IMAGE_HOST_ALLOWLIST',
    ),
    createRequestId: () => randomUUID(),
    createLeadId: () => randomUUID(),
    now: () => new Date(),
    leadKeyring: keyring,
    leads: {
      resolvePublicBinding: (
        slug: string,
        pageRoute: string,
        formNodeId: string,
      ) => leads.resolvePublicBinding(
        slug,
        pageRoute,
        formNodeId,
      ),
      appendEncrypted: (input: Parameters<
        typeof leads.appendEncrypted
      >[0]) => leads.appendEncrypted(input),
    },
    links: {
      findPublicBySlug: (slug: string) => (
        links.findPublicBySlug(slug)
      ),
    },
  }
  if (e2eEnabled) {
    return {
      ...common,
      admission: {
        acquire: () => Promise.resolve({ accepted: true }),
      },
      leadAdmission: {
        acquire: () => Promise.resolve({ accepted: true }),
        release: () => Promise.resolve(),
      },
    }
  }

  redis ??= new IORedis(required('REDIS_URL'), {
    maxRetriesPerRequest: 1,
  })
  const admissionSecret = required('AUTH_SECRET')
  return {
    ...common,
    admission: createRedisPublicShareAdmissionGate(redis, {
      viewerViewsPerMinute: integer(
        'SHARE_VIEWER_VIEWS_PER_MINUTE',
        60,
        1,
        1_000,
      ),
      linkViewsPerMinute: integer(
        'SHARE_LINK_VIEWS_PER_MINUTE',
        600,
        1,
        10_000,
      ),
    }, admissionSecret),
    leadAdmission: createRedisLeadAdmissionGate(redis, {
      ipPublicationRunsPerWindow: integer(
        'LEAD_IP_PUBLICATION_RUNS_PER_WINDOW',
        10,
        1,
        1_000,
      ),
      ipPublicationWindowSeconds: integer(
        'LEAD_IP_PUBLICATION_WINDOW_SECONDS',
        600,
        1,
        86_400,
      ),
      publicationRunsPerWindow: integer(
        'LEAD_PUBLICATION_RUNS_PER_WINDOW',
        1_000,
        1,
        100_000,
      ),
      publicationWindowSeconds: integer(
        'LEAD_PUBLICATION_WINDOW_SECONDS',
        600,
        1,
        86_400,
      ),
    }, {
      digest: (purpose, value) => createHmac(
        'sha256',
        admissionSecret,
      ).update(`${purpose}\0${value}`).digest('hex'),
    }),
  }
}
