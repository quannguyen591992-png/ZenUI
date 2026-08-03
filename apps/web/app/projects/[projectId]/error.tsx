'use client'

export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="dashboard-state">
      <h1>Không thể tải trình chỉnh sửa dự án</h1>
      <p role="alert">Dự án của bạn không bị thay đổi.</p>
      <button type="button" onClick={reset}>Thử tải lại</button>
    </main>
  )
}
