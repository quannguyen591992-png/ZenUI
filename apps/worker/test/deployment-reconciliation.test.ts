import { VercelProviderError } from '@zenui/deployment-core/server'
import { describe, expect, it, vi } from 'vitest'

import { createDeploymentReconciler } from '../src/deployment-reconciliation.js'

const job = {
  deploymentId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
}
const connection = {
  id: '55555555-5555-4555-8555-555555555555',
  workspaceId: job.workspaceId,
  configurationId: 'icfg_test',
  teamId: 'team_test',
  encryptedCredential: { ciphertext: 'cipher', iv: 'iv', authTag: 'tag', keyVersion: 1 },
}

function repository(input: Record<string, unknown>) {
  return {
    getReconciliationInput: vi.fn().mockResolvedValue({
      id: job.deploymentId,
      projectId: job.projectId,
      workspaceId: job.workspaceId,
      status: 'building',
      providerProjectName: 'zenui-12345678',
      providerDeploymentId: 'dpl_test',
      connection,
      ...input,
    }),
    attachProviderDeployment: vi.fn().mockResolvedValue({ status: 'building' }),
    completeReady: vi.fn().mockResolvedValue({ status: 'ready' }),
    fail: vi.fn().mockResolvedValue({ status: 'failed' }),
  }
}

describe('deployment reconciliation', () => {
  it('polls an attached provider deployment without creating a new deployment', async () => {
    const repo = repository({})
    const provider = {
      getDeployment: vi.fn().mockResolvedValue({ state: 'ready', url: 'https://zenui-test.vercel.app' }),
      findDeploymentByCorrelation: vi.fn(),
    }
    const reconcile = createDeploymentReconciler({
      repository: repo,
      provider,
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })

    await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'completed' })
    expect(provider.getDeployment).toHaveBeenCalledWith('token', 'dpl_test', 'team_test')
    expect(repo.completeReady).toHaveBeenCalledWith(expect.any(Object), job.deploymentId, 'https://zenui-test.vercel.app')
    expect(provider).not.toHaveProperty('createDeployment')
  })

  it('attaches exactly one correlated ambiguous outcome and requires manual review otherwise', async () => {
    const discovered = repository({ status: 'failed', errorCode: 'provider_outcome_unknown', providerProjectName: null, providerDeploymentId: null })
    const provider = {
      getDeployment: vi.fn(),
      findDeploymentByCorrelation: vi.fn().mockResolvedValue({
        match: 'one', deployment: { providerDeploymentId: 'dpl_discovered', state: 'building' },
      }),
    }
    const reconcile = createDeploymentReconciler({
      repository: discovered,
      provider,
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'attached' })
    expect(discovered.attachProviderDeployment).toHaveBeenCalledWith(expect.any(Object), job.deploymentId, {
      providerProjectName: 'zenui-12345678', providerDeploymentId: 'dpl_discovered',
    })
    expect(provider).not.toHaveProperty('createDeployment')

    for (const match of ['none', 'multiple'] as const) {
      provider.findDeploymentByCorrelation.mockResolvedValueOnce({ match })
      await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'manual_review' })
    }
  })

  it('maps provider and credential failures to safe outcomes', async () => {
    const repo = repository({})
    const reconcile = createDeploymentReconciler({
      repository: repo,
      provider: {
        getDeployment: vi.fn().mockRejectedValue(new Error('provider-secret')),
        findDeploymentByCorrelation: vi.fn(),
        },
      decryptCredential: vi.fn().mockImplementation(() => { throw new Error('cipher-secret') }),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'failed' })
    expect(repo.fail).toHaveBeenCalledWith(expect.any(Object), job.deploymentId, 'provider_auth')

    const providerFailure = createDeploymentReconciler({
      repository: repo,
      provider: {
        getDeployment: vi.fn().mockRejectedValue(new Error('provider-secret')),
        findDeploymentByCorrelation: vi.fn(),
        },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(providerFailure({ data: job })).resolves.toEqual({ outcome: 'manual_review' })
    expect(providerFailure).not.toHaveProperty('provider-secret')
  })

  it('rejects malformed and missing jobs and noops non-ambiguous records', async () => {
    const repo = repository({ status: 'ready', providerDeploymentId: null })
    const reconcile = createDeploymentReconciler({
      repository: repo,
      provider: { getDeployment: vi.fn(), findDeploymentByCorrelation: vi.fn() },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })

    await expect(reconcile({ data: { ...job, deploymentId: 'invalid' } })).rejects.toThrow('invalid_deployment_job')
    repo.getReconciliationInput.mockResolvedValueOnce(null)
    await expect(reconcile({ data: job })).rejects.toThrow('deployment_not_found')
    repo.getReconciliationInput.mockResolvedValueOnce({
      id: job.deploymentId, projectId: 'different', workspaceId: job.workspaceId,
      status: 'ready', providerProjectName: null, providerDeploymentId: null, connection,
    })
    await expect(reconcile({ data: job })).rejects.toThrow('deployment_not_found')
    await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'noop' })
  })

  it('maps attached building, failed, ready and provider-auth states', async () => {
    const cases = [
      { state: { state: 'building' as const }, outcome: 'noop' },
      { state: { state: 'failed' as const }, outcome: 'failed' },
    ]
    for (const item of cases) {
      const repo = repository({})
      const reconcile = createDeploymentReconciler({
        repository: repo,
        provider: { getDeployment: vi.fn().mockResolvedValue(item.state), findDeploymentByCorrelation: vi.fn() },
        decryptCredential: vi.fn().mockReturnValue('token'),
        deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
      })
      await expect(reconcile({ data: job })).resolves.toEqual({ outcome: item.outcome })
    }

    const readyRepo = repository({ status: 'failed', errorCode: 'provider_outcome_unknown', providerProjectName: null, providerDeploymentId: null })
    const ready = createDeploymentReconciler({
      repository: readyRepo,
      provider: {
        getDeployment: vi.fn(),
        findDeploymentByCorrelation: vi.fn().mockResolvedValue({
          match: 'one', deployment: { providerDeploymentId: 'dpl_ready', state: 'ready', url: 'https://zenui-test.vercel.app' },
        }),
      },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(ready({ data: job })).resolves.toEqual({ outcome: 'completed' })
    expect(readyRepo.completeReady).toHaveBeenCalled()

    const failedRepo = repository({ status: 'failed', errorCode: 'provider_outcome_unknown', providerDeploymentId: null })
    const failed = createDeploymentReconciler({
      repository: failedRepo,
      provider: {
        getDeployment: vi.fn(),
        findDeploymentByCorrelation: vi.fn().mockResolvedValue({
          match: 'one', deployment: { providerDeploymentId: 'dpl_failed', state: 'failed' },
        }),
      },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(failed({ data: job })).resolves.toEqual({ outcome: 'failed' })

    const authRepo = repository({})
    const auth = createDeploymentReconciler({
      repository: authRepo,
      provider: {
        getDeployment: vi.fn().mockRejectedValue(new VercelProviderError('provider_auth')),
        findDeploymentByCorrelation: vi.fn(),
      },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(auth({ data: job })).resolves.toEqual({ outcome: 'failed' })
    expect(authRepo.fail).toHaveBeenCalledWith(expect.any(Object), job.deploymentId, 'provider_auth')
  })

  it('requires a successful attachment before completing correlation recovery', async () => {
    const repo = repository({ status: 'failed', errorCode: 'provider_outcome_unknown', providerDeploymentId: null })
    repo.attachProviderDeployment.mockResolvedValue(null)
    const reconcile = createDeploymentReconciler({
      repository: repo,
      provider: {
        getDeployment: vi.fn(),
        findDeploymentByCorrelation: vi.fn().mockResolvedValue({
          match: 'one', deployment: { providerDeploymentId: 'dpl_discovered', state: 'building' },
        }),
      },
      decryptCredential: vi.fn().mockReturnValue('token'),
      deriveProjectName: vi.fn().mockReturnValue('zenui-12345678'),
    })
    await expect(reconcile({ data: job })).resolves.toEqual({ outcome: 'manual_review' })
  })
})
