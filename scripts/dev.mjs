import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

import { assertDevPortsAvailable, assertVercelRedirectConfiguration, waitForDevReadiness } from './dev-runtime.mjs'

process.loadEnvFile('.env')
assertVercelRedirectConfiguration()
await assertDevPortsAvailable()

const instanceId = randomBytes(16).toString('hex')
const environment = { ...process.env, ZENUI_WORKER_INSTANCE_ID: instanceId }
const child = spawn('pnpm exec turbo run dev --parallel --env-mode=loose', {
  stdio: 'inherit',
  env: environment,
  shell: true,
})
const assetServer = spawn(process.execPath, ['scripts/asset-server.mjs'], {
  stdio: 'inherit',
  env: environment,
  shell: false,
})

let shuttingDown = false
const stopChild = (processToStop, signal) => {
  if (process.platform === 'win32' && processToStop.pid) {
    spawn('taskkill', ['/pid', String(processToStop.pid), '/t', '/f'], { stdio: 'ignore', shell: false })
  } else if (!processToStop.killed) {
    processToStop.kill(signal)
  }
}
const shutdown = signal => {
  if (shuttingDown) return
  shuttingDown = true
  stopChild(child, signal)
  stopChild(assetServer, signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
child.once('error', () => { process.exitCode = 1 })
child.once('exit', code => {
  process.exitCode = code ?? 1
  shutdown('SIGTERM')
})
assetServer.once('error', () => {
  process.exitCode = 1
  shutdown('SIGTERM')
})
assetServer.once('exit', code => {
  if (!shuttingDown) {
    process.exitCode = code ?? 1
    shutdown('SIGTERM')
  }
})

try {
  await waitForDevReadiness(instanceId)
  console.log('ZenUI dev topology ready: Web, Preview, Asset and generation Worker.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ZenUI dev topology failed to start.')
  shutdown('SIGTERM')
  process.exitCode = 1
}
