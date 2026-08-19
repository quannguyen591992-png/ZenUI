import {
  projects,
  usageRecords,
} from '@zenui/database'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import {
  getDatabase,
  waitForDatabase,
} from '../../../../lib/server/database'
import {
  E2E_IDENTITIES,
  isE2eRuntimeEnabled,
} from '../../../../lib/server/e2e-runtime'
import { getRuntimeSession } from '../../../../lib/server/runtime-session'

const requestSchema = z.object({
  projectId: z.string().uuid(),
}).strict()

export async function POST(request: Request) {
  if (!isE2eRuntimeEnabled()) {
    return new Response('Not found', { status: 404 })
  }
  const session = await getRuntimeSession()
  if (!session) {
    return Response.json(
      { error: { code: 'unauthorized' } },
      { status: 401 },
    )
  }
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error' } },
      { status: 422 },
    )
  }
  const identity = Object.values(E2E_IDENTITIES).find(
    candidate => candidate.userId === session.userId,
  )
  if (!identity) {
    return Response.json(
      { error: { code: 'unauthorized' } },
      { status: 401 },
    )
  }
  await waitForDatabase()
  const database = getDatabase()
  const [project] = await database.select({ id: projects.id })
    .from(projects)
    .where(and(
      eq(projects.id, parsed.data.projectId),
      eq(projects.workspaceId, identity.workspaceId),
    ))
    .limit(1)
  if (!project) {
    return Response.json(
      { error: { code: 'not_found' } },
      { status: 404 },
    )
  }
  await database.insert(usageRecords).values([{
    workspaceId: identity.workspaceId,
    projectId: project.id,
    userId: identity.userId,
    provider: 'google-gemini',
    model: 'gemini-2.5-flash',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    pricingVersion: 'google-gemini-2026-08-13',
    inputRateMicroUsdPerMillion: 300_000,
    outputRateMicroUsdPerMillion: 2_500_000,
    inputEstimatedMicroUsd: 3,
    outputEstimatedMicroUsd: 50,
    totalEstimatedMicroUsd: 53,
    currency: 'USD',
  }, {
    workspaceId: identity.workspaceId,
    projectId: project.id,
    userId: identity.userId,
    provider: 'google-gemini',
    model: 'unknown-e2e-model',
    inputTokens: 1,
    outputTokens: 2,
    totalTokens: 3,
  }])
  return Response.json({ data: { seeded: 2 } })
}
