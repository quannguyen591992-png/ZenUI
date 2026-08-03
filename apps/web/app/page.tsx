import Link from 'next/link'

const capabilities = [
  {
    number: '01',
    title: 'Bắt đầu từ mô tả của bạn',
    copy: 'Nói rõ sản phẩm, khách hàng và mục tiêu. ZenUI biến thông tin đó thành ba hướng thiết kế để bạn lựa chọn.',
  },
  {
    number: '02',
    title: 'Chỉnh sửa mà không cần code',
    copy: 'Sắp xếp nội dung theo từng phần, thay ảnh, áp dụng thương hiệu và xem ngay kết quả trên nhiều kích thước màn hình.',
  },
  {
    number: '03',
    title: 'AI đề xuất, bạn quyết định',
    copy: 'Mọi thay đổi quan trọng đều có bản so sánh trước và sau. Website chỉ đổi khi bạn chủ động chấp nhận.',
  },
]

const workflow = [
  ['Mô tả', 'Cho ZenUI biết bạn đang xây website gì và dành cho ai.'],
  ['Chọn hướng', 'So sánh ba cách tiếp cận và chọn nền tảng phù hợp nhất.'],
  ['Cùng thiết kế', 'Tự chỉnh sửa hoặc yêu cầu AI cải thiện đúng phần đang chọn.'],
  ['Chia sẻ', 'Tạo phiên bản ổn định để xem trước, xuất tệp hoặc xuất bản.'],
]

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Trang chủ ZenUI">ZenUI</Link>
        <nav aria-label="Điều hướng chính">
          <a href="#quy-trinh">Quy trình</a>
          <a href="#an-toan">Cách ZenUI làm việc</a>
          <Link href="/login">Đăng nhập</Link>
          <Link className="landing-nav-cta" href="/dashboard">Mở bảng điều khiển</Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-heading">
        <div>
          <span className="landing-kicker">Trợ lý AI đồng thiết kế dành cho người không biết code</span>
          <h1 id="landing-heading">Từ ý tưởng đến website rõ ràng, theo cách của bạn.</h1>
          <p>ZenUI giúp bạn tạo một website có cấu trúc, hình ảnh phù hợp và câu chuyện mạch lạc — trong khi bạn vẫn kiểm soát từng thay đổi.</p>
          <div className="landing-actions">
            <Link className="landing-primary" href="/login">Bắt đầu với ZenUI</Link>
            <Link className="landing-secondary" href="/beta">Yêu cầu quyền truy cập beta</Link>
          </div>
          <small>Private beta · Không cần nhập thông tin thanh toán</small>
        </div>
        <div className="landing-visual" aria-label="Minh họa quy trình thiết kế có kiểm soát">
          <div className="landing-window-bar"><i /><i /><i /><span>Website của bạn</span></div>
          <article className="landing-preview-card">
            <span>Hướng thiết kế đã chọn</span>
            <h2>Một câu chuyện rõ ràng cho ý tưởng của bạn</h2>
            <p>Nội dung có cấu trúc, hình ảnh đúng ngữ cảnh và lời kêu gọi hành động nổi bật.</p>
            <div><b>Xem đề xuất</b><b>Chấp nhận thay đổi</b></div>
          </article>
          <aside><strong>Bạn luôn giữ quyền quyết định</strong><span>AI không tự ý ghi đè website.</span></aside>
        </div>
      </section>

      <section className="landing-capabilities" aria-labelledby="capabilities-heading">
        <div className="landing-section-heading">
          <span>Thiết kế website dễ hiểu hơn</span>
          <h2 id="capabilities-heading">Đủ sức mạnh để tạo khác biệt. Đủ rõ ràng để bạn tự làm chủ.</h2>
        </div>
        <div className="landing-card-grid">
          {capabilities.map(capability => (
            <article key={capability.number}>
              <span>{capability.number}</span>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="quy-trinh" className="landing-workflow" aria-labelledby="workflow-heading">
        <div>
          <span>Quy trình bốn bước</span>
          <h2 id="workflow-heading">Tập trung vào thông điệp. ZenUI lo phần cấu trúc.</h2>
          <p>Bạn không cần học một công cụ thiết kế phức tạp trước khi có thể bắt đầu.</p>
        </div>
        <ol>
          {workflow.map(([title, copy], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section id="an-toan" className="landing-trust" aria-labelledby="trust-heading">
        <span>Thiết kế có trách nhiệm</span>
        <h2 id="trust-heading">AI là cộng sự, không phải người quyết định thay bạn.</h2>
        <p>ZenUI giữ website dưới dạng tài liệu có cấu trúc, hỗ trợ hoàn tác và phiên bản bất biến. Đề xuất AI được chuẩn bị riêng để bạn so sánh trước khi chấp nhận.</p>
        <ul>
          <li>Không chạy mã JavaScript do AI tạo ra</li>
          <li>Thay đổi quan trọng luôn có bước xác nhận</li>
          <li>Có mốc khôi phục trước khi chia sẻ hoặc xuất bản</li>
        </ul>
      </section>

      <section className="landing-final-cta" aria-labelledby="cta-heading">
        <h2 id="cta-heading">Sẵn sàng biến ý tưởng thành một website?</h2>
        <p>ZenUI hiện đang mở theo hình thức private beta.</p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/login">Đăng nhập ZenUI</Link>
          <Link className="landing-secondary" href="/beta">Yêu cầu quyền truy cập beta</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <strong>ZenUI</strong>
        <p>Trợ lý AI đồng thiết kế website có cấu trúc và có thể hoàn tác.</p>
        <nav aria-label="Điều hướng cuối trang"><Link href="/beta">Thông tin beta</Link><Link href="/login">Đăng nhập</Link></nav>
      </footer>
    </main>
  )
}
