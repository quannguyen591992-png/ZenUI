import Link from 'next/link'

import { safeAuthCallbackPath } from '../../lib/server/auth-navigation'
import { createConfiguredAuth } from '../../lib/server/configured-auth'
import { isGitHubAuthConfigured, isLocalAuthRuntimeEnabled } from '../../lib/server/e2e-runtime'

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const callbackUrl = safeAuthCallbackPath((await searchParams).callbackUrl)
  const local = isLocalAuthRuntimeEnabled()
  const github = !local && isGitHubAuthConfigured()

  return (
    <main className="auth-page-pro">
      <div className="mesh-gradient-bg">
        <div className="mesh-blob blob-1"></div>
        <div className="mesh-blob blob-2"></div>
        <div className="mesh-blob blob-3"></div>
      </div>

      <section className="auth-card-pro glass-panel" aria-labelledby="login-heading">
        <div className="auth-card-content">
          <div className="auth-brand-wrapper">
            <Link className="auth-brand-pro" href="/" aria-label="Về trang chủ ZenUI">
              <span className="logo-icon"></span>
              ZenUI
            </Link>
            <span className="auth-eyebrow-pro badge-pro">Bản beta riêng tư</span>
          </div>

          <div className="auth-header-text">
            <h1 id="login-heading">Đăng nhập ZenUI</h1>
            <p>Tiếp tục vào không gian làm việc để tạo, chỉnh sửa và xuất bản website của bạn.</p>
          </div>

          <div className="auth-actions">
            {local ? (
              <form action="/api/local/session" method="post">
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <button className="btn-pro primary-btn full-width" type="submit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                  Tiếp tục với tài khoản local
                </button>
              </form>
            ) : github ? (
              <form action={async () => {
                'use server'
                await createConfiguredAuth().signIn('github', { redirectTo: callbackUrl })
              }}>
                <button className="btn-pro primary-btn full-width" type="submit">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                  Tiếp tục với GitHub
                </button>
              </form>
            ) : (
              <p className="auth-note-pro" role="status">
                Đăng nhập GitHub chưa được kích hoạt. Hãy liên hệ quản trị viên để được hỗ trợ.
              </p>
            )}
          </div>

          <div className="auth-footer-pro">
            <p className="auth-note-pro">
              ZenUI hiện chỉ mở cho các email đã được phê duyệt. Chúng tôi không cung cấp đăng ký công khai trong giai đoạn này.
            </p>
            <div className="auth-links-pro">
              <Link href="/beta" className="link-pro">Yêu cầu quyền truy cập beta</Link>
              <Link href="/" className="link-pro">Quay lại trang chủ</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
