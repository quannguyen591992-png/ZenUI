import Link from 'next/link'

const capabilities = [
  {
    icon: '✨',
    title: 'Từ Ý Tưởng Tới Hiện Thực',
    copy: 'Chỉ cần một dòng mô tả ngắn, AI của ZenUI sẽ tự động phân tích và kiến tạo ngay ba hướng giao diện chuyên nghiệp độc bản.',
  },
  {
    icon: '🎨',
    title: 'Cá Nhân Hóa Không Cần Code',
    copy: 'Kéo thả, tinh chỉnh và thay đổi mọi thứ trực quan trên màn hình. Tự do sáng tạo mà không phải chạm vào bất kỳ một dòng code nào.',
  },
  {
    icon: '🛡️',
    title: 'Bạn Nắm Quyền Kiểm Soát',
    copy: 'AI đóng vai trò như một trợ lý đề xuất, nhưng quyết định cuối cùng luôn là của bạn. Mọi thay đổi đều được ghi nhận an toàn.',
  },
]

const workflow = [
  ['1', 'Khởi tạo', 'Chia sẻ tầm nhìn và thông điệp cốt lõi mà bạn muốn truyền tải.'],
  ['2', 'Khám phá', 'AI phân tích và đưa ra các lựa chọn thiết kế tối ưu nhất cho thương hiệu.'],
  ['3', 'Tinh chỉnh', 'Cùng AI hoàn thiện từng pixel, từng góc bo cho tới khi đạt mức hoàn hảo.'],
  ['4', 'Xuất bản', 'Giao diện đã sẵn sàng để đưa sản phẩm của bạn tỏa sáng ra thế giới.'],
]

export default function HomePage() {
  return (
    <main className="landing-page-pro">
      <div className="mesh-gradient-bg">
        <div className="mesh-blob blob-1"></div>
        <div className="mesh-blob blob-2"></div>
        <div className="mesh-blob blob-3"></div>
      </div>

      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Trang chủ ZenUI">ZenUI</Link>
        <nav aria-label="Điều hướng chính" className="landing-nav-links">
          <a href="#quy-trinh">Quy trình</a>
          <a href="#tinh-nang">Tính năng</a>
          <a href="#an-toan">Bảo mật</a>
        </nav>
        <div className="landing-header-actions">
          <Link href="/login" className="btn-login-ghost">Đăng nhập</Link>
          <Link href="/dashboard" className="btn-primary-glow">
            Mở bảng điều khiển
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-heading">
        <div className="hero-content">
          <div className="pill-badge">
            <span className="sparkle-icon">✨</span> Trợ lý thiết kế AI thế hệ mới
          </div>
          <h1 id="landing-heading">
            Từ ý tưởng đến <span className="text-gradient">website hoàn mỹ</span>, theo cách của bạn.
          </h1>
          <p className="hero-subtitle">
            ZenUI giúp bạn tạo một website với cấu trúc chuẩn mực, hình ảnh sắc nét và thông điệp mạch lạc — trong khi bạn vẫn làm chủ từng chi tiết nhỏ nhất.
          </p>
          <div className="landing-actions hero-actions">
            <Link className="btn-primary-glow btn-large" href="/login">Bắt đầu ngay miễn phí</Link>
            <Link className="btn-secondary-glass btn-large" href="/beta">Yêu cầu quyền Beta</Link>
          </div>
          <p className="hero-disclaimer">Không yêu cầu thẻ tín dụng · Hủy bất kỳ lúc nào</p>
        </div>

        <div className="hero-visual-container">
          <div className="hero-visual-glow"></div>
          <div className="landing-visual glass-card" aria-label="Minh họa quy trình thiết kế" style={{ padding: '8px' }}>
            <div className="landing-window-bar" style={{ padding: '12px 16px', marginBottom: '0' }}>
              <div className="window-dots"><i className="red"/><i className="yellow"/><i className="green"/></div>
              <span>ZenUI Workspace</span>
            </div>
            <div className="hero-image-wrapper">
              <img src="/hero-dashboard.png" alt="ZenUI Dashboard Preview" className="hero-dashboard-img" />
            </div>
            <div className="floating-badge">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
              <span>Trực quan, dễ dàng thao tác</span>
            </div>
          </div>
        </div>
      </section>

      <section id="tinh-nang" className="landing-capabilities" aria-labelledby="capabilities-heading">
        <div className="landing-section-heading center">
          <span className="section-kicker">Sức mạnh AI đột phá</span>
          <h2 id="capabilities-heading">Tối giản quá trình. Tối đa sáng tạo.</h2>
        </div>

        <div className="bento-grid">
          {capabilities.map((capability, index) => (
            <article key={index} className={`bento-card glass-card bento-item-${index + 1}`}>
              <div className="bento-icon">{capability.icon}</div>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </article>
          ))}
          <article className="bento-card glass-card bento-item-large gradient-bg">
            <div className="large-card-content">
              <h3>Tốc độ ấn tượng</h3>
              <p>Giảm thiểu 80% thời gian tạo mockup và triển khai website so với phương pháp truyền thống.</p>
            </div>
          </article>
        </div>
      </section>

      <section id="quy-trinh" className="landing-workflow" aria-labelledby="workflow-heading">
        <div className="workflow-content">
          <span className="section-kicker">Quy trình thông minh</span>
          <h2 id="workflow-heading">Chỉ cần đưa ra yêu cầu. ZenUI lo phần còn lại.</h2>
          <p>Không cần đau đầu học các phần mềm thiết kế phức tạp. Trải nghiệm một quy trình làm việc trơn tru như đang trò chuyện với một chuyên gia.</p>
        </div>

        <div className="workflow-timeline">
          {workflow.map(([num, title, copy]) => (
            <div key={title} className="timeline-item glass-card">
              <div className="timeline-number">{num}</div>
              <div className="timeline-text">
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="an-toan" className="landing-trust glass-card" aria-labelledby="trust-heading">
        <div className="trust-grid">
          <div className="trust-content">
            <span className="section-kicker">Kiến trúc an toàn</span>
            <h2 id="trust-heading">AI là cộng sự đắc lực, không phải kẻ thay thế.</h2>
            <p>Mỗi bước tiến trong ZenUI đều được lưu lại dưới dạng các phiên bản có thể phục hồi (version-controlled). AI chỉ đưa ra các bản nháp (drafts) để bạn duyệt trước khi áp dụng chính thức.</p>
            <ul className="trust-list">
              <li><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> Hoàn toàn không thực thi mã độc ẩn.</li>
              <li><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> Cảnh báo và yêu cầu xác nhận khi thay đổi lớn.</li>
              <li><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg> Khôi phục bất cứ thời điểm nào (Time-travel).</li>
            </ul>
          </div>
          <div className="trust-visual">
            <div className="shield-icon-container">
              <div className="pulse-ring"></div>
              <svg className="shield-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-final-cta" aria-labelledby="cta-heading">
        <div className="cta-glass-panel">
          <h2 id="cta-heading">Sẵn sàng kiến tạo website trong mơ?</h2>
          <p>Tham gia hàng ngàn nhà sáng tạo đang định hình lại tương lai của thiết kế web.</p>
          <div className="landing-actions justify-center">
            <Link className="btn-primary-glow btn-large" href="/login">Trải nghiệm ZenUI ngay</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <strong className="text-gradient">ZenUI</strong>
            <p>Nền tảng đồng thiết kế web ứng dụng AI tạo sinh.</p>
          </div>
          <nav aria-label="Điều hướng cuối trang" className="footer-nav">
            <Link href="/beta">Về bản Beta</Link>
            <Link href="/login">Đăng nhập hệ thống</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} ZenUI Platform. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}
