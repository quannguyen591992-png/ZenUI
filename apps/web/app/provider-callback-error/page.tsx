export default function ProviderCallbackErrorPage() {
  return (
    <main className="dashboard-state">
      <h1>Chưa thể kết nối Vercel</h1>
      <p role="alert">
        Redirect URL của Vercel Integration chưa trỏ đến callback của ZenUI. Hãy cập nhật cấu hình rồi kết nối lại.
      </p>
      <p>Callback local: /api/v1/provider-connections/vercel/callback</p>
      <a href="/dashboard">Quay lại bảng điều khiển</a>
    </main>
  )
}
