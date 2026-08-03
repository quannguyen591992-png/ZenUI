import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function parseBackupConfig(environment = process.env) {
  const databaseUrl = environment.DATABASE_URL
  const output = environment.BACKUP_OUTPUT
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  if (!output) throw new Error('BACKUP_OUTPUT is required')
  const target = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('DATABASE_URL must be PostgreSQL')
  if (!output.endsWith('.dump')) throw new Error('BACKUP_OUTPUT must end in .dump')
  return {
    databaseUrl,
    output: resolve(output),
    manifest: resolve(`${output}.sha256.json`),
  }
}

function run(command, args, environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: environment, shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`${command} failed`)))
  })
}

export async function createManifest(path, now = new Date()) {
  const content = await readFile(path)
  return {
    format: 'pg_dump_custom',
    file: basename(path),
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
    createdAt: now.toISOString(),
  }
}

export async function main(environment = process.env) {
  const config = parseBackupConfig(environment)
  await run(environment.PG_DUMP_BIN ?? 'pg_dump', [
    '--format=custom', '--no-owner', '--no-privileges', '--file', config.output, config.databaseUrl,
  ], environment)
  const manifest = await createManifest(config.output)
  await writeFile(config.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify({ operation: 'backup_restore', outcome: 'completed', scanned: 1, changed: 1, failed: 0 }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ operation: 'backup_restore', outcome: 'failed', scanned: 1, changed: 0, failed: 1 }))
    process.exitCode = 1
  })
}
