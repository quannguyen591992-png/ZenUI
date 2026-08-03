export default function BetaOnboardingPage() {
  return (
    <main className="dashboard-state">
      <h1>Bản beta riêng tư của ZenUI</h1>
      <p>Hãy dùng phiên bản Chrome, Firefox hoặc Safari hiện hành trên máy tính. Chỉ các địa chỉ email đã được phê duyệt mới có quyền truy cập.</p>
      <section aria-labelledby="before-sharing">
        <h2 id="before-sharing">Trước khi chia sẻ hoặc xuất bản</h2>
        <ul>
          <li>Tạo và kiểm tra một phiên bản bất biến trước khi xuất bản.</li>
          <li>Bất kỳ ai có liên kết chia sẻ đang hoạt động đều có thể xem phiên bản được ghim cho đến khi chủ sở hữu tắt liên kết.</li>
          <li>Máy chủ ảnh từ xa trong danh sách cho phép vẫn nhận được địa chỉ IP của người xem.</li>
          <li>Biểu mẫu chỉ dùng để minh họa; ZenUI không gửi dữ liệu từ biểu mẫu.</li>
        </ul>
      </section>
      <section aria-labelledby="limits-recovery">
        <h2 id="limits-recovery">Giới hạn và khôi phục</h2>
        <ul>
          <li>Yêu cầu AI, xuất tệp, chia sẻ và triển khai có giới hạn tần suất và mức sử dụng.</li>
          <li>Tải bản sao khôi phục JSON trước thay đổi có rủi ro và dùng phiên bản để quay lại nội dung ổn định.</li>
          <li>Dùng tính năng xuất phía máy chủ để lấy HTML độc lập; xuất từ fixture chỉ chạy trong trình duyệt được chủ động tắt.</li>
        </ul>
      </section>
      <section aria-labelledby="support">
        <h2 id="support">Hỗ trợ và sự cố</h2>
        <p>Liên hệ người vận hành bản beta riêng tư qua kênh hỗ trợ trong thư mời. Không gửi mật khẩu, OAuth token, bearer link, prompt, tài liệu hoặc bản sao cơ sở dữ liệu.</p>
      </section>
      <section aria-labelledby="limitations">
        <h2 id="limitations">Giới hạn đã biết</h2>
        <p>Bản beta này không phải cam kết về độ sẵn sàng production hoặc tuân thủ. Proxy hình ảnh, tên miền riêng, mã người dùng, gửi biểu mẫu và tự xóa tài khoản chưa được hỗ trợ.</p>
      </section>
      <nav aria-label="Tiếp tục với ZenUI">
        <a href="/login">Đăng nhập ZenUI</a>
        <a href="/">Về trang chủ</a>
      </nav>
    </main>
  )
}
