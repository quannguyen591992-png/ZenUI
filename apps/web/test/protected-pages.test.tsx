import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import DashboardPage from '../app/dashboard/page'
import ProjectPage from '../app/projects/[projectId]/page'

const { redirectMock, getRuntimeSessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`) }),
  getRuntimeSessionMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('../lib/server/runtime-session', () => ({ getRuntimeSession: getRuntimeSessionMock }))
vi.mock('../lib/server/configured-auth', () => ({
  createConfiguredAuth: vi.fn(() => ({ signOut: vi.fn() })),
}))
vi.mock('../app/dashboard', () => ({ Dashboard: () => <main><h1>Bảng điều khiển dự án</h1></main> }))
vi.mock('../app/projects/[projectId]/project-editor', () => ({ ProjectEditor: () => <main><h1>Trình chỉnh sửa được bảo vệ</h1></main> }))

describe('protected pages', () => {
  it('redirects an unauthenticated dashboard visitor to login', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce(null)

    await expect(DashboardPage()).rejects.toThrow('REDIRECT:/login?callbackUrl=%2Fdashboard')
  })

  it('renders the dashboard after guarded authentication', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce({ userId: 'owner' })

    render(await DashboardPage())
    expect(screen.getByRole('heading', { name: 'Bảng điều khiển dự án' })).toBeVisible()
  })

  it('redirects an unauthenticated project visitor with a safe project callback', async () => {
    getRuntimeSessionMock.mockResolvedValueOnce(null)
    const projectId = '55555555-5555-4555-8555-555555555555'

    await expect(ProjectPage({ params: Promise.resolve({ projectId }) })).rejects.toThrow(
      `REDIRECT:/login?callbackUrl=${encodeURIComponent(`/projects/${projectId}`)}`,
    )
  })
})
