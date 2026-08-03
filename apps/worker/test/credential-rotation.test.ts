import { describe, expect, it, vi } from 'vitest'

import { rotateProviderCredentials } from '../src/credential-rotation.js'

const context = {
  provider: 'vercel' as const,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  connectionId: '22222222-2222-4222-8222-222222222222',
  configurationId: 'icfg_test',
}

describe('provider credential rotation', () => {
  it('rotates by exact key version without exposing credential values', async () => {
    const repository = {
      listCredentialsByKeyVersion: vi.fn().mockResolvedValue([{
        ...context,
        encryptedCredential: { ciphertext: 'old', iv: 'iv', authTag: 'tag', keyVersion: 1 },
      }]),
      rotateCredential: vi.fn().mockResolvedValue(true),
    }
    const decrypt = vi.fn().mockReturnValue('provider-token-secret')
    const encrypt = vi.fn().mockReturnValue({ ciphertext: 'new', iv: 'new-iv', authTag: 'new-tag', keyVersion: 2 })

    await expect(rotateProviderCredentials({
      repository,
      previousKeyVersion: 1,
      activeKeyVersion: 2,
      batchSize: 50,
      dryRun: false,
      decrypt,
      encrypt,
    })).resolves.toEqual({ operation: 'credential_rotation', outcome: 'completed', scanned: 1, changed: 1, failed: 0 })
    expect(repository.rotateCredential).toHaveBeenCalledWith(context.connectionId, 1, {
      ciphertext: 'new', iv: 'new-iv', authTag: 'new-tag', keyVersion: 2,
    })
    expect(JSON.stringify(repository.rotateCredential.mock.calls)).not.toContain('provider-token-secret')
  })

  it('supports count-only dry runs and safe failure counts', async () => {
    const rows = [{
      ...context,
      encryptedCredential: { ciphertext: 'old', iv: 'iv', authTag: 'tag', keyVersion: 1 },
    }]
    const repository = {
      listCredentialsByKeyVersion: vi.fn().mockResolvedValue(rows),
      rotateCredential: vi.fn().mockResolvedValue(false),
    }
    await expect(rotateProviderCredentials({
      repository,
      previousKeyVersion: 1,
      activeKeyVersion: 2,
      batchSize: 50,
      dryRun: true,
      decrypt: vi.fn(),
      encrypt: vi.fn(),
    })).resolves.toEqual({ operation: 'credential_rotation', outcome: 'completed', scanned: 1, changed: 0, failed: 0 })
    expect(repository.rotateCredential).not.toHaveBeenCalled()

    await expect(rotateProviderCredentials({
      repository,
      previousKeyVersion: 1,
      activeKeyVersion: 2,
      batchSize: 50,
      dryRun: false,
      decrypt: vi.fn().mockImplementation(() => { throw new Error('secret') }),
      encrypt: vi.fn(),
    })).resolves.toEqual({ operation: 'credential_rotation', outcome: 'failed', scanned: 1, changed: 0, failed: 1 })
  })
})
