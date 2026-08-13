import { createHmac } from 'node:crypto'

import { createLeadKeyring } from '@zenui/lead-core/server'

import { resolveRuntimeMode } from './e2e-runtime'

type LeadKeyringEnvironment = {
  NODE_ENV?: string
  ZENUI_E2E_ENABLED?: string
  ZENUI_LOCAL_AUTH_ENABLED?: string
  AUTH_SECRET?: string
  LEAD_ENCRYPTION_KEYS?: string
  LEAD_ENCRYPTION_ACTIVE_KEY_VERSION?: string
}

function required(
  environment: LeadKeyringEnvironment,
  name: keyof LeadKeyringEnvironment,
): string {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function activeKeyVersion(
  environment: LeadKeyringEnvironment,
): number {
  const value = required(
    environment,
    'LEAD_ENCRYPTION_ACTIVE_KEY_VERSION',
  )
  const parsed = Number(value)
  if (
    !Number.isInteger(parsed)
    || parsed < 1
    || parsed > 1_000_000
  ) {
    throw new Error(
      'LEAD_ENCRYPTION_ACTIVE_KEY_VERSION is invalid',
    )
  }
  return parsed
}

function configuredKeyring(
  environment: LeadKeyringEnvironment,
) {
  let keys: unknown
  try {
    keys = JSON.parse(required(
      environment,
      'LEAD_ENCRYPTION_KEYS',
    ))
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'LEAD_ENCRYPTION_KEYS is required'
    ) throw error
    throw new Error('LEAD_ENCRYPTION_KEYS is invalid')
  }
  if (
    !keys
    || typeof keys !== 'object'
    || Array.isArray(keys)
    || Object.values(keys).some(
      value => typeof value !== 'string',
    )
  ) {
    throw new Error('LEAD_ENCRYPTION_KEYS is invalid')
  }

  return createLeadKeyring({
    activeKeyVersion: activeKeyVersion(environment),
    keys: keys as Record<number, string>,
  })
}

export function createRuntimeLeadKeyring(
  environment: LeadKeyringEnvironment = process.env,
) {
  const mode = resolveRuntimeMode(environment)
  if (mode === 'e2e') {
    return createLeadKeyring({
      activeKeyVersion: 1,
      keys: { 1: Buffer.alloc(32, 9).toString('base64') },
    })
  }
  if (mode === 'local') {
    const key = createHmac(
      'sha256',
      required(environment, 'AUTH_SECRET'),
    ).update('zenui-local-lead-encryption-v1').digest('base64')
    return createLeadKeyring({
      activeKeyVersion: 1,
      keys: { 1: key },
    })
  }
  return configuredKeyring(environment)
}
