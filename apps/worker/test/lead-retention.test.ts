import { describe, expect, it, vi } from 'vitest'

import { startLeadRetentionMaintenance } from '../src/lead-retention.js'

describe('lead retention maintenance', () => {
  it('purges one bounded batch using the maintenance timestamp', async () => {
    const now = new Date('2026-08-13T10:00:00.000Z')
    const purgeExpired = vi.fn().mockResolvedValue({
      scanned: 100,
      deleted: 100,
    })
    let scheduled: (() => void) | undefined
    const clearInterval = vi.fn()
    const timer = { unref: vi.fn() }

    const maintenance = startLeadRetentionMaintenance({
      repository: { purgeExpired },
      policy: { intervalSeconds: 3_600, batchSize: 100 },
      now: () => now,
      timers: {
        setInterval(callback, milliseconds) {
          expect(milliseconds).toBe(3_600_000)
          scheduled = callback
          return timer
        },
        clearInterval,
      },
      onFailure: vi.fn(),
    })

    expect(timer.unref).toHaveBeenCalledTimes(1)
    scheduled?.()
    await maintenance.whenIdle()
    expect(purgeExpired).toHaveBeenCalledWith({
      now,
      batchSize: 100,
    })

    maintenance.close()
    expect(clearInterval).toHaveBeenCalledWith(timer)
  })

  it('does not overlap sweeps and reports only a safe failure signal', async () => {
    let rejectPurge: ((error: Error) => void) | undefined
    const purgeExpired = vi.fn().mockImplementation(() => (
      new Promise((_, reject) => { rejectPurge = reject })
    ))
    let scheduled: (() => void) | undefined
    const onFailure = vi.fn()
    const maintenance = startLeadRetentionMaintenance({
      repository: { purgeExpired },
      policy: { intervalSeconds: 60, batchSize: 1 },
      timers: {
        setInterval(callback) {
          scheduled = callback
          return { unref: vi.fn() }
        },
        clearInterval: vi.fn(),
      },
      onFailure,
    })

    scheduled?.()
    scheduled?.()
    expect(purgeExpired).toHaveBeenCalledTimes(1)
    rejectPurge?.(new Error('sensitive database detail'))
    await maintenance.whenIdle()
    expect(onFailure).toHaveBeenCalledWith()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })

  it('rejects unbounded retention policies', () => {
    expect(() => startLeadRetentionMaintenance({
      repository: { purgeExpired: vi.fn() },
      policy: { intervalSeconds: 59, batchSize: 501 },
      timers: {
        setInterval: vi.fn(),
        clearInterval: vi.fn(),
      },
      onFailure: vi.fn(),
    })).toThrow('invalid_lead_retention_policy')
  })
})
