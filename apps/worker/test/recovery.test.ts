import { describe, expect, it, vi } from 'vitest'

import { createRecoverySweep } from '../src/recovery.js'

const actions = [
  {
    kind: 'asset' as const,
    action: 'enqueue' as const,
    id: '99999999-9999-4999-8999-999999999999',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
  {
    kind: 'generation' as const,
    action: 'enqueue' as const,
    id: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
  {
    kind: 'export' as const,
    action: 'enqueue' as const,
    id: '55555555-5555-4555-8555-555555555555',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
  {
    kind: 'deployment' as const,
    action: 'enqueue' as const,
    id: '66666666-6666-4666-8666-666666666666',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
  {
    kind: 'deployment' as const,
    action: 'reconcile' as const,
    id: '77777777-7777-4777-8777-777777777777',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
  {
    kind: 'generation' as const,
    action: 'failed' as const,
    id: '88888888-8888-4888-8888-888888888888',
    projectId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
    userId: '44444444-4444-4444-8444-444444444444',
  },
]

describe('queue recovery sweep', () => {
  it('re-enqueues metadata-only safe actions and counts reconciliation separately', async () => {
    const asset = vi.fn().mockResolvedValue(undefined)
    const generation = vi.fn().mockResolvedValue(undefined)
    const exportQueue = vi.fn().mockResolvedValue(undefined)
    const deployment = vi.fn().mockResolvedValue(undefined)
    const reconcile = vi.fn().mockResolvedValue(undefined)
    const now = new Date('2026-07-23T12:00:00.000Z')
    const sweep = createRecoverySweep({
      repository: { recover: vi.fn().mockResolvedValue(actions) },
      queues: {
        asset: { enqueue: asset },
        generation: { enqueue: generation },
        export: { enqueue: exportQueue },
        deployment: { enqueue: deployment },
        reconciliation: { enqueue: reconcile },
      },
      policy: { intervalSeconds: 30, staleQueuedSeconds: 60, batchSize: 50, maxAttempts: 3 },
      now: () => now,
    })

    await expect(sweep()).resolves.toEqual({ scanned: 6, enqueued: 5, failed: 1 })
    expect(asset).toHaveBeenCalledWith({
      assetId: actions[0]!.id,
      projectId: actions[0]!.projectId,
      workspaceId: actions[0]!.workspaceId,
      userId: actions[0]!.userId,
    })
    expect(generation).toHaveBeenCalledWith({
      generationRunId: actions[1]!.id,
      projectId: actions[1]!.projectId,
      workspaceId: actions[1]!.workspaceId,
      userId: actions[1]!.userId,
    })
    expect(exportQueue).toHaveBeenCalledWith(expect.not.objectContaining({ document: expect.anything() }))
    expect(deployment).toHaveBeenCalledWith(expect.not.objectContaining({ revisionId: expect.anything() }))
    expect(reconcile).toHaveBeenCalledWith({
      deploymentId: actions[4]!.id,
      projectId: actions[4]!.projectId,
      workspaceId: actions[4]!.workspaceId,
      userId: actions[4]!.userId,
    })
  })

  it('continues after one queue enqueue fails and validates bounded policy', async () => {
    const sweep = createRecoverySweep({
      repository: { recover: vi.fn().mockResolvedValue(actions.slice(0, 2)) },
      queues: {
        asset: { enqueue: vi.fn() },
        generation: { enqueue: vi.fn().mockRejectedValue(new Error('redis-secret')) },
        export: { enqueue: vi.fn().mockResolvedValue(undefined) },
        deployment: { enqueue: vi.fn() },
        reconciliation: { enqueue: vi.fn() },
      },
      policy: { intervalSeconds: 30, staleQueuedSeconds: 60, batchSize: 50, maxAttempts: 3 },
    })
    await expect(sweep()).resolves.toEqual({ scanned: 2, enqueued: 1, failed: 1 })

    expect(() => createRecoverySweep({
      repository: { recover: vi.fn() },
      queues: {
        asset: { enqueue: vi.fn() }, generation: { enqueue: vi.fn() }, export: { enqueue: vi.fn() },
        deployment: { enqueue: vi.fn() }, reconciliation: { enqueue: vi.fn() },
      },
      policy: { intervalSeconds: 0, staleQueuedSeconds: 1, batchSize: 0, maxAttempts: 0 },
    })).toThrow('invalid_recovery_policy')
  })
})
