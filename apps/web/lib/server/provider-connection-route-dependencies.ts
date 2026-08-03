import { randomUUID } from 'node:crypto'

import { createProviderConnectionRepository, workspaceMembers } from '@zenui/database'
import { createCredentialCipher, createVercelAdapter } from '@zenui/deployment-core/server'
import { and, eq } from 'drizzle-orm'
import IORedis from 'ioredis'

import { createRedisOAuthStateStore } from './ai-infrastructure'
import { getDatabase } from './database'
import { isE2eRuntimeEnabled } from './e2e-runtime'
import { getRuntimeSession } from './runtime-session'

import type { ProviderConnectionDependencies } from './provider-connection-api'

let redis: IORedis | undefined
const e2eStates = new Map<string, { userId: string; workspaceId: string; returnPath: string }>()

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

function e2eStateStore() {
  return {
    create(record: { userId: string; workspaceId: string; returnPath: string }): Promise<string> {
      const state = Buffer.from(`${crypto.randomUUID()}${crypto.randomUUID()}`).toString('base64url').slice(0, 43)
      e2eStates.set(state, record)
      return Promise.resolve(state)
    },
    consume(state: string) {
      const record = e2eStates.get(state) ?? null
      e2eStates.delete(state)
      return Promise.resolve(record)
    },
  }
}

export function createProviderConnectionRouteDependencies(): ProviderConnectionDependencies {
  const database = getDatabase()
  const repository = createProviderConnectionRepository(database)
  const e2eEnabled = isE2eRuntimeEnabled()
  const trustedOrigin = required('APP_ORIGIN')
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

  if (e2eEnabled) {
    const cipher = createCredentialCipher({ key: Buffer.alloc(32, 7).toString('base64'), keyVersion: 1 })
    const oauth = {
      exchangeCode: () => Promise.resolve({ accessToken: 'e2e-encrypted-provider-token', teamId: 'team_e2e' }),
      getConfiguration: (_token: string, configurationId: string) => Promise.resolve({
        id: configurationId,
        teamId: 'team_e2e',
        status: 'ready',
        scopes: ['deployment:read-write', 'integration-configuration:read-write'],
      }),
      disconnect: () => Promise.resolve(),
    }
    return {
      trustedOrigin,
      installOrigin: trustedOrigin,
      integrationSlug: 'zenui-e2e',
      getSession,
      findMembership,
      states: e2eStateStore(),
      oauth,
      cipher,
      connections: { reserveId: randomUUID, ...repository },
      decryptCredential: connection => cipher.decrypt(connection.encryptedCredential!, {
        provider: 'vercel', workspaceId: connection.workspaceId, connectionId: connection.id,
        configurationId: connection.configurationId,
      }),
    }
  }

  redis ??= new IORedis(required('REDIS_URL'), { maxRetriesPerRequest: 1 })
  const cipher = createCredentialCipher({
    key: required('PROVIDER_CREDENTIAL_ENCRYPTION_KEY'),
    keyVersion: integer('PROVIDER_CREDENTIAL_KEY_VERSION', 1, 1, 1_000_000),
  })
  const oauth = createVercelAdapter({
    clientId: required('VERCEL_CLIENT_ID'),
    clientSecret: required('VERCEL_CLIENT_SECRET'),
    redirectUri: required('VERCEL_REDIRECT_URI'),
    timeoutMs: integer('DEPLOY_PROVIDER_TIMEOUT_MS', 30_000, 1_000, 120_000),
  })
  return {
    trustedOrigin,
    installOrigin: 'https://vercel.com',
    integrationSlug: required('VERCEL_INTEGRATION_SLUG'),
    getSession,
    findMembership,
    states: createRedisOAuthStateStore(redis, required('AUTH_SECRET')),
    oauth,
    cipher,
    connections: { reserveId: randomUUID, ...repository },
    decryptCredential: connection => cipher.decrypt(connection.encryptedCredential!, {
      provider: 'vercel', workspaceId: connection.workspaceId, connectionId: connection.id,
      configurationId: connection.configurationId,
    }),
  }
}
