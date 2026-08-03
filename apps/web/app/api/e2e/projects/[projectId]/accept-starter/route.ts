import { projects } from '@zenui/database'
import { and, eq } from 'drizzle-orm'

import { getDatabase, waitForDatabase } from '../../../../../../lib/server/database'
import { E2E_IDENTITIES, isE2eRuntimeEnabled } from '../../../../../../lib/server/e2e-runtime'
import { getRuntimeSession } from '../../../../../../lib/server/runtime-session'

export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  if (!isE2eRuntimeEnabled()) return new Response('Not found', { status: 404 })
  const session = await getRuntimeSession()
  if (!session) return Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
  const identity = Object.values(E2E_IDENTITIES).find(candidate => candidate.userId === session.userId)
  if (!identity) return Response.json({ error: { code: 'unauthorized' } }, { status: 401 })
  await waitForDatabase()
  const [updated] = await getDatabase().update(projects).set({
    creationState: 'accepted',
    updatedAt: new Date(),
  }).where(and(
    eq(projects.id, (await context.params).projectId),
    eq(projects.workspaceId, identity.workspaceId),
  )).returning()
  if (!updated) return Response.json({ error: { code: 'not_found' } }, { status: 404 })
  return Response.json({ data: { id: updated.id, creationState: 'accepted' } })
}
