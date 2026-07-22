import { describe, expect, it } from 'vitest'

import {
  createE2eSessionToken,
  E2E_IDENTITIES,
  isE2eRuntimeEnabled,
  verifyE2eSessionToken,
} from '../lib/server/e2e-runtime'

describe('guarded E2E runtime', () => {
  it('cannot be enabled in production', () => {
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'production', ZENUI_E2E_ENABLED: 'true' })).toBe(false)
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'false' })).toBe(false)
    expect(isE2eRuntimeEnabled({ NODE_ENV: 'test', ZENUI_E2E_ENABLED: 'true' })).toBe(true)
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
