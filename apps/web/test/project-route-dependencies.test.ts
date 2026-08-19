import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createRouteDependencies,
  projectBelongsToWorkspace,
} from '../lib/server/project-route-dependencies'

import type * as DatabaseModule from '@zenui/database'

const {
  databaseLimitMock,
  projectListMock,
} = vi.hoisted(() => ({
  databaseLimitMock: vi.fn(),
  projectListMock: vi.fn(),
}))

const repository = {
  list: projectListMock,
  create: vi.fn(),
  findById: vi.fn(),
  rename: vi.fn(),
  archive: vi.fn(),
  replaceDocument: vi.fn(),
  listRevisions: vi.fn(),
  createRevision: vi.fn(),
  restoreRevision: vi.fn(),
}

vi.mock('@zenui/database', async importOriginal => ({
  ...await importOriginal<typeof DatabaseModule>(),
  createProjectRepository: () => repository,
}))

vi.mock('../lib/server/database', () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: databaseLimitMock,
        }),
      }),
    }),
  }),
}))

vi.mock('../lib/server/runtime-session', () => ({
  getRuntimeSession: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_ORIGIN = 'http://localhost:3000'
  process.env.REMOTE_IMAGE_HOST_ALLOWLIST =
    'images.example.com'
})

describe('project route dependencies', () => {
  it('fails closed when required origin configuration is absent', () => {
    process.env.APP_ORIGIN = ''
    expect(() => createRouteDependencies()).toThrow(
      'APP_ORIGIN is required',
    )

    process.env.APP_ORIGIN = 'http://localhost:3000'
    process.env.REMOTE_IMAGE_HOST_ALLOWLIST = ''
    expect(() => createRouteDependencies()).toThrow(
      'REMOTE_IMAGE_HOST_ALLOWLIST is required',
    )
  })

  it('returns membership rows and null for missing members', async () => {
    const membership = {
      userId: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
      role: 'owner' as const,
    }
    const dependencies = createRouteDependencies()

    databaseLimitMock
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([])

    await expect(dependencies.findCurrentMembership(
      membership.userId,
    )).resolves.toEqual(membership)
    await expect(dependencies.findCurrentMembership(
      crypto.randomUUID(),
    )).resolves.toBeNull()
    await expect(dependencies.findMembership(
      membership.userId,
      membership.workspaceId,
    )).resolves.toEqual(membership)
    await expect(dependencies.findMembership(
      crypto.randomUUID(),
      membership.workspaceId,
    )).resolves.toBeNull()
  })

  it('delegates repository calls and checks project ownership', async () => {
    const dependencies = createRouteDependencies()
    const context = {
      userId: crypto.randomUUID(),
      workspaceId: crypto.randomUUID(),
      role: 'owner' as const,
    }
    projectListMock.mockResolvedValueOnce([])
    await expect(dependencies.projects.list(context))
      .resolves.toEqual([])
    expect(projectListMock).toHaveBeenCalledWith(context)

    databaseLimitMock
      .mockResolvedValueOnce([{ id: crypto.randomUUID() }])
      .mockResolvedValueOnce([])
    await expect(projectBelongsToWorkspace(
      crypto.randomUUID(),
      context.workspaceId,
    )).resolves.toBe(true)
    await expect(projectBelongsToWorkspace(
      crypto.randomUUID(),
      context.workspaceId,
    )).resolves.toBe(false)
  })
})
