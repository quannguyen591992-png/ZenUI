import { describe, expect, it } from 'vitest'

import {
  createE2eSessionToken,
  E2E_IDENTITIES,
  isE2eRuntimeEnabled,
  isGuardedIdentityRuntimeEnabled,
  isLocalAuthRuntimeEnabled,
  readE2eRuntimeCounters,
  recordE2eDirectionProviderCall,
  resetE2eRuntimeCounters,
  resolveRuntimeMode,
  verifyE2eSessionToken,
} from '../lib/server/e2e-runtime'

describe('guarded E2E runtime', () => {
  it('cannot be enabled in production', () => {
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'production', ZENUI_E2E_ENABLED: 'true' })).toBe(false)
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'false' })).toBe(false)
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'true' })).toBe(true)
  })

  it('separates guarded local auth from deterministic E2E infrastructure', () => {
    expect(resolveRuntimeMode({ NODE_ENV: 'development', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe('local')
    expect(resolveRuntimeMode({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'true' })).toBe('e2e')
    expect(resolveRuntimeMode({ NODE_ENV: 'production', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe('production')
    expect(isLocalAuthRuntimeEnabled({ NODE_ENV: 'development', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe(true)
    expect(isLocalAuthRuntimeEnabled({ NODE_ENV: 'production', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe(false)
    expect(isGuardedIdentityRuntimeEnabled({ NODE_ENV: 'development', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe(true)
    expect(isGuardedIdentityRuntimeEnabled({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'true' })).toBe(true)
    expect(isGuardedIdentityRuntimeEnabled({ NODE_ENV: 'production', ZENUI_LOCAL_AUTH_ENABLED: 'true' })).toBe(false)
  })

  it('rejects ambiguous non-production runtime configuration', () => {
    expect(() => resolveRuntimeMode({
      NODE_ENV: 'development',
      ZENUI_E2E_ENABLED: 'true',
      ZENUI_LOCAL_AUTH_ENABLED: 'true',
    })).toThrow('runtime_mode_conflict')
  })

  it('keeps deterministic provider counters behind the E2E guard', () => {
    const previous = process.env
    try {
      process.env = {
        ...previous,
        NODE_ENV: 'test',
        ZENUI_E2E_ENABLED: 'true',
        ZENUI_LOCAL_AUTH_ENABLED: 'false',
      }
      resetE2eRuntimeCounters()
      recordE2eDirectionProviderCall()
      expect(readE2eRuntimeCounters()).toEqual({
        directionProviderCalls: 1,
      })
      resetE2eRuntimeCounters()
      expect(readE2eRuntimeCounters()).toEqual({
        directionProviderCalls: 0,
      })
    } finally {
      process.env = previous
    }
  })

  it('signs allowlisted identities and rejects forged or expired tokens', () => {
    const secret = 'test-secret-at-least-32-characters-long'
    const token = createE2eSessionToken('owner', secret, 2_000)

    expect(verifyE2eSessionToken(token, secret, 1_000)).toEqual(E2E_IDENTITIES.owner)
    expect(verifyE2eSessionToken(`${token}forged`, secret, 1_000)).toBeNull()
    expect(verifyE2eSessionToken(token, secret, 3_000)).toBeNull()
    expect(() => createE2eSessionToken('unknown' as 'owner', secret, 2_000)).toThrow('invalid_e2e_identity')
  })
})
