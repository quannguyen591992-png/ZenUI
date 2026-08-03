import { startWorker } from './runtime.js'

process.loadEnvFile('../../.env')

const runtime = startWorker()

const shutdown = (): void => {
  void runtime.close().then(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
