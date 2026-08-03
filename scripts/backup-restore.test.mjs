import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { createManifest, parseBackupConfig } from './backup-database.mjs'
import { parseRestoreConfig, verifyManifest } from './restore-database.mjs'

describe('database backup and restore guards', () => {
  it('requires explicit PostgreSQL dump paths without exposing credentials', () => {
    assert.throws(() => parseBackupConfig({}), /DATABASE_URL/)
    assert.throws(() => parseBackupConfig({ DATABASE_URL: 'https://example.test', BACKUP_OUTPUT: 'backup.dump' }), /PostgreSQL/)
    assert.throws(() => parseBackupConfig({ DATABASE_URL: 'postgresql://user:secret@db/zenui', BACKUP_OUTPUT: 'backup.sql' }), /\.dump/)
    const parsed = parseBackupConfig({ DATABASE_URL: 'postgresql://user:secret@db/zenui', BACKUP_OUTPUT: 'backup.dump' })
    assert.ok(parsed.output.endsWith('backup.dump'))
  })

  it('forbids production restores and non-dump inputs', () => {
    assert.throws(() => parseRestoreConfig({
      RESTORE_DATABASE_URL: 'postgresql://db/zenui', RESTORE_INPUT: 'backup.dump', RESTORE_TARGET_ENVIRONMENT: 'production',
    }), /forbidden/)
    assert.throws(() => parseRestoreConfig({
      RESTORE_DATABASE_URL: 'postgresql://db/zenui', RESTORE_INPUT: 'backup.sql', RESTORE_TARGET_ENVIRONMENT: 'test',
    }), /\.dump/)
  })

  it('writes and verifies a deterministic checksum manifest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'zenui-backup-'))
    const dump = join(directory, 'backup.dump')
    const manifestPath = `${dump}.sha256.json`
    await writeFile(dump, Buffer.from('custom-format-test-dump'))
    const manifest = await createManifest(dump, new Date('2026-07-23T00:00:00.000Z'))
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(await verifyManifest(dump, manifestPath), { bytes: 23 })
    await writeFile(dump, Buffer.from('tampered'))
    await assert.rejects(verifyManifest(dump, manifestPath), /checksum/)
  })
})
