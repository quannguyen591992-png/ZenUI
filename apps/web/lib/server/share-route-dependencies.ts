import { createShareLinkRepository, createProjectRepository, workspaceMembers } from '@zenui/database'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import {
  createRedisPublicShareAdmissionGate,
  createRedisShareAdmissionGate,
} from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { validateAssetOrigin } from './public-asset-api'
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

  return { database, projects, links, e2eEnabled, trustedOrigin, shareOrigin, getSession, findMembership }
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
    links: context.links,
  }
}

export function createPublicShareRouteDependencies(): PublicShareDependencies {
  const database = getDatabase()
  const links = createShareLinkRepository(database)
  const appOrigin = required('APP_ORIGIN')
  const shareOrigin = validateShareOrigin(required('SHARE_ORIGIN'), appOrigin)
  const assetOrigin = validateAssetOrigin(required('ASSET_ORIGIN'), appOrigin)
  if (isE2eRuntimeEnabled()) {
    return {
      shareOrigin,
      assetOrigin,
      remoteImageHostAllowlist: required('REMOTE_IMAGE_HOST_ALLOWLIST'),
      admission: { acquire: () => Promise.resolve({ accepted: true }) },
      links: { findPublicBySlug: slug => links.findPublicBySlug(slug) },
    }
  }
  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  return {
    shareOrigin,
    assetOrigin,
    remoteImageHostAllowlist: required('REMOTE_IMAGE_HOST_ALLOWLIST'),
    admission: createRedisPublicShareAdmissionGate(redis, {
      viewerViewsPerMinute: integer('SHARE_VIEWER_VIEWS_PER_MINUTE', 60, 1, 1000),
      linkViewsPerMinute: integer('SHARE_LINK_VIEWS_PER_MINUTE', 600, 1, 10_000),
    }, required('AUTH_SECRET')),
    links: { findPublicBySlug: slug => links.findPublicBySlug(slug) },
  }
}
