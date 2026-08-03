# Cấu hình AI Agent dùng chung (CLAUDE.md)

> File này là template dùng chung cho các dự án trên máy của anh. Khi đưa vào dự án mới, AI Agent phải đọc file này, tự phân tích cấu trúc dự án hiện tại, rồi bổ sung/điều chỉnh phần lệnh chạy, kiến trúc và coding style cho phù hợp với dự án đó.

## 1. Quy tắc hoạt động của AI Agent (Bắt buộc)

### 1.1 Ưu tiên Claude Code global skills
- Với mỗi task liên quan đến viết code, sửa code, refactor, test, thiết kế kỹ thuật, kiểm tra chất lượng hoặc bảo mật, AI Agent BẮT BUỘC phải kiểm tra và áp dụng skill phù hợp trước khi triển khai.
- Nguồn skill chính là Claude Code global skills trên máy anh:
  - `C:\Users\V3400\.claude\skills\`
- Nếu dự án có thêm skill local tại `.claude/skills/` thì có thể dùng để bổ sung, nhưng mặc định vẫn ưu tiên bộ Claude Code global skills vì đây là nguồn dùng chung của anh.

### 1.2 Cách đọc và áp dụng skill
- Trong Claude Code, dùng công cụ đọc file có sẵn như `Glob`, `Read`, `Grep` để liệt kê skill và đọc `SKILL.md` tương ứng.
- Quy trình bắt buộc:
  1. Đọc `C:\Users\V3400\.claude\skills\INDEX.md` nếu tồn tại.
  2. Liệt kê hoặc kiểm tra các skill trong `C:\Users\V3400\.claude\skills\`.
  3. Chọn một hoặc vài skill phù hợp nhất với task.
  4. Đọc file `SKILL.md` của các skill đã chọn.
  5. Áp dụng design pattern, coding convention, TDD/test process và verification loop được mô tả trong skill.
  6. Nếu không tìm thấy skill phù hợp, nói rõ và tiếp tục theo kiến trúc/coding style hiện có của dự án.

### 1.3 Tự thích nghi với từng dự án mới
- Khi bắt đầu trong một dự án mới, AI Agent phải đọc cấu trúc repo và các file cấu hình như `package.json`, `pyproject.toml`, `requirements.txt`, `Dockerfile`, `compose.yaml`, `README.md`, framework config, test config.
- Sau khi hiểu dự án, AI Agent được phép đề xuất hoặc cập nhật `CLAUDE.md` để bổ sung phần project-specific:
  - lệnh cài đặt,
  - lệnh chạy dev server,
  - lệnh test/build/lint,
  - kiến trúc thực tế,
  - coding style thực tế,
  - các lưu ý riêng của dự án.
- Không được áp cứng tech stack từ template nếu repo thực tế dùng công nghệ khác.

### 1.4 Không sử dụng subagent trong phiên làm việc
- Không được gọi công cụ `Agent`, khởi chạy subagent hoặc dùng workflow/multi-agent orchestration có sinh subagent trong phiên làm việc.
- AI Agent chính phải tự thực hiện việc đọc, tìm kiếm, lập kế hoạch, sửa code và kiểm chứng bằng các công cụ trực tiếp phù hợp.
- Nếu skill hoặc quy trình mặc định đề xuất ủy quyền cho subagent, phải bỏ bước ủy quyền và thực hiện tuần tự trong AI Agent chính.

## 2. Quy trình làm việc mặc định
- Trước khi sửa code: đọc Claude Code global skill phù hợp và đọc code hiện có để hiểu pattern.
- Khi task đủ lớn hoặc có nhiều hướng triển khai: lập kế hoạch ngắn trước khi code.
- Khi viết code: giữ style giống code xung quanh, ưu tiên async/await nếu framework hỗ trợ.
- Khi nhận input từ người dùng/API: validate bằng schema phù hợp, ví dụ Pydantic, Zod, Yup, Joi hoặc validator tương đương.
- Khi thay đổi hành vi: thêm hoặc cập nhật test nếu dự án có test framework.
- Sau khi sửa: chạy command kiểm chứng phù hợp nếu khả thi, ví dụ test/build/lint/typecheck.
- Báo cáo trung thực kết quả: nói rõ đã chạy gì, pass/fail gì, bước nào chưa chạy.

### 2.1 Quản lý context bắt buộc
- Xem context window là tài nguyên hữu hạn; ưu tiên progressive disclosure, chỉ nạp dữ liệu cần cho quyết định hoặc bước triển khai hiện tại.
- Trước khi đọc code diện rộng: dùng `Glob` để xác định file, `Grep` để tìm symbol/keyword, sau đó `Read` đúng vùng liên quan. Mặc định mỗi lần chỉ đọc khoảng 200–300 dòng và mở rộng dần khi thật sự thiếu context.
- Không đọc hàng loạt toàn bộ nhiều file lớn trong cùng một lượt, kể cả bằng tool call song song. Chỉ chạy song song các lượt đọc nhỏ, độc lập và có output được giới hạn rõ ràng.
- Không đọc toàn bộ lockfile, generated/minified file, log dài, coverage report, build artifact, migration snapshot hoặc JSON/YAML lớn nếu có thể tìm chính xác bằng `Grep`, truy vấn theo key hoặc lấy phần summary.
- Với test/build/lint và terminal output: ưu tiên summary, lỗi, stack trace liên quan và một lượng context nhỏ; không đưa toàn bộ log thành công hoặc output lặp lại vào conversation.
- Với skill: đọc `INDEX.md`, chọn đúng skill cần thiết rồi đọc `SKILL.md`; không nạp hàng loạt skill hoặc toàn bộ thư mục `references/` nếu task không cần. Chỉ mở reference cụ thể khi `SKILL.md` yêu cầu hoặc khi thiếu thông tin để hành động.
- Sau mỗi phase khảo sát lớn, chắt lọc kết luận vào plan/Todo/file trước khi tiếp tục; không giữ nội dung thô của mọi file chỉ để “phòng khi cần”.
- Theo dõi `/context` ở các phiên dài nếu giao diện hỗ trợ. Khi usage khoảng 70% hoặc trước khi chuyển phase lớn (research → plan, plan → implementation, debugging → task mới), đề nghị người dùng chạy `/compact` với mục tiêu rõ ràng; không chờ tới khi gần đầy.
- Trước khi compact, lưu các quyết định, đường dẫn, trạng thái test và bước tiếp theo vào Todo/plan/file. Sau compact, chỉ đọc lại những vùng code cần thiết vì nội dung file đã đọc trước đó không còn đầy đủ trong context.
- Nếu context tăng đột biến hoặc vượt giới hạn: dừng mọi lượt đọc lớn, đề nghị `/compact`; nếu compact không phục hồi ổn định thì dùng `/clear` hoặc tạo session mới thật sự, rồi kiểm tra `/context` trước khi tiếp tục.
- Prompt caching chỉ giảm chi phí/độ trễ cho prefix lặp lại, không làm nội dung chiếm ít context hơn; không xem caching là biện pháp chống tràn context.
- Không được âm thầm cắt bỏ input quan trọng. Nếu dữ liệu cần thiết quá lớn, phải chia chunk, xử lý theo từng phần và nói rõ phần nào đã hoặc chưa được kiểm tra.

## 3. Commands mặc định để tham khảo
> Các lệnh dưới đây chỉ là fallback. Khi vào dự án cụ thể, phải ưu tiên lệnh được định nghĩa trong chính dự án đó.

- **Cài đặt thư viện:** `npm install`, `pnpm install`, `yarn install`, hoặc `pip install -r requirements.txt`
- **Chạy Unit Test:** `npm run test`, `pnpm test`, `pytest`, hoặc command test riêng của repo
- **Chạy E2E Test:** `npx playwright test` hoặc command E2E riêng của repo
- **Chạy Linter/Formatter:** `npm run lint`, `pnpm lint`, `ruff`, `flake8`, `black`, hoặc command riêng của repo
- **Build:** `npm run build`, `pnpm build`, hoặc command build riêng của repo
- **Khởi động Local Server:** `npm run dev`, `pnpm dev`, `uvicorn main:app --reload`, hoặc command dev riêng của repo

## 4. Coding style và bảo mật mặc định
- Không hard-code secrets, API keys, token hoặc mật khẩu trong code.
- Luôn kiểm tra phân quyền/RBAC với dữ liệu nhạy cảm.
- Với file upload: giới hạn dung lượng, kiểm tra extension/MIME type, đổi tên file lưu trữ, tránh path traversal, không thực thi file upload.
- Với database: dùng migration/schema rõ ràng, tránh query ghép chuỗi dễ SQL Injection.
- Với AI/LLM: không để prompt injection điều khiển system/developer instruction; phân biệt rõ nội dung AI tạo ra với nội dung người dùng/giảng viên xác nhận.
- Với frontend: validate dữ liệu từ API, xử lý loading/error/empty state, tránh lộ secret ở client.

## 5. Khu vực project-specific
> Khi đưa file này vào dự án mới, AI Agent có thể cập nhật phần này sau khi đọc repo. Không xóa các quy tắc global phía trên trừ khi anh yêu cầu.

### 5.1 Tech stack thực tế
- Runtime/tooling: Node.js >= 22, pnpm 11, Turborepo, TypeScript strict, ESLint 9.
- Frontend/BFF: Next.js 16 App Router trong `apps/web`.
- Worker: Node.js/TypeScript trong `apps/worker`; Google Gen AI adapter + BullMQ/Redis generation/export/deployment workers, private S3-compatible artifact storage, bounded concurrency/retry và không thực thi user code.
- Database/Auth: PostgreSQL + Drizzle ORM + Auth.js, thiết kế workspace-ready; implementation thuộc Phase 2.
- AI/LLM: Google Gemini sau provider-neutral adapter; mọi structured output phải qua Zod và semantic validation phía server.
- Deploy: Vercel là provider đầu tiên; OAuth credential chỉ ở server, deployment gắn immutable revision.
- Test framework: Vitest + Testing Library + V8 coverage; Playwright E2E chạy critical editor flow.

### 5.2 Commands thực tế
- Install: `pnpm install`
- Dev server: `pnpm dev` (khởi động Web, Preview và Worker qua Turbo; local-live yêu cầu worker health tại `http://127.0.0.1:9464/health/ready`)
- Local topology/bootstrap: `pnpm local:up`
- Stop local topology without deleting volumes: `pnpm local:down`
- Preview dev server: `pnpm --filter @zenui/preview dev`
- Production/local-live worker: `pnpm --filter @zenui/worker start` (`WORKER_SERVICES` selects strict enabled services; local default is `generation,asset,export`)
- Test: `pnpm test`
- Coverage: `pnpm test:coverage`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- E2E: `pnpm test:e2e`

### 5.3 Kiến trúc package
- `apps/web`: dashboard/editor/API BFF.
- `apps/worker`: AI/export/deploy job boundary; generation + export + deployment BullMQ workers, S3-compatible private artifact upload, bounded concurrency và không thực thi user code.
- `apps/preview`: preview app browser-only chạy hostname/origin riêng, deny-by-default CSP và exact validated `postMessage`; local/E2E dùng `127.0.0.1:3001` tách khỏi editor `localhost:3000`.
- `packages/design-schema`: Design Document v1, Zod schemas, limits, semantic validator và JSON Schema export.
- `packages/component-registry`: registry duy nhất cho 18 component Phase 2, composite templates, Inspector metadata và parent-child matrix.
- `packages/design-commands`: command discriminated union, subtree operations và atomic transaction contract.
- `packages/editor-core`: editor session/history, drop planning, sequential autosave coordinator và project-scoped recovery persistence thuần TypeScript.
- `packages/html-compiler`: browser-safe canonical render plan + deterministic multi-route static-site compiler, strict CSP/style hash, route/registry/URL validation và bounded file/site limits; standalone HTML wrapper vẫn giữ compatibility.
- `packages/preview-bridge`: versioned strict preview envelopes và exact origin/source/channel guards dùng chung giữa editor/preview.
- `packages/export-core`: strict durable export job/status/error/artifact contracts và object-store boundary.
- `packages/share-core`: strict public share slug/status/request/redacted response contracts.
- `packages/deployment-core`: strict Vercel connection/deployment/job/status contracts, AES-256-GCM credential cipher và validated Vercel REST adapter.
- `packages/ai-core`: provider-neutral AI contracts, prompt v1/context budgets, structured generation/edit schemas, command materialization, bounded repair/retry và deterministic mock provider.
- `packages/database`: PostgreSQL/Drizzle schema, migrations, workspace-scoped project/generation/export/share/provider-connection/deployment repositories, optimistic document versions, immutable revisions và usage ledger; integration test dùng PGlite.
- `apps/web/lib/server` và `apps/web/app/api`: Auth.js configuration, exact-Origin guard, RBAC/API envelopes, project/document/command/revision/generation/export/share/provider-connection/deployment boundaries, Redis OAuth state/admission/queue và guarded non-production E2E runtime.
- `apps/web/app/s/[slug]`: public read-only share surface trên `SHARE_ORIGIN`, compile immutable revision, noindex/no-store/CSP và không dùng editor session.
- `tests/e2e`: authenticated dashboard/editor autosave/reload/revision/tenant/conflict/export/share/deployment journeys chạy Chromium, Firefox và WebKit; axe audit chặn serious/critical violations.
- `docs/adr`, `docs/product`, `docs/security`: quyết định kiến trúc, interaction/API contracts và threat model.

### 5.4 Ghi chú riêng của dự án
- Design Document JSON là source of truth; mọi thay đổi phải đi qua command layer.
- Local-live mode dùng `ZENUI_LOCAL_AUTH_ENABLED=true` với PostgreSQL/Redis/BullMQ/MinIO và Gemini thật; `ZENUI_E2E_ENABLED=true` chỉ dành cho PGlite + deterministic mock. Hai flag không được bật cùng lúc và đều fail closed ở production.
- Khi Vercel chưa cấu hình, giữ `VERCEL_DEPLOYMENT_ENABLED=false` và không thêm mock/fallback ngoài pure E2E runtime.
- Editor là bounded multi-page structured block editor, không dùng tọa độ pixel và không chạy arbitrary generated JavaScript.
- Preview phải ở separate hostname/origin, dùng sandbox/CSP và validate `postMessage` theo exact origin/source/channel/schema; khác port cùng hostname không đủ để cô lập cookie.
- Public share phải pin immutable revision, chạy trên `SHARE_ORIGIN` khác hostname editor, mặc định noindex/no-store và disable được; không share current draft trực tiếp.
- Deploy luôn yêu cầu owner chọn và xác nhận một immutable revision + target; Vercel OAuth token AES-256-GCM server-only, queue chỉ nhận local IDs và worker không chạy user build command/code.
- Ảnh mới dùng owned asset ID (legacy HTTPS URL chỉ để read compatibility), form chỉ visual, font theo allowlist; export là deterministic multi-route ZIP chứa standalone HTML.
- Giới hạn contract: 500 nodes, depth 12, serialized JSON 1 MiB.
- Khi kết thúc hoặc đổi phase, phải cập nhật `PROJECT_PLAN.md` với checklist và bằng chứng verification trong cùng phiên.
