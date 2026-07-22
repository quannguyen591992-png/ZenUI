import { createValidDesignFixture, type DesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  createProjectCollectionHandlers,
  createProjectCommandHandler,
  createProjectDocumentHandler,
  createProjectItemHandlers,
  createProjectRevisionHandlers,
  createRevisionRestoreHandler,
  createSessionContextHandler,
  type ProjectApiDependencies,
  type ProjectApiRecord,
} from '../lib/server/project-api'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const projectId = '55555555-5555-4555-8555-555555555555'
const userId = '11111111-1111-4111-8111-111111111111'

function project(document = createValidDesignFixture()): ProjectApiRecord {
  document.projectId = projectId
  return {
    id: projectId,
    workspaceId,
    name: 'Landing page',
    status: 'active',
    version: document.version,
    document,
  }
}

function dependencies(overrides: Partial<ProjectApiDependencies> = {}): ProjectApiDependencies {
  let current = project()
  return {
    getSession: () => Promise.resolve({ userId }),
    findCurrentMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    findMembership: () => Promise.resolve({ userId, workspaceId, role: 'owner' }),
    trustedOrigin: 'http://localhost',
    projects: {
      list: () => Promise.resolve([current]),
      create: (_context, input) => Promise.resolve({ ...current, name: input.name }),
      findById: () => Promise.resolve(current),
      rename: (_context, _projectId, name) => {
        current = { ...current, name }
        return Promise.resolve(current)
      },
      archive: () => {
        current = { ...current, status: 'archived' }
        return Promise.resolve(current)
      },
      replaceDocument: (_context, _projectId, expectedVersion, document) => {
        if (expectedVersion !== current.version) {
          return Promise.resolve({ accepted: false, code: 'stale_document_version' })
        }
        current = { ...current, version: expectedVersion + 1, document }
        return Promise.resolve({ accepted: true, version: current.version, document })
      },
      listRevisions: () => Promise.resolve([{ id: 'revision-1', projectId, source: 'manual' as const, summary: 'Initial snapshot', createdAt: new Date('2026-07-22T00:00:00.000Z') }]),
      createRevision: (_context, _projectId, input) => Promise.resolve({ id: 'revision-2', projectId, source: 'manual' as const, summary: input.summary, createdAt: new Date('2026-07-22T01:00:00.000Z') }),
      restoreRevision: (_context, _projectId, _revisionId, expectedVersion) => {
        if (expectedVersion !== current.version) return Promise.resolve({ accepted: false, code: 'stale_document_version' as const })
        current = { ...current, version: expectedVersion + 1, document: { ...current.document, version: expectedVersion + 1 } }
        return Promise.resolve({ accepted: true as const, version: current.version, document: current.document })
      },
    },
    ...overrides,
  }
}

describe('project API handlers', () => {
  it('requires authentication before returning workspace projects', async () => {
    const handlers = createProjectCollectionHandlers(dependencies({
      getSession: () => Promise.resolve(null),
    }))

    const response = await handlers.GET(new Request(`http://localhost/api/v1/projects?workspaceId=${workspaceId}`))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'unauthorized', message: 'Authentication required' },
    })
  })

  it('returns the authenticated workspace context without exposing credentials', async () => {
    const handler = createSessionContextHandler(dependencies())
    const response = await handler()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: { userId, workspaceId, role: 'owner' },
    })

    const missingMembership = await createSessionContextHandler(dependencies({
      findCurrentMembership: () => Promise.resolve(null),
    }))()
    expect(missingMembership.status).toBe(404)
  })

  it('lists authorized projects and creates one with a Location header', async () => {
    const handlers = createProjectCollectionHandlers(dependencies())
    const listed = await handlers.GET(new Request(`http://localhost/api/v1/projects?workspaceId=${workspaceId}`))
    expect(listed.status).toBe(200)
    await expect(listed.json()).resolves.toMatchObject({ data: [{ id: projectId }] })

    const created = await handlers.POST(new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, name: 'New project' }),
    }))
    expect(created.status).toBe(201)
    expect(created.headers.get('Location')).toBe(`/api/v1/projects/${projectId}`)
    await expect(created.json()).resolves.toMatchObject({ data: { name: 'New project' } })
  })

  it('fails safely when the trusted origin is misconfigured', async () => {
    const handlers = createProjectCollectionHandlers(dependencies({ trustedOrigin: 'not-a-url' }))
    const response = await handlers.POST(new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, name: 'Blocked project' }),
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'server_misconfigured', message: 'An unexpected error occurred' },
    })
  })

  it('rejects missing and foreign origins before project mutations', async () => {
    let creates = 0
    const base = dependencies()
    const handlers = createProjectCollectionHandlers(dependencies({
      projects: {
        ...base.projects,
        create: (context, input) => {
          creates += 1
          return base.projects.create(context, input)
        },
      },
    }))

    for (const origin of [undefined, 'https://attacker.example', 'null']) {
      const headers = new Headers({ 'content-type': 'application/json' })
      if (origin) headers.set('origin', origin)
      const response = await handlers.POST(new Request('http://localhost/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({ workspaceId, name: 'Blocked project' }),
      }))
      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'invalid_origin', message: 'Request origin is not allowed' },
      })
    }
    expect(creates).toBe(0)
  })

  it('rejects invalid input and insufficient workspace role safely', async () => {
    const invalidHandlers = createProjectCollectionHandlers(dependencies())
    const invalid = await invalidHandlers.POST(new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId: 'forged', name: '' }),
    }))
    expect(invalid.status).toBe(422)

    const forbiddenHandlers = createProjectCollectionHandlers(dependencies({
      findMembership: () => Promise.resolve({ userId, workspaceId, role: 'viewer' }),
    }))
    const forbidden = await forbiddenHandlers.POST(new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, name: 'Forbidden project' }),
    }))
    expect(forbidden.status).toBe(403)
    await expect(forbidden.json()).resolves.toEqual({
      error: { code: 'forbidden', message: 'Forbidden' },
    })
  })

  it('reads, renames and archives one authorized project', async () => {
    const handlers = createProjectItemHandlers(dependencies())
    const context = { params: Promise.resolve({ projectId }) }

    const read = await handlers.GET(new Request(`http://localhost/api/v1/projects/${projectId}?workspaceId=${workspaceId}`), context)
    expect(read.status).toBe(200)
    await expect(read.json()).resolves.toMatchObject({ data: { id: projectId, name: 'Landing page' } })

    const renamed = await handlers.PATCH(new Request(`http://localhost/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, name: 'Renamed project' }),
    }), context)
    expect(renamed.status).toBe(200)
    await expect(renamed.json()).resolves.toMatchObject({ data: { name: 'Renamed project' } })

    const archived = await handlers.DELETE(new Request(`http://localhost/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId }),
    }), context)
    expect(archived.status).toBe(200)
    await expect(archived.json()).resolves.toMatchObject({ data: { status: 'archived' } })
  })

  it('returns validation errors for malformed project queries', async () => {
    const item = createProjectItemHandlers(dependencies())
    const document = createProjectDocumentHandler(dependencies())
    const context = { params: Promise.resolve({ projectId }) }

    expect((await item.GET(new Request(`http://localhost/api/v1/projects/${projectId}`), context)).status).toBe(422)
    expect((await document(new Request(`http://localhost/api/v1/projects/${projectId}/document?workspaceId=forged`), context)).status).toBe(422)
  })

  it('reads the current document without exposing another workspace project', async () => {
    const handler = createProjectDocumentHandler(dependencies())
    const response = await handler(
      new Request(`http://localhost/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ data: { version: 1, document: { projectId } } })

    const missing = createProjectDocumentHandler(dependencies({
      projects: { ...dependencies().projects, findById: () => Promise.resolve(null) },
    }))
    const hidden = await missing(
      new Request(`http://localhost/api/v1/projects/${projectId}/document?workspaceId=${workspaceId}`),
      { params: Promise.resolve({ projectId }) },
    )
    expect(hidden.status).toBe(404)
  })

  it('lists, creates and restores immutable revisions with optimistic version checks', async () => {
    const revisionHandlers = createProjectRevisionHandlers(dependencies())
    const context = { params: Promise.resolve({ projectId }) }
    const listed = await revisionHandlers.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}/revisions?workspaceId=${workspaceId}`),
      context,
    )
    expect(listed.status).toBe(200)
    await expect(listed.json()).resolves.toMatchObject({ data: [{ id: 'revision-1' }] })

    const created = await revisionHandlers.POST(new Request(`http://localhost/api/v1/projects/${projectId}/revisions`, {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, summary: 'Before redesign' }),
    }), context)
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({ data: { id: 'revision-2', summary: 'Before redesign' } })

    const restore = createRevisionRestoreHandler(dependencies())
    const restored = await restore(new Request(`http://localhost/api/v1/projects/${projectId}/revisions/revision-1/restore`, {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 1 }),
    }), { params: Promise.resolve({ projectId, revisionId: 'revision-1' }) })
    expect(restored.status).toBe(200)
    await expect(restored.json()).resolves.toMatchObject({ data: { version: 2 } })
  })

  it('applies a command batch atomically and persists one version increment', async () => {
    const handler = createProjectCommandHandler(dependencies())
    const response = await handler(new Request(`http://localhost/api/v1/projects/${projectId}/commands`, {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({
        workspaceId,
        expectedVersion: 1,
        commands: [{
          commandId: 'update-heading',
          documentVersion: 99,
          source: 'user',
          type: 'UPDATE_PROPS',
          nodeId: 'heading-1',
          patch: { text: 'Saved on server' },
        }],
      }),
    }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(200)
    const body = await response.json() as { data: { version: number; document: DesignDocument } }
    expect(body.data.version).toBe(2)
    expect(body.data.document.nodes['heading-1']?.props).toMatchObject({ text: 'Saved on server' })
  })

  it('rejects item and revision mutations with unsafe origins before repository access', async () => {
    let mutations = 0
    const base = dependencies()
    const guarded = dependencies({
      projects: {
        ...base.projects,
        rename: (...args) => { mutations += 1; return base.projects.rename(...args) },
        createRevision: (...args) => { mutations += 1; return base.projects.createRevision(...args) },
      },
    })
    const item = createProjectItemHandlers(guarded)
    const revisions = createProjectRevisionHandlers(guarded)
    const context = { params: Promise.resolve({ projectId }) }

    const rename = await item.PATCH(new Request(`http://localhost/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { origin: 'https://attacker.example' },
      body: JSON.stringify({ workspaceId, name: 'Forged' }),
    }), context)
    const revision = await revisions.POST(new Request(`http://localhost/api/v1/projects/${projectId}/revisions`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId, summary: 'Forged' }),
    }), context)

    expect(rename.status).toBe(403)
    expect(revision.status).toBe(403)
    expect(mutations).toBe(0)
  })

  it('returns not found for a missing project and malformed command input', async () => {
    const missingHandler = createProjectCommandHandler(dependencies({
      projects: {
        ...dependencies().projects,
        findById: () => Promise.resolve(null),
      },
    }))
    const missing = await missingHandler(new Request('http://localhost/api/v1/projects/project/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 1, commands: [{
        commandId: 'read-missing', documentVersion: 1, source: 'user', type: 'UPDATE_STYLE',
        nodeId: 'heading-1', patch: { color: '#112233' },
      }] }),
    }), { params: Promise.resolve({ projectId }) })
    expect(missing.status).toBe(404)

    const handler = createProjectCommandHandler(dependencies())
    const malformed = await handler(new Request('http://localhost/api/v1/projects/project/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 1, commands: [] }),
    }), { params: Promise.resolve({ projectId }) })
    expect(malformed.status).toBe(422)
  })

  it('maps a repository race to 409 after a valid transaction', async () => {
    const base = dependencies()
    const handler = createProjectCommandHandler(dependencies({
      projects: {
        ...base.projects,
        replaceDocument: () => Promise.resolve({ accepted: false, code: 'stale_document_version' }),
      },
    }))
    const response = await handler(new Request('http://localhost/api/v1/projects/project/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 1, commands: [{
        commandId: 'race', documentVersion: 1, source: 'user', type: 'UPDATE_STYLE',
        nodeId: 'heading-1', patch: { color: '#112233' },
      }] }),
    }), { params: Promise.resolve({ projectId }) })

    expect(response.status).toBe(409)
  })

  it('returns 409 for a stale write and 422 without mutating for invalid commands', async () => {
    const handler = createProjectCommandHandler(dependencies())
    const stale = await handler(new Request('http://localhost/api/v1/projects/project/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 2, commands: [{
        commandId: 'stale', documentVersion: 2, source: 'user', type: 'UPDATE_STYLE',
        nodeId: 'heading-1', patch: { color: '#112233' },
      }] }),
    }), { params: Promise.resolve({ projectId }) })
    expect(stale.status).toBe(409)
    await expect(stale.json()).resolves.toMatchObject({ error: { code: 'stale_document_version' } })

    const invalid = await handler(new Request('http://localhost/api/v1/projects/project/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ workspaceId, expectedVersion: 1, commands: [{
        commandId: 'invalid', documentVersion: 1, source: 'user', type: 'UPDATE_PROPS',
        nodeId: 'heading-1', patch: { level: 99 },
      }] }),
    }), { params: Promise.resolve({ projectId }) })
    expect(invalid.status).toBe(422)
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: 'document_invalid' } })
  })
})
