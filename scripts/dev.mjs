import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

import { assertDevPortsAvailable, waitForDevReadiness } from './dev-runtime.mjs'

process.loadEnvFile('.env')
await assertDevPortsAvailable()

const instanceId = randomBytes(16).toString('hex')
const child = spawn('pnpm exec turbo run dev --parallel --env-mode=loose', {
  stdio: 'inherit',
  env: { ...process.env, ZENUI_WORKER_INSTANCE_ID: instanceId },
  shell: true,
})

let shuttingDown = false
const shutdown = signal => {
  if (shuttingDown) return
  shuttingDown = true
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', shell: false })
  } else if (!child.killed) {
    child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
child.once('error', () => { process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })

try {
  await waitForDevReadiness(instanceId)
  console.log('ZenUI dev topology ready: Web, Preview and generation Worker.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ZenUI dev topology failed to start.')
  shutdown('SIGTERM')
  process.exitCode = 1
}
