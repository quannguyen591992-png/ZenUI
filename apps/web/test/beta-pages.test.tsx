import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import AuthErrorPage from '../app/auth-error/page'
import BetaOnboardingPage from '../app/beta/page'

describe('private beta surfaces', () => {
  it('publishes onboarding, privacy warnings, recovery and limitations', () => {
    render(<BetaOnboardingPage />)
    expect(screen.getByRole('heading', { name: 'Bản beta riêng tư của ZenUI' })).toBeVisible()
    expect(screen.getByText(/Bất kỳ ai có liên kết chia sẻ/)).toBeVisible()
    expect(screen.getByText(/Máy chủ ảnh từ xa/)).toBeVisible()
    expect(screen.getByText(/Tải bản sao khôi phục JSON/)).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Giới hạn đã biết' })).toBeVisible()
  })

  it('returns generic allowlist denial without revealing approved emails', async () => {
    render(await AuthErrorPage({ searchParams: Promise.resolve({ error: 'AccessDenied' }) }))
    expect(screen.getByRole('alert')).toHaveTextContent('chưa được cấp quyền truy cập')
    expect(document.body.textContent).not.toContain('owner@example.com')
  })

  it('fails generic for unknown auth errors', async () => {
    render(await AuthErrorPage({ searchParams: Promise.resolve({ error: 'provider-secret-detail' }) }))
    expect(screen.getByRole('alert')).toHaveTextContent('Không thể hoàn tất đăng nhập')
    expect(document.body.textContent).not.toContain('provider-secret-detail')
  })
})
