import {
  providerAuthorizeRequestSchema,
  providerConnectionPublicSchema,
  providerDisconnectRequestSchema,
} from '@zenui/deployment-core'
import { z } from 'zod'

import { ApiError, errorResponse, parseJsonBody, successResponse } from './api'
import { hasWorkspacePermission, type WorkspaceMembership } from './authorization'

import type {
  AuthContext,
  EncryptedProviderCredential,
  ProviderConnectionInternalRecord,
  ProviderConnectionRecord,
} from '@zenui/database'

interface StateRecord { userId: string; workspaceId: string; returnPath: string }

export interface ProviderConnectionDependencies {
  trustedOrigin: string
  installOrigin: string
  integrationSlug: string
  getSession(): Promise<{ userId: string } | null>
  findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>
  states: {
    create(record: StateRecord): Promise<string>
    consume(state: string): Promise<StateRecord | null>
  }
  oauth: {
    exchangeCode(code: string): Promise<{ accessToken: string; teamId: string | null }>
    getConfiguration(accessToken: string, configurationId: string, teamId: string | null): Promise<{
      id: string
      teamId: string | null
      status: string
      scopes: string[]
    }>
    disconnect(accessToken: string, configurationId: string, teamId: string | null): Promise<void>
  }
  cipher: {
    encrypt(secret: string, context: {
      provider: 'vercel'
      workspaceId: string
      connectionId: string
      configurationId: string
    }): EncryptedProviderCredential
  }
  decryptCredential(connection: ProviderConnectionInternalRecord): string
  connections: {
    reserveId(): string
    connect(context: AuthContext, input: {
      id: string
      provider: 'vercel'
      configurationId: string
      teamId: string | null
      scopes: string[]
      encryptedCredential: EncryptedProviderCredential
    }): Promise<ProviderConnectionRecord>
    findPublic(context: AuthContext, provider: 'vercel'): Promise<ProviderConnectionRecord | null>
    getInternal(context: AuthContext, id: string): Promise<ProviderConnectionInternalRecord | null>
    disconnect(context: AuthContext, id: string): Promise<ProviderConnectionRecord | null>
  }
}

const callbackSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code: z.string().min(1).max(500),
  configurationId: z.string().min(1).max(200),
  teamId: z.string().min(1).max(200).nullable(),
  source: z.literal('external'),
}).strict()

const requiredScopes = new Set(['read-write:deployment', 'read-write:integration-configuration', 'read-write:project'])

function trustedOrigin(request: Request, expected: string): void {
  const origin = request.headers.get('origin')
  let normalized: string
  try { normalized = new URL(expected).origin } catch { throw new ApiError('server_misconfigured', 'An unexpected error occurred', 500) }
  if (!origin || origin === 'null') throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  try {
    if (new URL(origin).origin !== normalized) throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('invalid_origin', 'Request origin is not allowed', 403)
  }
}

async function authorize(deps: ProviderConnectionDependencies, workspaceId: string): Promise<AuthContext> {
  const session = await deps.getSession()
  if (!session) throw new ApiError('unauthorized', 'Authentication required', 401)
  const membership = await deps.findMembership(session.userId, workspaceId)
  if (!membership) throw new ApiError('not_found', 'Resource not found', 404)
  if (!hasWorkspacePermission(membership.role, 'manageProject')) throw new ApiError('forbidden', 'Forbidden', 403)
  return { userId: session.userId, workspaceId }
}

function workspaceFrom(request: Request): string {
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get('workspaceId'))
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
  return parsed.data
}

function safeConnection(connection: ProviderConnectionRecord) {
  return providerConnectionPublicSchema.parse({
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    connectedAt: connection.connectedAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  })
}

function callbackInput(request: Request) {
  const search = new URL(request.url).searchParams
  const parsed = callbackSchema.safeParse({
    state: search.get('state'),
    code: search.get('code'),
    configurationId: search.get('configurationId'),
    teamId: search.get('teamId'),
    source: search.get('source'),
  })
  if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
  return parsed.data
}

function callbackHeaders(): HeadersInit {
  return {
    'cache-control': 'no-store',
    'cross-origin-opener-policy': 'unsafe-none',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  }
}

export function createProviderConnectionHandlers(deps: ProviderConnectionDependencies) {
  return {
    async GET(request: Request) {
      try {
        const context = await authorize(deps, workspaceFrom(request))
        const connection = await deps.connections.findPublic(context, 'vercel')
        return successResponse(connection ? safeConnection(connection) : null, { headers: { 'cache-control': 'private, no-store' } })
      } catch (error) { return errorResponse(error) }
    },

    async AUTHORIZE(request: Request) {
      try {
        trustedOrigin(request, deps.trustedOrigin)
        const parsed = providerAuthorizeRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success) throw new ApiError('validation_error', 'Request validation failed', 422)
        const context = await authorize(deps, parsed.data.workspaceId)
        const state = await deps.states.create({ ...context, returnPath: parsed.data.returnPath })
        const install = deps.integrationSlug === 'zenui-e2e'
          ? new URL('/api/e2e/provider-connect', deps.installOrigin)
          : new URL(`/integrations/${encodeURIComponent(deps.integrationSlug)}/new`, deps.installOrigin)
        install.searchParams.set('state', state)
        return successResponse({ url: install.toString() }, { headers: { 'cache-control': 'no-store' } })
      } catch (error) { return errorResponse(error) }
    },

    async CALLBACK(request: Request) {
      try {
        const input = callbackInput(request)
        const state = await deps.states.consume(input.state)
        if (!state) throw new ApiError('invalid_oauth_state', 'Connection could not be verified', 403)
        const context = await authorize(deps, state.workspaceId)
        if (context.userId !== state.userId) throw new ApiError('invalid_oauth_state', 'Connection could not be verified', 403)
        const exchanged = await deps.oauth.exchangeCode(input.code)
        const teamId = input.teamId ?? exchanged.teamId
        if (input.teamId && exchanged.teamId && input.teamId !== exchanged.teamId) {
          throw new ApiError('invalid_provider_configuration', 'Provider configuration could not be verified', 403)
        }
        const configuration = await deps.oauth.getConfiguration(exchanged.accessToken, input.configurationId, teamId)
        if (configuration.id !== input.configurationId || configuration.status !== 'ready') {
          throw new ApiError('invalid_provider_configuration', 'Provider configuration could not be verified', 403)
        }
        if ((configuration.teamId ?? null) !== (teamId ?? null) || ![...requiredScopes].every(scope => configuration.scopes.includes(scope))) {
          throw new ApiError('provider_scope_insufficient', 'Provider permissions are insufficient', 403)
        }
        const existing = await deps.connections.findPublic(context, 'vercel')
        const connectionId = existing?.id ?? deps.connections.reserveId()
        const encryptedCredential = deps.cipher.encrypt(exchanged.accessToken, {
          provider: 'vercel', workspaceId: context.workspaceId, connectionId, configurationId: input.configurationId,
        })
        await deps.connections.connect(context, {
          id: connectionId,
          provider: 'vercel',
          configurationId: input.configurationId,
          teamId,
          scopes: configuration.scopes,
          encryptedCredential,
        })
        return new Response(null, {
          status: 303,
          headers: {
            ...callbackHeaders(),
            location: `${new URL(deps.trustedOrigin).origin}${state.returnPath}?provider=connected`,
          },
        })
      } catch (error) {
        const response = errorResponse(error)
        for (const [name, value] of Object.entries(callbackHeaders())) response.headers.set(name, String(value))
        return response
      }
    },

    async DELETE(request: Request) {
      try {
        trustedOrigin(request, deps.trustedOrigin)
        const parsed = providerDisconnectRequestSchema.safeParse(await parseJsonBody(request))
        if (!parsed.success || parsed.data.workspaceId !== workspaceFrom(request)) {
          throw new ApiError('validation_error', 'Request validation failed', 422)
        }
        const context = await authorize(deps, parsed.data.workspaceId)
        const visible = await deps.connections.findPublic(context, 'vercel')
        if (!visible) throw new ApiError('not_found', 'Resource not found', 404)
        const internal = await deps.connections.getInternal(context, visible.id)
        if (!internal) throw new ApiError('not_found', 'Resource not found', 404)
        if (internal.status !== 'disconnected' && internal.encryptedCredential) {
          const token = deps.decryptCredential(internal)
          try {
            await deps.oauth.disconnect(token, internal.configurationId, internal.teamId)
          } catch {
            throw new ApiError('provider_unavailable', 'Provider is temporarily unavailable', 503)
          }
        }
        const disconnected = await deps.connections.disconnect(context, internal.id)
        if (!disconnected) throw new ApiError('not_found', 'Resource not found', 404)
        return successResponse(safeConnection(disconnected), { headers: { 'cache-control': 'no-store' } })
      } catch (error) { return errorResponse(error) }
    },
  }
}
