const safeMessages = {
  AccessDenied: 'Tài khoản này chưa được cấp quyền truy cập bản beta riêng tư của ZenUI.',
  Configuration: 'Tính năng đăng nhập tạm thời chưa sẵn sàng.',
} as const

export default async function AuthErrorPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>
}) {
  const error = (await searchParams).error
  const message = error && error in safeMessages
    ? safeMessages[error as keyof typeof safeMessages]
    : 'Không thể hoàn tất đăng nhập.'
  return (
    <main className="dashboard-state">
      <h1>Không thể đăng nhập</h1>
      <p role="alert">{message}</p>
      <a href="/login">Quay lại đăng nhập</a>
      <a href="/beta">Xem điều kiện truy cập và giới hạn của bản beta riêng tư</a>
      <a href="/">Về trang chủ ZenUI</a>
    </main>
  )
}
