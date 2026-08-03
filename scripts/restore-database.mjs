import { createHash, timingSafeEqual } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function parseRestoreConfig(environment = process.env) {
  const databaseUrl = environment.RESTORE_DATABASE_URL
  const input = environment.RESTORE_INPUT
  const targetEnvironment = environment.RESTORE_TARGET_ENVIRONMENT
  if (!databaseUrl) throw new Error('RESTORE_DATABASE_URL is required')
  if (!input) throw new Error('RESTORE_INPUT is required')
  if (!targetEnvironment) throw new Error('RESTORE_TARGET_ENVIRONMENT is required')
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('RESTORE_DATABASE_URL must be PostgreSQL')
  if (targetEnvironment.trim().toLowerCase() === 'production') throw new Error('production restore is forbidden')
  if (!input.endsWith('.dump')) throw new Error('RESTORE_INPUT must end in .dump')
  return {
    databaseUrl,
    input: resolve(input),
    manifest: resolve(environment.RESTORE_MANIFEST ?? `${input}.sha256.json`),
    allowNonempty: environment.RESTORE_ALLOW_NONEMPTY === 'true',
  }
}

function run(command, args, environment, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      env: environment,
      shell: false,
    })
    let stdout = ''
    if (capture && child.stdout) child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise(stdout) : reject(new Error(`${command} failed`)))
  })
}

export async function verifyManifest(input, manifestPath) {
  const [content, manifestRaw] = await Promise.all([readFile(input), readFile(manifestPath, 'utf8')])
  const manifest = JSON.parse(manifestRaw)
  if (manifest?.format !== 'pg_dump_custom' || !/^[a-f0-9]{64}$/.test(manifest.sha256 ?? '')) {
    throw new Error('invalid_backup_manifest')
  }
  const actual = Buffer.from(createHash('sha256').update(content).digest('hex'))
  const expected = Buffer.from(manifest.sha256)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('backup_checksum_mismatch')
  return { bytes: content.byteLength }
}

export async function main(environment = process.env) {
  const config = parseRestoreConfig(environment)
  await verifyManifest(config.input, config.manifest)
  if (!config.allowNonempty) {
    const count = await run(environment.PSQL_BIN ?? 'psql', [
      config.databaseUrl, '--tuples-only', '--no-align', '--command',
      "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');",
    ], environment, true)
    if (Number(String(count).trim()) !== 0) throw new Error('restore_target_not_empty')
  }
  await run(environment.PG_RESTORE_BIN ?? 'pg_restore', [
    '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', config.databaseUrl, config.input,
  ], environment)
  console.log(JSON.stringify({ operation: 'backup_restore', outcome: 'completed', scanned: 1, changed: 1, failed: 0 }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ operation: 'backup_restore', outcome: 'failed', scanned: 1, changed: 0, failed: 1 }))
    process.exitCode = 1
  })
}
