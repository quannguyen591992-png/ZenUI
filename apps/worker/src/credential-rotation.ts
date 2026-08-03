import { operatorResultSchema, type OperatorResult } from '@zenui/operations-core'

import type { EncryptedProviderCredential } from '@zenui/database'
import type { EncryptedCredential } from '@zenui/deployment-core/server'

interface CredentialRow {
  provider: 'vercel'
  workspaceId: string
  connectionId: string
  configurationId: string
  encryptedCredential: EncryptedProviderCredential
}

interface CredentialRepository {
  listCredentialsByKeyVersion(keyVersion: number, limit: number): Promise<CredentialRow[]>
  rotateCredential(connectionId: string, expectedKeyVersion: number, credential: EncryptedProviderCredential): Promise<boolean>
}

export async function rotateProviderCredentials(dependencies: {
  repository: CredentialRepository
  previousKeyVersion: number
  activeKeyVersion: number
  batchSize: number
  dryRun: boolean
  decrypt(envelope: EncryptedCredential, context: Omit<CredentialRow, 'encryptedCredential'>): string
  encrypt(secret: string, context: Omit<CredentialRow, 'encryptedCredential'>): EncryptedCredential
}): Promise<OperatorResult> {
  const valid = Number.isInteger(dependencies.previousKeyVersion)
    && Number.isInteger(dependencies.activeKeyVersion)
    && dependencies.previousKeyVersion > 0
    && dependencies.activeKeyVersion > 0
    && dependencies.previousKeyVersion !== dependencies.activeKeyVersion
    && Number.isInteger(dependencies.batchSize)
    && dependencies.batchSize >= 1
    && dependencies.batchSize <= 500
  if (!valid) throw new Error('invalid_rotation_input')
  const rows = await dependencies.repository.listCredentialsByKeyVersion(
    dependencies.previousKeyVersion,
    dependencies.batchSize,
  )
  let changed = 0
  let failed = 0
  if (!dependencies.dryRun) {
    for (const row of rows) {
      const context = {
        provider: row.provider,
        workspaceId: row.workspaceId,
        connectionId: row.connectionId,
        configurationId: row.configurationId,
      }
      try {
        const plaintext = dependencies.decrypt(row.encryptedCredential, context)
        const rotated = dependencies.encrypt(plaintext, context)
        const accepted = await dependencies.repository.rotateCredential(
          row.connectionId,
          dependencies.previousKeyVersion,
          rotated,
        )
        if (accepted) changed += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
  }
  return operatorResultSchema.parse({
    operation: 'credential_rotation',
    outcome: failed > 0 ? 'failed' : 'completed',
    scanned: rows.length,
    changed,
    failed,
  })
}
