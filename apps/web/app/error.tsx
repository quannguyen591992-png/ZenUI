'use client'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="dashboard-state">
      <h1>Không thể tải ZenUI</h1>
      <p role="alert">Đã xảy ra lỗi ngoài dự kiến.</p>
      <button type="button" onClick={reset}>Thử lại</button>
    </main>
  )
}
