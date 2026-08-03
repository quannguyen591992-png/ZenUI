import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { Pool } from 'pg'
import { pathToFileURL } from 'node:url'

export const LOCAL_IDENTITIES = {
  owner: {
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    email: 'owner@example.test',
  },
}

function required(environment, name) {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function parseLocalBootstrapConfig(environment = process.env) {
  if (environment.NODE_ENV === 'production' || environment.ZENUI_LOCAL_AUTH_ENABLED !== 'true') {
    throw new Error('local_bootstrap_disabled')
  }
  const databaseUrl = required(environment, 'DATABASE_URL')
  const endpoint = required(environment, 'S3_ENDPOINT')
  const region = required(environment, 'S3_REGION')
  const bucket = required(environment, 'S3_BUCKET')
  const accessKey = required(environment, 'S3_ACCESS_KEY')
  const secretKey = required(environment, 'S3_SECRET_KEY')
  return {
    databaseUrl,
    endpoint,
    region,
    bucket,
    accessKey,
    secretKey,
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === 'true',
    summary: { database: 'configured', objectStore: 'configured', bucket },
  }
}

function missingBucket(error) {
  return error && typeof error === 'object' && (
    error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404
  )
}

export async function bootstrapLocalRuntime(config, dependencies) {
  const owner = LOCAL_IDENTITIES.owner
  await dependencies.database.query(
    'INSERT INTO users (id, name, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email',
    [owner.userId, 'Local Owner', owner.email],
  )
  await dependencies.database.query(
    'INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name',
    [owner.workspaceId, 'Local Workspace', owner.userId],
  )
  await dependencies.database.query(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    [owner.workspaceId, owner.userId],
  )

  let bucketCreated = false
  try {
    await dependencies.objectStore.headBucket(config.bucket)
  } catch (error) {
    if (!missingBucket(error)) throw error
    await dependencies.objectStore.createBucket(config.bucket)
    bucketCreated = true
  }
  return { database: 'ready', objectStore: 'ready', bucketCreated }
}

async function main() {
  process.loadEnvFile('.env')
  const config = parseLocalBootstrapConfig()
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1 })
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  })
  try {
    const result = await bootstrapLocalRuntime(config, {
      database: pool,
      objectStore: {
        headBucket: bucket => s3.send(new HeadBucketCommand({ Bucket: bucket })),
        createBucket: bucket => s3.send(new CreateBucketCommand({ Bucket: bucket })),
      },
    })
    console.log(JSON.stringify({ event: 'local_bootstrap_complete', ...result }))
  } finally {
    await pool.end()
    s3.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ event: 'local_bootstrap_failed', code: 'bootstrap_error' }))
    process.exitCode = 1
  })
}
