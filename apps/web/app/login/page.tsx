import Link from 'next/link'

import { safeAuthCallbackPath } from '../../lib/server/auth-navigation'
import { createConfiguredAuth } from '../../lib/server/configured-auth'
import { isLocalAuthRuntimeEnabled } from '../../lib/server/e2e-runtime'

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>
}) {
  const callbackUrl = safeAuthCallbackPath((await searchParams).callbackUrl)
  const local = isLocalAuthRuntimeEnabled()

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-heading">
        <Link className="auth-brand" href="/" aria-label="Về trang chủ ZenUI">ZenUI</Link>
        <span className="auth-eyebrow">Bản beta riêng tư</span>
        <h1 id="login-heading">Đăng nhập ZenUI</h1>
        <p>Tiếp tục vào không gian làm việc để tạo, chỉnh sửa và xuất bản website của bạn.</p>

        {local ? (
          <form action="/api/local/session" method="post">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button className="auth-primary" type="submit">Tiếp tục với tài khoản local</button>
          </form>
        ) : (
          <form action={async () => {
            'use server'
            await createConfiguredAuth().signIn('github', { redirectTo: callbackUrl })
          }}>
            <button className="auth-primary" type="submit">Tiếp tục với GitHub</button>
          </form>
        )}

        <p className="auth-note">ZenUI hiện chỉ mở cho các email đã được phê duyệt. Chúng tôi không cung cấp đăng ký công khai trong giai đoạn này.</p>
        <div className="auth-links">
          <Link href="/beta">Yêu cầu quyền truy cập beta</Link>
          <Link href="/">Quay lại trang chủ</Link>
        </div>
      </section>
    </main>
  )
}
