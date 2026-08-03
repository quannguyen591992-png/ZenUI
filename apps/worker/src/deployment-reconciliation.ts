import { deploymentJobSchema, type DeploymentErrorCode } from '@zenui/deployment-core'
import { VercelProviderError } from '@zenui/deployment-core/server'

import type { AuthContext, DeploymentRecord, ProviderConnectionInternalRecord } from '@zenui/database'

interface ReconciliationInput {
  id: string
  projectId: string
  workspaceId: string
  status: 'queued' | 'uploading' | 'building' | 'ready' | 'failed'
  errorCode?: DeploymentErrorCode | null
  providerProjectName: string | null
  providerDeploymentId: string | null
  connection: ProviderConnectionInternalRecord & {
    encryptedCredential: NonNullable<ProviderConnectionInternalRecord['encryptedCredential']>
  }
}

interface ReconciliationRepository {
  getReconciliationInput(context: AuthContext, deploymentId: string): Promise<ReconciliationInput | null>
  attachProviderDeployment(context: AuthContext, deploymentId: string, input: {
    providerProjectName: string
    providerDeploymentId: string
  }): Promise<DeploymentRecord | null>
  completeReady(context: AuthContext, deploymentId: string, url: string): Promise<DeploymentRecord | null>
  fail(context: AuthContext, deploymentId: string, code: DeploymentErrorCode): Promise<DeploymentRecord | null>
}

interface ReconciliationProvider {
  getDeployment(accessToken: string, providerDeploymentId: string, teamId: string | null): Promise<
    { state: 'building' } | { state: 'ready'; url: string } | { state: 'failed' }
  >
  findDeploymentByCorrelation(accessToken: string, input: {
    teamId: string | null
    projectName: string
    correlationId: string
  }): Promise<
    | { match: 'none' }
    | { match: 'multiple' }
    | { match: 'one'; deployment: { providerDeploymentId: string; state: 'building' | 'ready' | 'failed'; url?: string } }
  >
}

function safeProviderCode(error: unknown): DeploymentErrorCode {
  return error instanceof VercelProviderError ? error.code : 'provider_error'
}

export function createDeploymentReconciler(dependencies: {
  repository: ReconciliationRepository
  provider: ReconciliationProvider
  decryptCredential(connection: ReconciliationInput['connection']): string
  deriveProjectName(projectId: string): string
}) {
  return async function reconcile(jobInput: { data: unknown }): Promise<{
    outcome: 'noop' | 'attached' | 'completed' | 'failed' | 'manual_review'
  }> {
    const job = deploymentJobSchema.safeParse(jobInput.data)
    if (!job.success) throw new Error('invalid_deployment_job')
    const context = { userId: job.data.userId, workspaceId: job.data.workspaceId }
    const input = await dependencies.repository.getReconciliationInput(context, job.data.deploymentId)
    if (!input || input.projectId !== job.data.projectId) throw new Error('deployment_not_found')
    let token: string
    try {
      token = dependencies.decryptCredential(input.connection)
    } catch {
      await dependencies.repository.fail(context, input.id, 'provider_auth')
      return { outcome: 'failed' }
    }

    try {
      if (input.providerDeploymentId) {
        const state = await dependencies.provider.getDeployment(token, input.providerDeploymentId, input.connection.teamId)
        if (state.state === 'ready') {
          await dependencies.repository.completeReady(context, input.id, state.url)
          return { outcome: 'completed' }
        }
        if (state.state === 'failed') {
          await dependencies.repository.fail(context, input.id, 'provider_error')
          return { outcome: 'failed' }
        }
        return { outcome: 'noop' }
      }
      if (input.status !== 'failed' || input.errorCode !== 'provider_outcome_unknown') return { outcome: 'noop' }
      const projectName = input.providerProjectName ?? dependencies.deriveProjectName(input.projectId)
      const result = await dependencies.provider.findDeploymentByCorrelation(token, {
        teamId: input.connection.teamId,
        projectName,
        correlationId: input.id,
      })
      if (result.match !== 'one') return { outcome: 'manual_review' }
      const attached = await dependencies.repository.attachProviderDeployment(context, input.id, {
        providerProjectName: projectName,
        providerDeploymentId: result.deployment.providerDeploymentId,
      })
      if (!attached) return { outcome: 'manual_review' }
      if (result.deployment.state === 'ready' && result.deployment.url) {
        await dependencies.repository.completeReady(context, input.id, result.deployment.url)
        return { outcome: 'completed' }
      }
      if (result.deployment.state === 'failed') {
        await dependencies.repository.fail(context, input.id, 'provider_error')
        return { outcome: 'failed' }
      }
      return { outcome: 'attached' }
    } catch (error) {
      const code = safeProviderCode(error)
      if (code === 'provider_auth') {
        await dependencies.repository.fail(context, input.id, code)
        return { outcome: 'failed' }
      }
      return { outcome: 'manual_review' }
    }
  }
}
