import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '../app/dashboard'

const workspaceId = '22222222-2222-4222-8222-222222222222'
const project = {
  id: '55555555-5555-4555-8555-555555555555',
  workspaceId,
  name: 'Landing page',
  status: 'active' as const,
  version: 1,
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('authenticated dashboard', () => {
  it('shows loading then an empty state for the authenticated workspace', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] })))

    render(<Dashboard />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading projects')
    expect(await screen.findByText('No projects yet')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Create project' })).toBeVisible()
  })

  it('renders a safe authentication error with retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      error: { code: 'unauthorized', message: 'Authentication required' },
    }, 401))
    vi.stubGlobal('fetch', fetchMock)

    render(<Dashboard />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('creates, renames and archives projects for an owner', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ data: project }, 201))
      .mockResolvedValueOnce(jsonResponse({ data: { ...project, name: 'Renamed' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { ...project, name: 'Renamed', status: 'archived' } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByText('No projects yet')
    await user.type(screen.getByLabelText('Project name'), 'Landing page')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByRole('link', { name: 'Open Landing page' })).toHaveAttribute('href', `/projects/${project.id}`)

    await user.click(screen.getByRole('button', { name: 'Rename Landing page' }))
    const rename = screen.getByLabelText('Rename project')
    await user.clear(rename)
    await user.type(rename, 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Save project name' }))
    expect(await screen.findByRole('link', { name: 'Open Renamed' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Archive Renamed' }))
    expect(await screen.findByText('No projects yet')).toBeVisible()
  })

  it('shows a safe create failure and keeps the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Unable to create' } }, 500)))
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByText('No projects yet')
    await user.type(screen.getByLabelText('Project name'), 'Failed project')
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to create')
    expect(screen.getByText('No projects yet')).toBeVisible()
  })

  it('shows safe mutation failures without discarding the current list', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'owner', workspaceId, role: 'owner' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [project] }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Unable to rename' } }, 500)))
    const user = userEvent.setup()
    render(<Dashboard />)

    await screen.findByRole('link', { name: 'Open Landing page' })
    await user.click(screen.getByRole('button', { name: 'Rename Landing page' }))
    await user.clear(screen.getByLabelText('Rename project'))
    await user.type(screen.getByLabelText('Rename project'), 'New name')
    await user.click(screen.getByRole('button', { name: 'Save project name' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to rename')
    expect(screen.getByLabelText('Rename project')).toHaveValue('New name')
  })

  it('keeps project management controls hidden from viewers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { userId: 'viewer', workspaceId, role: 'viewer' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [project] })))

    render(<Dashboard />)

    expect(await screen.findByRole('link', { name: 'Open Landing page' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /create project/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /rename landing page/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /archive landing page/i })).toBeNull()
  })
})
