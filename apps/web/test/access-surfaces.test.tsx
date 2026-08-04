import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import LoginPage from '../app/login/page'
import HomePage from '../app/page'
import { safeAuthCallbackPath } from '../lib/server/auth-navigation'
import { isLocalAuthRuntimeEnabled } from '../lib/server/e2e-runtime'

vi.mock('../lib/server/configured-auth', () => ({
  createConfiguredAuth: vi.fn(() => ({ signIn: vi.fn() })),
}))

vi.mock('../lib/server/e2e-runtime', () => ({
  isLocalAuthRuntimeEnabled: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.mocked(isLocalAuthRuntimeEnabled).mockReset()
})

describe('public access surfaces', () => {
  it('renders a public ZenUI landing page without loading the authenticated dashboard', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: /Từ ý tưởng đến website/i })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: 'Mở bảng điều khiển' })).toHaveAttribute('href', '/dashboard')
    expect(screen.getAllByRole('link', { name: 'Yêu cầu quyền Beta' })[0]).toHaveAttribute('href', '/beta')
    expect(screen.queryByText('Đang tải dự án...')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders private-beta GitHub login outside guarded local mode', async () => {
    vi.mocked(isLocalAuthRuntimeEnabled).mockReturnValue(false)

    render(await LoginPage({ searchParams: Promise.resolve({ callbackUrl: '/dashboard' }) }))

    expect(screen.getByRole('heading', { name: 'Đăng nhập ZenUI' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Tiếp tục với GitHub' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Tiếp tục với tài khoản local' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Yêu cầu quyền truy cập beta' })).toHaveAttribute('href', '/beta')
  })

  it('renders one-click local login only in guarded local mode', async () => {
    vi.mocked(isLocalAuthRuntimeEnabled).mockReturnValue(true)

    render(await LoginPage({ searchParams: Promise.resolve({ callbackUrl: '/projects/55555555-5555-4555-8555-555555555555' }) }))

    const localButton = screen.getByRole('button', { name: 'Tiếp tục với tài khoản local' })
    expect(localButton).toBeVisible()
    expect(localButton.closest('form')).toHaveAttribute('action', '/api/local/session')
    expect(screen.queryByRole('button', { name: 'Tiếp tục với GitHub' })).not.toBeInTheDocument()
  })

  it('allows only internal dashboard and UUID project callbacks', () => {
    expect(safeAuthCallbackPath('/dashboard')).toBe('/dashboard')
    expect(safeAuthCallbackPath('/projects/55555555-5555-4555-8555-555555555555')).toBe('/projects/55555555-5555-4555-8555-555555555555')

    for (const input of [
      null,
      '',
      '/',
      '//evil.example',
      'https://evil.example/dashboard',
      '/api/v1/session',
      '/auth-error',
      '/projects/not-a-uuid',
      ['/dashboard'],
    ]) {
      expect(safeAuthCallbackPath(input)).toBe('/dashboard')
    }
  })
})
