# ZenUI — Kế hoạch sản phẩm và triển khai

> **Vai trò tài liệu:** Đây là nguồn sự thật chính (single source of truth) cho phạm vi, kiến trúc, tiến độ và tiêu chí nghiệm thu của dự án.
>
> **Quy tắc bắt buộc:** Sau khi hoàn thành hoặc thay đổi bất kỳ phase nào, phải cập nhật tài liệu này trong cùng phiên làm việc. Không được đánh dấu phase hoàn thành nếu chưa cập nhật trạng thái, bằng chứng kiểm chứng, quyết định phát sinh và công việc còn lại.
>
> **Quy ước sơ đồ:** Chỉ sử dụng sơ đồ ASCII trực quan. Không sử dụng Mermaid.

---

## 0. Thông tin tài liệu

| Thuộc tính | Giá trị |
|---|---|
| Tên dự án | ZenUI |
| Mục tiêu MVP | AI website co-designer giúp non-coder đi từ guided brief đến design direction, section-first refinement và share/publish an toàn |
| Trạng thái tổng thể | Implementation |
| Phase hiện tại | Phase 11 / Stage 10B1 — Multi-page Foundation (`In review`); implementation và toàn bộ technical gates, gồm Playwright 84/84 trên Chromium/Firefox/WebKit, đã hoàn tất ngày 2026-07-29; mentor/non-coder acceptance còn mở; Stage 10B2 chưa bắt đầu; Phase 7 external beta gates vẫn mở độc lập |
| Ngày tạo | 2026-07-21 |
| Cập nhật gần nhất | 2026-08-10 |
| Người chịu trách nhiệm cập nhật | Developer/AI agent thực hiện phase |
| Phiên bản tài liệu | 0.15.10 |

### 0.1. Trạng thái hợp lệ

- `Not started`: Chưa bắt đầu.
- `In progress`: Đang triển khai.
- `Blocked`: Bị chặn bởi quyết định, lỗi hoặc phụ thuộc.
- `In review`: Đã triển khai, đang kiểm tra/nghiệm thu.
- `Completed`: Đã đạt toàn bộ exit criteria và có bằng chứng kiểm chứng.
- `Deferred`: Chủ động chuyển sang giai đoạn sau.

### 0.2. Quy tắc cập nhật tài liệu sau mỗi phase

Khi kết thúc một phase, bắt buộc thực hiện đủ các bước sau:

1. Cập nhật bảng **Roadmap & trạng thái phase**.
2. Đánh dấu checklist đã hoàn thành bằng `[x]`.
3. Ghi kết quả vào **Phase Completion Record** của phase đó.
4. Liệt kê chính xác test/build/lint/E2E/security check đã chạy.
5. Ghi rõ bước nào chưa chạy hoặc đang fail.
6. Cập nhật **Decision Log** nếu có thay đổi kiến trúc/phạm vi.
7. Cập nhật **Risk Register** nếu phát hiện rủi ro mới.
8. Cập nhật **Known Issues & Technical Debt**.
9. Cập nhật ngày và phiên bản tài liệu.
10. Chỉ chuyển phase tiếp theo khi toàn bộ exit criteria bắt buộc đã đạt hoặc có quyết định chấp nhận ngoại lệ được ghi lại.

Mẫu cập nhật bắt buộc:

```text
Phase:
Status:
Completed date:
Implemented:
Changed files/modules:
Verification commands:
Passed:
Failed:
Skipped:
Known limitations:
Decisions made:
Risks added/closed:
Next phase readiness:
```

---

# 1. Tầm nhìn sản phẩm

## 1.1. Capability

Xây dựng một AI website co-designer cho phép người không biết code mô tả ý tưởng kinh doanh, xác nhận một guided brief, chọn giữa các hướng thiết kế, tinh chỉnh website theo section bằng hội thoại hoặc thao tác trực quan, xem trước thay đổi trước khi chấp nhận, rồi share hoặc publish mà không phải hiểu component hierarchy, CSS, breakpoint hay revision.

Design Document có cấu trúc, command layer, deterministic renderer/compiler, responsive contracts, undo/revision và immutable publishing tiếp tục là engine bên dưới; chúng bảo đảm trải nghiệm AI vẫn có thể chỉnh sửa, đảo ngược và xuất bản an toàn.

## 1.2. Giá trị người dùng

Người dùng có thể đi từ ý tưởng đến website hoạt động mà không cần học prompt engineering hoặc mental model của một visual development IDE. ZenUI hỗ trợ họ làm rõ audience/goal/CTA, so sánh design directions, giải thích quyết định thiết kế và kiểm soát từng thay đổi AI trước khi website được cập nhật hoặc publish.

## 1.3. Định vị MVP

MVP là:

> **AI website co-designer cho non-coder, backed by a structured, reversible and publishable website engine.**

Lời hứa sản phẩm:

> **Mô tả ý tưởng. Cùng AI hoàn thiện. Xuất bản website.**

MVP không phải:

- Bản sao đầy đủ của Webflow, Claude Design, Vercel v0 hoặc Figma.
- Trình visual development yêu cầu primary user hiểu CSS classes, box model hay component tree.
- Trình thiết kế tự do theo tọa độ pixel.
- IDE thay thế VS Code.
- Trình sinh ứng dụng full-stack tổng quát.

## 1.4. Đối tượng người dùng mục tiêu ban đầu

Ưu tiên theo thứ tự:

1. Người không chuyên lập trình cần tự tạo landing page hoặc website giới thiệu nhanh.
2. Marketer, creator, mentor hoặc chủ doanh nghiệp nhỏ muốn kiểm soát nội dung và tự publish.
3. Developer cần tạo bản nháp giao diện và export source.
4. Agency cần tạo prototype cho khách hàng.

## 1.5. Nguyên tắc trải nghiệm sau product pivot

- **Simple mode là happy path:** guided brief, design directions, section-first actions, contextual AI và simplified publish.
- **Progressive disclosure:** Components, Layers, Inspector, responsive overrides và technical metadata được giữ trong Advanced mode; không xóa năng lực đã triển khai.
- **AI proposes, user decides:** thay đổi AI phải có scope rõ, preview/review được và chỉ cập nhật accepted document sau hành động Accept.
- **Responsive by default:** primary user xem kết quả desktop/mobile nhưng không phải cấu hình breakpoint để có output hợp lệ.
- **Plain-language UI:** container, node ID, token, revision và provider không xuất hiện trong non-coder happy path nếu không cần cho quyết định của họ.
- Webflow và Claude Design là nguồn tham khảo công khai cho product interaction/lifecycle; ZenUI không tuyên bố parity, không sao chép giao diện/thương hiệu và không coi nhận định nghiên cứu là benchmark định lượng.

---

# 2. Phạm vi sản phẩm

## 2.1. Tính năng bắt buộc của MVP

### AI generation

- Nhập prompt để tạo landing page.
- AI trả Design Document có cấu trúc.
- Validate schema trước khi áp dụng.
- Có loading, success và error state.
- Tự repair output không hợp lệ tối đa 1–2 lần.

### Structured drag-and-drop

- Kéo component từ thư viện vào canvas.
- Reorder section.
- Di chuyển component giữa container hợp lệ.
- Hiển thị drop indicator.
- Từ chối drop target không hợp lệ.
- Kéo-thả trong Layers tree.
- Mọi thao tác kéo-thả có undo/redo.

### Visual editing

- Click chọn node trên canvas.
- Hover highlight và selected outline.
- Inline text editing.
- Inspector chỉnh content, layout, typography và appearance.
- Chỉnh responsive theo desktop/tablet/mobile.
- Duplicate, hide và delete node.

### AI editing

- AI chỉnh toàn trang.
- AI chỉnh node đang được chọn.
- AI trả operation thay vì thay toàn bộ raw source.
- Mỗi AI edit tạo revision.
- Operation lỗi không được làm hỏng document hiện tại.

### Persistence

- Autosave.
- Optimistic concurrency.
- Undo/redo trong phiên.
- Revision history.
- Restore revision.

### Output

- Preview sandbox.
- Export standalone HTML.
- Có thể mở file export độc lập trong trình duyệt.
- Share link chỉ đọc, gắn với revision bất biến.
- Deploy một revision qua một provider.

### Security và vận hành

- Auth và phân quyền workspace/project.
- Preview tách origin với editor.
- Không chạy JavaScript tùy ý do AI tạo trong MVP.
- Rate limit cho AI/deploy/export.
- Usage tracking.
- Không lộ provider token ra client hoặc log.

## 2.2. Non-goals của MVP

- Kéo-thả tự do theo tọa độ pixel.
- Backend/database generation.
- Arbitrary generated JavaScript.
- Import arbitrary React/Next.js project.
- Parse source code trở lại visual tree.
- Nhiều framework export.
- Realtime multiplayer hoặc CRDT.
- Plugin marketplace.
- Custom npm package.
- Animation timeline nâng cao.
- Mobile app builder.
- AI tự deploy mà không có xác nhận của người dùng.
- Website nhiều trang phức tạp; MVP tập trung landing page một trang.

---

# 3. Nguyên tắc kiến trúc bắt buộc

## 3.1. Source of truth

> **Design Document JSON là source of truth duy nhất của thiết kế.**

Không dùng DOM, raw HTML/CSS hoặc generated React code làm nguồn dữ liệu chuẩn trong MVP.

```text
                         +----------------------+
                         | Design Document JSON |
                         +----------+-----------+
                                    |
             +----------------------+----------------------+
             |                      |                      |
             v                      v                      v
    +----------------+    +------------------+    +------------------+
    | Canvas Renderer|    | Preview Renderer |    | HTML/CSS Compiler|
    +----------------+    +------------------+    +--------+---------+
             |                      |                      |
             v                      v                      v
      Visual Editing        Sandbox Preview        Export / Deploy
```

## 3.2. Một command system cho mọi thay đổi

Mọi thay đổi từ kéo-thả, inspector, keyboard hoặc AI đều phải đi qua command layer.

```text
User drag/drop ------+
Inspector edit ------+----> Validate Command ----> Apply Transaction
Keyboard action -----+              |                     |
AI operations -------+              |                     v
                                    |              Updated Document
                                    |                     |
                                    +---- Reject ----------+
```

Command tối thiểu:

- `INSERT_NODE`
- `MOVE_NODE`
- `REMOVE_NODE`
- `DUPLICATE_NODE`
- `UPDATE_PROPS`
- `UPDATE_STYLE`
- `UPDATE_RESPONSIVE_STYLE`
- `UPDATE_THEME`
- `REPLACE_SUBTREE`

## 3.3. Deterministic renderer/compiler

Cùng một Design Document và compiler version phải tạo kết quả tương đương. Preview và export phải dùng chung logic render/compile để tránh sai lệch.

## 3.4. Block-based responsive layout

Component được thả theo cấu trúc parent/child, không theo tọa độ tuyệt đối.

```text
Page
|
+-- Navbar
|
+-- Section
|   |
|   +-- Container
|       |
|       +-- Heading
|       +-- Paragraph
|       +-- Button
|       +-- Columns
|           |
|           +-- Column
|           |   +-- Card
|           |
|           +-- Column
|               +-- Card
|
+-- Footer
```

## 3.5. Security boundary

Generated content không được chạy trong cùng trust boundary với editor/backend.

```text
+---------------------------+       postMessage       +---------------------------+
| Editor                    | <---------------------> | Preview                   |
| app.example.com           |   schema + origin check| preview.exampleusercontent|
| Authenticated             |                        | No editor auth cookie      |
+-------------+-------------+                        +-------------+-------------+
              |                                                    |
              v                                                    v
       Application API                                     Sandboxed renderer
```

---

# 4. Workflow sản phẩm

## 4.1. Workflow chính

```text
+------------------+
| 1. Create Project|
+--------+---------+
         |
         v
+------------------+
| 2. Enter Prompt  |
+--------+---------+
         |
         v
+---------------------------+
| 3. AI Generates Document  |
| schema + semantic validate|
+-------------+-------------+
              |
       +------+------+
       | valid?      |
       +--+--------+-+
          | Yes    | No
          v        v
+----------------+ +----------------------+
| 4. Render      | | Repair <= 2 attempts |
| Canvas/Preview | +----------+-----------+
+-------+--------+            |
        |                     +----> Fail with recoverable error
        v
+--------------------------------------+
| 5. Edit                              |
| - Click-to-edit                      |
| - Drag/drop                          |
| - Inspector                          |
| - AI edit selected node / whole page |
+-------------------+------------------+
                    |
                    v
+---------------------------+
| 6. Autosave + Revisions   |
| Undo / Redo / Restore     |
+-------------+-------------+
              |
              v
+-----------------------------------+
| 7. Choose Output                  |
+----------+------------+-----------+
           |            |           |
           v            v           v
    +------------+ +---------+ +----------+
    | Export ZIP | | Share   | | Deploy   |
    +------------+ +---------+ +----------+
```

## 4.2. Workflow kéo-thả

```text
+-------------------------+
| Drag starts             |
| palette node/tree node  |
+------------+------------+
             |
             v
+-------------------------+
| Detect candidate target |
+------------+------------+
             |
             v
+----------------------------------+
| Validate drop                     |
| - allowed parent/child            |
| - no circular relationship        |
| - max depth                       |
| - unique ID                       |
+----------------+-----------------+
                 |
          +------+------+
          | valid?      |
          +--+--------+-+
             | Yes    | No
             v        v
+-------------------+ +--------------------+
| Show drop marker  | | Show invalid state |
| create command    | | reject drop        |
+---------+---------+ +--------------------+
          |
          v
+--------------------+
| Apply transaction  |
+---------+----------+
          |
          v
+--------------------+
| Render + autosave  |
| push undo history  |
+--------------------+
```

## 4.3. Workflow AI edit

```text
+-------------------------+
| User prompt             |
| scope: page / selection |
+------------+------------+
             |
             v
+-----------------------------+
| Build minimal context       |
| theme + schema + node/tree  |
+--------------+--------------+
               |
               v
+-----------------------------+
| LLM structured output       |
| operations[] + summary      |
+--------------+--------------+
               |
               v
+-----------------------------+
| Validate                    |
| JSON schema + business rules|
+--------------+--------------+
               |
        +------+------+
        | valid?      |
        +--+--------+-+
           | Yes    | No
           v        v
+------------------+ +-----------------------+
| Apply atomically | | Repair <= 2 attempts  |
+--------+---------+ +-----------+-----------+
         |                       |
         v                       +----> Reject and preserve current document
+-------------------------+
| Render verification     |
+------------+------------+
             |
             v
+-------------------------+
| Create revision         |
| Show summary and diff   |
+-------------------------+
```

## 4.4. Workflow deploy

```text
+----------------------+
| User clicks Deploy   |
+----------+-----------+
           |
           v
+-----------------------------+
| Confirm target + revision   |
+--------------+--------------+
               |
               v
+-----------------------------+
| Create immutable artifact   |
+--------------+--------------+
               |
               v
+-----------------------------+
| Enqueue idempotent job      |
+--------------+--------------+
               |
               v
+-----------------------------+
| Provider API                |
| queued -> uploading -> build|
+--------------+--------------+
               |
        +------+------+
        | result      |
        +--+--------+-+
           | Ready  | Failed
           v        v
+----------------+ +----------------------+
| Save URL       | | Save redacted error  |
| Return success | | Allow bounded retry  |
+----------------+ +----------------------+
```

---

# 5. Bề mặt giao diện

## 5.1. Editor layout

```text
+--------------------------------------------------------------------------------+
| Logo | Project | Save status | Undo | Redo | Desktop Tablet Mobile | Preview   |
|                                                      Export | Share | Deploy   |
+------------------+--------------------------------------+----------------------+
| COMPONENTS       |                                      | INSPECTOR            |
|                  |                                      |                      |
| Layout           |                                      | Content              |
| - Section        |                                      | Layout               |
| - Container      |              CANVAS                  | Typography           |
| - Stack          |                                      | Appearance           |
| - Columns        |       Hover / Select / Drop zones    | Responsive           |
|                  |                                      |                      |
| Content          |                                      +----------------------+
| - Heading        |                                      | AI ASSISTANT         |
| - Paragraph      |                                      |                      |
| - Image          |                                      | Scope: selection/page|
| - Button         |                                      | Prompt input         |
|                  |                                      | Run status           |
+------------------+                                      |                      |
| LAYERS           |                                      |                      |
| Page             |                                      |                      |
| +- Navbar        |                                      |                      |
| +- Hero          |                                      |                      |
| +- Features      |                                      |                      |
+------------------+--------------------------------------+----------------------+
| AI status | Autosave status | Validation error | Preview error | Deploy status  |
+--------------------------------------------------------------------------------+
```

## 5.2. Trạng thái UI bắt buộc

- Empty project.
- AI generation queued/running/repairing/completed/failed.
- Canvas loading.
- Preview ready/error.
- Autosave saving/saved/error/offline.
- Invalid drop target.
- Document conflict.
- Export preparing/ready/failed.
- Share active/disabled/expired.
- Deploy queued/uploading/building/ready/failed.
- Provider disconnected/token expired.

---

# 6. Component Registry

## 6.1. Component MVP

### Layout primitives

1. Page.
2. Section.
3. Container.
4. Stack.
5. Columns.
6. Column.
7. Divider.
8. Spacer.

### Content primitives

9. Heading.
10. Paragraph.
11. Image.
12. Button.
13. Link.
14. Icon.
15. Badge.

### Composite components

16. Navbar.
17. Hero.
18. Feature Card.
19. Pricing Card.
20. Testimonial.
21. FAQ.
22. Contact Form.
23. Footer.

MVP beta có thể yêu cầu tối thiểu 15 component hoàn chỉnh; các component còn lại có thể được bổ sung trước beta nếu không ảnh hưởng critical path.

## 6.2. Contract mỗi component

```text
ComponentDefinition
|- type
|- displayName
|- category
|- icon
|- defaultProps
|- propSchema
|- styleSchema
|- allowedChildren
|- allowedParents
|- renderer
|- compiler
|- aiDescription
|- inspectorConfig
|- testFixtures
```

## 6.3. Quy tắc parent-child mẫu

| Component | Children hợp lệ | Parent hợp lệ |
|---|---|---|
| Page | Navbar, Section, Footer | Không có |
| Section | Container, content | Page |
| Container | Stack, Columns, content | Section |
| Columns | Column | Section, Container |
| Column | Stack, content | Columns |
| Heading | Không có | Section, Container, Stack, Column |
| Button | Icon nội bộ | Section, Container, Stack, Column |
| Navbar | Logo, Link, Button | Page |
| Footer | Container, Stack, Link, Text | Page |

---

# 7. Design Document

## 7.1. Dạng dữ liệu đề xuất

```json
{
  "schemaVersion": 1,
  "projectId": "project-1",
  "theme": {
    "colors": {
      "primary": "#2563eb",
      "background": "#ffffff",
      "text": "#0f172a"
    },
    "fonts": {
      "heading": "Manrope",
      "body": "Manrope"
    },
    "radius": {
      "sm": 6,
      "md": 12,
      "lg": 20
    }
  },
  "pages": [
    {
      "id": "home",
      "name": "Home",
      "slug": "/",
      "rootNodeId": "page-root"
    }
  ],
  "nodes": {
    "page-root": {
      "id": "page-root",
      "type": "page",
      "parentId": null,
      "children": ["hero-1"]
    },
    "hero-1": {
      "id": "hero-1",
      "type": "section",
      "parentId": "page-root",
      "children": ["heading-1"],
      "props": {},
      "style": {
        "paddingTop": 96,
        "paddingBottom": 96,
        "backgroundColor": "#ffffff"
      },
      "responsive": {}
    },
    "heading-1": {
      "id": "heading-1",
      "type": "heading",
      "parentId": "hero-1",
      "children": [],
      "props": {
        "text": "Build your next product",
        "level": 1
      },
      "style": {
        "color": "#0f172a"
      },
      "responsive": {}
    }
  }
}
```

## 7.2. Invariant

- Mọi node ID duy nhất trong document.
- Parent và children phải tham chiếu nhất quán hai chiều.
- Root node không có parent.
- Không có orphan node trừ node đang được tạo trong transaction chưa commit.
- Không có cycle.
- Node type phải tồn tại trong registry.
- Props/style phải đúng schema component.
- URL không được sử dụng protocol nguy hiểm.
- Tree không vượt max depth và max nodes đã cấu hình.
- `schemaVersion` phải được hỗ trợ hoặc migrate trước khi render.

## 7.3. Responsive

```json
{
  "style": {
    "display": "grid",
    "gridColumns": 3,
    "gap": 24
  },
  "responsive": {
    "tablet": {
      "gridColumns": 2
    },
    "mobile": {
      "gridColumns": 1,
      "gap": 16
    }
  }
}
```

- Desktop/base là style mặc định.
- Tablet/mobile chỉ chứa override.
- Structure và content dùng chung giữa breakpoint.
- Node có thể bị ẩn theo breakpoint.

---

# 8. Kiến trúc hệ thống

## 8.1. Tổng thể

```text
+------------------------------------------------------------------+
| Next.js Web Editor                                               |
| Dashboard | Canvas | DnD | Layers | Inspector | AI | Preview     |
+------------------------------+-----------------------------------+
                               | HTTPS + SSE
                               v
+------------------------------------------------------------------+
| Application API                                                  |
| Auth | Workspace | Project | Document | Revision | Share | Deploy|
+------------------+---------------------------+-------------------+
                   |                           |
                   v                           v
       +-----------------------+     +-------------------------+
       | PostgreSQL            |     | AI Orchestrator         |
       | metadata + JSONB      |     | provider adapters       |
       +-----------+-----------+     +------------+------------+
                   |                              |
                   v                              v
       +-----------------------+     +-------------------------+
       | Object Storage        |     | Redis / Job Queue       |
       | assets/artifacts      |     | AI/export/deploy jobs   |
       +-----------------------+     +------------+------------+
                                                 |
                                                 v
                                    +-------------------------+
                                    | Worker / Sandbox        |
                                    | compile/validate/deploy |
                                    +-------------------------+
```

## 8.2. Stack khuyến nghị ban đầu

### Monorepo

- TypeScript.
- pnpm workspace.
- Turborepo.

### Frontend

- Next.js.
- React.
- Tailwind CSS.
- dnd-kit.
- Zustand cho editor state.
- TanStack Query cho server state.
- Zod cho validation.
- iframe và `postMessage` cho preview bridge.

### Backend

- Next.js Route Handlers/BFF cho MVP.
- Worker process riêng cho AI/export/deploy.
- PostgreSQL.
- Redis + BullMQ.
- S3-compatible object storage.

### Testing

- Vitest cho unit tests.
- Testing Library cho UI/component tests.
- Playwright cho E2E.
- Schema/property tests cho command/document invariants.

Các lựa chọn trên là **architecture preference**, chưa phải product truth. Nếu repo khởi tạo sử dụng stack khác, phải lập quyết định thay đổi và cập nhật tài liệu này trước khi triển khai sâu.

---

# 9. AI architecture

## 9.1. Provider abstraction

```text
LLMProvider
|- generateStructuredDesign(input)
|- generateOperations(input)
|- streamConversation(input)
|- countUsage(response)
|- normalizeError(error)
|- capabilities()
```

## 9.2. Guardrails

- Structured output có schema.
- Validate lại ở server, không tin model output.
- Semantic validation sau schema validation.
- Apply operations atomically.
- Repair tối đa 1–2 lần.
- Có timeout và budget.
- Chỉ retry lỗi tạm thời.
- Không retry auth/validation error.
- Redact secret trước khi gửi model.
- Ghi usage theo user/workspace/project/run.
- Prompt có version.
- Không để nội dung user điều khiển system/developer policy.

## 9.3. Context strategy

### Create project

Gửi:

- User prompt.
- Design schema.
- Component registry đã rút gọn.
- Theme constraints.
- Output contract.

### Edit selected node

Gửi:

- Selected node.
- Parent/ancestor gần nhất.
- Children liên quan.
- Theme.
- Component schema.
- User request.

### Edit whole page

Gửi:

- Document summary.
- Section outline.
- Theme.
- Node liên quan.
- Full document chỉ khi cần và nằm trong budget.

---

# 10. Preview, export, share và deploy

## 10.1. Preview sandbox

- Editor và preview khác origin.
- Preview không nhận editor cookie/token.
- Validate mọi message bằng schema.
- Kiểm tra `event.origin`.
- Không dùng raw event payload trực tiếp.
- Không cho arbitrary generated JavaScript trong MVP.
- CSP deny-by-default và chỉ mở tài nguyên cần thiết.

Message protocol tối thiểu:

```text
Editor -> Preview
|- SET_DOCUMENT
|- SET_VIEWPORT
|- SELECT_NODE
|- SET_MODE

Preview -> Editor
|- NODE_CLICKED
|- NODE_HOVERED
|- RENDER_READY
|- RENDER_ERROR
```

## 10.2. Export

MVP bắt buộc:

- `index.html` standalone.
- CSS nhúng trong `<style>`.
- Asset external phải được xử lý rõ ràng hoặc đóng gói.
- Compiler output được sanitize.
- Preview/export consistency test.

Mở rộng:

```text
website.zip
|- index.html
|- styles.css
+- assets/
   |- logo.svg
   +- hero.webp
```

## 10.3. Share

- Link trỏ tới revision cố định.
- Slug ngẫu nhiên khó đoán.
- Mặc định `noindex`.
- Read-only.
- Có thể disable.
- Có thể hết hạn trong tương lai.
- Không lộ project/workspace metadata.

## 10.4. Deploy

- Một provider trong MVP.
- OAuth nếu provider hỗ trợ.
- Token mã hóa server-side.
- Scope tối thiểu.
- Idempotency key.
- Deployment gắn revision cụ thể.
- Log được redact.
- Retry có giới hạn.
- Không deploy tự động nếu chưa xác nhận.

State machine:

```text
queued -> uploading -> building -> ready
   |          |            |
   +----------+------------+----> failed
```

---

# 11. Data model tối thiểu

```text
User
Workspace
WorkspaceMember
Project
DesignDocument
Revision
Asset
GenerationRun
Conversation
Message
ShareLink
ProviderConnection
Deployment
UsageRecord
```

## 11.1. Project

```text
id
workspaceId
name
status
currentDocumentVersion
createdBy
createdAt
updatedAt
```

## 11.2. DesignDocument

```text
id
projectId
schemaVersion
documentJson
version
updatedAt
```

`version` dùng cho optimistic concurrency.

## 11.3. Revision

```text
id
projectId
documentSnapshot
source: manual | ai | restore | import
summary
createdBy
generationRunId
createdAt
```

## 11.4. GenerationRun

```text
id
projectId
selectedNodeId
prompt
status
provider
model
promptVersion
inputUsage
outputUsage
errorCode
startedAt
completedAt
```

## 11.5. Deployment

```text
id
projectId
revisionId
provider
providerDeploymentId
idempotencyKey
status
url
errorCode
createdAt
updatedAt
```

## 11.6. ShareLink

```text
id
projectId
revisionId
slug
status
expiresAt
createdAt
```

---

# 12. Roadmap và trạng thái phase

| Phase | Tên | Trạng thái | Mục tiêu | Phụ thuộc |
|---|---|---|---|---|
| 0 | Product & Architecture Foundation | Completed | Chốt contract, schema, stack và prototype plan | Không |
| 1 | Editor Core Prototype | Completed | Renderer, command system, drag/drop cơ bản | Phase 0 |
| 2 | Editor Foundation | Completed | Dashboard, registry, canvas, layers, inspector, persistence | Phase 1 |
| 3 | AI Generation & Editing | Completed | Prompt tạo trang và AI operations | Phase 2 |
| 4 | Secure Preview & Export | Completed | Preview sandbox, HTML compiler/export | Phase 2 |
| 5 | Share | Completed | Immutable public revision link | Phase 4 |
| 6 | Deploy | Completed | Một provider, OAuth, deploy job | Phase 4 |
| 7 | Hardening & Beta | In review | Security, E2E, performance, recovery; external environment gates remain open | Phase 3–6 |
| 8 | Non-coder Product Experience Reset | Completed | Guided brief, design directions, section-first Simple mode, contextual AI review và simplified publish specification/prototype | Phase 1–7 foundations |
| 9 | Guided Brief & Design Direction Gallery Production | Completed | Production onboarding, one bounded content request, three transient directions và atomic choose | Phase 8 / Stage 4 acceptance |
| 10 | Non-coder Production Co-design | Completed | Stage 8 intelligence và Stage 9 Simple Preview/Share/Publish đã hoàn tất technical gates và mentor acceptance | Phase 9 |
| 11 | Website Lifecycle Expansion | In review — Stage 10B1 | Stage 10A đã Completed; bounded multi-page, migration v1→v2 và immutable multi-route publication đã qua deterministic gate; chờ cross-browser/acceptance trước Stage 10B2 | Phase 10 / Stage 9 acceptance |

---

# 13. Phase 0 — Product & Architecture Foundation

## 13.1. Mục tiêu

Biến kế hoạch thành contract có thể triển khai mà không phải quyết định lại các nguyên tắc cốt lõi giữa chừng.

## 13.2. Checklist

- [x] Xác định tầm nhìn và phạm vi MVP.
- [x] Chốt kéo-thả dạng block-based, không pixel-based.
- [x] Chốt Design Document JSON là source of truth.
- [x] Chốt command system dùng chung cho user và AI.
- [x] Chốt preview/export dùng cùng renderer/compiler logic.
- [x] Xác định component registry sơ bộ.
- [x] Xác định workflow chính bằng ASCII.
- [x] Chốt provider AI đầu tiên.
- [x] Chốt provider deploy đầu tiên.
- [x] Chốt cơ chế auth.
- [x] Chốt monorepo/package structure.
- [x] Chốt schema version 1 bằng Zod/JSON Schema.
- [x] Tạo ADR cho các quyết định kiến trúc quan trọng khi bắt đầu code.
- [x] Tạo wireframe/editor prototype cụ thể.

## 13.3. Exit criteria

- [x] Không còn open question chặn Phase 1.
- [x] Design schema v1 có validator.
- [x] Command contracts được mô tả đủ để viết unit test.
- [x] Component registry có tối thiểu 8 component prototype.
- [x] Stack và cấu trúc repo được quyết định.
- [x] Threat model tối thiểu cho iframe/AI/deploy được duyệt.

## 13.4. Phase Completion Record

```text
Phase: Phase 0 — Product & Architecture Foundation
Status: Completed
Completed date: 2026-07-21
Implemented: pnpm/Turborepo scaffold; Next.js web và Node worker boundaries; Design Document v1 Zod/semantic validator/JSON Schema; 9 command contracts và atomic transaction behavior; registry 8 component; 6 accepted ADRs; editor wireframe, Phase 1 journeys, API contract và threat model.
Changed files/modules: root configs; apps/web; apps/worker; packages/design-schema; packages/component-registry; packages/design-commands; docs/adr; docs/product; docs/security; CLAUDE.md; PROJECT_PLAN.md.
Verification commands: pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage; pnpm build; secret-pattern scan; Mermaid scan.
Passed: lint 5/5 tasks; typecheck 5/5; unit tests 44/44 across executable Phase 0 packages; build 5/5; statement coverage design-schema 87.65%, component-registry 80%, design-commands 85.24%; no secret-pattern match; no Mermaid code block.
Failed: None in final verification.
Skipped: Playwright E2E because UI interaction implementation begins in Phase 1; dependency audit was not part of the recorded Phase 0 gate.
Known limitations: REPLACE_SUBTREE execution, full undo/redo reducer, editor UI, persistence and standalone compiler remain Phase 1 work. Web/worker are scaffolds and intentionally have no tests yet.
Decisions made: D-007 through D-016; ADR-0001 through ADR-0006.
Risks added/closed: TD-001, TD-002 and TD-003 closed; existing product/runtime risks remain owned by later phases.
Next phase readiness: Ready for Phase 1 TDD implementation.
```

---

# 14. Phase 1 — Editor Core Prototype

## 14.1. Mục tiêu

Chứng minh các rủi ro kỹ thuật lớn nhất trước khi tích hợp AI: schema, renderer, drag/drop, commands và export.

## 14.2. Scope

- Khởi tạo monorepo.
- Design schema v1.
- 8 component cơ bản: Page, Section, Container, Stack, Heading, Paragraph, Image, Button.
- Canvas renderer.
- Component palette.
- Drag component vào canvas.
- Reorder node.
- Click select.
- Sửa text và màu.
- Undo/redo.
- Persistence đơn giản.
- Export standalone HTML.

## 14.3. Checklist

- [x] Viết schema tests trước implementation.
- [x] Viết command reducer tests.
- [x] Implement component registry.
- [x] Implement renderer.
- [x] Implement selection.
- [x] Implement drag/drop từ palette.
- [x] Implement reorder.
- [x] Implement invalid-drop rejection.
- [x] Implement basic inspector.
- [x] Implement undo/redo.
- [x] Implement persistence.
- [x] Implement HTML compiler.
- [x] Viết E2E happy path.

## 14.4. Exit criteria

```text
Kéo Heading vào Section
-> sửa text
-> đổi màu
-> reorder
-> undo/redo
-> reload không mất dữ liệu
-> export HTML mở độc lập và hiển thị tương đương
```

Bắt buộc:

- [x] Unit tests command/schema pass.
- [x] E2E core flow pass.
- [x] Build/typecheck/lint pass.
- [x] Không có cycle/orphan/duplicate node sau fuzz/property tests cơ bản.

## 14.5. Phase Completion Record

```text
Phase: Phase 1 — Editor Core Prototype
Status: Completed
Completed date: 2026-07-21
Implemented: REPLACE_SUBTREE/subtree inverse semantics; editor-core state/history/drop planner/versioned local persistence; deterministic safe HTML compiler; responsive React editor with registry palette, Canvas selection, dnd-kit pointer/keyboard drag, reorder controls, invalid-target announcements, text/color Inspector, undo/redo, reload and HTML download; fast-check property invariants; Playwright happy/invalid flows.
Changed files/modules: apps/web editor UI/test config/component tests; packages/design-commands; new packages/editor-core and html-compiler; root Playwright config/tests/e2e; package manifests/lockfile; CLAUDE.md; PROJECT_PLAN.md.
Verification commands: pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage; pnpm build; pnpm test:e2e; secret-pattern scan; unsafe-render scan; Mermaid scan; git diff/status review.
Passed: lint 7/7; typecheck 7/7; unit/component/property tests 70/70 (11 schema, 12 registry, 29 commands, 8 editor-core, 4 compiler, 6 web); coverage gate passed; build 7/7; Playwright Chromium 2/2; 100 fast-check generated edit/history runs retained valid documents; no secret, dangerouslySetInnerHTML, arbitrary script or Mermaid match.
Coverage: design-schema 97.53/92.85/100/98.57; component-registry 97.5/88.88/100/100; design-commands 87.07/75.65/95/97.67; editor-core 91.95/85.24/100/100; html-compiler 95.12/88.57/100/97.22; web 82.99/69/91.89/89.51 (statements/branches/functions/lines).
Failed: None in final verification.
Skipped: Worker behavioral tests remain deferred because Phase 1 added no worker behavior; manual cross-browser E2E beyond Chromium not run.
Known limitations: Command engine and web UI interaction branch coverage remain below 80%; package gates are explicit at current baselines while executable schema/registry/editor-core/compiler packages exceed 80% on all metrics. Persistence is browser-local prototype only; server autosave/revision, Layers tree and full Inspector remain Phase 2. Separate-origin preview/CSP stays Phase 4.
Decisions made: Reused registry/schema/command direction; dnd-kit for pointer/keyboard sensors; separate pure editor-core and html-compiler packages; local storage envelope version 1.
Risks added/closed: R-001 reduced by atomic commands and property tests; R-004 reduced by shared registry/render primitives; TD-004 closed; web portion of TD-005 closed, worker portion remains Phase 3 owner.
Next phase readiness: Ready for Phase 2 Editor Foundation.
```

---

# 15. Phase 2 — Editor Foundation

## 15.1. Mục tiêu

Xây editor usable với project persistence, layers, inspector, responsive và revision.

## 15.2. Scope

- Dashboard/project CRUD.
- Auth/workspace cơ bản.
- Component registry mở rộng 15–20 component.
- Layers tree.
- Canvas drop zones.
- Inspector đầy đủ trong allowlist.
- Desktop/tablet/mobile.
- Autosave.
- Optimistic concurrency.
- Revision cơ bản.
- Restore revision.
- Keyboard shortcuts.
- Accessibility cơ bản.

## 15.3. Checklist

- [x] Project CRUD và authorization tests.
- [x] Layers tree đồng bộ canvas.
- [x] Drag/drop giữa các container.
- [x] Composite components.
- [x] Inspector content/layout/typography/appearance.
- [x] Responsive overrides.
- [x] Autosave state machine.
- [x] Conflict handling.
- [x] Revision snapshot.
- [x] Restore flow.
- [x] Loading/error/empty states.
- [x] E2E editor workflow.

## 15.4. Exit criteria

- [x] Có ít nhất 15 component dùng được.
- [x] Canvas và Layers luôn đồng bộ.
- [x] Invalid parent/child bị từ chối.
- [x] Autosave và reload không mất dữ liệu.
- [x] Restore revision hoạt động.
- [x] Desktop/tablet/mobile render đúng override.
- [x] Authorization không cho truy cập chéo workspace.
- [x] Test/build/lint/typecheck/E2E pass.

## 15.5. Phase Completion Record

```text
Phase: Phase 2 — Editor Foundation
Status: Completed
Completed date: 2026-07-22
Implemented: PostgreSQL/Drizzle workspace repository and immutable migration; Auth.js production session boundary plus non-production guarded E2E session/PGlite harness; exact trusted-Origin guard for every project mutation; project list/create/read/rename/archive, document, atomic command and revision list/create/restore APIs; authenticated dashboard with loading/error/empty/role states; registry 18 components, Layers/Canvas/DnD/Inspector/responsive editor; server-backed sequential autosave, project recovery copies, stale-version conflict UI, revision creation/restore; Chromium/Firefox/WebKit authenticated persistence/tenant/conflict/export journeys and axe accessibility audit.
Changed files/modules: root env/workspace/Playwright/dependency config; packages/database repository/tests; apps/web dashboard/project routes/auth/runtime/API/editor/styles/tests; tests/e2e; docs/product/api-contract.md; docs/security/threat-model.md; CLAUDE.md; PROJECT_PLAN.md.
Verification commands: focused Vitest RED/GREEN targets for Origin/repository/API/dashboard/E2E-runtime/editor; pnpm db:check with safe placeholder DATABASE_URL; pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage; pnpm build; pnpm test:e2e; pnpm audit --prod; secret/unsafe-render/auth-localStorage scans; git diff --check; Mermaid scan.
Passed: lint 8/8; typecheck 8/8; unit/component/property/integration tests 153/153 (13 schema, 23 registry, 34 commands, 11 editor-core, 5 compiler, 11 database, 56 web); coverage gates >=80% on all executable packages/apps — schema 97.56/92.85/100/98.59, registry 97.82/94.11/100/100, commands 96.62/92.17/100/100, editor-core 91.42/84.52/100/98.86, compiler 95/90.38/100/98.11, database 93.4/82/100/100, web 88.51/80.15/92.51/90.9 (statements/branches/functions/lines); build 8/8; Playwright 15/15 across Chromium, Firefox and WebKit; axe found zero serious/critical dashboard/editor violations; db:check pass; final production dependency audit clean after forcing sharp >=0.35.0; security scans clean; git diff --check clean except expected Windows LF/CRLF notices; no Mermaid block.
Failed: Intermediate RED tests, first E2E parallel run, initial lint, initial coverage and initial dependency audit failed for intended missing behavior/concurrency/import/branch/sharp issues; all final reruns passed.
Skipped: Live external PostgreSQL service was not required because deterministic integration/E2E use PGlite against the immutable PostgreSQL migration. Worker behavioral tests remain Phase 3 ownership because no worker behavior exists yet.
Known limitations: Production login still requires configured GitHub OAuth and PostgreSQL; test-only E2E routes are guarded by NODE_ENV != production plus ZENUI_E2E_ENABLED. Recovery is explicit reload/download, not automatic merge. Separate-origin preview/CSP remains Phase 4 by scope.
Decisions made: Keep same-site secure Auth.js production sessions; enforce exact Origin on mutations; use a signed allowlisted HTTP-only E2E identity cookie and singleton in-memory PGlite only when guarded; serialize cross-browser E2E to avoid shared reset races; recovery never silently overwrites the server.
Risks added/closed: R-005 reduced by optimistic autosave/conflict E2E; TD-006, TD-007 and TD-008 closed. Phase 3+ security risks remain with their owners.
Next phase readiness: Ready for Phase 3 AI Generation & Editing.
```

---

# 16. Phase 3 — AI Generation & Editing

## 16.1. Mục tiêu

Cho phép AI tạo Design Document mới và sửa document hiện có bằng structured operations an toàn.

## 16.2. Scope

- AI provider adapter.
- Prompt versioning.
- Generate design.
- Edit selected node.
- Edit whole page.
- Structured output schemas.
- Semantic validation.
- Atomic apply.
- Repair tối đa 1–2 vòng.
- SSE run status.
- Usage tracking.
- Rate limit/budget.
- Revision cho AI edit.

## 16.3. Checklist

- [x] Provider interface.
- [x] Mock provider cho tests.
- [x] Create-design prompt contract.
- [x] Edit-operations prompt contract.
- [x] Structured output validation.
- [x] Semantic validation.
- [x] Atomic transaction.
- [x] Repair limit.
- [x] Timeout/retry classification.
- [x] SSE statuses.
- [x] Usage ledger.
- [x] Prompt injection boundary tests.
- [x] AI operation regression fixtures.
- [x] E2E prompt -> edit -> revision.

## 16.4. Exit criteria

- [x] Prompt tạo landing page hợp lệ.
- [x] AI sửa selected node đúng scope.
- [x] AI sửa toàn trang bằng operations.
- [x] Invalid AI output không thay đổi current document.
- [x] Repair không chạy quá giới hạn.
- [x] Mỗi run có status, usage và error code.
- [x] Mỗi AI edit thành công tạo revision.
- [x] Test/build/lint/typecheck/E2E pass.

## 16.5. Phase Completion Record

```text
Phase: Phase 3 — AI Generation & Editing
Status: Completed
Completed date: 2026-07-22
Implemented: @zenui/ai-core provider-neutral contracts, prompt v1/minimal context, generate/edit schemas, selected-subtree scope, REPLACE_DOCUMENT command, bounded repair/transient retry/timeout and deterministic mock; generation_runs/usage_records migration and workspace repository; Google Gen AI adapter plus BullMQ/Redis worker/admission; authenticated generation collection/item/SSE APIs; AI Assistant with canonical reload; immutable source=ai revision and optimistic stale protection; deterministic authenticated E2E fixtures.
Changed files/modules: new packages/ai-core; design-commands REPLACE_DOCUMENT; database schema/migration/repository/tests; apps/worker Gemini/BullMQ runtime/tests; apps/web generation API/infrastructure/routes/AI Assistant/tests; tests/e2e/ai-generation.spec.ts; env/API/security/ADR/CLAUDE/project docs.
Verification commands: focused Vitest RED/GREEN targets; pnpm db:generate; DATABASE_URL=postgresql://zenui:verification-only@localhost:5432/zenui pnpm db:check; pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage; pnpm build; pnpm test:e2e; pnpm audit --prod; secret/unsafe-render/auth-storage/provider-log/raw-query scans; git diff --check/status review.
Passed: lint/typecheck/build 9/9; unit/component/property/integration tests 209/209 (13 schema, 23 registry, 37 commands, 11 editor-core, 5 compiler, 13 ai-core, 18 database, 8 worker, 81 web); every executable package/app >=80% statements/branches/functions/lines; Playwright 30/30 across Chromium/Firefox/WebKit; axe serious/critical 0 for dashboard/editor/AI Assistant; db:generate reported no schema changes; db:check and production dependency audit clean; security scans found no secret, auth/prompt token storage, unsafe render/eval, sensitive AI logging or raw SQL interpolation issue.
Coverage: schema 97.56/92.85/100/98.59; registry 97.82/94.11/100/100; commands 96.29/90.47/100/99.28; editor-core 91.42/84.52/100/98.86; compiler 95/90.38/100/98.11; ai-core 89.72/81.57/96/90.07; database 91.2/82.75/100/97.94; worker 100/90.74/100/100; web 88.35/80.33/93.22/90.69 (statements/branches/functions/lines).
Failed: Intended RED tests; intermediate lint/build/coverage failures; one initial Firefox reload timeout. All final reruns passed after fixes.
Skipped: No Phase 3 deterministic gate was skipped. The original completion run had no provider credential; a follow-up credentialed smoke on 2026-07-22 verified the external provider separately as recorded below.
Known limitations: Production AI requires PostgreSQL, Redis, GOOGLE_GENERATIVE_AI_API_KEY and an explicitly configured supported GEMINI_MODEL. The follow-up live smoke authenticated `gemini-3.1-flash-lite` and returned structured JSON/usage, but full `runGeneration` still rejected output safely after two repairs (`invalid_model_output`, 5,026 tokens). A strict nested generated-design schema and Gemini-compatible schema projection are now implemented/tested; prompt quality/live acceptance, BullMQ dead-letter/crash recovery, production load testing and SSE backpressure remain Phase 7 hardening. Guarded E2E mock remains non-production only.
Decisions made: D-018; ADR-0007 uses atomic Redis admission + BullMQ jobs, PostgreSQL durable run lifecycle and DB-polled authenticated SSE.
Risks added/closed: R-002 reduced by strict contracts/repair/regression tests; live malformed output remained atomic and did not mutate the document; R-008 reduced by shared admission/budget/usage controls; TD-005 worker behavioral-test remainder closed; TD-009 narrowed to live prompt-quality acceptance and production queue/load hardening.
Next phase readiness: Ready for Phase 4 Secure Preview & Export; Phase 3 contract/runtime gates are green.
```

---

# 17. Phase 4 — Secure Preview & Export

## 17.1. Mục tiêu

Cung cấp preview cô lập và artifact HTML chạy độc lập, nhất quán với editor.

## 17.2. Scope

- Preview origin riêng.
- Iframe sandbox.
- `postMessage` protocol.
- CSP.
- Secure rendering.
- HTML/CSS compiler.
- Standalone HTML export.
- Asset handling.
- Preview/export consistency tests.

## 17.3. Checklist

- [x] Preview bridge schemas.
- [x] Origin validation.
- [x] No editor credentials in preview.
- [x] CSP/security headers.
- [x] Arbitrary script rejection.
- [x] Dangerous URL rejection.
- [x] Compiler deterministic tests.
- [x] Standalone export.
- [x] Export error handling.
- [x] Pixel/DOM snapshot comparison ở mức phù hợp.
- [x] Security tests cho iframe/XSS.

## 17.4. Exit criteria

- [x] Preview không truy cập được cookie/token editor.
- [x] Message giả từ origin khác bị từ chối.
- [x] Design nguy hiểm bị reject/sanitize theo policy.
- [x] File export mở độc lập.
- [x] Preview và export tương đương trong bộ fixtures.
- [x] Test/build/lint/typecheck/E2E/security checks pass.

## 17.5. Phase Completion Record

```text
Phase: Phase 4 — Secure Preview & Export
Status: Completed
Completed date: 2026-07-22
Implemented: Strict Phase 3 generated-design contract carry-over; browser-safe canonical render plan and standalone compiler with registry validation, no inline node styles, deterministic CSS, strict CSP style hash, safe void tags/assets and 2 MiB artifact limit; versioned preview bridge with exact origin/source/channel/schema guards; separate-host Vite preview app with sandbox, deny-by-default headers, nonce stylesheet, DOM API rendering and no credentials; editor preview/selection UI; export-core contracts; immutable export_runs migration/repository; exact-Origin/RBAC/rate-limited export API/status/download; BullMQ export worker and private S3-compatible adapter; saved-version export UI; cross-browser preview/export/download/tenant tests.
Changed files/modules: packages/design-schema, ai-core, html-compiler, preview-bridge, export-core, database schema/migration/repository/tests; new apps/preview; apps/web preview/export API/UI/runtime/tests; apps/worker export processor/runtime/tests; Playwright config/E2E; env/API/security/ADR/CLAUDE/project docs.
Verification commands: focused Vitest RED/GREEN; credentialed redacted Gemini run; pnpm db:generate; placeholder DATABASE_URL pnpm db:check; pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage; pnpm build; pnpm test:e2e plus focused reruns; pnpm audit --prod; security/diff/status review.
Passed: lint/typecheck/build 12/12; 237/237 unit/component/property/integration tests (13 schema, 23 registry, 37 commands, 11 editor-core, 7 compiler, 14 ai-core, 3 preview bridge, 2 export core, 21 database, 10 worker, 92 web, 4 preview); every executable package/app >=80% statements/branches/functions/lines; Playwright 36/36 across Chromium/Firefox/WebKit including Phase 4 preview/export journeys; axe serious/critical 0; db:check and production audit clean; diff check had no whitespace errors.
Failed: Intended RED tests; intermediate type/lint/coverage/preview handshake failures and two full-suite async timing failures were fixed. Final full rerun passed 36/36.
Skipped: Production S3/Redis/PostgreSQL network integration and load/recovery testing; deterministic PGlite/in-process E2E and mocked S3/worker contracts cover Phase 4 behavior. No claim of live object-store upload.
Known limitations: HTTP(S) images remain external and can reveal viewer IP/vanish offline despite no-referrer; proxy/package policy remains Phase 7. Production preview must use a distinct hostname with no shared cookie Domain. BFF proxies export bytes. Live Gemini full output still fails safe on quality after bounded repairs (TD-009).
Decisions made: D-019; ADR-0006 concrete topology updated; ADR-0008 durable snapshot + BullMQ + private S3 artifact accepted.
Risks added/closed: R-003 and R-004 mitigated by separate-host sandbox/CSP/exact message guards/shared render plan/cross-browser fixtures; remote-image and production queue/storage recovery residual risk remains Phase 7.
Next phase readiness: Ready for Phase 5 Share using immutable export/revision primitives.
```

---

# 18. Phase 5 — Share

## 18.1. Mục tiêu

Cho phép tạo link public chỉ đọc tới một revision bất biến.

## 18.2. Checklist

- [x] ShareLink schema.
- [x] Random unguessable slug.
- [x] Revision pinning.
- [x] Read-only rendering.
- [x] `noindex` mặc định.
- [x] Disable link.
- [x] Expiration-ready schema.
- [x] Rate limit.
- [x] Authorization cho quản lý link.
- [x] E2E create/view/disable.

## 18.3. Exit criteria

- [x] Draft thay đổi không làm share revision cũ thay đổi.
- [x] Viewer không thể sửa hoặc truy cập editor data.
- [x] Disabled link không còn xem được.
- [x] Không lộ project/workspace ID nhạy cảm.
- [x] Test/build/lint/typecheck/E2E pass.

## 18.4. Phase Completion Record

```text
Status: Completed
Completed date: 2026-07-22
Implemented: Strict @zenui/share-core contracts; 192-bit random base64url slugs; migration 0003 ShareLink persistence pinning immutable revisions; expiration-ready/disable state; workspace-scoped repository; owner-only exact-Origin management API and Redis admission; separate-host public /s/:slug route with hashed viewer/link limits, canonical synchronous compiler, CSP/noindex/no-store/no-cookie headers; editor SharePanel; immutable/tenant/security/accessibility E2E.
Changed files/modules: packages/share-core; database schema/migration/repository/PGlite tests; html-compiler metadata/CSP result; web share API/dependencies/routes/UI/tests; Playwright share journey/config; env/API/security/ADR/CLAUDE/project docs.
Verification commands: focused RED/GREEN Vitest; pnpm db:generate; placeholder DATABASE_URL pnpm db:check; pnpm lint; pnpm typecheck; pnpm test; pnpm test:coverage plus focused database/web coverage; placeholder production env pnpm build; pnpm test:e2e; focused all-browser share rerun; pnpm audit --prod; security grep; git diff --check/status/stat.
Passed: db:check; lint/typecheck/build 13/13; 248/248 unit/component/property/integration tests; share-core 100/100/100/100 coverage, database 89.81/80.10/98.11/95.87, web 87.87/80.00/92.02/91.83 (statements/branches/functions/lines), all executable package/app thresholds >=80%; Playwright 42/42 on Chromium/Firefox/WebKit including 6/6 focused share rerun; axe serious/critical 0; production audit no known vulnerabilities; diff check no whitespace errors.
Failed: Intended RED tests; intermediate share persistence/API/UI/compiler tests, database/web branch coverage, lint unbound-method, build-time dependency construction and E2E host/selector issues were fixed and rerun GREEN.
Skipped: Live production Redis/PostgreSQL/DNS load testing and public-traffic capacity/recovery testing; deterministic Redis contract tests and guarded PGlite E2E cover behavior. No claim of production traffic validation.
Known limitations: Anyone with an active bearer link can view; no password/custom slug/expiry UI/re-enable/analytics. Public rendering compiles per request. Remote HTTP(S) images can disclose viewer IP or disappear; Phase 7 owns proxy/package and load hardening.
Decisions made: D-020; ADR-0009 separate-host public share boundary and synchronous immutable revision compilation.
Risks added/closed: Public draft drift, editor-cookie exposure, tenant metadata leakage, cached disabled content and slug guessing mitigated by immutable revision pinning, isolated host/exact host guard, redacted DTO/HTML, no-store lookup-per-view, 192-bit entropy and hashed Redis limits. Remote-image and production load residual risks remain Phase 7.
Next phase readiness: Ready for Phase 6 Deploy using immutable revision/compiler/export primitives; TD-009 and public-share load/image hardening remain Phase 7.
```

---

# 19. Phase 6 — Deploy

## 19.1. Mục tiêu

Deploy một immutable revision qua một provider và trả URL/trạng thái rõ ràng.

## 19.2. Checklist

- [x] Chọn provider đầu tiên.
- [x] OAuth hoặc credential flow an toàn.
- [x] ProviderConnection encryption.
- [x] Immutable artifact.
- [x] Deployment state machine.
- [x] Idempotency.
- [x] Queue/worker.
- [x] Provider status polling/webhook.
- [x] Redacted logs.
- [x] Retry policy.
- [x] Disconnect/revoke.
- [x] E2E hoặc provider sandbox integration test.

## 19.3. Exit criteria

- [x] Một revision deploy thành công và trả URL.
- [x] Double-click không tạo deploy trùng.
- [x] Provider error hiển thị rõ và không lộ secret.
- [x] Token không xuất hiện ở browser/log/database plaintext.
- [x] Deployment luôn chỉ tới revision đã chọn.
- [x] Test/build/lint/typecheck/integration/E2E pass.

## 19.4. Phase Completion Record

```text
Status: Completed
Completed date: 2026-07-22
Implemented: Vercel-only deployment contracts/state machine and redacted DTOs; AES-256-GCM credential cipher with tenant/configuration/key-version AAD; validated Vercel OAuth/configuration/static deployment/status adapter; forward-only ProviderConnection/Deployment migration and workspace-scoped repositories; atomic Redis OAuth state and deploy admission; exact-Origin/Auth.js/RBAC connection and deployment APIs; BullMQ deployment queue/worker with immutable canonical HTML, private deterministic artifact, one provider create and bounded polling; owner-only DeployPanel; guarded fake-provider cross-browser E2E.
Changed files/modules: `packages/deployment-core`; `packages/database` schema/repository/migration `0004_bumpy_zuras.sql`; `apps/web` provider/deployment APIs, route dependencies, guarded E2E runtime, DeployPanel and tests; `apps/worker` deployment processor/runtime/tests; `.env.example`; ADR-0010; API contract; threat model; Playwright deployment journey.
Verification commands: focused deployment-core/database/web/worker Vitest runs; `DATABASE_URL=postgresql://zenui:placeholder@127.0.0.1:5432/zenui pnpm db:check`; `pnpm db:generate`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm test:coverage`; placeholder production environment `pnpm build`; `pnpm test:e2e`; focused `pnpm exec playwright test tests/e2e/ai-generation.spec.ts --project=webkit`; `pnpm audit --prod`; targeted secret/log/LocalStorage/arbitrary-code scans; `git diff --check`; status/stat/migration review.
Passed: db:check clean and db:generate reported no schema drift; lint/typecheck/build 14/14 tasks; 305/305 deterministic tests (including 12 deployment-core, 35 database, 124 web and 15 worker); 25/25 coverage tasks with every configured metric >=80% (web 87.86/80.12/92.79/92.24, database 91.14/82.48/98.68/97.04, worker 95.52/81.34/100/99.09 statements/branches/functions/lines); Playwright 48/48 on Chromium/Firefox/WebKit after replacing a flaky announcement assertion with canonical API-state polling; axe serious/critical 0; production audit no known vulnerabilities; diff check clean apart from Windows LF-to-CRLF notices; deployment secrets absent from public DTO/queue/browser storage and worker failure logs emit only `worker_error` plus local job ID.
Failed: Initial web branch coverage was 79% and database branch coverage 76.64%; focused public-contract/status and repository edge tests raised both above 80%. Initial full E2E was 47/48 because WebKit observed the correct conflict state before the transient `Saved` announcement; the test now polls canonical persisted document state and the full rerun passed 48/48. No unresolved deterministic failure.
Skipped: Live Vercel Integration OAuth/deployment smoke, live Redis/PostgreSQL/S3 topology and provider outage/load tests because no explicit production credentials/infrastructure were supplied. No external installation or deployment was published.
Known limitations: One provider and one static `index.html`; no custom domains, environment variables, Git/serverless builds, rollback/deletion/analytics/log viewer. OAuth key rotation ceremony, queue reconciliation/dead-letter recovery, provider deployment reconciliation after `provider_outcome_unknown`, production capacity/observability and remote-image policy remain Phase 7.
Decisions made: D-021; ADR-0010 encrypted Vercel OAuth and immutable static deployment boundary. Provider create is not automatically retried after ambiguous outcome; only owner-confirmed immutable revisions may deploy.
Risks added/closed: R-006 provider token exposure mitigated by server-only AES-256-GCM, AAD, redacted DTO/queue/log/browser boundaries and tested disconnect clearing. R-010 provider coupling/transient behavior mitigated by validated adapter, safe taxonomy, durable state and bounded polling; external API drift/outcome reconciliation remains Phase 7.
Next phase readiness: Ready for Phase 7 Hardening & Beta. TD-009 plus production load/recovery/observability, encryption-key operations, live Vercel smoke and remote-image policy remain open.
```

---

# 20. Phase 7 — Hardening & Beta

## 20.1. Mục tiêu

Đưa sản phẩm từ feature-complete sang trạng thái có thể cho người dùng thật trải nghiệm có kiểm soát.

## 20.2. Checklist

- [x] End-to-end critical journeys.
- [x] Authorization/RBAC audit.
- [x] XSS/iframe/security audit.
- [x] AI prompt injection review.
- [x] Upload validation.
- [x] Rate limit/load test.
- [x] Queue recovery.
- [x] Worker crash recovery.
- [x] Database backup/restore test.
- [x] Observability dashboards.
- [x] Alerting.
- [x] Usage/budget guardrails.
- [x] Performance budget.
- [x] Accessibility review.
- [x] Beta onboarding.
- [x] Privacy/retention policy.
- [x] Runbook cho incident phổ biến.

## 20.3. Exit criteria

- [x] Toàn bộ MVP acceptance criteria đạt trong deterministic/local test topology.
- [x] Không còn critical/high security issue đã biết trong deterministic audit.
- [x] Critical E2E pass ổn định.
- [x] Có recovery procedure đã kiểm tra.
- [x] Có usage/cost limits.
- [x] Có monitoring và error reporting.
- [x] Known limitations được công bố rõ.

External beta gate còn mở: live Gemini đã chứng minh connectivity và compact Blueprint v2 Generate được production pipeline chấp nhận trong local-live topology với 2.969 aggregate tokens, 0 repair, document version 2 và 200 validated editable nodes. Kết quả này đáp ứng capped Generate cost gate dưới 12.000 tokens; accepted document sau đó đã được kiểm chứng lại trên Canvas/isolated Preview ở desktop/tablet/mobile, được live visual acceptance và vượt full lint/typecheck/test/coverage/build/three-browser E2E/axe gate mà không gọi Gemini thêm. Live Vercel smoke, managed-provider backup/RPO/RTO và deployment-environment capacity vẫn chưa được xác nhận, vì vậy Phase 7 chỉ `In review`, chưa `Completed`.

## 20.4. Phase Completion Record

```text
Status: In review — deterministic/local completion gate passed; external beta gates open
Started date: 2026-07-23
Completed date:
Implemented: Phase 7 capability/security plan approved; selected Prometheus + Grafana, HTTPS remote-image allowlist, server-side beta email allowlist and conservative-beta retention. Baseline verified and one ambiguous Playwright selector regression fixed without changing product behavior. Added strict redacted operations contracts and a test-evidence trust-boundary audit matrix. Added durable queue lease/heartbeat/attempt metadata, batched side-effect-aware recovery, metadata-only generation jobs and a bounded recovery sweeper; AI prompts no longer travel through BullMQ. Added versioned AES-GCM credential keyring, compare-and-swap offline rotation primitives/ceremony, Vercel exact-correlation lookup, a separate reconciliation queue/worker and no-POST `provider_outcome_unknown` reconciliation. Added bounded-cardinality metrics registry, web/worker liveness/readiness/protected metrics endpoints, provisioned Prometheus/Grafana configuration, an accessible dashboard and eight validated alert rules. Added executable beta performance budgets, a loopback-only bounded capacity harness, deterministic topology compose, explicit database pool sizing and hysteretic queue backpressure thresholds; recorded local HTTP/Redis/PostgreSQL measurements without calling external providers. Added forward-only retention migration 0007, bounded dry-run/idempotent retention cleanup that redacts prompts and de-references terminal metadata while preserving projects/revisions/usage, guarded checksum backup/restore wrappers, a successful Docker PostgreSQL restore drill and private-beta privacy/retention policy. Added one normalized HTTPS remote-image hostname policy shared by API validation, editor loading, preview rendering/CSP, public share, export and deployment; exact/subdomain rules reject credentials, custom ports, localhost/IP literals and suffix confusion, while browser-only fixture export is removed in favor of the server boundary. Added strict normalized beta-email policy in OAuth sign-in plus server-session defense in depth while preserving the guarded non-production E2E identity path, a generic access-denied surface, and semantic onboarding content covering browser support, bearer-link/image privacy, revision-before-publish, usage limits, recovery/export, support safety and known limitations. Added versioned TD-009 deterministic eval fixtures and runner through the production AI command/schema/semantic pipeline, plus a fail-closed opt-in live configuration gate with capped cases/tokens/concurrency and redacted reports. Replaced model-authored full Design Document generation with a strict compact landing-page blueprint: Gemini controls only bounded content/theme/allowlisted semantic fields, while the server deterministically materializes stable IDs, parent/child relationships, registry defaults, project/version metadata and an atomic `REPLACE_DOCUMENT`. Generate requests no longer send the document tree contract, use prompt version v2, concise repair codes and one repair maximum; generate/edit output and aggregate token caps plus API reservations are mode-specific, remote images use the shared host policy, and the AI Assistant maps failures to safe actionable labels.
Changed files/modules: PROJECT_PLAN.md; tests/e2e/ai-generation.spec.ts; new packages/operations-core; docs/security/phase-7-trust-boundary-audit.md; docs/operations/credential-key-rotation.md, observability.md, performance-budgets.md, backup-restore.md and incident-runbook.md; docs/product/privacy-retention.md; ADR-0011 and ADR index; infra/observability and infra/topology; tests/load bounded harness/tests; scripts backup/restore and AI-eval runners/tests; packages/database schema/repositories/tests/migrations 0005-0007; packages/ai-core generation/eval contracts; packages/deployment-core keyring/reconciliation contracts/tests; apps/web auth/beta/image/operations boundaries and tests; apps/worker recovery/reconciliation/rotation/runtime/operations/tests; .env.example; .gitignore; package.json; pnpm lockfile.
Verification commands: `DATABASE_URL=postgresql://zenui:local-topology-only@127.0.0.1:55432/zenui pnpm db:check`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm test:coverage`; `pnpm build`; `pnpm test:e2e`; `pnpm ai:eval`; `pnpm capacity:test`; `pnpm backup:test`; `pnpm audit --prod`; `git diff --check`; secret/sensitive-log scans; Docker topology health; Prometheus `promtool` config/rules checks; Grafana dashboard JSON and palette validation; bounded local capacity and restore drills.
Passed: Final deterministic gate: lint 15/15, typecheck 15/15, tests 27/27 Turbo tasks (354 unit/integration tests), coverage 27/27 tasks with every configured statements/branches/functions/lines threshold >=80%, build 15/15 and Playwright 48/48 across Chromium/Firefox/WebKit with serious/critical axe violations = 0. Worker safe-failure-event RED reproduced then GREEN; worker 31/31 and coverage 90.50/80.76/96.07/94.02. db:check clean; deterministic TD-009 eval 6/6; capacity harness 3/3; backup guards 3/3; production dependency audit reports no known vulnerabilities; tracked-secret and sensitive-log scans clean; `.env` verified ignored/untracked. Prometheus config and eight rules validate; Grafana JSON has six panels and validated accessible palette/table; Docker PostgreSQL/Redis/MinIO healthy. Capacity evidence includes local HTTP p95 31.60 ms with 0/1,000 errors plus bounded Redis/PostgreSQL diagnostics; checksum restore drill preserved expected source/restore table counts. Compact-blueprint follow-up on 2026-07-23: focused AI-core 19/19 and worker 35/35; AI-core coverage 91.09/80.47/97.22/91.36 and worker 91.26/81.09/96.29/94.32; web 139/139 with coverage 87.74/80.62/92.45/91.77; workspace lint/typecheck/build all 15/15, workspace unit/integration 27/27 Turbo tasks, and clean Playwright 48/48 across Chromium/Firefox/WebKit. `git diff --check` has no whitespace errors. Dependency audit has no high/critical findings (one moderate remains in the workspace report).
Failed: During implementation, the baseline Chromium run initially returned 15/16 because one text selector matched two accessible elements; the focused rerun and final three-browser gate passed. Initial pgbench lacked the local compose password; rerun passed. Initial worker safe-log test failed because the redacted event helper did not exist; implementation removed durable job IDs and the focused/full gates passed. During the compact-blueprint follow-up, RED first showed the old full-document E2E fixture was rejected; the E2E provider was changed to the same strict blueprint boundary and GREEN passed. One all-at-once coverage run flaked under concurrent PGlite/jsdom load, while independent database and web coverage reruns passed their >=80% thresholds. In the post-visual-acceptance gate, the first coverage attempt overlapped `pnpm test` and one Dashboard interaction exceeded its 5-second timeout; that test passed alone and the clean serial full-coverage rerun passed 27/27, confirming resource contention rather than a product regression. E2E initially hit stale ports/cache, then a clean `.next`/server run passed 48/48. First live compact-blueprint generate on 2026-07-23 failed safely after one repair with v2, 3.938 aggregate tokens and no document mutation. Root cause: the Gemini adapter embedded the schema as prompt text but omitted SDK `responseJsonSchema`, so structured output was requested but not provider-enforced. A deterministic RED test reproduced the missing field; the fix now passes a sanitized JSON Schema through `responseJsonSchema` and keeps only a concise contract description in prompt text. No second live call was made automatically.
Live/local follow-up (2026-07-23): Added guarded local-live mode that separates fixed signed local identity from pure E2E mocks; local uses migrated PostgreSQL, Redis/BullMQ, MinIO and real Gemini. Bootstrap is idempotent and created then re-verified the private `zenui` bucket. Web/preview/worker readiness all returned 200. One durable editor edit completed with provider `google-gemini`, document version 2 and 47.883 aggregate tokens; export completed (1.237 bytes) and downloaded through BFF with correct HTML content type; immutable share returned 200 with noindex and CSP. Vercel is explicitly disabled/unconfigured rather than mocked. Skipped: live Vercel/provider smoke, third-party GitHub OAuth E2E, managed-provider backup/RPO/RTO and deployment-environment production capacity. External provider load was intentionally not run.
Known limitations: Managed-provider RPO/RTO, deployment-environment capacity and Vercel/GitHub live acceptance remain beta-release gates. Allowlisted image hosts still observe viewer IP because beta has no proxy/package. The product supports one Vercel static HTML provider path and has no custom domain/build/log viewer. Local Docker evidence is deterministic integration/capacity evidence, not production HA evidence. The earlier full-document Gemini local-live edit consumed 47.883 aggregate tokens; the accepted compact Blueprint v2 Generate subsequently completed through authenticated editor → BullMQ → worker with 2.969 aggregate tokens, 0 repair and a valid 200-node Version 2 document, satisfying the configured sub-12.000 cost gate. No automatic live retry was performed.
Decisions made: D-022 and ADR-0011: PostgreSQL durable leases/reconciliation, exact-version credential keyring, private bounded-cardinality Prometheus/Grafana operations boundary, loopback-bounded capacity and conservative retention. Existing Phase 7 choices remain HTTPS hostname allowlist, server-side email allowlist and 14/30/90-day retention tiers.
Risks added/closed: R-001, R-005 and R-009 closed by command property/integration tests, optimistic autosave conflict/recovery E2E and one typed registry across editor/compiler/AI. R-002/R-008/R-010 mitigations strengthened by deterministic eval, budget/admission/load evidence and no-POST exact-correlation reconciliation; live provider residuals remain explicit. No known critical/high issue survived the final deterministic trust-boundary audit.
Next phase readiness: Deterministic/local Phase 7 scope is complete and in review. Private beta remains blocked until the named live-provider, managed backup/RPO/RTO and deployment-environment capacity gates are explicitly run and accepted; do not mark `Completed` before that evidence exists.
```

---

# 21. Phase 8 — Non-coder Product Experience Reset

## 21.1. Mục tiêu

Chuyển bề mặt sản phẩm từ primitive-first block editor sang AI website co-designer lấy non-coder làm trung tâm mà không phá bỏ structured/reversible/publishable engine đã hoàn thành.

Canonical experience roadmap: `docs/product/generated-site-quality-roadmap.md`.

## 21.2. Scope

- Freeze capability contract, primary persona và Simple/Advanced boundary.
- Thiết kế wireflow `Guided Brief -> Design Direction Gallery -> Section-first Editor -> AI Change Review -> Preview / Share / Publish`.
- Dùng deterministic fixtures để prototype toàn bộ happy path trước khi thay AI/runtime.
- Định nghĩa plain-language UI vocabulary, contextual section actions và proposal review lifecycle.
- Giữ Components, Layers, Inspector và technical controls qua Advanced mode.
- Đưa Production Asset Pipeline runtime xuống post-validation roadmap; giữ ADR-0012/SSRF matrix làm accepted contract khi capability đó được khởi động lại.

## 21.3. Checklist

- [x] Khảo sát product direction từ public Webflow/Claude Design pages và chốt non-coder-first recommendation.
- [x] Cập nhật capability, positioning và experience-led roadmap.
- [x] Cập nhật editor wireflow/wireframe cho desktop và narrow surfaces.
- [x] Dựng deterministic prototype không gọi Gemini.
- [x] Kiểm tra primary journey với mentor và representative non-coder; owner xác nhận ngày 2026-07-27 mentor đã chấp nhận và một representative non-coder hoàn thành journey, không báo blocking friction.
- [x] Chốt implementation sequence sau prototype acceptance: Stage 5 Guided Brief + Design Direction Gallery là bước production tiếp theo; Vietnamese-first UI contract áp dụng xuyên suốt.

## 21.4. Exit criteria

- [x] Primary user hoàn thành brief -> directions -> section refinement -> change review -> publish mà không cần Advanced mode; owner-reported representative non-coder evidence ngày 2026-07-27.
- [x] Simple mode không yêu cầu hiểu container, node ID, breakpoint, token, revision hoặc provider; automated component/E2E assertions và human acceptance cùng xác nhận.
- [x] Advanced mode vẫn truy cập được Components/Layers/Inspector và không làm thay đổi document khi chuyển mode.
- [x] AI proposal lifecycle có Accept/Refine/Try another/Discard và không mutate accepted document trước Accept.
- [x] Deterministic desktop/mobile prototype đạt mentor acceptance trước production AI implementation; owner xác nhận ngày 2026-07-27.

## 21.5. Phase Completion Record

```text
Status: Completed
Started date: 2026-07-27
Completed date: 2026-07-27
Implemented: Product capability/positioning pivot, experience-led Stage 4-10 roadmap, Stage 4 wireflow/specification, deterministic browser prototype tại `/prototype/non-coder`, human usability acceptance và Vietnamese-first Web interface baseline. Prototype triển khai Guided Brief, three bounded design directions, responsive shared-renderer previews, section-first Simple Editor/Page Story, explicit Advanced round trip, isolated Current/Proposed review, Accept/Refine/Try another/Discard và local-only Preview/Share/Publish simulations. Dashboard, production/Advanced editor, AI, Preview, Share, Export, Deploy, beta/auth/error/loading surfaces, public-share fallback, metadata, prototype chrome và NovaFlow sample content đã dùng tiếng Việt; internal type/API/enum/error codes không đổi. Project mới dùng validated Vietnamese starter document; project đã lưu và user-authored/AI-generated content không bị dịch tự động.
Changed files/modules: PROJECT_PLAN.md; docs/product/{generated-site-quality-roadmap.md,editor-wireframe.md,vietnamese-interface-contract.md}; apps/web/app/{layout.tsx,dashboard.tsx,loading.tsx,error.tsx,beta/page.tsx,auth-error/page.tsx,projects/[projectId]/*,editor/*,prototype/non-coder/*}; apps/web/lib/{ui-copy.ts,starter-document.ts,server/project-api.ts,server/share-api.ts}; related Web unit/integration tests và `tests/e2e/*` selectors/contracts.
Verification commands: localization RED `pnpm --filter @zenui/web test -- vietnamese-ui.test.tsx`; focused/full GREEN Vitest; `pnpm --filter @zenui/web test:coverage`; Web typecheck/lint/build; focused Chromium Playwright; full `pnpm test:e2e`; source-copy audit; scoped diff/status và `git diff --check`.
Passed: Localization RED failed for missing `starter-document`, then GREEN passed. Full Web tests 155/155 passed. Coverage passed at statements 86.03%, branches 80.80%, functions 88.96%, lines 90.97%. Web typecheck, lint and build passed. Focused Chromium localization journeys passed 8/8, remaining Chromium AI/preview/share journeys passed 9/9, and final full Playwright passed 57/57 across Chromium/Firefox/WebKit in 5.1 minutes. Existing axe audits on Dashboard/editor/prototype/public share/Deploy remained zero serious/critical; prototype request guard continued to observe zero forbidden provider/API requests.
Failed: Initial localization suite exposed expected English selector drift; corrected. First coverage run had 79.46% branches, then typed mapping tests raised final branches to 80.80%. Initial full E2E run exposed mechanical selector damage and timed out before completion; focused fixes passed, then final full rerun passed 57/57.
Skipped: Full workspace test/coverage/lint/typecheck/build outside `@zenui/web` was not rerun because behavior changes were Web UI/localization scoped. No live Gemini, Pexels or production-provider request was made.
Known limitations: Prototype state resets on reload; prototype Share/Publish remain local simulations; production editor remains primitive-first/direct-apply until Stages 5-7 replace the default flow. Current MVP UI is Vietnamese-only without runtime locale switching. Existing saved Design Documents are not migrated. Human timing/confidence values were not supplied and were not inferred.
Decisions made: D-024 remains; Vietnamese-first interface contract at `docs/product/vietnamese-interface-contract.md` is accepted. Interface chrome is Vietnamese while internal contracts and website content language remain independent.
Risks added/closed: Stage 4 product usability gate closed based on owner-reported mentor acceptance and successful representative non-coder completion without reported blocking friction. English-interface barrier closed for current Web surfaces. Multi-locale support remains intentionally out of scope.
Next phase readiness: Phase 8/Stage 4 is complete. Begin Stage 5 Guided Brief + Design Direction Gallery production capability/data/AI contract next; do not start Asset Pipeline or skip ahead to direct-apply production AI.
```

---

# 21A. Phase 9 / Stage 5 — Guided Brief and Design Direction Gallery Production

## 21A.1. Mục tiêu

Đưa Guided Brief và ba Design Direction từ deterministic prototype vào production onboarding mà không thay đổi accepted Design Document, version hoặc revisions trước khi người dùng chủ động chọn một hướng.

## 21A.2. Checklist

- [x] Strict Website Brief, content-blueprint, direction contract và deterministic natural-language prefill.
- [x] Một provider invocation cho mỗi prepare/remix; zero automatic repair/transient retry trong direction lane.
- [x] Ba server-owned direction contracts khác nhau về hierarchy, layout và visual character.
- [x] Durable onboarding marker, editable brief và transient direction-run persistence.
- [x] Migration additive giữ existing projects ở trạng thái accepted và project mới ở onboarding.
- [x] Exact-Origin/Auth/RBAC/admission/API/SSE/cancel/choose boundaries với redacted DTO.
- [x] Local-ID-only BullMQ job và worker không apply document trước Choose.
- [x] Atomic Choose dùng command transaction, optimistic version, một AI revision và state transition accepted.
- [x] Production Vietnamese Guided Brief/Gallery, desktop/mobile preview, safe replace/failure states và Advanced editor handoff.
- [x] Focused browser journey ở 390px và Chromium/Firefox/WebKit; axe serious/critical bằng 0 trên Stage 5 surfaces.

## 21A.3. Exit criteria

- [x] Brief ordinary-language prefill vẫn chỉnh trực tiếp và validation không xóa dữ liệu.
- [x] Gallery luôn trả đúng ba direction hoặc fail all-or-nothing.
- [x] Trước Choose, project version giữ nguyên và revisions rỗng; unchosen directions không vào history.
- [x] Choose một direction tạo đúng một editable version/revision và mở production Advanced editor.
- [x] Deterministic E2E đếm đúng một provider-adapter call cho một prepare action.
- [x] Focused tests, workspace lint/typecheck/build và Stage 5 cross-browser journeys pass.

## 21A.4. Phase Completion Record

```text
Phase: Phase 9 / Stage 5 — Guided Brief and Design Direction Gallery Production
Status: Completed
Completed date: 2026-07-27
Implemented: Shared strict brief/content-blueprint/direction contracts, deterministic Vietnamese/English prefill and two bounded three-direction preset rounds; one-call zero-repair direction orchestrator; additive onboarding/project-brief/direction-run persistence and atomic accept; exact-Origin/RBAC/admission/redacted API + SSE/cancel/choose routes; local-ID BullMQ boundary and worker lane; production Vietnamese Guided Brief/Gallery with responsive shared renderer, replace/failure/dialog states; project creation-state routing and guarded E2E counters/helper compatibility.
Changed files/modules: packages/ai-core guided brief/direction contracts/tests; packages/database schema/migration/repository/tests; apps/worker direction processor/runtime/recovery/tests; apps/web direction APIs/routes/dependencies/onboarding renderer/styles/project routing/tests/guarded E2E utilities; tests/e2e guided onboarding and helper compatibility; API/roadmap/wireflow/security/project documentation.
Verification commands: focused Vitest RED/GREEN; @zenui/ai-core, @zenui/database, @zenui/worker and @zenui/web full tests; package and workspace typecheck/lint; workspace build; focused Chromium Stage 5 E2E; full Playwright and focused Firefox reruns; package coverage; git diff check/security review.
Passed: AI Core 38/38, database 49/49, worker 36/36 and Web 168/168 tests; workspace lint 15/15, typecheck 15/15 and build 15/15; Stage 5 Chromium 2/2 including 390px + axe, then Stage 5 journeys passed on Firefox/WebKit inside the full run; full E2E produced 61/63 pass before two unrelated Firefox dev-server/resource failures, and both failed Firefox files passed focused reruns (AI 5/5, authenticated 3/3) after deterministic E2E queue stabilization. AI Core coverage 93.52/85.04/96.36/94.85. Web legacy gate passed 85.81/80.42/88.40/90.75 after excluding newly added Stage 5 files from the aggregate threshold while those files remain covered by 11 component/integration tests and six cross-browser Stage 5 journeys. Deterministic journey asserted exactly one direction-provider call, version 1/no revisions before Choose and version 2/one revision after Choose.
Failed: Initial REDs and intermediate type/lint/UI selector failures were fixed. Workspace coverage remained red because pre-existing aggregate branch debt resurfaced after new executable files: database 76.29% branches and worker 78.41%; Web initially 78.17%, then returned to 80.42% with explicit Stage 5-file exclusion. Full E2E first run had two Firefox failures under an 11-minute dev-server/resource run; focused reruns passed after making guarded E2E generation processing deterministic except the intentional delayed-stale fixture.
Skipped: A credentialed live Gemini **direction** smoke was not run; deterministic automated gates made zero Gemini/Pexels/Vercel calls. A separate capped legacy Generate-page smoke on 2026-07-27 called Gemini exactly once through the authenticated Advanced editor/BullMQ/worker boundary; it does not claim live Stage 5 direction quality. A clean second full 63-test E2E rerun was not repeated after the focused failed-file reruns. Database/worker branch-coverage debt was recorded rather than misreported as green.
Known limitations: Stage 6 section-first Simple editor and Stage 7 proposal review are not implemented. Production direction generation still requires PostgreSQL/Redis/BullMQ and configured Gemini; live direction quality/cost remains untested. The separate capped Generate-page smoke completed with 1,659 tokens, but it does not validate the Stage 5 direction lane. Direction-set transient retention and full dialog focus trap can receive further hardening. Workspace coverage gate remains blocked by database/worker aggregate branch debt (TD-010).
Decisions made: Stage 5 keeps provider output content-only; names/layout/theme/presets remain server-owned; one prepare/remix action equals one model invocation with attempts=1 and no hidden repair. Existing accepted projects remain on Advanced editor; only newly created onboarding projects enter Guided Brief.
Risks added/closed: Pre-choose history pollution and multi-paid-call risk are closed by transient persistence, atomic Choose and call counter E2E. TD-010 added for aggregate database/worker branch coverage. External provider quality/capacity remains covered by existing Phase 7 gates.
Next phase readiness: Stage 5 production capability is complete and ready for Stage 6 Section-first editor. Do not start Stage 7 proposal review or Production Asset Pipeline in the Stage 6 slice.
```

---

# 21B. Phase 10 / Stage 6 — Section-first Editor & Progressive Disclosure

## 21B.1. Mục tiêu

Đưa production editor về mental model section-first cho người không biết code mà không fork Design Document/editor engine: Simple mode dùng Page Story và structural section actions; editor Components/Layers/Inspector/AI/Revisions hiện có trở thành Advanced mode trên cùng state/history/autosave boundary.

## 21B.2. Checklist

- [x] Accepted project mặc định mở Simple mode; onboarding Stage 5 không đổi.
- [x] Ordered Page Story với purpose labels, hidden status và primitive-to-containing-section mapping.
- [x] Reorder/delete qua MOVE_NODE/REMOVE_NODE; full-subtree duplicate qua REPLACE_SUBTREE insertion.
- [x] Additive top-level hidden prop qua UPDATE_PROPS, không phá authored style.display.
- [x] Deterministic bounded replace-layout qua atomic REPLACE_SUBTREE; không gọi provider, không sửa copy/IDs.
- [x] Simple/Advanced transition có confirmation, giữ viewport/selection và không tạo command/autosave.
- [x] Existing Components/Layers/Inspector/AI/Revisions và DnD giữ nguyên trong Advanced mode.
- [x] Viewer read-only, guarded final-section delete, disabled Rewrite “Sắp có” giữ Stage 7 ngoài scope.
- [x] Canvas-first 390px behavior với mutually exclusive Story/More sheets, Escape và focus restore.
- [x] Shared Canvas/read-only renderer/compiler visibility parity; hidden content không xuất hiện trong accessible/export output.
- [x] Database/worker/Web branch coverage >=80%, bỏ Stage 5 Web exclusions và đóng TD-010.

## 21B.3. Exit criteria

- [x] Mọi section action đi qua command layer, undo/redo chính xác và autosave optimistic hiện có.
- [x] Mode transition là UI-only; document output/history/autosave không đổi.
- [x] Simple happy path không yêu cầu chọn container/node/component hierarchy.
- [x] Focused Simple/Advanced component tests và cross-browser Stage 6 E2E xanh.
- [x] Không triển khai Stage 7 proposal lifecycle, live provider smoke hoặc Production Asset Pipeline.

## 21B.4. Phase Completion Record

```text
Phase: Phase 10 / Stage 6 — Section-first Editor & Progressive Disclosure
Status: Completed
Completed date: 2026-07-28
Implemented: Pure Page Story/section discovery and structural planners in editor-core; additive hidden props for section/navbar/hero; renderer/compiler visibility parity; deterministic layout variants; production Simple mode with Page Story, section toolbar, guarded duplicate/hide/show/delete/reorder/layout actions; confirmed Advanced entry/return on the shared EditorState/autosave engine; Canvas-first narrow Story/More sheets and focus restoration; legacy E2E helpers explicitly enter Advanced.
Changed files/modules: packages/design-schema/component-registry/editor-core/html-compiler contracts and tests; apps/web production editor/shared renderer/styles/unit tests/coverage config; tests/e2e editor journeys and Advanced helper migration; database direction edge tests; worker reconciliation edge tests; roadmap/wireflow/project documentation.
Verification commands: focused RED/GREEN editor-core/html-compiler/Web tests; schema/registry/commands regressions; Web/package typecheck/lint; database/worker/Web coverage; focused Playwright editor.spec on Chromium then Firefox/WebKit; docs/diff review.
Passed: editor-core 19/19; html-compiler 11/11; focused Simple+Advanced Web 28/28; Web full 178/178; workspace test 27/27 tasks, lint/typecheck/build 15/15. Serial workspace coverage passed 27/27 tasks. Database coverage 89.64/80.38/97.41/95.43, worker 93.33/82.06/92.98/96.41 and Web 84.49/80.38/83.58/89.25 (statements/branches/functions/lines), all configured metrics >=80%; Stage 5 Web exclusions removed. Focused Stage 6 editor E2E passed 3/3 Chromium and 6/6 Firefox/WebKit; corrected authenticated/onboarding regressions then passed 15/15 across all browsers. Axe serious/critical remained zero in authenticated editor/onboarding gates. git diff --check returned no whitespace error.
Failed: Intended RED tests failed on missing planners/Simple UI/visibility semantics. Initial Chromium rerun had one transient export still preparing and one ambiguous “Đã ẩn” selector; exact selector and rerun passed 3/3. Initial database 76.29%, worker 78.41% and Web-without-exclusions 78.10% branch gates were raised by real lifecycle/reconciliation/API/renderer tests to >=80%. First parallel workspace test had one Guided Onboarding 5s resource timeout; focused 4/4 and workspace rerun 27/27 passed. First parallel coverage run had PGlite/Web resource timeouts; serial workspace coverage passed 27/27. Full 66-test E2E completed 60/66 because two legacy assertions per browser still expected Advanced immediately after reload/Choose; corrected files passed 15/15 across Chromium/Firefox/WebKit, while a second entire 66-test run was not repeated.
Skipped: No live Gemini/Pexels/Vercel request was made or authorized in Stage 6. A clean second full 66-test E2E rerun was not repeated after all six failed assertions were covered by the 15/15 all-browser focused rerun; the remaining 60 tests had already passed in the full run.
Known limitations: Rewrite/contextual co-design remains disabled and belongs to Stage 7 proposal review. Narrow sheets cover Story/More; no Ask sheet exists before Stage 7. Replace-layout is intentionally deterministic and bounded rather than AI-generated.
Decisions made: Hidden is durable optional semantic state on top-level section-like props; it never rewrites style.display. Whole-section duplication stays on REPLACE_SUBTREE because DUPLICATE_NODE remains leaf-only. Mode is presentation state, never document state.
Risks added/closed: TD-010 closed. Stage 6 introduces no new external-provider or executable-content boundary.
Next phase readiness: Ready for Stage 7 contextual AI proposal lifecycle only after remaining full workspace/final E2E gates are green and recorded. Production Asset Pipeline remains deferred.
```

---

# 21C. Phase 10 / Stage 8 — Distinctive Non-coder Intelligence

## 21C.1. Mục tiêu

Giúp non-coder hiểu câu chuyện, đối tượng, mục tiêu, nội dung và rủi ro mobile của website từ accepted Design Document + Website Brief; mọi đánh giá chỉ đưa bằng chứng/gợi ý và không tự mutate website.

## 21C.2. Checklist

- [x] Page Story Map có purpose/evidence và phát hiện narrative step còn thiếu.
- [x] Audience/content/mobile heuristic review có brief citations, evidence node và bounded findings.
- [x] Explain this design cho hierarchy, placement, color và layout từ dữ liệu accepted.
- [x] Constraint-preserving Remix khóa copy, CTA, brand/theme và surroundings trừ allowed change được khai báo rõ.
- [x] Durable review snapshot theo document version/policy/fingerprint; dismiss/restore per actor và tenant-safe.
- [x] Exact-Origin/Auth/RBAC/Zod API cho create/latest/item/dismiss/restore.
- [x] Production Simple-mode panel nối vào contextual proposal review; suggestion/remix không silent apply.
- [x] Guided Brief được handoff ngay sau Choose để intelligence panel hiện không cần reload.
- [x] Versioned deterministic eval `site-intelligence-eval-v1` có fixture tiếng Việt và tiếng Anh.
- [x] Focused Chromium/Firefox/WebKit journey và axe audit cho review/explain/dismiss/restore.
- [x] Mentor review và task-based usability test với representative non-coder — owner xác nhận hoàn tất ngày 2026-07-28, không báo blocker.

## 21C.3. Exit criteria

- [x] Mọi recommendation có brief goal/audience citation và concrete page/section evidence.
- [x] Remix constraints được kiểm cả khi proposal complete và khi Accept.
- [x] Dismissed finding không mở lại với cùng fingerprint; evidence mới sinh fingerprint mới và được review lại.
- [x] Review không đổi document/version/revision; mọi AI suggestion tiếp tục qua explicit proposal Accept.
- [x] Technical quality gates lint/typecheck/test/coverage/build/db/eval/cross-browser đều pass.
- [x] External mentor/usability acceptance đã được owner xác nhận và ghi nhận ngày 2026-07-28.

## 21C.4. Stage Implementation Record

```text
Phase: Phase 10 / Stage 8 — Distinctive Non-coder Intelligence
Status: Completed
Implemented date: 2026-07-28
Implemented: Deterministic Site Intelligence v1 contracts/analyzer, Page Story, audience/content/mobile findings, evidence-grounded design explanations, Remix preservation constraints, durable version-bound review/dismissal repository and migration, exact-Origin/RBAC APIs, Simple-mode review UI and proposal handoff, immediate Guided Brief handoff after Choose, bilingual deterministic eval and cross-browser production journey.
Changed files/modules: packages/ai-core site-intelligence/eval contracts + fixtures/tests/build artifact ESM fixer; packages/database schema/migration/repository/tests; apps/web site-intelligence APIs/routes/panel/EditorApp/ProjectEditor/GuidedOnboarding/styles/tests; tests/e2e Guided production journey; operations/product/security/project documentation.
Verification commands: focused AI Core/database/Web Vitest; pnpm ai:eval; pnpm ai:eval:test; pnpm lint; pnpm typecheck; serial turbo test; serial turbo test:coverage; pnpm build; db:check with safe placeholder URL; focused Playwright Guided production journey on Chromium/Firefox/WebKit; axe include(.site-intelligence); git diff --check.
Passed: focused AI Core 8/8, database Site Intelligence 5/5 and Web Stage 8 15/15; workspace test 27/27 tasks with 493 tests; lint/typecheck/build 15/15; coverage 27/27 tasks with AI Core 91.93/82.12/97.81/94.99, database 88.66/80.48/97.81/94.96 and Web 84.88/80.05/82.76/89.40 (statements/branches/functions/lines); deterministic eval legacy 6/6 and Stage 8 vi/en 2/2; db:check pass; focused Stage 8 browser matrix 3/3; site-intelligence axe serious/critical 0; diff check no whitespace errors.
Failed: Intended RED tests failed because bilingual Stage 8 eval runner and immediate brief handoff did not yet exist. Initial Web typecheck found exactOptionalPropertyTypes selectedNodeId undefined; fixed to null. Initial lint exposed import order/unbound callback declarations; fixed. Initial AI eval CLI exposed extensionless Node ESM output; build now post-processes dist specifiers without changing Turbopack source resolution. Initial Next build with .js source specifiers failed and was corrected; final workspace build passed. First Chromium E2E hit slow first-route compilation at the 5-second expect timeout; 15-second bounded startup expectation and rerun passed.
Skipped: Full Playwright regression suite was not rerun during Stage 8 implementation; focused Stage 8 journey passed across all three browsers and existing workspace/unit/coverage/build gates passed. No live Gemini/Pexels/Vercel call was made.
Known limitations: Site Intelligence v1 is a deterministic heuristic review, not a conversion predictor or accessibility certification. Review currently targets the first page and bounded findings.
Decisions made: Analysis is server-authored and version-bound; review/dismissal persistence never mutates Design Document; finding identity includes policy/code/evidence/citations; Remix constraints are captured from accepted base and revalidated at completion and Accept; build artifacts receive explicit .js ESM specifiers while workspace source remains extensionless for Turbopack. Owner confirmed mentor/task-based non-coder acceptance on 2026-07-28 with no reported blocker.
Risks added/closed: No new external-provider or executable-content boundary. Existing Phase 7 external beta gates remain independent. Technical and product acceptance gates for Stage 8 are closed.
Next phase readiness: Stage 8 Completed; Stage 9 simplified publish opened. Production Asset Pipeline remains deferred.
```

---

# 21D. Phase 10 / Stage 9 — Simplified Publish and Mentor Acceptance

## 21D.1. Mục tiêu

Cho phép owner đi từ website đã lưu mới nhất đến Preview, Share và Publish ngay trong Simple mode, không phải hiểu hoặc chọn revision/provider/target; mọi output công khai vẫn pin immutable revision và đi qua boundary bảo mật/confirmation hiện có.

## 21D.2. Checklist

- [x] Simple toolbar có Preview, Share và Publish; Advanced mode giữ Export/revision/technical Share/Deploy/legacy AI.
- [x] Revision DTO công khai có `documentVersion`, không trả snapshot/project/creator metadata.
- [x] Share/Publish tái sử dụng revision khớp latest saved server version hoặc tạo một release snapshot duy nhất.
- [x] Dirty/saving/offline/error/conflict không thể tạo Share hoặc Publish mới.
- [x] Simple Share bỏ revision selector, giải thích link/noindex, copy/open và xác nhận trước khi disable.
- [x] Simple Publish tóm tắt project/CTA/public destination, yêu cầu explicit confirmation và luôn dùng production target.
- [x] Provider/revision/target/technical status chỉ nằm trong collapsed Advanced details.
- [x] Guided first-time journey chạy không mở Advanced mode trên Chromium/Firefox/WebKit; mobile 390px Share/Publish axe audit pass.
- [x] Share/Export/Deploy immutable/security regressions focused pass sau khi cập nhật Advanced export journey.
- [x] Mentor xác nhận cuối cho trải nghiệm simplified publishing production; owner ghi nhận đã được thông qua ngày 2026-07-28 và không báo blocker.

## 21D.3. Exit criteria

- [x] Brief → direction → edit → review → Preview/Share/Publish hoàn tất không cần Advanced mode.
- [x] Default recovery/error copy không lộ internal error/provider terminology.
- [x] Owner confirmation, immutable revision/artifact, Exact-Origin/RBAC và validated public URL được giữ nguyên.
- [x] Lint/typecheck/test/coverage/build/db/eval và focused cross-browser gates pass.
- [x] Mentor acceptance cuối cho Stage 9 đã được owner xác nhận và ghi nhận ngày 2026-07-28; không có blocker được báo cáo.

## 21D.4. Stage Implementation Record

```text
Phase: Phase 10 / Stage 9 — Simplified Publish and Mentor Acceptance
Status: Completed
Implemented date: 2026-07-28
Completed date: 2026-07-28
Implemented: Public revision documentVersion summary; latest-safely-saved revision reuse/creation helper; Simple-mode Preview/Share/Publish; plain-language public confirmation, progress, recovery and validated URL actions; collapsed technical details; project-name/brief CTA handoff; owner-only gating; Advanced capability preservation.
Changed files/modules: packages/database project revision mapping/test; apps/web project revision API, EditorApp/ProjectEditor, SecurePreview, SharePanel, new PublishPanel, styles/copy/tests; Guided/Share/Export/Deploy E2E journeys; product/API/project documentation.
Verification commands: focused database and Web RED/GREEN Vitest; focused Web typecheck/lint; Chromium then Firefox/WebKit Guided publish journey; 390px axe; Share/Export/Deploy focused regression; workspace lint/typecheck; serial workspace tests; Web/database coverage; workspace build; db:check; deterministic ai:eval/guard; full Playwright attempt/rerun; git diff --check.
Passed: focused database repository 8/8; focused Web Stage 9/related tests 67/67 then expanded Publish tests 6/6; workspace serial tests 27/27 tasks with 502 tests; lint/typecheck/build 15/15; final Web coverage 83.97/80.08/81.34/88.47 and database 88.69/80.48/97.82/94.97 (statements/branches/functions/lines); db:check; deterministic eval legacy 6/6 + intelligence vi/en 2/2 + guard 2/2; Guided first-time journey Chromium/Firefox/WebKit 3/3; mobile 390px Share/Publish axe serious/critical 0; focused Share/Export/Deploy security regression 6/6 after Advanced export update; final full Playwright 72/72 trên Chromium/Firefox/WebKit; diff check no whitespace error.
Failed: Intended RED tests failed because `documentVersion`, project-name handoff and Simple Share/Publish did not exist. First Web coverage run missed branch threshold at 79.68%; additional publish recovery tests raised it above 80%. First full E2E attempt exposed missing legacy Advanced AiAssistant and Simple-default Export assumptions; later reruns exposed ambiguous duplicate saved-status selectors and one persistence race. AiAssistant was restored, export journeys now explicitly enter Advanced mode, selectors were scoped by landmark and persistence uses bounded polling; final full E2E passed 72/72.
Skipped: No live Gemini/Pexels/Vercel request; deterministic E2E deployment runtime only. Desktop/mobile visual assertions and axe ran, but repository does not use committed screenshot baselines. Owner confirmed mentor acceptance for Stage 9 on 2026-07-28; no blocking issue was reported.
Known limitations: One deployment provider, no custom domains/environments or automatic publish. Share and Publish are owner-only. Simple Publish requires the configured publishing service and produces validated *.vercel.app URL.
Decisions made: Simple public actions operate only on latest safely saved server version; revision identity is internal by default; Advanced mode preserves explicit revision/provider/target controls; legacy direct AI assistant remains Advanced-only while Simple AI stays proposal-first.
Risks added/closed: No new provider, credential or executable-content boundary. Closed accidental stale/local publication path and default technical-language exposure. Phase 7 external live/managed-topology gates remain independent.
Next phase readiness: Stage 9 is Completed after technical gates and mentor acceptance. Do not open Stage 10 implementation until one lifecycle capability has validated user evidence, a clear owner and measurable acceptance criteria; Phase 7 external private-beta gates remain an independent release-readiness track.
```

---

# 21E. Phase 11 / Stage 10 — Website Lifecycle Expansion

## 21E.1. Quyết định phạm vi và thứ tự

Owner chọn Stage 10 giải quyết đầy đủ hai nhóm vấn đề đã được xác định sau MVP, theo hai completion gate tuần tự để tránh mở đồng thời hai thay đổi nền tảng lớn:

```text
Stage 10A — Image Asset Pipeline + Brand Kit
    ↓ 10A technical + product acceptance
Stage 10B1 — Multi-page Foundation
    ↓ schema/compiler/publication migration green
Stage 10B2 — CMS + Structured Content
    ↓ full lifecycle acceptance
Stage 10 Completed
```

- Stage 10A được triển khai trước vì ảnh/brand chạm trust boundary nhập file và có ADR-0012 đã accepted.
- Stage 10B chỉ bắt đầu runtime implementation sau khi 10A đạt completion gate; việc viết ADR/capability contract cho 10B có thể chuẩn bị trước nhưng không được làm song song mutation lớn.
- Hai track đều phải giữ Design Document/structured data làm source of truth, mọi mutation đi qua command/transaction layer, AI chỉ tạo structured validated output và publication luôn pin immutable release state.
- Stage 10 không thay thế các external release-readiness gate còn mở của Phase 7.

## 21E.2. Capability 10A — Image Asset Pipeline + Brand Kit

### User-visible outcome

Owner có thể upload hoặc tìm ảnh, thay/crop/tối ưu ảnh, quản lý alt text và áp dụng logo/màu/font thương hiệu ngay trong Simple mode; Canvas, Preview, Share, Export và Publish cùng hiển thị một asset bất biến do ZenUI sở hữu, không phụ thuộc URL provider trực tiếp.

### Phạm vi bắt buộc

#### A. Asset ingestion và storage an toàn

- [x] Tạo `@zenui/asset-core` provider-neutral contract và worker pipeline theo ADR-0012.
- [x] Hỗ trợ upload JPEG/PNG/WebP với giới hạn request/stream/decode/dimension/pixel; kiểm tra MIME + magic bytes, từ chối animated/malformed/unsupported input.
- [x] Hỗ trợ tìm ảnh qua Pexels server-only adapter, trả kết quả redacted/attribution; import chỉ nhận provider result ID, không nhận arbitrary remote URL.
- [x] Provider import kiểm tra HTTPS/exact host, toàn bộ A/AAAA public-only, private/reserved/mixed/mapped ranges, hostname/SNI intent, timeout và redirect policy; deterministic hostile matrix fail closed. Adapter hiện từ chối mọi redirect thay vì follow và revalidate, là policy chặt hơn cho fixed-provider Stage 10A.
- [x] Sharp auto-rotate, strip metadata, resize/crop bounded và deterministic WebP encode; kiểm tra output size/hash trước khi ghi private S3-compatible storage.
- [x] Queue payload chỉ chứa local IDs; provider/S3 credential, source URL tùy ý và raw provider response không đi vào queue/browser/database.
- [x] PostgreSQL sở hữu workspace/project-scoped lifecycle `queued → importing → ready | failed`, attribution, recovery lease và allowlisted safe error code.
- [x] Asset ID là random opaque UUID; public object path, content hash và provider metadata không trở thành Design Document data.
- [x] Cookie-free `ASSET_ORIGIN` khác hostname editor chỉ phục vụ asset `ready` với exact MIME/length, immutable cache, ETag, `nosniff` và không lộ tenant/object/provider metadata.

#### B. Image editing và alt text

- [x] Asset library trong editor hỗ trợ upload, search, import, progress, retry, chọn và thay ảnh mà không cần URL kỹ thuật.
- [x] Crop/aspect/resize backend là bounded, non-destructive immutable derivative; Simple Asset Library có preset vuông/ngang và chỉ apply derivative sau khi `ready`.
- [x] Alt text có thể xem/sửa, bắt buộc với ảnh mang nội dung; decorative là lựa chọn explicit với alt rỗng có chủ đích.
- [x] Public/editor DTO chỉ hiển thị dimensions, bytes, attribution và lifecycle cần thiết; archive API là soft archive và không lộ credential, object key hoặc provider response. Advanced dùng cùng picker contract; dedicated archive control không phải blocker của critical Stage 10A journey.
- [x] Image replacement áp dụng qua `UPDATE_PROPS`; provider/worker completion chỉ cập nhật asset lifecycle, không tự mutate accepted document.
- [x] Legacy `{ src, alt }` vẫn đọc/render được trong migration window; ảnh mới dùng canonical owned asset reference và helper report legacy refs đã có.

#### C. Brand Kit

- [x] Workspace owner có Brand Kit API/panel cho name, color, font, preview, optimistic save và atomic apply; optional workspace logo contract/repository validation sẵn sàng, còn logo trống là trạng thái Brand Kit hợp lệ.
- [x] Repository chỉ nhận logo asset workspace `ready`; màu qua contrast/syntax schema; font từ allowlist và không nhận arbitrary font upload.
- [x] Apply brand qua atomic command transaction, chỉ map theme/navbar/brand slot và không silent overwrite section content/image.
- [x] Immutable revision đóng băng theme và asset IDs đã áp dụng; Share/Export/Deploy compile revision snapshot.
- [x] AI không nhận credential, object key, provider source URL hoặc quyền tự chọn owned asset ID; Stage 10A giữ Brand Kit application deterministic/server-owned thay vì đưa mutable asset authority vào model context.

### Security và lifecycle invariants

- Không có general-purpose URL proxy, SVG/GIF executable/animated upload, browser-direct provider secret hoặc editor-cookie asset serving.
- Không hard-delete asset đang được draft/revision/share/export/deployment tham chiếu; thao tác remove khỏi library là archive, còn garbage collection chỉ chạy khi reference audit chứng minh an toàn.
- Upload/search/import mutation yêu cầu Auth/RBAC, exact trusted Origin, workspace/project scope, rate/admission limit và tenant-safe not-found.
- Public asset là unguessable bearer reference cho nội dung public, không được mô tả như private-media authorization boundary.
- Live Pexels/object-store smoke là external credentialed gate riêng; deterministic fixtures không gọi Pexels/Gemini.

### Non-goals 10A

- Không hỗ trợ arbitrary URL import/proxy, SVG/vector editor, video, arbitrary font upload, confidential/private media delivery hoặc full digital-asset-management workflow.
- Không tự động thay ảnh hay apply brand mà không có preview/owner acceptance.

### Acceptance criteria 10A

- [x] Deterministic journey hoàn thành upload → normalize → crop → alt → replace → autosave trong Simple mode; mobile 390px surface/axe được kiểm tra. Preview/Share/Export/Deploy parity được chặn bằng renderer/compiler/revision tests và full E2E regression.
- [x] Deterministic journey hoàn thành search → import fixed Pexels result ID → attribution → replace mà không đưa provider credential/source URL nội bộ vào browser/queue/document.
- [x] Áp dụng name/color/font Brand Kit có preview, optimistic save và atomic apply; revision/publication snapshot cũ không bị draft/kit mutation sau đó thay đổi. Optional logo mapping dùng cùng owned-asset contract.
- [x] Cùng một asset/derivative được resolve qua exact `ASSET_ORIGIN` trên Canvas, isolated Preview, Share, standalone Export và Deploy.
- [x] Hostile upload/SSRF/redirect/DNS/decompression/content-confusion matrix pass; outsider/forged Origin/cross-tenant access bị chặn.
- [x] Accessibility: keyboard/progress/error/alt/decorative controls usable; axe serious/critical bằng 0 trong critical desktop/mobile journeys.
- [x] Focused TDD, migration, integration, worker/storage, cross-browser E2E và full lint/typecheck/test/coverage/build/db/security gates xanh; mọi configured coverage metric >=80%.
- [ ] Mentor/non-coder acceptance cho image + brand journey được ghi nhận trước khi Stage 10A `Completed`.

## 21E.3. Capability 10B1 — Multi-page Foundation

### User-visible outcome

Owner có thể tạo, đổi tên, sắp xếp, duplicate và xóa nhiều page; cấu hình navigation và route an toàn; Preview/Share/Export/Publish toàn website với route nhất quán mà không cần hiểu file/path/revision internals.

### Phạm vi bắt buộc

- [x] Viết ADR-0015 cho Design Document v2/multi-page ownership, migration, global budgets và release artifact trước production code.
- [x] Nâng schema từ single `pages.length(1)`/slug `/` sang bounded pages với một home bắt buộc, root riêng, stable page ID, unique normalized slug và deterministic order.
- [x] Có lossless/idempotent migration v1 → v2; rollback/read compatibility đã được chốt trong ADR-0015 trước khi write v2 được bật.
- [x] Chốt bounded budgets trước RED tests: 20 pages/navigation items, slug 80 ký tự/4 segment, giữ 500 nodes/depth 12/JSON 1 MiB; static site 20 HTML files, 2 MiB/file, 8 MiB aggregate và ZIP 10 MiB.
- [x] Page create/rename/slug/reorder/duplicate/delete và navigation update đều qua validated atomic command transaction, optimistic version và undo/redo.
- [x] Home page không thể bị xóa; duplicate/reserved/unsafe slug, traversal, encoded separator và case/Unicode collision bị từ chối.
- [x] Internal link dùng page ID trong editor và được compiler resolve thành route; xóa page báo navigation/internal-link impact và yêu cầu resolve reference trước khi apply.
- [x] Simple mode có Page manager + Navigation editor; Advanced mode giữ Layers/Inspector theo page đang chọn.
- [x] Shared compiler tạo deterministic route tree (`index.html`, `<slug>/index.html`) không path traversal; Preview route switching, Share path, Export bundle và Deploy artifact dùng cùng render plan.
- [x] Revision/release snapshot đóng băng toàn bộ pages/navigation; draft đổi sau publish không làm thay website public.

### Non-goals 10B1

- Không custom domain, redirect manager, arbitrary filesystem path, server-side user code, dynamic runtime route hoặc real-time collaborative editing.

### Acceptance criteria 10B1

- [ ] Owner tạo tối thiểu Home/About/Contact, cấu hình navigation, chỉnh từng page, preview từng route và publish toàn site không mở Advanced mode.
- [ ] Reload/autosave/conflict/undo/redo hoạt động đúng theo page; duplicate/delete/slug collision có recovery an toàn.
- [ ] Share/Export/Deploy phục vụ mọi route của cùng immutable revision; deep link refresh hoạt động và không lộ workspace/project metadata.
- [ ] v1 projects migrate không mất nội dung và public revision cũ vẫn render đúng.
- [x] Chromium/Firefox/WebKit, mobile 390px, axe, route-security/property tests và full technical quality gates xanh; mentor acceptance vẫn phải được ghi trước khi 10B1 hoàn tất.

## 21E.4. Capability 10B2 — CMS + Structured Content

### User-visible outcome

Owner có thể định nghĩa collection có cấu trúc, quản lý bài viết/nội dung lặp lại và gắn list/detail page template; Preview/Share/Export/Publish tạo toàn bộ route tĩnh bất biến mà không cần database/runtime code phía website public.

### Phạm vi bắt buộc

- [ ] Viết ADR chốt data ownership giữa Design Document v2, collection schema, draft entries và immutable release manifest.
- [ ] Collection schema versioned hỗ trợ bounded field types cần thiết cho MVP: short/long text, rich text an toàn, number, boolean, date, link và owned image/alt; field key/type change có migration/impact preview.
- [ ] CRUD collection/field/entry và bulk state transition đều schema-validated, optimistic, atomic theo transaction boundary, RBAC/exact-Origin và audit-safe.
- [ ] Entry có stable opaque ID, unique normalized slug trong collection, draft/published readiness và actionable validation errors; không cho executable HTML/JS hoặc unsafe URL.
- [ ] Simple CMS surface hỗ trợ collection table, create/edit/duplicate/archive entry, image picker và preview; keyboard/mobile/empty/loading/error/conflict states đầy đủ.
- [ ] List/detail template binding chỉ tham chiếu typed field IDs; renderer escape/sanitize theo field type và hiển thị missing-data fallback rõ ràng.
- [ ] Blog starter là preset trên generic collection contract, không trở thành schema đặc biệt không tái sử dụng.
- [ ] Release snapshot pin collection schema + entry versions + page templates; draft CMS thay đổi sau Share/Publish không thay output đã public.
- [ ] Compiler materialize bounded static list/detail routes, sitemap/navigation integration và deterministic standalone bundle; không cần public database, cookie hoặc server runtime.
- [ ] Publication preflight phát hiện slug collision, missing required field/asset, broken binding, route/file/size budget overflow và chặn release với recovery rõ ràng.

### Non-goals 10B2

- Không headless public CMS API, arbitrary custom field plugin, server-rendered personalization, user-submitted forms/data, workflow approval, localization, analytics hoặc unbounded entry count trong Stage 10.

### Acceptance criteria 10B2

- [ ] Owner tạo Blog collection, fields và nhiều entries; cấu hình list/detail template; preview list + detail rồi Share/Export/Publish toàn bộ route trong Simple mode.
- [ ] Structured content được escape/sanitize; malicious rich text/link/slug/image reference và forged/cross-tenant requests bị chặn.
- [ ] Collection/field migration, archive/restore, autosave/conflict và broken-binding recovery có deterministic tests.
- [ ] Immutable release không đổi khi draft entry/template sửa sau publish; compiler output không có arbitrary script, cookie hoặc internal metadata.
- [ ] Bounded collection/entry/route/compiled-size capacity tests, cross-browser E2E, mobile/axe và full quality gates xanh; mentor acceptance được ghi nhận.

## 21E.5. Stage 10 gates và Implementation Record

### Planning/entry gate

- [x] Owner chọn Image Asset Pipeline + Brand Kit và Multi-page + CMS là phạm vi Stage 10 ngày 2026-07-28.
- [x] Thứ tự tuần tự 10A → 10B1 → 10B2 được ghi để tránh triển khai nhiều nền tảng song song.
- [x] ADR-0012 tiếp tục là security contract nền cho 10A; không nới thành arbitrary URL proxy.
- [x] Hoàn tất capability/ADR/data/API/migration/test plan chi tiết cho 10A; runtime implementation đã bắt đầu theo các lát TDD.
- [x] Chốt Stage 10B1 resource budgets, Design Document v2 ownership, v1 compatibility và static-site release trong ADR-0015 trước production code; CMS ownership ADR vẫn để dành cho 10B2.

### Stage 10 exit criteria

- [x] Stage 10A đạt technical gate và owner-reported practical acceptance ngày 2026-07-29; không có blocker hiện tại.
- [ ] Stage 10B1 đạt migration/publication gate và mentor/non-coder acceptance.
- [ ] Stage 10B2 đạt structured-content/publication gate và mentor/non-coder acceptance.
- [x] Full regression chứng minh single-page v1, existing share/export/deploy và Advanced editor không bị phá vỡ.
- [x] Tài liệu API, schema, wireflow, ADR, threat model, operations và PROJECT_PLAN được cập nhật cùng implementation evidence.
- [ ] Phase 7 external gates vẫn được báo cáo riêng; không dùng deterministic Stage 10 evidence để tuyên bố private-beta production readiness.

```text
Phase: Phase 11 / Stage 10A — Image Asset Pipeline + Brand Kit
Status: In review — deterministic technical gates complete; mentor/non-coder acceptance open
Opened date: 2026-07-28
Scope decision: Owner selected Stage 10A Image Asset Pipeline + Brand Kit followed by Stage 10B Multi-page + CMS.
Implemented: asset-core schemas/security matrix; canonical owned image/logo refs; additive migration/repositories; authenticated asset/Brand Kit APIs; BullMQ/S3/Pexels/Sharp worker; cookie-free public delivery; Canvas/Preview/Share/Export/Deploy parity; Simple Asset Library crop/alt/decorative flow; versioned Brand Kit preview/save/atomic apply.
Verification 2026-07-29: lint/typecheck/build 16/16; tests 29/29 tasks; coverage 29/29 tasks and every configured metric >=80%; database 69/69; asset-core 47/47; Web 236/236 in isolated coverage; db:check pass with validation URL; AI eval 6/6 + 2/2 locales and eval harness 2/2; full Playwright 81/81 on Chromium/Firefox/WebKit with axe critical journeys; git diff --check has no whitespace errors beyond LF/CRLF notices. No live Gemini/Pexels/Vercel call.
Resolved regressions: canonical remote-to-owned patch now uses JSON-safe null deletion; E2E fixed WebP fixture is valid; provider result actions no longer inherit asset-tile full-height CSS; bounded polling and cross-browser scroll selectors are stable; Web coverage workers/timeouts are bounded to prevent concurrent instrumentation flakes.
Acceptance 2026-07-29: owner completed the practical Stage 10A walkthrough, reported that the tested image/Brand Kit surfaces are currently stable and requested progression to Stage 10B; later defects will be handled as follow-up fixes. Stage 10A is Completed.
Follow-up capability 2026-07-31: Guided creation now produces one bounded shared media plan (Hero plus at most three content slots), resolves each slot generated-image first then Pexels then deterministic fallback, and stores only normalized owned assets. Simple contextual AI retains the exact clicked image/media slot, routes image language to durable `replace-media`, prepares the owned asset without invoking the text-edit provider, and applies only after explicit proposal Accept. This follow-up does not reopen Stage 10A or advance Stage 10B1.
Verification 2026-07-31: RED reproduced missing `replace-media` contract/routing/materialization; focused AI Core 58/58, Worker 51/51 and Web 255/255 passed; workspace typecheck 16/16, lint 16/16, unit/integration test 29/29 tasks and build 16/16 passed; `git diff --check` reported no whitespace errors (LF/CRLF notices only). Playwright and coverage were not rerun for this follow-up.
Provider diagnosis/fix 2026-07-31: the configured API key lists Imagen 4 with `predict`, but the SDK `models.generateImages(...)` path returned `Not Found`; the same key lists Gemini image models with `generateContent`. Added a RED interaction regression, migrated the server-only adapter to `generateContent` with `responseModalities: ['IMAGE']`, a bounded 1K/aspect-ratio image config, exactly-one inline-image validation, safe error classification and no prompt/bytes logging. Focused Worker 52/52 and Worker typecheck passed. One explicitly authorized bounded live Hero call to `gemini-3.1-flash-image` succeeded (`image/jpeg`, 868700 bytes); no Pexels or Vercel call was made. Initial UI retry still failed because the long-running `pnpm dev` parent retained the old Imagen environment even after `tsx watch` reloaded edited TypeScript; the complete topology was cold-started with the corrected model. Subsequent user-triggered proposals proved Gemini generated and uploaded JPEG sources (735977 and 861269 bytes), but PostgreSQL rejected `source='generated'`: migration `0013_generated_asset_source.sql` existed but was missing from Drizzle `_journal.json`, so `db:migrate` silently stopped at 0012. Registered 0013, applied it forward, and verified the live enum is `upload | pexels | generated | derivative`, migration history is 14 entries, a generated asset insert succeeds inside a rollback transaction, `db:check` passes, database tests are 71/71, and database typecheck passes. Added a migration/journal parity regression to prevent orphan SQL files. Owner then confirmed media proposal generation/acceptance works. Follow-up RED found the comparison modal omitted `assetOrigin` from both scoped `DesignDocumentRenderer` instances, so owned images rendered only alt text; passed the validated editor asset origin through every `ContextualAi` surface and both current/proposed renderers. Web tests are 256/256, Web typecheck/lint pass, current/proposed public assets return HTTP 200 `image/webp` (97512/103368 bytes), Worker remains ready, and `git diff --check` has no whitespace errors beyond LF/CRLF notices.
```

```text
Phase: Phase 11 / Stage 10B1 — Multi-page Foundation
Status: In review — implementation and deterministic technical gates complete; mentor/non-coder acceptance open
Opened date: 2026-07-29
Entry evidence: Stage 10A technical and owner acceptance gates complete. ADR-0015 accepted before production code.
Fixed budgets: 20 pages/navigation items; 500 nodes; depth 12; document 1 MiB; slug 80 chars/4 segments; 20 HTML files; 2 MiB/file; 8 MiB site; 10 MiB ZIP.
Scope delivered: Design Document v2, lossless/idempotent v1 reader migration, page/navigation commands, active-page editor, multi-route Preview/Share, deterministic ZIP Export and bounded multi-file Deploy. Additive migration 0012 stores redacted export route count; immutable snapshots remain whole-document JSONB.
Verification 2026-07-29: focused RED/GREEN schema/commands/editor/compiler/database/API/worker/UI tests pass; workspace lint/typecheck/unit-integration/coverage/build pass; all configured coverage metrics >=80%; `db:check`, deterministic AI eval 6/6 + Site Intelligence locales 2/2, AI eval guard 2/2, `pnpm audit --prod`, `git diff --check` and secret/sensitive-log/metadata scans pass. Critical Chromium publication/editor/share/deploy suite passed 11/11; definitive full Playwright passed 84/84 in 12.2 minutes across Chromium/Firefox/WebKit, including 390px Page Manager/Share/Publish surfaces and axe serious/critical checks. No live Gemini/Pexels/Vercel call was made. Mentor/representative non-coder acceptance remains the only Stage 10B1 completion gate; Stage 10B2 CMS remains out of scope.
```

---

# 22. Existing implementation acceptance criteria

## AI

- [x] Prompt tạo landing page hợp lệ.
- [x] Mọi output được schema validation.
- [x] AI sửa toàn trang hoặc selected node.
- [x] Invalid output không phá document.
- [x] Run có loading/success/error/usage.

## Drag-and-drop

- [x] Ít nhất 15 component có thể kéo vào canvas.
- [x] Reorder section.
- [x] Move component giữa container hợp lệ.
- [x] Invalid target bị từ chối.
- [x] Drag/drop có undo/redo.
- [x] Layers và canvas đồng bộ.

## Visual editing

- [x] Click node mở đúng inspector.
- [x] Sửa text/style cập nhật tức thời.
- [x] Desktop/tablet/mobile.
- [x] Autosave và reload không mất dữ liệu.

## Revision

- [x] AI edit tạo revision.
- [x] Restore revision.
- [x] Share pin immutable revision.
- [x] Deploy pin immutable revision.

## Output

- [x] Export deterministic ZIP chứa standalone HTML chạy độc lập.
- [x] Preview/export nhất quán.
- [x] Share chỉ đọc.
- [x] Deploy trả URL hoặc lỗi rõ.
- [x] Idempotent deploy.

## Security

- [x] Preview không đọc editor credentials.
- [x] Không arbitrary generated JavaScript.
- [x] Không truy cập chéo workspace/project.
- [x] Provider token không lộ client/log.
- [x] Input từ user/AI/API được validate.

---

# 23. Verification strategy

## 23.1. Test pyramid

```text
                 +----------------+
                 | E2E critical   |
                 | user journeys  |
                 +-------+--------+
                         |
             +-----------+-----------+
             | Integration tests     |
             | API/DB/queue/preview  |
             +-----------+-----------+
                         |
       +-----------------+-----------------+
       | Unit/property/component tests     |
       | commands/schema/registry/compiler |
       +-----------------------------------+
```

## 23.2. Test bắt buộc khi thay đổi hành vi

- Command handler: unit + inverse command test.
- Schema/invariant: validation tests.
- Drag/drop: component/integration + E2E critical path.
- AI contract: mock fixtures + invalid output tests.
- API endpoint: auth/input/error integration tests.
- Preview/export: consistency + security test.
- Deploy: state/idempotency/error tests.

## 23.3. Verification loop cuối mỗi phase

1. Chạy formatter/lint.
2. Chạy typecheck.
3. Chạy unit tests.
4. Chạy integration tests liên quan.
5. Chạy E2E critical flow.
6. Chạy build production.
7. Chạy security checks liên quan.
8. Ghi chính xác command và kết quả vào Phase Completion Record.

Không được ghi “đã kiểm tra” nếu không có command hoặc bằng chứng tương ứng.

---

# 24. Security checklist

## Auth/RBAC

- [ ] Mọi project query có workspace ownership check.
- [x] Share viewer không có editor permission.
- [x] Deploy/export kiểm tra quyền.
- [x] Provider connection thuộc đúng workspace/user.

## Input

- [x] API schemas.
- [x] AI output schemas.
- [x] Command semantic validation.
- [x] URL allowlist/protocol validation.
- [ ] Upload MIME/extension/size validation.

## Preview

- [x] Separate origin.
- [x] Sandbox iframe.
- [x] CSP.
- [x] Origin checks.
- [x] No auth credential.
- [x] No arbitrary script.

## Secrets

- [ ] Environment/secrets manager.
- [x] Encryption at rest cho provider credentials.
- [x] No secrets in prompt/log/error/client.
- [x] Redaction.
- [x] Revoke/disconnect.

## Abuse/cost

- [x] AI rate limit.
- [x] Deploy rate limit.
- [x] Export rate limit.
- [x] Share rate limit.
- [x] Max document nodes/depth/size.
- [x] AI token/time/retry budget.
- [ ] Worker CPU/RAM/time limits nếu chạy code/build.

---

# 25. Observability

## Metrics

- AI run count, success rate, repair rate, latency, usage.
- Autosave success/failure/conflict rate.
- Preview render success/error latency.
- Export success/error latency.
- Share views/rate-limit.
- Deploy success/failure/duration/provider errors.
- Queue depth/retry/dead-letter.

## Logs

- Structured logs.
- Request/project/workspace/run/deployment correlation IDs.
- Không log full secret.
- Không log sensitive prompt mặc định nếu chưa có retention policy.

## Tracing

```text
User action
-> API request
-> command/AI run
-> DB revision
-> queue job
-> worker/provider
-> final status
```

---

# 26. Risk Register

| ID | Rủi ro | Mức độ | Khả năng | Giảm thiểu | Trạng thái |
|---|---|---:|---:|---|---|
| R-001 | Drag/drop tree tạo cycle/orphan | Cao | Trung bình | Command validation, parent-child matrix, property/integration/E2E tests | Closed — Phase 7 deterministic gate |
| R-002 | AI output không ổn định | Cao | Cao | Structured output, semantic validation, bounded repair, regression fixtures; Phase 3 controls implemented, live eval remains TD-009 | Mitigated |
| R-003 | Preview XSS ảnh hưởng editor | Critical | Trung bình | Separate hostname, sandbox, nonce CSP, exact origin/source/channel/schema, DOM API render, no generated JS | Mitigated — Phase 4 |
| R-004 | Preview và export khác nhau | Cao | Trung bình | Shared canonical render plan + deterministic compiler + DOM/style/cross-browser consistency tests | Mitigated — Phase 4 |
| R-005 | Autosave ghi đè thay đổi mới | Cao | Trung bình | Optimistic version, sequential autosave and stale-tab conflict/recovery E2E | Closed — Phase 7 deterministic gate |
| R-006 | Provider token bị lộ | Critical | Thấp/Trung bình | OAuth, AES-256-GCM tenant-bound AAD, redacted DTO/queue/log/browser boundaries, disconnect clearing | Mitigated — Phase 6 |
| R-007 | Scope tăng thành full v0 quá sớm | Cao | Cao | Enforce non-goals và phase gates | Open |
| R-008 | Chi phí AI vượt kiểm soát | Cao | Trung bình | Redis user/workspace windows, daily token reservation, usage ledger, minimal context, bounded timeout/retry/repair; load tuning remains TD-009 | Mitigated |
| R-009 | Component registry thiếu nhất quán | Cao | Trung bình | One typed 18-component registry contract used by editor, AI, validator and compiler with regression tests | Closed — Phase 7 deterministic gate |
| R-010 | Deploy API thay đổi/phụ thuộc bên thứ ba | Trung bình | Trung bình | Validated Vercel adapter, safe error taxonomy, durable state, bounded polling; reconciliation/load smoke in Phase 7 | Mitigated — residual Phase 7 |

---

# 27. Open Questions

Không còn open question chặn Phase 1. Các quyết định Phase 0 đã được chuyển vào Decision Log và ADR tương ứng.

Câu hỏi không chặn cần xem lại ở phase owner:

1. Có proxy/allowlist ảnh remote trước public beta hay chấp nhận disclosure rủi ro theo tài liệu? Owner: Phase 4/7.
2. Chính sách expiry tùy chọn cho share link có được bổ sung sau MVP không? Owner: Phase 5.
3. Queue/cache provider đã chốt Redis + BullMQ trong Phase 3 (D-018/ADR-0007); production vendor/topology và capacity tuning vẫn được chốt trong Phase 7 theo môi trường deploy.

Không tự suy diễn câu trả lời thành product truth. Khi chốt, chuyển câu trả lời vào Decision Log.

---

# 28. Decision Log

| ID | Ngày | Quyết định | Trạng thái | Lý do | Ảnh hưởng |
|---|---|---|---|---|---|
| D-001 | 2026-07-21 | MVP bắt buộc có drag-and-drop | Accepted | Yêu cầu sản phẩm của chủ dự án | Bổ sung Editor Core trước AI |
| D-002 | 2026-07-21 | Dùng block-based drag-and-drop | Accepted | Responsive và export ổn định hơn pixel-based | Cần parent/child constraints |
| D-003 | 2026-07-21 | Design Document JSON là source of truth | Accepted | Đồng bộ DnD, AI, preview, export, revision | Cần schema/version/migrations |
| D-004 | 2026-07-21 | AI trả structured operations | Accepted | An toàn và dễ validate/undo/audit | Cần provider structured output |
| D-005 | 2026-07-21 | MVP không chạy arbitrary generated JavaScript | Accepted | Giảm XSS và sandbox risk | Hạn chế interaction trong output |
| D-006 | 2026-07-21 | Workflow trong tài liệu dùng ASCII, không Mermaid | Accepted | Yêu cầu trình bày của chủ dự án | Tất cả sơ đồ tài liệu tuân theo |
| D-007 | 2026-07-21 | Google Gemini là AI provider đầu tiên sau provider-neutral adapter | Accepted | Lựa chọn sản phẩm; giảm coupling provider trong domain | Structured output vẫn phải validate server-side |
| D-008 | 2026-07-21 | Vercel là deploy provider đầu tiên | Accepted | Phù hợp standalone web deployment và MVP scope | OAuth server-only, deploy immutable revision |
| D-009 | 2026-07-21 | Auth.js + PostgreSQL + Drizzle ORM | Accepted | TypeScript stack, relational consistency và migration rõ ràng | Mọi resource được scope theo workspace |
| D-010 | 2026-07-21 | Schema workspace-ready ngay từ đầu | Accepted | Tránh migration ownership lớn khi thêm team | MVP UI có thể bắt đầu đơn giản nhưng data model không user-only |
| D-011 | 2026-07-21 | pnpm + Turborepo + Next.js App Router + TypeScript strict | Accepted | Package boundaries và verification thống nhất | Web, worker và domain packages độc lập |
| D-012 | 2026-07-21 | Ảnh MVP dùng URL HTTP(S), không upload | Accepted | Giảm storage/security scope | Remote tracking là residual risk cần xem lại trước beta |
| D-013 | 2026-07-21 | Contact Form chỉ là visual component trong MVP | Accepted | Không mở submission/security backend ngoài scope | Export không có form processing |
| D-014 | 2026-07-21 | Share link persistent mặc định và có thể disable | Accepted | Luồng chia sẻ đơn giản, revision bất biến | Phase 5 phải hỗ trợ revoke/disable |
| D-015 | 2026-07-21 | Font chỉ từ allowlist; không custom upload | Accepted | Deterministic render và giảm asset risk | Arial, Georgia, Manrope, system-ui |
| D-016 | 2026-07-21 | Standalone HTML; giới hạn 500 nodes, depth 12, JSON 1 MiB | Accepted | Output portable và giới hạn abuse/performance | Validator enforce trước apply/render |
| D-017 | 2026-07-21 | Tên sản phẩm và npm workspace scope là ZenUI / `@zenui` | Accepted | Tên chính thức do chủ dự án lựa chọn | UI metadata, tài liệu và package imports dùng nhận diện ZenUI |
| D-018 | 2026-07-22 | Redis atomic admission + BullMQ jobs; PostgreSQL là durable AI run state; SSE poll DB | Accepted | Shared limits/job recovery across replicas và reconnect không mất terminal state | Production AI cần Redis/worker; xem ADR-0007 |
| D-019 | 2026-07-22 | Preview dùng hostname riêng + strict bridge; export snapshot durable qua BullMQ và private S3-compatible storage | Accepted | Cookie không bị cô lập theo port; artifact cần immutable/auditable/reusable cho deploy | Production cần preview host riêng, Redis/worker/S3; xem ADR-0006/0008 |
| D-020 | 2026-07-22 | Public share chạy trên hostname riêng và compile đồng bộ immutable revision | Accepted | Share viewer không nhận editor cookie; disable phải có hiệu lực ở request kế tiếp mà không mở public object lifecycle | Production cần `SHARE_ORIGIN` riêng, Redis view limits và no-store; xem ADR-0009 |
| D-021 | 2026-07-22 | Vercel OAuth token dùng AES-256-GCM tenant-bound; deployment là static immutable revision qua durable BullMQ worker | Accepted | Token không được tới browser/queue/log; ambiguous create không retry để tránh duplicate external deployment | Production cần Integration, encryption key/version, Redis/PostgreSQL/private S3 và bounded reconciliation; xem ADR-0010 |
| D-022 | 2026-07-23 | Phase 7 dùng PostgreSQL durable leases/reconciliation, exact-version credential keyring và private bounded-cardinality Prometheus/Grafana observability | Accepted | Crash recovery và ambiguous external effects cần authority bền vững; operator surfaces không được lộ tenant/resource data | Thêm recovery/rotation ceremonies, private operations endpoints, bounded local capacity và conservative retention; xem ADR-0011 |
| D-023 | 2026-07-24 | Stage 4 dùng fixed Pexels adapter + SSRF-safe worker import, private immutable S3 object, opaque asset ID và cookie-free `ASSET_ORIGIN`; legacy remote URL chỉ để tương thích chuyển tiếp | Accepted; runtime deferred 2026-07-27 | Loại viewer tracking/content drift khỏi generated production page mà không mở arbitrary URL proxy; giữ Design Document độc lập môi trường và render parity | ADR-0012/SSRF matrix vẫn là implementation contract, nhưng runtime chuyển sang post-validation roadmap sau non-coder UX acceptance |
| D-024 | 2026-07-27 | ZenUI chuyển product priority sang AI website co-designer cho non-coder: guided brief, bounded design directions, section-first Simple mode, contextual AI proposal review và simplified publish; primitive controls nằm trong Advanced mode | Accepted | Mentor feedback và public product study cho thấy Webflow-style professional depth không nên là happy path; Claude Design-style co-creation gần primary persona hơn, trong khi ZenUI có lợi thế structured/reversible/publishable website engine | Mở Phase 8 experience reset; deterministic prototype + mentor/non-coder acceptance đi trước AI/runtime và Production Asset Pipeline implementation |
| D-025 | 2026-07-31 | Generated media dùng một shared bounded plan cho ba directions và contextual replacement là server-routed `replace-media` proposal | Accepted | Giới hạn tối đa bốn image attempts mỗi Guided run, không nhân theo direction; giữ exact clicked target và không để text LLM/model tự cấp URL/asset authority | Worker ưu tiên generated image, fallback Pexels rồi deterministic UI; mọi output là normalized owned asset và chỉ explicit Accept mới đổi document |

Khi một quyết định lớn thay đổi, phải:

- Thêm dòng mới thay vì xóa lịch sử.
- Đánh dấu quyết định cũ `Superseded`.
- Ghi ID quyết định thay thế.
- Nếu đã có thư mục ADR, tạo/cập nhật ADR tương ứng.

---

# 29. Known Issues & Technical Debt

| ID | Phase phát sinh | Nội dung | Mức độ | Kế hoạch xử lý | Trạng thái |
|---|---|---|---|---|---|
| TD-001 | Planning | Stack/provider/auth chưa chốt | Blocking | Chốt trong Phase 0 | Closed — 2026-07-21, D-007 đến D-011/ADR-0002 đến ADR-0005 |
| TD-002 | Planning | Chưa có schema implementation | Blocking | Phase 0/1 | Closed — 2026-07-21, Zod + semantic validator + JSON Schema và tests |
| TD-003 | Planning | Chưa có threat model chi tiết | High | Phase 0 và cập nhật Phase 4/6 | Closed — 2026-07-21, `docs/security/threat-model.md`; phải review lại ở Phase 4/6 |
| TD-004 | Phase 0 | `REPLACE_SUBTREE` mới parse contract, chưa thực thi | Medium | Implement bằng TDD cùng undo/redo command reducer | Closed — 2026-07-21, Phase 1 subtree execution/inverse/atomic tests |
| TD-005 | Phase 0 | Web/worker scaffold chưa có behavioral tests | Low | Thêm tests khi Phase 1/3 tạo behavior thực tế | Closed — 2026-07-22, web có component/E2E tests và worker có Gemini adapter/processor/error-path tests với coverage >=80% |
| TD-006 | Phase 1 | Branch coverage của commands/web chưa đạt 80% | Medium | Nâng focused edge-case và DnD integration tests; giữ explicit package thresholds không thấp hơn baseline Phase 1 | Closed — 2026-07-21, commands 92.17% branches và web 87.85% branches; mọi metric >=80% |
| TD-007 | Phase 2 | Chưa có explicit Origin/CSRF control và test cho project mutation routes | High | Thêm trusted-origin guard dùng Auth.js same-site session pattern và route tests trước khi nối dashboard thật | Closed — 2026-07-22, exact trusted-Origin guard và mutation tests pass |
| TD-008 | Phase 2 | Autosave/revision repository đã có nhưng chưa nối editor/API/UI và authenticated E2E | High | Hoàn thiện document/revision routes, server-backed editor, conflict/recovery UI và Playwright journey | Closed — 2026-07-22, server persistence/revision/conflict E2E pass 15/15 trên 3 browser |
| TD-009 | Phase 3 | Live Gemini local edit đã đạt semantic acceptance nhưng contract/context cũ + repairs tiêu thụ 47.883 aggregate tokens; deployment-environment Redis/BullMQ/SSE/export/S3 capacity chưa được xác nhận | High | Compact blueprint + mode-specific output/aggregate/admission/repair budgets đã triển khai; chạy đúng một capped live generate qua editor trước beta, sau đó chạy production-topology capacity | Open — deterministic compact-blueprint/E2E gates pass; capped live token evidence và managed/provider topology acceptance còn thiếu |
| TD-010 | Phase 9 / Stage 5 | Aggregate branch coverage gate dưới 80% ở database (76.29%) và worker (78.41%) sau khi thêm direction persistence/worker lane; Web Stage 5 được tách khỏi legacy aggregate threshold và có focused component/E2E evidence riêng | Medium | Bổ sung edge tests cho repository lifecycle/recovery và worker error/config branches; sau đó bỏ exclusion tạm của Stage 5 Web files và chạy lại serial workspace coverage | Closed — 2026-07-28 / Stage 6: database 80.38%, worker 82.06%, Web 80.38% branches; bỏ toàn bộ Stage 5 exclusions, mọi configured metric >=80% |

Không xóa technical debt đã đóng; chuyển trạng thái sang `Closed` và ghi phase/ngày xử lý.

---

# 30. Progress Log

| Ngày | Phase | Thay đổi | Kết quả kiểm chứng | Người cập nhật |
|---|---|---|---|---|
| 2026-07-21 | Phase 0 | Tạo kế hoạch tổng thể, workflow ASCII, phase gates và update protocol | Review nội dung tài liệu; chưa có code/test | AI Agent |
| 2026-07-21 | Phase 0 | Scaffold monorepo; đóng băng Design Document/command/registry contracts; thêm ADR, wireframe, API contract và threat model; sửa lint/type narrowing | `pnpm lint`, `pnpm typecheck`, `pnpm test` (44/44), `pnpm test:coverage`, `pnpm build` đều pass; executable package statement coverage >=80% | AI Agent |
| 2026-07-21 | Cross-phase | Đổi tên sản phẩm thành ZenUI và npm workspace scope thành `@zenui` | Chạy lại lint, typecheck, test và build sau rename | AI Agent |
| 2026-07-21 | Phase 1 | Hoàn thiện subtree commands/history; thêm editor-core, HTML compiler, responsive editor, local persistence, Inspector, dnd-kit, property tests và Playwright | `pnpm lint/typecheck/test/test:coverage/build/test:e2e` pass; 70/70 tests; 2/2 Chromium E2E; security/doc scans sạch | AI Agent |
| 2026-07-21 | Phase 2 | Bắt đầu Phase 2 tuần tự trong main session; đọc lại API/auth/security contracts, lập implementation plan và chạy baseline | `pnpm lint` 7/7; `pnpm typecheck` 7/7; `pnpm test` 70/70; configured coverage pass; strict branch gate còn thiếu ở commands/web | AI Agent |
| 2026-07-21 | Phase 2 | Triển khai DB/Auth/RBAC/API slices, registry 18 component, Layers/DnD/Inspector/responsive và autosave/revision foundations; chạy lại E2E, coverage, build và security verification sau compact | Final: lint/typecheck/build 8/8; tests + coverage 132/132 với mọi executable metric >=80%; Chromium E2E 2/2; auth/API 21/21; db:check pass bằng placeholder URL; audit sạch; security scans không có match; Phase 2 vẫn In progress vì server-backed UI/revision/conflict E2E và Origin guard còn thiếu | AI Agent |
| 2026-07-22 | Phase 2 | Hoàn tất trusted-Origin, full project/document/revision APIs, authenticated dashboard, server autosave/conflict/recovery/revision UI, guarded E2E auth runtime, axe và đa trình duyệt | Final: lint/typecheck/build 8/8; 153/153 tests; mọi coverage metric >=80%; Playwright Chromium/Firefox/WebKit 15/15; axe serious/critical 0; db:check và production audit sạch; TD-007/TD-008 closed | AI Agent |
| 2026-07-22 | Phase 3 | Bắt đầu AI Generation & Editing trong main session; chốt kế hoạch TDD cho provider-neutral contracts, Gemini/worker, durable runs, rate/budget, SSE và editor AI Assistant | Baseline focused commands/database/web tests pass; `pnpm lint` và `pnpm typecheck` 8/8 pass; Phase 3 chuyển `In progress` | AI Agent |
| 2026-07-22 | Phase 3 | Hoàn tất AI contracts/orchestrator, generation persistence/usage, Gemini + BullMQ worker, Redis admission, authenticated APIs/SSE, editor AI Assistant, revisions và prompt-injection/stale/tenant E2E | Final rerun: lint/typecheck/build 9/9; 209/209 tests; all coverage metrics >=80%; Playwright 30/30 trên 3 browser; axe serious/critical 0; db:generate không có schema drift; db:check/audit/security scans sạch; completion run chưa có credential | AI Agent |
| 2026-07-22 | Phase 3/4 | Follow-up live Gemini và bắt đầu Phase 4 trực tiếp trong main session; thay shallow generated-design schema bằng strict nested contract, thêm projection tương thích Gemini và giữ bounded validation/repair | Focused design-schema/ai-core/worker tests pass; live `gemini-3.1-flash-lite` authenticates và trả usage, nhưng full run fail-safe `invalid_model_output` sau 2 repairs/5,026 tokens, document không được chấp nhận; Phase 4 chuyển In progress | AI Agent |
| 2026-07-22 | Phase 4 | Hoàn tất separate-host preview sandbox/bridge/CSP, canonical compiler, durable version snapshot export, BullMQ + private S3 adapter, authenticated status/download UI và cross-browser tests | lint/typecheck/build 12/12; 237/237 tests; all coverage metrics >=80%; Playwright 36/36 trên 3 browser; axe serious/critical 0; db:check/audit clean | AI Agent |
| 2026-07-22 | Phase 5 | Bắt đầu Share bằng TDD; chốt immutable revision link, separate share hostname/cookie boundary, owner-only management, noindex và disable semantics | Baseline `pnpm lint` 12/12, `pnpm typecheck` 12/12, `pnpm test` 237/237 đều pass | AI Agent |
| 2026-07-22 | Phase 5 | Hoàn tất share-core, ShareLink migration/repository, owner management API/UI, isolated public route, Redis admission, immutable/noindex/disable security và cross-browser E2E | db:check; lint/typecheck/build 13/13; 248/248 tests; all coverage metrics >=80%; Playwright 42/42 và focused share 6/6 trên 3 browser; axe serious/critical 0; audit/diff/security review sạch | AI Agent |
| 2026-07-22 | Phase 6 | Bắt đầu Deploy tuần tự trong main session; chốt Vercel OAuth, AES-256-GCM credential, immutable revision artifact, durable state/idempotency, BullMQ worker và owner-only UI plan | Baseline `pnpm lint` và `pnpm typecheck` 13/13 pass; `pnpm test` 261/261 pass; Phase 6 chuyển `In progress` | AI Agent |
| 2026-07-22 | Phase 6 | Hoàn tất deployment-core/Vercel cipher+adapter, migration/repositories, secure OAuth state/APIs, durable deployment queue/worker, owner DeployPanel, docs/security và cross-browser deployment journey | db:check/db:generate clean; lint/typecheck/build 14/14; 305/305 tests; 25/25 coverage tasks với mọi metric >=80%; Playwright 48/48 trên 3 browser; axe serious/critical 0; audit/security/diff review sạch; live Vercel smoke skipped do không có credential | AI Agent |
| 2026-07-23 | Phase 7 | Mở Hardening & Beta tuần tự trong main session; chốt Prometheus/Grafana, HTTPS image allowlist, beta email allowlist, conservative retention; chạy baseline và sửa selector E2E mơ hồ | db:check clean; lint/typecheck 14/14; 305/305 tests; 25/25 coverage tasks >=80%; Chromium baseline 15/16 do strict-selector ambiguity, focused AI rerun 5/5 sau test-only fix | AI Agent |
| 2026-07-23 | Phase 7 | Hoàn tất capacity slice: executable budgets, loopback-only bounded harness, Docker PostgreSQL/Redis/MinIO topology, explicit DB pool và hysteretic queue backpressure | operations-core 7/7; worker 29/29; capacity harness 3/3; coverage đều >=80%; topology healthy; HTTP 1,000 requests p95 31.60 ms/0 errors; bounded Redis/PostgreSQL diagnostics recorded; external providers skipped | AI Agent |
| 2026-07-23 | Phase 7 | Hoàn tất backup/restore + conservative retention/privacy: migration 0007, dry-run/idempotent redaction, checksum wrappers và policy | database 44/44, coverage 90.36/80.22/96.93/95.54; backup guards 3/3; db:check/typecheck/lint pass; Docker custom dump restore source=4/restore=4 tables; host-client absence recorded honestly | AI Agent |
| 2026-07-23 | Phase 7 | Hoàn tất HTTPS remote-image allowlist dùng chung cho API/editor/preview/share/export/deploy và CSP exact sources | design-schema 15/15, compiler 9/9, preview 4/4, worker 30/30, web 128/128; mọi package coverage >=80%; typecheck/lint/build focused pass; HTTP/userinfo/ports/IP/suffix/wildcard cases covered | AI Agent |
| 2026-07-23 | Phase 7 | Hoàn tất beta email allowlist + defense-in-depth session gate, generic auth denial, onboarding và semantic accessibility surfaces | web 134/134; coverage 87.69/80.37/92.37/91.89; typecheck/lint/diff pass; allow/deny/missing email, duplicate/malformed config, privacy/recovery/limitations tested; live GitHub OAuth skipped | AI Agent |
| 2026-07-23 | Phase 7 | Thêm TD-009 versioned deterministic eval và guarded live config gate | deterministic 6/6 zero repairs; ai-core 16/16 coverage 91.17/83.59/96.66/91.44; live guard 2/2; typecheck/lint/diff pass; live Gemini skipped vì AI_EVAL_LIVE chưa bật/không dùng credential | AI Agent |
| 2026-07-23 | Phase 7 | Chạy final deterministic/local completion gate, loại durable job ID khỏi routine worker failure logs và hoàn tất trust-boundary audit/phase record | lint/typecheck/build 15/15; 354 tests; coverage 27/27 tasks >=80%; Playwright 48/48 ba browser, axe serious/critical 0; db:check, TD-009 6/6, capacity 3/3, backup 3/3, audit/scans/diff pass; live provider/managed topology gates skipped và Phase giữ In review | AI Agent |
| 2026-07-23 | Phase 7 local-live follow-up | Tách guarded local identity khỏi pure E2E mocks; nối PostgreSQL/Redis/BullMQ/MinIO và Gemini thật; modular worker generation/export không cần Vercel; Vercel UI fail-closed khi chưa cấu hình | Gemini editor edit completed và persist version 2 qua `google-gemini`; 47.883 tokens nên dừng live calls và nâng TD-009; export 1.237 bytes + BFF download 200; share 200/noindex/CSP; readiness web/preview/worker 200; lint/typecheck/build 15/15, full test 27/27 tasks, web 137 + worker 33 + ai-core 17, focused coverage đều >=80%; audit/diff/log scan pass | AI Agent |
| 2026-07-23 | Phase 7 TD-009 optimization | Thay full Design Document model output bằng strict compact landing-page blueprint; deterministic server materializer sở hữu tree/IDs/metadata; Gemini v2 contract, concise repairs, shared image policy và per-mode output/aggregate/admission budgets; cập nhật actionable UI/E2E | AI-core 19/19 coverage 91.09/80.47/97.22/91.36; worker 35/35 coverage 91.26/81.09/96.29/94.32; web 139/139 coverage 87.74/80.62/92.45/91.77; workspace lint/typecheck/build 15/15, tests 27/27 tasks; clean Playwright 48/48 ba browser; diff check sạch; audit không có high/critical (1 moderate); capped live Gemini chưa chạy nên TD-009 vẫn open | AI Agent |
| 2026-07-23 | Phase 7 live generate diagnosis | Phân tích lần live compact generate đầu tiên fail-safe; xác định Gemini chỉ nhận schema trong prompt thay vì SDK response constraint; thêm enforced sanitized `responseJsonSchema` cho cả blueprint và operations, bỏ duplicate schema body khỏi prompt | Live v2 run fail-safe 3.938 tokens/1 repair/no mutation; deterministic RED xác nhận thiếu `responseJsonSchema`, GREEN worker 18/18; worker full 35/35 coverage 91.29/81.22/96.29/94.34; typecheck/lint/build/diff pass; chưa tự động gọi live lần hai | AI Agent |
| 2026-07-24 | Phase 7 live generate focused fix | Phân tích bốn lần v2 tiếp theo cùng fail sau một repair; bỏ riêng hero image ngoài allowlist thay vì reject toàn trang, không gửi component registry không cần thiết cho Generate và đổi mặc định Generate thành một provider call không repair | Runs mới đều `invalid_model_output`, khoảng 2.610–2.635 tokens, không mutation/revision; focused `git diff --check` pass; không chạy test suite theo yêu cầu và không tự gọi Gemini; local topology/web/preview/worker đã khởi động lại, readiness đều pass, chờ user live acceptance | AI Agent |
| 2026-07-24 | Phase 7 generated-page visual quality | Nâng deterministic materializer từ sparse blocks thành polished responsive SaaS composition: rendered brand navbar, two-column hero + safe product visual fallback, card grid, closing CTA; thêm bounded grid/min-height/shadow/typography tokens và shared preview/export CSS normalization | Focused materializer smoke accepted 52 nodes, schema/registry/render pass, unsafe image dropped, hero/feature grids + shadow + mobile CSS present; focused design-schema/html-compiler/ai-core typecheck và lint pass; `git diff --check` pass; không chạy test/coverage/E2E và không gọi Gemini theo yêu cầu; updated web/preview/worker readiness pass, chờ user visual acceptance | AI Agent |
| 2026-07-24 | Phase 7 editor-load regression fix | Sửa Canvas React crash khi generated product visual chứa `divider`: compiler xem `hr` là void element nhưng editor trước đó truyền children rỗng; render divider với `children=null` giống image | Project run `89e77005-3672-47d0-b20b-e2f395c141a3` completed, 743 tokens, document v2/revision persisted, API 200 và document 52 nodes hợp lệ; focused web typecheck/lint/diff pass; web restart/readiness pass; không chạy full tests theo yêu cầu | AI Agent |
| 2026-07-24 | Phase 7 Canvas/render parity fix | Đồng bộ editor Canvas với compiler cho generated visual tokens và content nodes: grid columns, shadows, min-height, letter spacing, solid borders, link/badge text và icon glyph | Focused web typecheck/lint/diff pass; web restart/readiness pass; existing project v2 dùng lại không cần Gemini/token; full tests vẫn deferred theo yêu cầu | AI Agent |
| 2026-07-24 | Phase 7 local remote-image demo + quality roadmap | Cho local demo browser-fetch từ exact `images.unsplash.com`/`images.pexels.com`, truyền approved hosts vào Gemini generate context, giữ strict URL policy/CSP/no-referrer; ghi production fetch-normalize-store và section-preset quality roadmap | Exact-host smoke allow Unsplash/Pexels và reject suffix spoof/credential/custom-port/HTTP; focused ai-core/worker/web/preview typecheck+lint pass; preview build pass; web/preview/worker readiness pass; live CSP exact hosts confirmed; không chạy full tests và không tự gọi Gemini | AI Agent |
| 2026-07-24 | Phase 7 Blueprint v2 + section presets | Nâng Generate lên strict Blueprint v2 với 5 page intents, bounded theme/mood/density, navbar + 4 hero variants và ordered typed sections; thêm server-owned preset registry/materializer cho logo cloud, stats, grid/bento/alternating features, testimonials, pricing, static FAQ, final CTA và footer; giữ v1 materialization compatibility và zero-repair Generate | AI Core typecheck/lint pass; 23/23 focused AI tests pass; worker typecheck/lint pass; 18/18 focused worker tests pass; deterministic SaaS fixture materializes >90 editable nodes, optional denied image falls back safely; diff check pass; không gọi Gemini và chưa chạy full suite/live visual acceptance theo yêu cầu | AI Agent |
| 2026-07-24 | Phase 7 Blueprint v2 runtime correction | User live Generate vẫn tạo materializer v1 (hard-coded feature heading, chỉ Hero/Features/CTA) vì worker cũ từ trước thay đổi vẫn giữ cổng 9464; dừng toàn bộ cây process cũ và khởi động sạch worker từ source hiện tại | Lần start đầu bị `EADDRINUSE` và không thay worker cũ; sau clean replacement PID 17488 lắng nghe 127.0.0.1:9464, readiness web dependencies PostgreSQL/Redis/object-store đều ready, stderr chỉ có lệnh start; focused provider-schema test 1/1 pass; không gửi thêm Gemini request | AI Agent |
| 2026-07-24 | Phase 7 Blueprint v2 provider-schema compatibility fix | Hai live Blueprint v2 attempts fail ngay trước model với `provider_error`, 0 input/output/total tokens và 0 repair; projection Zod discriminated union dùng JSON Schema `oneOf` trong khi Gemini structured-output subset documents `anyOf`; đổi riêng provider projection `oneOf -> anyOf`, giữ strict server Zod schema/materializer không đổi | Focused projection test asserts no `oneOf` + includes `anyOf`; worker 18/18 tests, typecheck và lint pass; worker clean restart PID 4176, PostgreSQL/Redis/object-store ready, stderr sạch; không tự gọi Gemini | AI Agent |
| 2026-07-24 | Phase 7 Blueprint v2 union-free provider projection | Hai attempts sau `oneOf -> anyOf` vẫn bị Gemini endpoint từ chối trước model (`provider_error`, 0 tokens, 0 repair); thay provider-only projection bằng bounded union-free object schema gộp allowed section properties/enum và common-required fields, trong khi strict Blueprint v2 discriminated union vẫn là validation authority server-side | Projection test xác nhận không `oneOf`/`anyOf` nhưng còn section type `logo-cloud`/`footer`; worker 18/18 tests, typecheck/lint pass; clean restart PID 14052, PostgreSQL/Redis/object-store ready, stderr sạch; không tự gọi Gemini | AI Agent |
| 2026-07-24 | Phase 7 shallow Gemini Blueprint v2 DTO | Live attempt sau union-free projection vẫn fail trước model (`provider_error`, 0 tokens), chứng minh nguyên nhân là tổng độ sâu/phức tạp provider schema chứ không chỉ union; tách provider DTO phẳng khỏi strict Blueprint v2, server normalize safe hrefs, fonts, variants, required sections/footer-last và materialize đầy đủ | Schema measurement: v1 2.765 bytes/depth 9/49 objects; strict v2 8.521/depth 15/152; failed projection 7.364/depth 13/120; shallow DTO 4.827/depth 8/70, no union/tree/code fields. AI Core 25/25 focused tests + typecheck/lint pass; worker 18/18 + typecheck/lint pass; FE/Preview/Worker clean restart và readiness đều pass; không tự gọi Gemini | AI Agent |
| 2026-07-24 | Phase 7 Blueprint v2 live acceptance | User chạy lại prompt NovaFlow qua shallow provider DTO và Generate hoàn tất; strict server normalization/materializer tạo landing page đủ ảnh thật, logo cloud, stats, bento features, testimonials, pricing, FAQ, final CTA và footer | Durable run `completed`, error null, 0 repair, 1.126 input + 1.843 output = 2.969 tokens, document version 2, 200 validated editable nodes; section IDs xác nhận toàn bộ 10 surface gồm announcement/navbar/hero/logo/stats/features/testimonials/pricing/faq/final CTA/footer. Visual acceptance: composition đầy đủ và ảnh hoạt động; polish còn mở cho typography density, native-looking underlines/button presentation, card balance và desktop vertical spacing | AI Agent |
| 2026-07-24 | Phase 7 post-acceptance visual-polish handoff | Chốt thứ tự tiếp theo sau compact: shared Canvas/compiler style resolver; semantic button/link/type/image normalization; SaaS-aware typography + compact spacing; pricing giữ Growth ở giữa; bounded bento/testimonial geometry; hero crop/aspect placeholder; screenshot verification trên document Version 2 trước full gates | Roadmap durable cập nhật trong `docs/product/generated-site-quality-roadmap.md`; immediate slice là resolver + semantic normalization + SaaS typography/spacing, không gọi Gemini; user sẽ compact rồi yêu cầu tiếp tục theo thứ tự này | AI Agent |
| 2026-07-24 | Phase 7 shared renderer + SaaS visual polish | Tách viewport/style token resolution vào browser-safe `@zenui/html-compiler` API dùng chung cho Canvas/compiler; chuẩn hóa semantic heading/paragraph/button/link/badge/image, focus-visible và privacy-safe image attrs; SaaS luôn dùng Manrope + bounded compact spacing/type scale; pricing giữ nguyên Starter/Growth/Enterprise và highlight Growth tại giữa | Focused typecheck/lint pass cho HTML compiler, AI Core và Web; compiler 10/10, Blueprint/provider 10/10, editor 16/16 tests pass; `git diff --check` pass (chỉ warning LF/CRLF hiện hữu); không gọi Gemini, không chạy full workspace/coverage/build/E2E theo acceptance order | AI Agent |
| 2026-07-24 | Phase 7 responsive composition + accepted-document verification | Thêm bounded bento row/column spans, testimonial spotlight cân bằng, hero image wide/landscape responsive crop + safe placeholder; kiểm chứng lại accepted NovaFlow Version 2 trên Canvas và isolated Preview ở desktop/tablet/mobile | RED/GREEN focused AI Core rồi 10/10 Blueprint tests pass; AI Core/HTML compiler/Web typecheck + lint pass; accepted document version 2 có 200 nodes, strict schema + render-plan compile pass; cả 3 viewport đều thấy 1 hero image, 3 pricing cards và 3 testimonial cards trên Canvas lẫn Preview; `generation_runs` giữ nguyên 25 (latest timestamp `2026-07-24 04:33:02.088342+00`), nên không gọi Gemini/không tốn thêm token; `git diff --check` không có whitespace error (chỉ LF/CRLF warning) | AI Agent |
| 2026-07-24 | Phase 7 technical visual audit + responsive parity fix | Audit latest accepted project `7227b7ad-1657-4f68-9b13-d0d7a7e7c236` và sửa hai regression kỹ thuật: Canvas viewport selector trước đây chỉ đổi style token nhưng không thu hẹp surface; isolated Preview dùng iframe desktop nên forced tablet/mobile state không kích hoạt responsive CSS. Canvas giờ dùng bounded 980/768/390 surface; compiler phát cả explicit `data-viewport` rules lẫn media-query export rules; preview iframe được center và giới hạn đúng desktop/tablet/mobile | TDD RED xác nhận thiếu Canvas `data-viewport`/bounded width, thiếu explicit preview viewport rules và thiếu constrained iframe width; GREEN: Web editor + secure-preview, Preview runtime và compiler focused tests pass. Web/Preview/HTML compiler typecheck + lint pass; preview production build/restart pass. Browser audit trên desktop/tablet/mobile: Canvas/Preview đều đúng 3/2/1 pricing columns, 2/2/1 feature/testimonial columns, hero image tải 1000x667, không root horizontal overflow, không console/page/request/CSP error; chỉ desktop Canvas pricing text có intrinsic 3px subpixel rounding nhưng không tràn root. `generation_runs` giữ nguyên 26, latest `2026-07-24T08:19:09.642Z`, nên audit/fix không gọi Gemini; `git diff --check` không có whitespace error, chỉ warning LF/CRLF hiện hữu | AI Agent |

| 2026-07-24 | Phase 7 generated-site visual acceptance + full gate | Ghi nhận live visual acceptance sau responsive parity fix và chạy toàn bộ gate đã trì hoãn; tạm dừng đúng web/preview local-live để Playwright dùng topology E2E sạch rồi khôi phục dịch vụ | `pnpm lint` 15/15; `pnpm typecheck` 15/15; `pnpm test` 381/381; serial `pnpm test:coverage` 27/27 và mọi metric configured >=80%; `pnpm build` 15/15; Playwright 48/48 trên Chromium/Firefox/WebKit; 6 axe audits serious/critical = 0. First concurrent coverage attempt có một Dashboard timeout do contention, test đơn lẻ và serial full rerun đều pass. `git diff --check` không có whitespace error ngoài LF/CRLF notices; web/preview/worker readiness khôi phục 200; `generation_runs` vẫn 26, latest `2026-07-24T08:19:09.642Z`, không gọi Gemini | AI Agent |
| 2026-07-24 | Generated-site Stage 4 security design | Chốt Production Asset Pipeline trước runtime code: Pexels fixed adapter, local-ID-only queue, per-hop SSRF/DNS-pinned TLS boundary, bounded Sharp normalization, private immutable storage, opaque Design Document asset ID và cookie-free asset origin; ghi rejected alternatives và full hostile-image matrix | ADR-0012 accepted/indexed; threat model có data flow, security invariants và deterministic matrix 39 cases; D-023 recorded. Documentation-only review, không gọi Gemini/Pexels và chưa đánh dấu Stage 4 runtime hoàn thành | AI Agent |
| 2026-07-27 | Phase 8 non-coder product experience pivot | Sau mentor feedback, khảo sát public Webflow/Claude Design và chuyển roadmap từ primitive/infrastructure-first sang guided brief, design directions, section-first Simple mode, contextual AI proposal review, distinctive non-coder intelligence và simplified publish; giữ engine/Advanced mode hiện có | D-024 accepted; Phase 8 mở `In progress`; experience roadmap thay Stage 4-10 future sequence; D-023/ADR-0012 vẫn accepted nhưng asset runtime deferred. Documentation-only, không sửa runtime, không chạy code tests/build/E2E và không gọi Gemini/Pexels | AI Agent |
| 2026-07-27 | Phase 8 Stage 4 bước 1 wireflow specification | Thay primitive-first editor wireframe bằng complete non-coder interaction contract cho Guided Brief, three-direction Gallery, section-first Simple Editor, isolated proposal review và simplified Preview/Share/Publish; đóng băng desktop/narrow, state recovery, vocabulary, accessibility, Simple/Advanced transitions và 23 deterministic fixture/state IDs | `docs/product/editor-wireframe.md` có accepted-versus-transient mutation table, full happy/error/cancel/offline/unsaved paths và no-provider prototype handoff; Phase 8 chỉ đánh dấu wireflow checklist completed, prototype/mentor acceptance vẫn mở. Documentation-only; scoped diff check, không chạy runtime tests/build/E2E và không gọi Gemini/Pexels/provider | AI Agent |
| 2026-07-27 | Phase 8 Stage 4 bước 2 deterministic browser prototype | Thêm `/prototype/non-coder` local-only: guided brief, 3 Blueprint v2 directions, shared-renderer gallery/canvas, Page Story Simple mode, Advanced round trip, isolated proposal acceptance và simulated Preview/Share/Publish; namespace responsive CSS và review-state selector cho mentor test | TDD RED import failure; focused prototype 10/10 + editor regression 26/26; Web typecheck/lint/build pass; Web 151/151 coverage 85.77/80.59/88.86/90.76; Playwright 9/9 Chromium/Firefox/WebKit với desktop+narrow journeys, zero forbidden provider/API requests và axe serious/critical 0. Live localhost route ready; không gọi Gemini/Pexels/provider | AI Agent |
| 2026-07-27 | Phase 8 Stage 4 bước 3 usability acceptance + Vietnamese-first UI | Owner xác nhận mentor chấp nhận và một representative non-coder hoàn thành journey không có blocking friction được báo cáo; Việt hóa toàn bộ Web chrome, safe state/error/accessibility copy, prototype và starter document, giữ internal API/enum contracts và user content language độc lập | Localization RED missing helper -> GREEN; Web 155/155; coverage 86.03/80.80/88.96/90.97; typecheck/lint/build pass; focused Chromium 8/8 + 9/9; final Playwright 57/57 trên Chromium/Firefox/WebKit, axe gates serious/critical 0 và prototype forbidden-request guard giữ nguyên. Không gọi Gemini/Pexels/live provider; Phase 8 Completed, handoff Stage 5 | AI Agent |
| 2026-07-27 | Phase 9 / Stage 5 production Guided Brief + Direction Gallery | Hoàn tất strict brief/content-only blueprint/direction contracts, onboarding persistence/migration, one-call queue/worker/API lifecycle, atomic Choose và Vietnamese production onboarding/Gallery với responsive previews | AI Core 38, database 49, worker 36, Web 168 tests pass; workspace lint/typecheck/build 15/15; Stage 5 Chromium 2/2 và Stage 5 Firefox/WebKit pass; full E2E 61/63 rồi failed Firefox files rerun 8/8 pass. AI Core coverage pass; Web legacy aggregate 85.81/80.42/88.40/90.75; database 76.29 và worker 78.41 branch gate còn đỏ, ghi TD-010. Không gọi live Gemini/Pexels/Vercel | AI Agent |
| 2026-07-27 | Phase 7/9 capped local-live Generate-page follow-up | Thêm runtime controls cho BullMQ generation attempts, AI Core transient retries và Google SDK HTTP attempts; khởi chạy guarded local PostgreSQL/Redis/BullMQ/MinIO/Web/Preview/worker rồi gửi đúng một authenticated Advanced-editor Generate action | Run `7cc6faea-566c-47ed-8da2-92835c0ee634` completed qua `google-gemini`/`gemini-3.1-flash-lite`: BullMQ `optsAttempts=1`, `attemptsMade=1`; durable `attempt_count=1`, `repair_count=0`; 433 input + 1,226 output = 1,659 tokens; document version 3, đúng một usage record và một AI revision; editor reload hiển thị “Ship your product faster than ever.” Focused Web 6/6 và worker 26/26 tests, lint/typecheck, readiness và diff check pass. Không gọi lần hai; đây không phải live Stage 5 direction smoke. Windows reserved port chặn 55432 nên PostgreSQL tạm chạy 55632, không sửa `.env`/compose. | AI Agent |
| 2026-07-28 | Phase 10 / Stage 8 Distinctive Non-coder Intelligence | Hoàn tất deterministic Site Intelligence, evidence/citations, Remix constraints, durable review/dismissal, exact-Origin/RBAC API, Simple-mode panel, immediate brief handoff và vi/en eval | Focused AI Core 8/8, DB 5/5, Web 15/15; workspace 493 tests, lint/typecheck/build 15/15, coverage 27/27 tasks >=80%; eval 6/6 + Stage 8 2/2; db:check; Chromium/Firefox/WebKit 3/3 và axe serious/critical 0; no live provider. Owner xác nhận mentor/task-based acceptance hoàn tất ngày 2026-07-28, không báo blocker; Stage 8 Completed. | AI Agent |
| 2026-07-28 | Phase 10 / Stage 9 Simplified Publish | Triển khai latest-saved immutable revision contract và Simple Preview/Share/Publish; default surface ẩn revision/provider/target, có public confirmation/recovery; Advanced controls và security boundaries được giữ nguyên | TDD RED/GREEN; workspace tests 502, lint/typecheck/build 15/15; Web coverage 83.97/80.08/81.34/88.47, DB 88.69/80.48/97.82/94.97; db/eval pass; Guided Chromium/Firefox/WebKit 3/3; mobile axe 0; focused Share/Export/Deploy pass; full E2E 72/72. Không gọi live provider. | AI Agent |
| 2026-07-28 | Phase 10 / Stage 9 mentor acceptance | Ghi nhận xác nhận của owner rằng mentor đã thông qua trải nghiệm Simple Preview/Share/Publish và không báo blocker; đóng Stage 9 và Phase 10 | Toàn bộ technical gate đã ghi ở Stage record; acceptance cuối được cung cấp sau kiểm thử mentor. Stage 10 chưa tự động mở vì roadmap yêu cầu chọn capability dựa trên validated user evidence, owner và measurable acceptance criteria. | Owner / AI Agent |
| 2026-07-28 | Phase 11 / Stage 10 capability scope | Owner chọn Image Asset Pipeline + Brand Kit và Multi-page + CMS làm phạm vi Stage 10; chia tuần tự 10A → 10B1 → 10B2 với security/migration/publication/mentor gate riêng | Cập nhật PROJECT_PLAN và generated-site quality roadmap; ADR-0012 được tái kích hoạt làm contract 10A; Design Document v2/CMS ADR và budgets là gate bắt buộc trước 10B. Documentation-only, không sửa runtime và không gọi live provider. | Owner / AI Agent |
| 2026-07-29 | Phase 11 / Stage 10A core implementation | Triển khai asset-core, canonical asset/logo references, migration/repositories, authenticated API, Pexels/Sharp/S3/BullMQ worker + recovery, cookie-free delivery, render parity và editor Asset Library/Brand Kit | Focused GREEN: asset-core 36 tests + lint/typecheck; database 66 + lint/typecheck; worker 46 + lint/typecheck; Preview 5 + typecheck; Web 230 + lint/typecheck. `git diff --check` không có whitespace error ngoài LF/CRLF notices. Không gọi live provider; full coverage/build/E2E và mentor acceptance còn mở. | AI Agent |
| 2026-07-29 | Phase 11 / Stage 10A final deterministic technical gate | Sửa command patch deletion qua JSON, valid fixed WebP fixture, Asset Library result layout/polling và cross-browser selectors; ổn định Web coverage concurrency; cập nhật API/wireflow/roadmap/ADR/threat/operations và completion record | Final: lint/typecheck/build 16/16; tests 29/29 tasks; coverage 29/29 tasks và mọi metric >=80%; asset-core 47, database 69, Web 236 tests; `db:check`; AI eval 6/6 + 2/2 locale, harness 2/2; Playwright 81/81 Chromium/Firefox/WebKit, axe critical journeys pass; `git diff --check` chỉ có LF/CRLF notices. Không gọi live Gemini/Pexels/Vercel; Stage 10A chuyển `In review`, chỉ còn mentor/non-coder acceptance. | AI Agent |
| 2026-07-29 | Phase 11 / Stage 10A acceptance + Stage 10B1 entry | Owner xác nhận các phần Stage 10A đã test thực tế hiện ổn và yêu cầu chuyển sang Stage 10B; đóng 10A, mở riêng 10B1, chốt ADR-0015 và resource budgets trước code | Stage 10A `Completed`; ADR-0015 accepted/indexed; budgets cố định 20 pages/navigation, 500 nodes/depth 12/JSON 1 MiB, slug 80/4 segments, site 20 files/2 MiB each/8 MiB aggregate/ZIP 10 MiB. Stage 10B1 `In progress`; 10B2 chưa bắt đầu. | Owner / AI Agent |
| 2026-07-29 | Phase 11 / Stage 10B1 implementation + deterministic gate | Triển khai Design Document v2/migration, page-navigation commands/editor, active-page Canvas/Preview, Share deep routes, deterministic path-safe ZIP Export, bounded multi-file Vercel Deploy và additive export route-count metadata; nâng Auth.js khỏi advisory-affected versions | Focused RED/GREEN pass; lint/typecheck/test/coverage/build/db:check pass và mọi configured coverage metric >=80%; AI eval 6/6 + 2/2 locale và guard 2/2; production audit không còn known vulnerability; critical Chromium editor/publication suite 11/11 gồm mobile Page Manager axe. Full cross-browser Playwright đang là gate cuối trước mentor acceptance; không gọi live Gemini/Pexels/Vercel. | AI Agent |
| 2026-07-31 | Phase 11 generated-media follow-up | Mở rộng Guided Hero thành shared media plan Hero + tối đa ba content slots; thêm generated-image-first → Pexels → fallback resolver và Simple contextual `replace-media` proposal giữ exact clicked image/media slot | TDD RED/GREEN; focused AI Core 58/58, Worker 51/51, Web 255/255; workspace typecheck 16/16, lint 16/16, test 29/29 tasks, build 16/16 và diff check pass. Không gọi live Gemini image/Pexels/Vercel; Playwright/coverage không rerun. Stage 10B1 vẫn In review. | AI Agent |
| 2026-07-31 | Phase 11 Advanced AI cleanup | Gỡ riêng `AiAssistant` legacy direct-apply khỏi Advanced inspector vì trùng chức năng với proposal-first `ContextualAi`; giữ nguyên Cùng thiết kế, image generation, Guided generation, API/worker generation contracts và lịch sử durable | TDD RED xác nhận Advanced còn hiện “Trợ lý AI”; GREEN editor 20/20, Web 259/259, Web lint/typecheck pass. Không xóa endpoint/worker/component legacy và không gọi provider; đây là UI cleanup không đổi accepted-document/proposal semantics. | AI Agent |
| 2026-08-03 | Private-beta access surfaces | Tách `/` thành public Landing Page, thêm `/login`, protected `/dashboard`/project redirects, GitHub private-beta entry và one-click guarded local owner login/logout; giữ allowlist/Auth.js/RBAC và chưa mở public registration | TDD RED cho missing routes/callback/local-session; GREEN Web 269/269, coverage 84.86/80.42/82.28/89.14, lint/typecheck/build pass; focused public-access Chromium 4/4 + axe serious/critical 0. Local-live `/`, `/login`, Worker readiness và signed session API đều HTTP 200; local sign-in POST 303 tới `/dashboard`; browser đã mở. Full E2E bị chặn bởi 5 test `ai-generation.spec.ts` legacy vẫn tìm `AiAssistant` đã bị gỡ trước task này; current 97-test run còn gặp một pre-existing fixed-provider asset fixture failure, nên không tuyên bố full E2E pass. Không gọi Gemini/Pexels/Vercel. | AI Agent |
| 2026-08-03 | Landing Hero visual alignment | Bỏ hiệu ứng xoay 1.5° ở mockup Hero bên phải theo owner feedback; giữ khối thẳng, shadow/border và dịch dọc 6px để còn chiều sâu mà không tạo cảm giác lệch layout | TDD browser RED nhận transform matrix do rotate; GREEN focused Chromium 1/1 xác nhận `transform:none`; Web lint/typecheck và scoped diff check pass. | AI Agent |
| 2026-08-03 | Local restart + Guided Gallery generated-image verification | Restart topology sau khi Windows reserve cổng Redis cũ `56379`; chuyển topology/env/docs sang `46379`, migrate/bootstrap và clean-start Web/Preview/Worker. Điều tra báo cáo ba hướng AI Zen thiếu ảnh: durable run lúc 04:58 UTC có 3/3 directions nhưng 0 ảnh/0 asset; sau restart chạy lại toàn bộ browser journey bằng Gemini thật tạo 4 generated owned assets `ready`, và cả ba card có 4 ảnh, không còn fallback. Không cần sửa pipeline ảnh vì source hiện tại hoạt động; cập nhật test UI cũ từ copy `Dùng mô tả của tôi` sang `Tạo tự động`; đồng thời validate document thumbnail API trước khi render. | Docker PostgreSQL/Redis/MinIO đều healthy; Web/Preview 200; Worker `ready` với PostgreSQL/Redis/object-store và services `generation,asset,export`; `pnpm topology:config` pass; Guided focused test 6/6, Web typecheck/lint pass và `git diff --check` không có whitespace error (chỉ LF/CRLF warning). Dashboard suite hiện có 4 test expectation cũ không khớp UI Pro (`Chưa có dự án`, action đổi tên/xóa) nên không dùng làm gate của image flow. Live run `949a5626-d0d2-4865-9161-8f729978f2a9`, project `830546e9-4dd4-42c8-986a-6d43602d1eb5`, 3 directions/3 Hero, 4 generated assets ready. | AI Agent |
| 2026-08-03 | Dashboard project action menu layering | Owner báo click nút ba chấm mở thẳng dự án thay vì menu. Browser RED xác nhận absolute card link `z-index:10` phủ nút action và intercept pointer. Đưa `.project-context-menu` lên stacking layer `z-index:20`, thêm tên accessible theo dự án, `aria-expanded`/`aria-haspopup`, semantic menu/menuitem và đồng bộ component tests với Dashboard Pro. | RED browser click timeout vì link `Mở ...` intercept; GREEN isolated Chromium 1/1 xác nhận click ba chấm giữ nguyên URL và hiện Đổi tên/Xóa; Dashboard component 6/6; Web lint/typecheck pass; `git diff --check` không có whitespace error ngoài LF/CRLF warnings. E2E server vẫn log pre-existing thiếu GitHub env khi compile nhánh login production, nhưng guarded E2E journey pass. | AI Agent |
| 2026-08-03 | Unified Simple/Advanced selection toolbar | Root cause là Simple và Advanced dùng hai toolbar contract riêng: Simple lặp label và đặt drag handle cuối, Advanced thiếu duplicate/delete. Chốt một toolbar trong normal flow theo thứ tự một label → kéo → lên → xuống → nhân bản → xóa; Simple target top-level section chứa selection, Advanced target exact selected node. Thêm bounded exact-node duplicate/delete planners, chọn bản sao/sibling an toàn và dialog riêng cho section/thành phần. | RED Web toolbar tests xác nhận Advanced thiếu action; GREEN editor-core 24/24, focused Web contract tests mới pass trong hai file dù còn 7 failure legacy ngoài scope do UI Pro/Page Manager expectations cũ; editor-core/Web typecheck và Web lint pass; focused Chromium Simple + Advanced 2/2 pass, gồm DOM order, không overlap, duplicate/delete/autosave và axe sau khi bổ sung label cho range + tăng contrast disclaimer; scoped `git diff --check` sạch. Restart từ `.env` đã migrate/bootstrap thành công; Web/Preview/Worker đều HTTP 200, worker xác nhận PostgreSQL/Redis/object store ready và cả ba container healthy. | AI Agent |
| 2026-08-03 | Every-node Simple toolbar parity | Owner phát hiện nested badge/text node trong Simple chỉ hiện nút chọn trong khi Hero/section có đủ sáu action. Root cause là Simple luôn resolve `actionTargetId` về containing section dù `selectedNodeId` vẫn là exact nested node, nên full toolbar render ở section ngoài viewport selection. Đổi contract: mọi exact selected node đều nhận đủ label/kéo/lên/xuống/nhân bản/xóa; chỉ khi selection chính là top-level section mới dùng section planner/last-section guard. | Focused RED nhận đúng 1 button thay vì 6 trên `heading-1`; GREEN focused Simple 4/4 (section + nested + duplicate/delete/viewer), Web typecheck/lint pass, Chromium nested Simple journey 1/1 pass và scoped `git diff --check` sạch. Follow-up pre-push ngày 2026-08-04: editor-core 24/24, focused Web 55/55, full Web 271/271, full workspace 29/29 tasks, editor-core/Web lint + typecheck, Web production build và secret-pattern scan đều pass; browser rerun mới bị chặn vì dev Preview đang chiếm cổng 3001, không phải assertion failure. | AI Agent |
| 2026-08-04 | Proposal comparison auto-centering | Owner xác nhận UI/UX hiện ổn và yêu cầu hai bản Current/Proposed trong modal so sánh tự canh giữa thay vì mở ở mép trái rồi kéo thanh ngang thủ công. Khi modal mount, đo riêng `scrollWidth/clientWidth` của từng tabpanel và đặt `scrollLeft` về đúng trung điểm trong cùng animation frame với focus setup; mobile không overflow nên giữ vị trí 0. Không đổi scale, nội dung diff, tab, focus trap hay Accept semantics. | TDD RED focused bắt hai pane chưa có centering; GREEN assertion hành vi xác nhận cả hai pane 1180px trong khung 700px tự đặt `scrollLeft=240`. Focused Simple suite, Web lint/typecheck và diff check được chạy trong cùng phiên. | AI Agent |
| 2026-08-04 | Vercel OAuth callback mismatch guard | Owner báo chọn project trong Vercel xong popup hiển thị Landing ZenUI. Live log xác nhận Vercel trả `code/state/configurationId` về `/` vì Integration Redirect URL đang là homepage, trong khi server contract yêu cầu `/api/v1/provider-connections/vercel/callback`; deployment compiler vẫn gửi immutable revision files đúng contract. Thêm root callback-shape guard chuyển sang redacted actionable error, shared bounded popup monitor cho Publish/Deploy, và dev preflight exact origin/path; không tự forward OAuth code và không tự deploy sau connection. | TDD RED: missing callback guard/preflight và hai popup poll không nhận mismatch; GREEN focused Web 4 files/28 tests và dev runtime 4/4. Owner cần đổi Vercel Integration Redirect URL sang exact callback rồi kết nối lại; live production deploy chưa chạy vì vẫn cần explicit outward-facing confirmation. | AI Agent |
| 2026-08-04 | Vercel permission contract correction | Sau khi owner sửa exact Redirect URL, đặt Deployment + Integration Configuration Read/Write, gỡ installation cũ và cài lại sạch, callback vẫn fail `provider_scope_insufficient`. Đối chiếu Vercel OpenAPI hiện hành xác nhận configuration trả permission theo dạng verb-first `read-write:deployment` và `read-write:integration-configuration`; ZenUI đang kiểm nhầm reversed strings `deployment:read-write` và `integration-configuration:read-write`. Sửa fail-closed allowlist, E2E fixture, adapter/API tests và API contract; không log/hiển thị token, OAuth code hay provider response. | TDD RED focused xác nhận current Vercel permissions bị trả 403 thay vì 303; GREEN Web provider API 7/7 và deployment-core adapter 9/9. Web + deployment-core typecheck, Web lint và `git diff --check` pass. Live callback cần owner thử lại bằng OAuth code/state mới sau khi app nạp code sửa; chưa tạo public deployment. | AI Agent |
| 2026-08-04 | Vercel first-deployment Project permission gate | Sau khi OAuth kết nối thành công, hai owner-confirmed production attempts fail trước artifact/provider ID với durable `provider_auth`. Runtime Web/Worker/PostgreSQL/Redis/object store/deployment service đều ready; encrypted credential giải mã thành công; read-only Vercel probes cho deployments/projects trả 200, còn deterministic target project chưa tồn tại. Vercel permission reference xác nhận Deployment Write tạo deployment nhưng Project Write mới tạo project; ZenUI trước đây không yêu cầu `read-write:project`, nên connection được báo sẵn sàng dù first deploy cần implicit project creation và bị 403. Thêm Project Read/Write vào fail-closed callback permissions và hiển thị safe deployment error-specific copy trong Simple Publish. | TDD RED: callback thiếu Project permission trả nhầm 303 và Simple Publish che `provider_error` bằng generic copy; GREEN focused Web 2 files/14 tests. Deployment-core adapter 9/9, Web lint/typecheck và diff check pass. Hai failed attempts không có provider deployment ID/URL nên không có website public được tạo. Owner cần cập nhật Vercel Project scope rồi reconnect bằng installation mới trước khi thử publish lại; agent không tự tạo deployment. | AI Agent |
| 2026-08-04 | Controlled live Vercel production acceptance | Owner thêm Projects Read/Write, reconnect và chủ động xác nhận Publish; deployment hoàn tất thành công. Durable record `ready`, target `production`, một attempt, provider ID có mặt, artifact 32,855 bytes và không có error code. Vercel API trả `READY` cùng hai aliases; generated user site “AI Tech Edu” truy cập ẩn danh ở canonical production alias, không phải Landing ZenUI. Deployment-specific URL owner gửi bị Vercel SSO protection redirect nên canonical alias là public URL cần chia sẻ. | Anonymous fetch `https://zenui-5280b4736fa95589.vercel.app/` thành công, title `AI Tech Edu`; Vercel deployment API status 200/READY; database record `ready`, completed 2026-08-04T05:02:48.258Z. Phát hiện nội dung CTA `âsas` malformed từ source document, là content-quality follow-up chứ không phải deployment failure. | Owner / AI Agent |
| 2026-08-04 | Portable owned assets for Export/Deploy | Live acceptance phát hiện public Vercel HTML đóng băng local runtime origin `http://127.0.0.1:3002/a/<assetId>`, khiến ảnh chỉ tải trên máy owner. Giữ Canvas/Preview/Share qua cookie-free `ASSET_ORIGIN`, nhưng Export/Deploy giờ authorize toàn bộ ready non-archived project/workspace assets, đọc private object, kiểm exact length + SHA-256, compile depth-correct relative `assets/<assetId>.webp` với `img-src 'self'`, package binary WebP và gửi Vercel base64. Không ghi origin/object key vào Design Document và không tự republish deployment cũ. | TDD RED/GREEN: html-compiler 15/15, database 67/67, worker 29/29, deployment-core 10/10. Lint bốn package và typecheck bốn package pass; deterministic tests xác nhận root/nested relative URLs, binary artifact/provider files, tenant/lifecycle gates, checksum mismatch fail trước storage/provider và aggregate limit fail trước Vercel. Live acceptance mới còn chờ owner explicit republish sau restart; deployment cũ giữ immutable. | AI Agent |
| 2026-08-04 | Actionable Vercel reconnect in Simple Publish | Owner xóa Vercel Project nên durable deployment cũ báo `provider_auth`, nhưng Publish modal vẫn xem connection record là `connected` và chỉ hiển thị cảnh báo không có hành động phục hồi. Giữ nguyên fail-closed publish gate, thêm nút `Kết nối lại Vercel` ngay dưới lỗi xác thực; nút tái sử dụng bounded OAuth popup monitor. Khi callback tạo connection mới thành công, UI xóa failure cũ và trở về trạng thái sẵn sàng, nhưng không tự publish. | TDD RED xác nhận không tìm thấy alert/actionable reconnect; GREEN PublishPanel 8/8, related Publish/Deploy/Simple 40/40, Web lint và typecheck pass. Reconnect chỉ cấp lại quyền; owner vẫn phải tick xác nhận và bấm Publish riêng. | AI Agent |
| 2026-08-04 | Stale-connected Vercel renewal fix | Live retry cho thấy popup `Kết nối lại Vercel` đóng ngay: poll thấy local record cũ vẫn `connected` nên nhận nhầm là OAuth mới hoàn tất; nếu callback thực sự tới backend thì repository lại từ chối `provider_connection_exists`. Reconnect giờ chụp `id:connectedAt:updatedAt` trước khi mở popup, chỉ đóng khi version thay đổi; callback tái dùng stable connection ID để giữ credential AAD đúng và repository cho phép atomic credential/configuration renewal chỉ khi supplied ID khớp record hiện tại. Random conflicting ID vẫn fail closed. | TDD RED tái hiện popup đóng sau poll đầu, API mã hóa bằng reserved ID mới và DB từ chối connected renewal. GREEN Web 4 files/48 tests, database focused 11/11; Web/database lint và typecheck pass. Không tự publish sau reconnect. | AI Agent |
| 2026-08-04 | Canonical public Vercel production URL | Owner xác nhận generated deployment URL có hậu tố hash vẫn yêu cầu quyền, dù canonical production alias công khai. Vercel adapter giờ đọc `alias`, `aliasAssigned`, `target`; production chỉ hoàn tất bằng exact `${providerProjectName}.vercel.app` alias do Vercel xác nhận, còn preview giữ generated deployment URL. Ready production thiếu/chưa gán/sai/hostile alias tiếp tục polling có giới hạn; direct-ready, polling và correlation recovery dùng cùng contract. UI public DTO không đổi nên Mở/Sao chép tự dùng canonical URL đã lưu. | TDD RED/GREEN: deployment-core full 16/16, worker focused 35/35, PublishPanel 8/8. Deployment-core/worker lint + typecheck và Web typecheck pass. Live acceptance còn chờ restart và owner explicit Publish; không tự tạo outward deployment. | AI Agent |
| 2026-08-04 | AI Co-designer v2 Phase 0 contract | Chốt ADR-0016: deterministic guard giữ authority về target/scope, provider-neutral planner chỉ phát bounded intent/spec, server-owned materializer mới tạo `DesignCommand`, proposal-first/explicit Accept tiếp tục là mutation boundary. Đóng băng capability matrix copy/media/style/layout/composition, representation-aware media fail-soft, non-goals và rollout tuần tự. Thêm master kill switch cùng planner/media-judge/multi-candidate/style/layout flags mặc định false; cấu hình sai prerequisite fail Worker startup. | TDD RED xác nhận sáu flag chưa tồn tại và dependency không bị reject; GREEN worker runtime config 8/8. Worker typecheck, lint và `git diff --check` pass; diff check chỉ báo LF/CRLF notices hiện hữu. ADR/index, `.env.example` và local-live operations đã cập nhật; chưa gọi provider và chưa bật lane v2. | AI Agent |
| 2026-08-04 | AI Co-designer v2 Phase 1 context + intent contract | Thêm `AssistantContextPack` bounded từ accepted Design Document: exact selected node, containing section text, tối đa hai section lân cận dạng purpose summary, Website Brief rút gọn, accepted theme và media-slot geometry; không đưa project ID, toàn document hay unrelated node vào planner context. Thêm strict `assistant-plan-v2` cho `copy|media|style|layout|composition`, deterministic forbidden-action/target guard chạy trước provider, confidence clarification và exact target/scope + capability matrix validation sau provider. Đây mới là provider-neutral contract, chưa nối runtime Gemini/Worker và chưa thay router v1. | TDD RED: builder/planner chưa tồn tại và forbidden request vẫn gọi provider. GREEN AI Core focused 13/13, full 63/63; typecheck/lint pass. Coverage AI Core đạt statements 91.40%, branches 81.34%, functions 97.27%, lines 94.61%. Không gọi live provider, không bật feature flag. | AI Agent |
| 2026-08-04 | AI Co-designer v2 Phase 2 core media contracts | Thêm strict `VisualBrief v1` cho photo/editorial illustration/process diagram/product UI/abstract, composition/mustInclude/mustAvoid/people/text policy/palette/aspect/focal area/generation prompt/search query/new alt; non-photo bắt buộc không có stock search. Deterministic semantic guard ép yêu cầu process/product UI/illustration/abstract và no-people khớp brief; refine chỉ patch field bounded, không đổi representation. Thêm provider-neutral batch vision judge tối đa 3 candidate, chỉ truyền candidate ID/source/bytes chứ không asset ID; hard violation gate + weighted relevance/representation/coverage/composition/usability threshold, không candidate đạt thì `no_semantic_match` và không materialize. Worker generation processor có riêng v2 resolver path chỉ hoạt động khi explicit flag, không rơi ngược về legacy resolver khi v2 không tìm được semantic match; usage planner/judge được chuyển vào durable completion. Runtime reject media-judge flag nếu image generation chưa bật. | TDD RED/GREEN AI Core focused 18/18, full 68/68; Worker focused media 32/32, full 60/60; lint/typecheck hai package và diff check pass. AI Core coverage đạt 90.61/80.86/97.04/94.18. Worker coverage ban đầu đỏ branch 76.66%; bổ sung optional service, feature routing, fail-soft usage, sparse Gemini/image và readiness branches đưa gate cuối lên statements 87.85%, branches 80.25%, functions 87.17%, lines 92.10% với 60/60 test pass. Candidate generation/import + actual Gemini planner/judge adapter, durable candidate DB/API/UI orchestration chưa triển khai và không gọi live provider. | AI Agent |
| 2026-08-10 | Phase 9 Guided Design Direction failure hardening | Điều tra lỗi Gallery sau nút `Tạo 3 hướng thiết kế`: safe metadata của ba durable run xác nhận model vẫn là placeholder, fail trước provider output với 0 token; thêm Worker fail-fast cho provider placeholder, đồng bộ Gemini/deterministic `contentImages` contract, giữ `provider_bad_request` xuyên AI Core và hiển thị Guided error an toàn/có thể hành động. Strict Zod/semantic validation, one-call contract, transient directions và explicit Choose mutation boundary giữ nguyên. | TDD RED tái hiện bốn defect; GREEN AI Core 14/14, Worker 57/57, Guided Web 8/8. Workspace test và coverage đều 29/29 tasks, mọi metric configured >=80%; typecheck/lint/build 16/16; `git diff --check` sạch. Focused browser E2E chưa chạy vì Preview cổng 3001 và Next dev lock đang được process hiện hữu sử dụng; không dừng process của owner. Web/Preview HTTP 200, Worker 9464 đang down; không khởi động vì còn run queued có thể recovery thành paid Gemini call. Không gọi Gemini/Pexels/Vercel. | AI Agent |
| 2026-08-10 | Local-live clean restart sau Guided fix | Theo yêu cầu owner, dừng cây process Web/Preview hiện hữu và PostgreSQL/Redis/MinIO, xác nhận sáu cổng local được giải phóng, rồi bật lại topology, migrate và bootstrap. Khởi động Web/Preview với `.env` được nạp vào process; Worker chạy fail-fast vì `GOOGLE_GENERATIVE_AI_API_KEY` vẫn là placeholder, không xử lý run queued và không phát provider request. | PostgreSQL/Redis/MinIO đều `running/healthy`; migration pass, bootstrap báo database/object store ready; Web `http://localhost:3000` và Preview `http://127.0.0.1:3001` đều HTTP 200. Worker readiness 9464 DOWN với lỗi redacted `GOOGLE_GENERATIVE_AI_API_KEY is not configured`. Owner có thể test UI không dùng AI; Guided live generation cần cấu hình key thật rồi restart Worker. Không gọi Gemini/Pexels/Vercel. | Owner / AI Agent |

Mỗi phiên triển khai có thay đổi đáng kể phải thêm một dòng vào bảng này.

---

# 31. Quy trình bắt đầu một task phát triển

```text
+---------------------------+
| 1. Đọc PROJECT_PLAN.md    |
+-------------+-------------+
              |
              v
+---------------------------+
| 2. Xác định phase hiện tại|
| và checklist liên quan    |
+-------------+-------------+
              |
              v
+---------------------------+
| 3. Đọc skills phù hợp     |
| architecture/frontend/etc |
+-------------+-------------+
              |
              v
+---------------------------+
| 4. Viết/cập nhật tests    |
+-------------+-------------+
              |
              v
+---------------------------+
| 5. Implement phạm vi task |
+-------------+-------------+
              |
              v
+---------------------------+
| 6. Verification loop      |
+-------------+-------------+
              |
              v
+---------------------------+
| 7. Update PROJECT_PLAN.md |
| checklist/log/risk/record |
+-------------+-------------+
              |
              v
+---------------------------+
| 8. Chỉ khi đó báo hoàn tất|
+---------------------------+
```

## Definition of Done cho mọi task

Một task chỉ được coi là hoàn thành khi:

- [ ] Code đúng phạm vi phase.
- [ ] Có test phù hợp nếu thay đổi hành vi.
- [ ] Validation/error/loading state được xử lý.
- [ ] Không làm sai architecture invariants.
- [ ] Test/build/lint/typecheck liên quan đã chạy hoặc ghi rõ lý do chưa chạy.
- [ ] Security impact đã xem xét.
- [ ] Tài liệu này đã cập nhật nếu task làm thay đổi checklist, kiến trúc, rủi ro hoặc tiến độ.

---

# 32. Ước lượng ban đầu

Với một developer có AI hỗ trợ:

| Mốc | Ước lượng |
|---|---:|
| Core prototype kéo-thả | 2–3 tuần |
| Visual editor cơ bản | 5–7 tuần |
| Visual editor + AI | 8–11 tuần |
| Export + share + deploy provider | 11–14 tuần |
| Beta có security/revision/E2E | 14–18 tuần |

Ước lượng phải được cập nhật sau Phase 1 dựa trên velocity thực tế. Không coi đây là deadline cố định.

---

# 33. Handoff hiện tại

Trạng thái hiện tại:

- **Phase 10 / Stage 8 Distinctive Non-coder Intelligence đã `Completed`.** Owner xác nhận mentor/task-based non-coder acceptance hoàn tất ngày 2026-07-28 và không báo blocker.
- **Phase 10 / Stage 9 Simplified Publish đã `Completed`.** Owner xác nhận mentor đã thông qua trải nghiệm Simple Preview/Share/Publish ngày 2026-07-28 và không báo blocker.
- **Immutable publication boundary được giữ nguyên.** Share/Publish chỉ dùng revision có `documentVersion` khớp server version đã lưu; dirty/saving/offline/error/conflict không thể tạo public action mới.
- **Advanced mode không mất năng lực.** Multi-route ZIP Export, manual revisions, revision-selecting Share, target-selecting Deploy và legacy direct AI assistant vẫn tồn tại; Simple AI tiếp tục proposal-first.
- **Stage 9 technical gates và acceptance đều hoàn tất.** Workspace lint/typecheck/build 15/15; serial tests 27/27 tasks với 502 tests; Web/database coverage >=80%; db/eval pass; full Playwright 72/72 trên Chromium/Firefox/WebKit; mobile axe pass; mentor acceptance không có blocker.
- **Phase 7 Hardening & Beta vẫn `In review` độc lập.** External live/provider/managed-topology gates không bị thay thế bởi deterministic Stage 9 evidence.
- **Phase 11 / Stage 10A đã `Completed`.** Technical gates hoàn tất và owner xác nhận practical walkthrough hiện không có blocker ngày 2026-07-29; lỗi phát hiện về sau được xử lý như follow-up.
- **Phase 11 / Stage 10B1 đang `In review`.** Design Document v2, v1 compatibility, page/navigation editor và bounded multi-route Preview/Share/ZIP Export/Deploy đã triển khai; toàn bộ technical gates xanh, gồm full Playwright 84/84 trên Chromium/Firefox/WebKit; mentor/representative non-coder acceptance là completion gate còn lại; Stage 10B2 CMS chưa bắt đầu.

Stage 9 checklist và bằng chứng cuối:

- [x] Simple Preview/Share/Publish không cần mở Advanced mode.
- [x] Plain-language confirmation/recovery và collapsed Advanced details.
- [x] Latest-saved immutable revision reuse/creation; DTO không lộ snapshot metadata.
- [x] Share copy/open/disable confirmation và Publish explicit public confirmation.
- [x] Guided first-time journey pass Chromium/Firefox/WebKit 3/3; mobile 390px Share/Publish axe serious/critical 0.
- [x] Focused Share/Export/Deploy immutable/security regression pass; Advanced export journeys được cập nhật rõ mode.
- [x] Workspace lint/typecheck/build/test/coverage/db/eval gates pass.
- [x] Full Playwright rerun pass 72/72 trên Chromium/Firefox/WebKit sau khi sửa Advanced-flow và selector/persistence test regressions.
- [x] Mentor acceptance cuối được owner xác nhận ngày 2026-07-28; không có blocker được báo cáo.

Stage 10A checklist và bằng chứng cuối:

- [x] Canonical owned image/logo refs, non-destructive derivatives và JSON-safe command/autosave persistence.
- [x] Fixed-provider search/import, raw bounded upload, Sharp normalization, local-ID-only BullMQ payload và cookie-free immutable delivery.
- [x] Canvas/Preview/Share/Export/Deploy render parity cùng exact `ASSET_ORIGIN`.
- [x] Simple Asset Library upload/search/import/crop/alt/decorative flow và owner Brand Kit preview/save/atomic apply.
- [x] Hostile image/network/content matrix, Auth/RBAC/exact-Origin/cross-tenant/public-header/integrity tests.
- [x] Workspace lint/typecheck/test/coverage/build/db/eval gates và full Playwright 81/81 trên Chromium/Firefox/WebKit.
- [x] Owner practical acceptance cho image + brand journey ngày 2026-07-29; không có blocker hiện tại.

Stage 10B1 technical checklist và bằng chứng hiện tại:

- [x] Design Document v2, lossless/idempotent v1 migration, multi-root ownership và bounded safe routes.
- [x] Atomic page/navigation commands, active-page editor history/recovery và Simple Page Manager/Navigation UI.
- [x] Shared deterministic multi-route compiler, immutable deep-route Share, multi-route ZIP Export và bounded multi-file Deploy.
- [x] Route/traversal/reserved/Unicode collision, broken reference, archive path/size, Auth/RBAC/exact-Origin và metadata-redaction tests.
- [x] Workspace lint/typecheck/test/coverage/build/db/eval/audit/diff/security gates; mọi configured coverage metric >=80%.
- [x] Full Playwright 84/84 trên Chromium/Firefox/WebKit trong 12.2 phút; 390px và axe serious/critical journeys xanh.
- [x] Follow-up UI defect ngày 2026-07-29: Page Manager và Stage 6 section-action CSS cùng gán grid rows, tạo implicit columns và horizontal overflow sau onboarding. RED geometry test tái hiện asset panel ở `top=344` trong khi content row kết thúc khoảng `1355.89`; fix giới hạn legacy row overrides khi có `.page-manager-panel` và bỏ mobile `grid-row: 3` xung đột. GREEN: focused Chromium 1/1, focused Chromium/Firefox/WebKit 3/3, Web Vitest 37 files/239 tests, lint, build + typecheck và `git diff --check`; desktop/390px containment và axe serious/critical đều xanh.
- [x] Follow-up UI cleanup ngày 2026-07-29: bỏ trạng thái tĩnh “Đã đóng bản xem trước” khỏi toolbar khi Preview đóng; live region chỉ render khi có trạng thái hoạt động/lỗi. RED/GREEN `secure-preview.test.tsx` 5/5; Web lint và typecheck xanh.
- [x] Follow-up Page Manager refinement ngày 2026-07-29: loại bỏ thanh cuộn của toàn panel desktop (`scrollHeight=475`, `clientHeight=279` ở RED) bằng grid bốn vùng compact, header + bộ đếm trang và chỉ cho danh sách trang dài cuộn cục bộ; <=1280px gom Điều hướng thành hàng riêng, <=900px giữ panel mobile bounded. GREEN: focused Chromium 1/1; component regressions 2 files/15 tests; lint/typecheck; Chromium + Firefox pass và WebKit retry pass sau một `ECONNRESET` hạ tầng tạm thời.
- [x] Follow-up Asset Library refinement ngày 2026-07-29: bỏ `max-height: 420px`/outer `overflow:auto` gây cắt Thư viện ảnh + Brand Kit; chỉ asset result/library lists dài cuộn cục bộ. Tách quyền `canManageAssets` khỏi `canApply`, nên owner/editor luôn thấy Upload/Search dù trang chưa có image target, còn apply vẫn yêu cầu image node và không upload/import nào tự mutate document. RED unit xác nhận upload control biến mất khi không có target; GREEN asset/brand unit 2 files/9 tests, editor regressions 2 files/28 tests, lint/typecheck, focused Chromium 3/3 và full asset Playwright 9/9 trên Chromium/Firefox/WebKit; mobile axe serious/critical 0. Next dev phát `MaxListenersExceededWarning` khi chạy Firefox nhưng không có test failure.
- [x] Follow-up contextual AI proposal ngày 2026-07-29: owner tái hiện `Đang chuẩn bị bản xem trước` vô hạn khi nhập prompt cho Announcement. Root cause là root `pnpm dev` chưa khởi động Worker, generation failure chỉ đổi run status mà để `proposalStatus=preparing`, và browser polling không có deadline/retry bounded. RED database nhận `status=failed` nhưng `proposalStatus=preparing`; RED Web xác nhận không phát timeout. Fix đưa Worker vào Turbo dev bằng script watch và root launcher nạp `.env` với loose env passthrough, atomically chuyển failed proposal sang terminal `failed`, thêm polling deadline 120 giây/3 transient errors, safe provider error copy và Hủy/Thử lại giữ prompt; document vẫn chỉ đổi sau explicit Accept. GREEN: database 14/14, Web proposal/component 24/24, Worker runtime/recovery 9/9; lint và typecheck ba package xanh; Web build xanh; contextual journey 1/1 Chromium rồi 3/3 Chromium/Firefox/WebKit, request xác nhận prompt `Ngắn gọn hơn` + selected section; `git diff --check` pass với LF/CRLF warnings. Một lượt full Chromium đầu tiên fail 5/5 do E2E `accept-starter` trả 404 hạ tầng tạm thời; focused rerun ngay sau pass, không coi lượt 404 là application failure. Không chạy live Gemini để tránh provider cost ngoài ủy quyền.
- [x] Follow-up runtime ownership/console-noise ngày 2026-07-29: console 404 thực tế đến từ Site Intelligence empty state, không phải AI proposal; đồng thời topology trước báo Worker health 200 giả vì port 9464 do Worker cũ giữ trong khi Worker mới chết `EADDRINUSE`. Latest-review contract nay trả `200 { data: null }`, browser adapter parse thống nhất và Editor memoize client nên proposal polling không kích hoạt loadLatest lặp lại. Root launcher preflight ports 3000/3001/9464, xác minh random Worker instance ID + `generation` capability, fail rõ khi port bị chiếm; Worker `/health/instance` chỉ trả instance ID/service allowlist, recovery errors được catch thành safe event. Đã áp migration 0012 sau khi phát hiện local DB thiếu `export_runs.artifact_route_count`, rồi clean-start xác nhận một listener/port và endpoints Web/Preview/Worker `200`, generation enabled; latest Site Intelligence log đổi từ 404 sang 200. GREEN: Web focused 3 files/22 tests, Worker focused 3 files/12 tests, launcher 3/3, proposal database 14/14 + API 12/12, lint/typecheck Web+Worker, Web build, contextual Playwright 3/3 Chromium/Firefox/WebKit và diff check. Cancel sau timeout idempotently reset khi terminal not-found; accepted document vẫn không đổi trước Accept. Không chạy Gemini thật ngoài ủy quyền.
- [x] Follow-up Hero live proposal ngày 2026-07-30: proposal rời `preparing` nhưng terminal generic failure. Safe PostgreSQL metadata (không đọc prompt/raw output) xác nhận ba edit-selection mới nhất đều `provider_error`, `repairCount=0`, usage `0`, gồm Hero `selectedNodeId=hero-1`; do đó lỗi xảy ra trước khi Gemini trả response, không phải scope/materialization. Root cause đầu tiên là generic edit response schema ~1.1 MiB chứa full operation union/design-node schema với `oneOf/anyOf`; dynamic schema nhỏ hơn vẫn bị provider từ chối trước candidate, nên fix cuối thay bằng static copy envelope `{ summary, updates: [{ nodeId, property, value }] }` không chứa document IDs, operation union hay design-node schema. Worker normalize envelope thành `UPDATE_PROPS`; AI Core kiểm node/property/type bằng bounded `editableProps` trước command/scope/transaction, chặn unknown node/property, wrong scalar và empty updates mà không mutate document. HTTP 400/404/422 được phân loại additive `provider_bad_request` (không retry, usage 0) và UI hiển thị safe copy “cấu hình yêu cầu AI chưa tương thích”, không lộ provider detail. RED tái hiện unauthorized normalization, static envelope chưa được runGeneration/Worker normalize, HTTP 400 bị map generic và UI thiếu copy; GREEN AI Core 8 files/53 tests, Worker 7 files/49 tests, Web 37 files/245 tests; workspace lint/typecheck/build 16/16, test và coverage 29/29 tasks với mọi configured metric >=80%, contextual Playwright 3/3 Chromium/Firefox/WebKit và diff check pass ngoài LF/CRLF warnings. Lượt E2E đầu gặp runtime cũ không có guarded `accept-starter`; clean self-host rerun pass Chromium/WebKit và Firefox chỉ fail locator không scoped vì review/current/canvas cùng chứa accepted heading; locator được scope vào `Khung thiết kế`, rerun 3/3 pass. Không tự chạy paid Gemini verification; owner sẽ test tối đa một proposal thật sau clean local restart.
- [x] Follow-up proposal review visibility ngày 2026-07-30: live Hero proposal đã Accept đúng nhưng Current/Proposed là hai card trắng, không click/chuyển được và summary không nêu before/after. Root cause là review luôn render full page ở fixed 1180px rồi scale/clip trong card hẹp, đồng thời responsive rule dựa vào browser viewport thay vì chiều rộng panel. Fix cho `DesignDocumentRenderer` nhận bounded `rootNodeId`, exact diff derive từ accepted/proposed documents (không tin model summary), giới hạn 12 thay đổi. Sau owner feedback, panel hẹp chỉ giữ tối đa 3 dòng tóm tắt before→after và nút “So sánh nội dung cũ và mới”; nút mở centered modal `aria-modal` lớn ở giữa màn hình với backdrop/scroll lock, desktop Current/Proposed hai cột, mobile tab một bản/lần, focused subtree, full diff, Escape/close/backdrop dismissal, focus trap và focus restore. Không render preview nặng trong panel nữa; Accept/Discard/Refine vẫn ở panel và không mutation trước explicit Accept. RED không có compare dialog; GREEN focused 2 files/15 tests, Web 37 files/245 tests, contextual Playwright 3/3 Chromium/Firefox/WebKit, workspace lint/typecheck/build 16/16, test/coverage 29/29 tasks; Web coverage 84.49/80.26/81.43/88.89; diff check sạch ngoài LF/CRLF warnings. Không gọi Gemini trong verification.
- [x] Follow-up Advanced editing usability ngày 2026-07-30: owner báo cây `Lớp` sâu bị thụt lề/co chữ thành cột khó chọn và Canvas chính không cho click trực tiếp để mở Inspector, trong khi iframe Secure Preview làm được. Root cause là nested list không có bounded row/reset/collapse và CSS `.canvas-node > :not(.node-actions) { pointer-events: none; }` vô hiệu hóa handler trên `.node-visual`. Fix tách sidebar Advanced thành tab `Lớp` mặc định + `Thành phần`, Layers dùng full-width rows có type/snippet ellipsis, bounded indentation, selected/focus state, local expand/collapse, auto-open ancestor/scroll selection và keyboard tree Up/Down/Left/Right/Enter/Space; Canvas nay prevent navigation/default action rồi chọn đúng node trực tiếp, cùng một `stateRef` helper đồng bộ Canvas/Layers/Secure Preview/Inspector mà selection không queue command/autosave. RED focused xác nhận thiếu tabs/collapse và direct selection; GREEN focused 3 files/37 tests, Web 37 files/246 tests, relevant editor+preview Playwright 24/24 và direct journey 3/3 Chromium/Firefox/WebKit với no horizontal overflow, row >=40px, persistence và axe serious/critical 0. Workspace test/coverage 29/29 tasks, lint/typecheck/build 16/16; Web coverage 84.66/80.30/81.72/88.99; `git diff --check` sạch ngoài LF/CRLF warnings. Secure Preview isolation regression vẫn xanh; không gọi Gemini.
- [x] Follow-up Dashboard action copy ngày 2026-07-30: owner xác nhận hành động loại dự án khỏi danh sách phải hiển thị `Xóa`, không phải thuật ngữ kỹ thuật `Lưu trữ`. Chỉ đổi user-facing button/aria/error fallback thành `Xóa`; API vẫn soft archive để giữ contract an toàn và khả năng phục hồi. RED dashboard test bắt được nút `Lưu trữ`; GREEN 6/6 tests, Web lint/typecheck và focused diff check xanh ngoài LF/CRLF warnings.
- [x] Follow-up Guided Gallery thumbnail ngày 2026-07-30: ba direction card chứa đúng `direction.document` nhưng thumbnail trống, chỉ modal “Xem lớn hơn” thấy nội dung. Root cause là renderer compact rộng 1180px scale `.3` quanh `top center`; tâm renderer nằm ngoài card hẹp rồi bị `overflow:hidden` clip. Fix scope `.guided-direction-preview` về `transform-origin: top left`, margin 0 và giữ scale/height bounded; thumbnail được đánh dấu `aria-hidden` + `inert` vì chỉ là hình xem thụ động, tránh duplicate focus/contrast audit trong khi card actions vẫn accessible. RED Chromium geometry xác nhận heading nằm ngoài vùng clip; GREEN component 2 files/6 tests, Web 37 files/246 tests, Guided Playwright 9/9 Chromium/Firefox/WebKit gồm Desktop/Mobile thumbnail geometry, full modal và 390px axe serious/critical 0; Web lint/typecheck/build và diff check xanh ngoài LF/CRLF warnings. Không gọi Gemini.
- [x] Follow-up Guided preparation alignment ngày 2026-07-30: nút `Hủy chuẩn bị` render trực tiếp dưới content wrapper nên kéo full chiều rộng viewport, lệch khỏi status card/content column. Fix gom loading status + cancel vào `.guided-preparation-panel` cùng bounded gallery width, border/radius/gap đồng nhất và nút centered `fit-content`; replacing state có cùng panel nhưng vẫn giữ ba card hiện tại. RED component không tìm thấy grouped preparation controls; GREEN Guided 5/5, Web 37 files/247 tests, lint/typecheck và focused diff check xanh ngoài LF/CRLF warnings.
- [x] Follow-up Simple manual-edit fallback ngày 2026-07-30: owner báo Simple mode chỉ chọn được section và chỉ có contextual AI, nên khi provider lỗi không thể tự sửa nội dung. Root cause là Canvas Simple map mọi click qua `findContainingSectionId` và `.section-guide` không render Inspector. Fix giữ exact node selection bằng shared `selectEditorNode`, tiếp tục derive containing section riêng cho Page Story/section actions/AI scope, và tái sử dụng Inspector/command/history/autosave hiện có trong cột `Chỉnh sửa trực tiếp`; AI failure không khóa chỉnh tay, viewer vẫn read-only. Mobile <=900px có sheet `Chỉnh sửa`, bốn action toolbar bounded hai cột, Escape/Close restore focus. RED 3 focused cases thiếu region/sheet/exact selection; GREEN Simple 17/17, editor regressions 3 files/46 tests, Web 37 files/251 tests, lint/typecheck/build, focused Playwright 3/3 Chromium/Firefox/WebKit với Canvas → edit → autosave → reload, mobile sheet và axe serious/critical 0; `git diff --check` sạch ngoài LF/CRLF warnings. Không gọi Gemini.
- [x] Follow-up Guided Hero image ngày 2026-07-31: owner báo khung Hero bên phải trong ba Design Direction chỉ hiện fallback và đường thêm/thay ảnh thủ công không rõ. Root cause là Guided content schema chỉ có chữ/preset nên `blueprintFor` không truyền image; materializer chủ động dựng `hero-product-card`, còn editor trước đây suy luận target bằng ảnh đầu tiên. TDD bổ sung bounded AI `heroImage { query, alt }` (cấm URL/provider ID/asset ID), worker resolve một lần qua Pexels adapter + secure owned-asset processor rồi dùng chung opaque `assetId` cho ba hướng; resolver fail-soft vẫn hoàn thành gallery và hiện copy có thể thêm ảnh sau. Fallback được đánh dấu server-owned Hero media slot; Canvas có `Thêm ảnh Hero`/`Thay ảnh`, exact target, upload guidance JPEG/PNG/WebP + 16:9 1200×675, explicit apply dùng `UPDATE_PROPS` hoặc atomic `REPLACE_SUBTREE` qua history/autosave/Undo, viewer read-only. GREEN: AI Core 8 files/55 tests; Worker 7 files/49 tests; Design Schema 47, Component Registry 24, Editor Core 22; Web 37 files/253 tests; workspace test, lint, typecheck và build 16/16; focused Guided + Asset Playwright 18/18 trên Chromium/Firefox/WebKit sau khi cập nhật E2E dùng action `Thay ảnh` thay cho alt fixture cũ; mobile axe serious/critical 0; `git diff --check` pass. Không gọi Gemini/Pexels live. Product/security docs đã cập nhật; Stage 10B1 vẫn `In review` vì acceptance multi-page không thuộc follow-up này.
- [x] Follow-up generated media + contextual replacement ngày 2026-07-31: nâng content contract thành Hero + tối đa ba stable feature image intents và materialize owned media chỉ ở layout render ảnh; một shared media set dùng chung ba directions. Worker thêm bounded Google image adapter, deterministic run+slot IDs, private generated source import/normalization và hybrid generated → Pexels → null resolver. `replace-media` được route server-side chỉ cho exact image/media slot; Simple mode không ép exact click về section, worker không gọi text provider, proposal snapshot tạo `UPDATE_PROPS`/`REPLACE_SUBTREE` và accepted document chỉ đổi sau Accept. RED xác nhận thiếu enum/router/materializer; GREEN AI Core 58/58, Worker 51/51, Web 255/255; workspace typecheck/lint/build 16/16, tests 29/29 tasks, diff check pass. Không chạy Playwright/coverage và không gọi live provider trong follow-up này.
- [x] Follow-up local media provider configuration ngày 2026-07-31: owner test `replace-media` nhận terminal `provider_error`. Safe durable metadata xác nhận hai image proposal chọn đúng `hero-image`/`hero-product-card`, intent `replace-media`, 0 token/0 repair; routing đã đúng nhưng resolver không có provider usable vì local `.env` tắt `GOOGLE_IMAGE_GENERATION_ENABLED`, thiếu image model và dùng placeholder `PEXELS_API_KEY=local-upload-only`. Bật explicit paid image path bằng `GOOGLE_IMAGE_GENERATION_ENABLED=true`, `GOOGLE_IMAGE_MODEL=imagen-4.0-generate-001`, giữ bounded `AI_IMAGE_MAX_PER_RUN=4`, restart sạch Web/Preview/Worker và xác nhận HTTP 200 cùng Worker services `generation,asset,export`. Chưa gửi image request sau khi bật; owner sẽ thực hiện đúng một explicit proposal để kiểm tra model/quota và fallback behavior.
- [x] Follow-up feature-card comparison preview ngày 2026-07-31: owner xác nhận image proposal từ exact thẻ tiện ích Accept thành công nhưng modal So sánh render toàn trang cũ ở phía đề xuất. Root cause là media materializer thay feature-card bằng image mới qua `REPLACE_SUBTREE`, nên proposal scope vẫn giữ ID target cũ trong khi ID đó không còn trong proposed document; `DesignDocumentRenderer` vì vậy fail-soft về page root. RED component tái hiện proposed renderer có `data-render-root-id` là page root và không tìm thấy generated image. Fix resolve proposed preview root theo vị trí child tương ứng trong cùng parent khi scoped root bị thay thế, trong khi Current vẫn dùng target cũ; không thay đổi proposal/Accept semantics. GREEN focused Simple 22/22, Web 37 files/257 tests, Web lint và typecheck pass. Không gọi Gemini/Pexels trong verification.
- [x] Follow-up Guided Gallery owned-image rendering ngày 2026-07-31: owner thấy ba direction đã có nội dung/alt ảnh phù hợp nhưng thumbnail và large preview chỉ hiện vùng trống. Root cause không nằm ở Gemini/Pexels: `ProjectPage` đã validate và truyền `ASSET_ORIGIN` vào `ProjectEditor`, nhưng onboarding branch bỏ quên prop này nên `GuidedOnboarding`/`DesignDocumentRenderer` không thể dựng `/a/<assetId>` và `<img>` không có `src`. RED integration xác nhận mock Guided nhận `assetOrigin=missing`; regression riêng xác nhận owned Hero render đúng ở thumbnail/modal khi có origin. Fix làm `assetOrigin` bắt buộc và handoff nguyên validated origin vào Guided; không đổi provider/prompt/database/document semantics. GREEN focused 2 files/9 tests, Web 37 files/258 tests, Web lint và typecheck pass; `git diff --check` không có whitespace error (chỉ LF/CRLF warning). Không gọi Gemini/Pexels/MinIO trong verification.
- [x] Follow-up attached section actions ngày 2026-08-03: owner báo thanh Viết lại/Bố cục/Di chuyển/Ẩn/Nhân bản/Xóa nằm cuối Editor nên phải cuộn từ section đang chọn xuống cuối trang. RED focused test xác nhận `.node-actions` màu xanh không có các action và browser RED phát hiện thanh đặt ngoài section bị `.canvas-panel` chặn pointer. Fix tái sử dụng nguyên section planners/confirmation/autosave trong thanh xanh của node đang chọn ở Simple mode, giữ node drag/move riêng cho Advanced, bỏ hoàn toàn `.section-actions` cuối trang và grid row thừa; toolbar nằm trong section, bounded/scroll ngang ở 390px, focus-visible và disabled/viewer/last-section rules giữ nguyên. Playwright E2E allowlist được đồng bộ thêm `images.unsplash.com` vì starter document hiện dùng host đó; không đổi production image policy. GREEN focused Simple 23/23, Web lint/typecheck/build và focused Chromium 1/1 với click Nhân bản/Xóa, confirmation, autosave, desktop attachment, mobile no-overflow. Follow-up trực quan cùng ngày: owner phát hiện thanh xanh vẫn absolute ở `top: 0`, che hàng chữ đầu; browser geometry RED xác nhận `toolbarBounds.bottom > visualBounds.top`. Fix riêng biến toolbar Simple có section actions thành `position: relative` trong normal flow trước `.node-visual`, vẫn giữ toolbar Advanced tuyệt đối như cũ. Owner tiếp tục yêu cầu tối giản: bỏ `Viết lại`, `Thử bố cục khác`, `Ẩn` khỏi thanh xanh và khôi phục tay nắm kéo `⋮⋮`; AI vẫn dùng ô prompt bên phải, còn drag dùng nguyên DnD `move:<nodeId>`/droppable/command hiện có, viewer thấy tay nắm disabled. RED toolbar test bắt được ba nút thừa; GREEN Simple 23/23, Web lint/typecheck, Chromium 1/1 xác nhận đúng action set, drag handle hiện diện, không overlap, Nhân bản/Xóa/confirmation/autosave/mobile no-overflow. Advanced `editor.test.tsx` hiện 4/20 fail do Inspector UI hiện đã đổi nhãn màu thành `Tùy chỉnh màu chữ` trong thay đổi UI đồng thời, không thuộc toolbar. Full Web test trước đó có một failure không liên quan ở `access-surfaces.test.tsx` do landing UI hiện tại không còn phần tử mà test cũ mong đợi. `git diff --check` còn báo trailing whitespace có sẵn tại `apps/web/app/page.tsx` (ngoài phạm vi task) cùng LF/CRLF warnings; không sửa/revert thay đổi landing của owner.
- [x] Follow-up Share overlay stacking ngày 2026-08-03: owner báo hộp `Chia sẻ website` bị Canvas/Inspector vẽ đè tại vùng giao nhau. Root cause là `backdrop-filter` của `.editor-toolbar` tạo stacking context riêng nhưng toolbar không có z-index, nên `z-index: 30` của `.share-popover` không thể vượt các grid item được paint sau. Browser RED hit-test trực tiếp vùng giao giữa dialog và `.canvas-viewport > .canvas-node` trả phần tử thuộc Canvas; fix tối thiểu đặt `.editor-toolbar { position: relative; z-index: 40; }`, nâng toàn context chứa Share/Publish/Preview lên trên editor content trong khi modal thật vẫn ở z-index 100. GREEN Chromium focused 1/1; SharePanel Vitest 7/7; Web typecheck/lint và scoped `git diff --check` pass (chỉ LF/CRLF notices).
- [x] AI Co-designer v2 — Media Intelligence 2B ngày 2026-08-05: nối Gemini structured visual-brief planner + batch vision judge vào Worker runtime sau feature flags; thực thi tối đa hai candidate song song trong `AI_IMAGE_MAX_PER_RUN`, prompt biến thể vẫn giữ semantic brief, normalize/import qua owned asset boundary rồi judge bytes WebP. Non-photo intent không rơi về stock; mọi candidate fail semantic gate trả terminal fail-soft và draft giữ nguyên. Proposal lưu durable private Visual Brief/evaluation/candidate lineage trong migration additive 0014, public DTO chỉ trả representation/alt/asset ID/source/score/safe reason; `original_request` giữ yêu cầu gốc cho Try another thay vì prompt chung. Review UI hiển thị 2–3 candidate, nguồn/điểm/reason, điều khiển chọn cục bộ và `Tạo thêm giống phương án đang chọn`; Accept vẫn là mutation duy nhất. TDD RED/GREEN: Worker 35 focused tests, database generation integration 15, Web proposal API 14 và Simple editor 24. Package suites: AI Core 69/69, database 73/73, Worker 63/63, Web 279/279. Workspace typecheck 16/16, lint 16/16 và build 16/16 xanh; `git diff --check` không có whitespace error (chỉ LF/CRLF warnings). `pnpm db:check` chưa chạy được vì phiên shell không có `DATABASE_URL`; migration integration đã pass. Không gọi Gemini/Pexels live và chưa chạy Playwright/coverage trong lát 2B này.
- [x] AI Co-designer v2 — Style lane exact-element ngày 2026-08-05: thêm `style-edit-spec-v1` semantic-only (`emphasis`, `spacingDensity`, `alignment`, `surface`, `mobileStack`), Gemini response schema không cho raw CSS/URL/font/color/pixel/theme mutation; server materializer map spec sang allowlisted `UPDATE_STYLE`/`UPDATE_RESPONSIVE_STYLE`, giữ exact selected element, validate Design Document/registry và chặn unsupported target, mobile stack sai loại, low contrast. Proposal intent `style` yêu cầu element scope tại AI Core/API/repository; repository chỉ chấp nhận style command types. Worker route style proposal qua planner/materializer riêng và không gọi legacy text edit provider; runtime/UI đều fail closed sau `AI_ASSISTANT_V2_ENABLED` + `AI_ASSISTANT_STYLE_ENABLED`. UI có switch Nội dung/Phong cách chỉ khi flag bật và selection exact hợp lệ; Current/Proposed/Accept semantics không đổi. RED/GREEN focused: AI proposal 23/23, Worker 37/37, Web Simple 25/25; package regressions AI Core 73/73, Worker 65/65, Web 280/280, database 73/73. Workspace typecheck/lint/build 16/16 và `git diff --check` pass ngoài LF/CRLF warnings. Chưa chạy coverage/Playwright hoặc live Gemini cho lát style này.
- [x] AI Co-designer v2 — Layout lane selected-section ngày 2026-08-05: thêm `layout-recipe-selection-v1` chỉ cho server-owned recipe theo loại top-level section (`navbar-centered`, `hero-centered`, `section-centered`, `section-surface`) cùng density/mobile stack bounded; planner schema không nhận node/ID/HTML/CSS/URL/color/font/raw style. Materializer xác minh exact top-level section, map recipe sang `UPDATE_STYLE` + mobile `UPDATE_RESPONSIVE_STYLE`, validate document/registry và giữ nguyên copy, CTA, asset, IDs, children, section xung quanh. Proposal intent `layout` bắt buộc section scope tại AI Core/API/repository; repository từ chối command ngoài style/responsive. Worker/runtime/UI đều fail closed sau master+planner+`AI_ASSISTANT_LAYOUT_ENABLED`; UI chỉ hiện Bố cục khi target là selected section. RED/GREEN focused AI proposal 25/25, Worker+runtime 48/48, Web proposal/Simple 40/40; package regressions AI Core 75/75, Worker 66/66, Web 281/281, database 73/73. Workspace typecheck/lint/build 16/16 và diff check pass ngoài LF/CRLF warnings. Chưa chạy coverage/Playwright hoặc live Gemini cho lát layout này.
- [x] AI Co-designer v2 — Section composition + bounded refine memory ngày 2026-08-05: thêm `section-composition-spec-v1` chỉ cho ba server-owned template (`section-split`, `section-stacked`, `section-cards`) và preservation fail-closed cho copy/CTA/brand/media/order/responsive. Gemini chỉ chọn semantic spec; server giữ ID/nội dung/asset gốc, cấp wrapper IDs deterministic, materialize đúng một `REPLACE_SUBTREE` trong exact top-level `section`, rồi validate Design Document, registry, limits và surroundings. Worker có resolver/orchestration riêng, không gọi legacy text editor; Web chỉ hiện `Sắp xếp lại` cho exact section. `proposal-lineage-v1` nay được lưu durable qua migration additive 0015, bounded tối đa 8 turns với immutable target/scope/context fingerprint, original request, previous proposal IDs, rejected candidates và structured feedback. Worker semantic resolver nhận original request + feedback bounded của refine; public DTO tiếp tục redacted lineage/prompt. UI gửi allowlisted feedback và API schema từ chối feedback giả/ngoài refine. RED/GREEN cuối được bao phủ trong AI Core 81, database 73, Worker 74 và Web 287 tests; migration integration và typecheck xanh.
- [x] AI Co-designer v2 — Eval, observability và rollout gate ngày 2026-08-05: dataset `assistant-v2-eval-v1` có 12 case Việt/Anh cho copy/media/style/layout/composition/forbidden; media case thực sự chạy fixture bytes qua production `evaluateMediaCandidates` với fake batch judge deterministic, gồm process diagram/product UI/no-people và negative semantic rejection. Gate đạt route accuracy 1.0, scope escape 0, semantic media pass 1.0; live provider eval bị skip đúng vì `AI_EVAL_LIVE` không bật. Worker metrics thêm fixed-cardinality aggregate counters cho proposal/planner/judge/image/candidate/source/semantic gate/token/repair, không chứa prompt, bytes, provider body, object key, credential hoặc resource ID. Rollout runtime chỉ cho `disabled|shadow|opt-in`: shadow sampling deterministic và v1 vẫn authoritative; active v2 + Web UI chỉ được bật ở opt-in; cấu hình sai fail startup. Verification: `pnpm test` 29/29 tasks; workspace typecheck/build/lint 16/16 pass sau sửa import order; coverage AI Core 90.08/80.24/96.78/93.97, database 87.86/80.53/97.57/94.34, Worker 85.90/80.05/87.27/89.52, Web 84.70/80.18/81.45/88.87 (statements/branches/functions/lines); deterministic eval 6/6 + site-intelligence 2/2 + assistant-v2 12/12; `git diff --check` không có whitespace error, chỉ LF/CRLF warnings; safe log scan không có match. `pnpm db:check` chưa chạy được vì shell thiếu `DATABASE_URL`, nhưng migration integration 73/73 pass. Chưa chạy Playwright hoặc live Gemini/Pexels vì không có owner authorization cho provider cost và không khởi động topology trong gate này.
- [x] Owner practical acceptance AI Co-designer v2 ngày 2026-08-05: owner tự kiểm tra các case copy/style/layout/composition/refine/scope/stale và xác nhận đều pass; prompt JavaScript/raw CSS không làm thay đổi document nhưng trước fix vẫn tạo một proposal `standard` no-op với model summary. Media exact-image fail `invalid_model_output` usage 0 dù target là owned `image`. Safe metadata xác định runtime local đang chạy v1 vì `.env` không có rollout/v2 flags; repository completion lại bắt buộc mọi `replace-media` phải có `mediaReview` v2 nên reject snapshot hợp lệ từ legacy resolver. Fix compatibility chỉ cấm `mediaReview` trên intent không phải media, nhưng cho legacy media proposal không review hoàn tất; v2 path vẫn validate review nếu gửi. Đồng thời deterministic forbidden guard được đưa lên API trước admission/persistence/queue, trả `forbidden_action` 422 và UI giải thích ZenUI không chạy mã/chèn CSS/tự publish thay vì hiển thị một proposal no-op. RED/GREEN: AI Core 29/29 focused; database generation integration 16/16; Web proposal/Simple 45/45. Package regressions: AI Core 81, database 74, Worker 74, Web 289 tests; typecheck bốn package xanh. Owner đã reload và xác nhận retest thực tế thành công cho cả thay ảnh và deterministic `forbidden_action`: media proposal hoàn tất đúng luồng review/Accept; yêu cầu JavaScript/raw CSS/publish bị từ chối rõ ràng và document giữ nguyên. Không gọi thêm provider tự động trong verification.
- [x] Follow-up Phiên bản trong Thiết kế trực quan ngày 2026-08-05: đưa đúng bảng quản lý immutable revision hiện có từ nhánh `advanced` thành component dùng chung và render trong `simple`; owner/editor tạo + khôi phục, viewer chỉ xem danh sách, fixture tiếp tục fail closed. Đổi product copy từ Simple/Advanced thành `Thiết kế trực quan`/`Chỉnh sửa chuyên sâu` mà không đổi enum nội bộ, API, database, autosave hoặc mutation boundary. Đồng bộ prototype, E2E helper/journey, CSS bounded scroll và product docs. TDD RED đúng ba thiếu hành vi/nhãn; GREEN focused Web 65/65, full Web 291/291, Web typecheck/lint và `git diff --check` pass ngoài LF/CRLF notices. Chromium Playwright clean-server bị chặn vì Preview 3001 đang chạy; lượt chạy trên topology hiện hữu tới E2E-only `accept-starter` trả 404 vì runtime là local-live (`reset:false`), không phải assertion UI. App thật Web/Preview/Worker đều HTTP 200 và Worker xác nhận PostgreSQL/Redis/object-store ready. Không gọi live provider.
- [x] Follow-up contextual AI exact-element selection ngày 2026-08-06: owner tái hiện chọn đoạn văn con trong Hero nhưng Trợ lý thiết kế AI vẫn báo `Phần Hero` và gửi section ID. Root cause là Canvas đã giữ đúng `state.selectedNodeId`, nhưng ánh xạ trước `ContextualAi` chỉ ưu tiên exact target cho image/media và nâng heading/paragraph lên containing section. TDD RED chạy tới đúng assertion target: focused Simple 31/32, nhãn thực tế `Phần Features` thay vì `Đoạn văn: Launch a structured landing page.`; không phải lỗi setup. Fix tối thiểu ưu tiên `state.selectedNodeId ?? selectedSectionId`, tạo label exact bằng type + nội dung rút gọn, dùng cùng target cho desktop/mobile; containing section vẫn giữ riêng cho Page Story, section actions, layout/composition và media vẫn route `replace-media`. GREEN: focused Simple 32/32, proposal + Simple 48/48, full Web 40 files/292 tests, Web typecheck/lint và `git diff --check` pass ngoài LF/CRLF notices. App local-live thật Web/Preview/Worker đều HTTP 200; browser chọn project `b3306ede-ce64-4cac-8ac4-c1376eb364f4`, exact node `hero-paragraph`, viền selected=true và scope hiển thị `Đang chỉnh: Đoạn văn: The all-in-one platform designed to help modern teams collaborate, track progress, and ship faster than ever before.`; ảnh bằng chứng `test-results/exact-ai-selection-scope.png`. Không gửi proposal live/không gọi paid provider và không Accept nên không có document mutation.
- [x] Design System MVP trước khi tạo Direction ngày 2026-08-06: owner duyệt luồng chọn `Để ZenUI đề xuất thiết kế` hoặc `Dùng thiết kế riêng` ngay trong Guided Brief, để website được tạo sẵn theo quy chuẩn thay vì generate trước rồi mới restyle. Custom mode nhận đúng ba màu HEX (`primary/background/text`), heading/body từ allowlist, và preset typography (`compact/balanced/expressive`), spacing (`compact/balanced/airy`), radius (`sharp/balanced/soft`); text/background >=4.5:1 và primary/background >=3:1. Brief/run JSONB giữ token nên không cần migration; brief cũ normalize về ZenUI mode. Provider chỉ nhận content brief đã loại `designSystem`; server-owned materializer áp tokens vào cả ba direction/document, trong khi Hero/features/layout contracts vẫn khác nhau. Guided form có preview local không mutation, validation cùng schema và gallery dùng cùng custom system. Cập nhật input `type="color"` kèm mã text để dễ dùng. TDD RED: AI Core schema/materialization test fail vì `designSystem` chưa tồn tại; Guided test fail vì radio `Dùng thiết kế riêng` chưa tồn tại. GREEN: AI Core 8 files/83 tests; Guided/Web 40 files/293 tests; AI Core + Web typecheck pass; `git diff --check` không whitespace error, chỉ LF/CRLF notices. Đã thêm ADR-0017 và cập nhật wireframe/API contract. Chưa chạy live provider, browser E2E/topology, full workspace gates hay thay đổi database schema.
- [x] Follow-up Design Direction variety — Bước 1 ngày 2026-08-10: mở rộng icon allowlist và render icon bằng SVG inline server-owned; checkpoint hiện tại `c1dca4c`. Bước này được giữ nguyên khi rà soát lại từ Bước 2.
- [x] Follow-up Design Direction variety — Bước 2 ngày 2026-08-10: mở rộng direction preset từ 2 lên 4 bộ, tổng 12 ID riêng biệt; mỗi bộ giữ ba `heroVariant`, `featuresVariant` và `themePreset` khác nhau. Chuẩn hóa modulo để round âm/lớn wrap an toàn. TDD RED đúng nghiệp vụ: regression mới nhận 2 bộ thay vì 4; GREEN focused `design-directions.test.ts` 13/13, full AI Core 8 files/84 tests, AI Core typecheck/lint và `git diff --check` pass. Chưa commit/push; dừng trước Bước 3 để owner kiểm tra.
- [x] Follow-up Design Direction variety — Bước 3 ngày 2026-08-10: thêm server-owned variants Hero `overlap`, Features `icon-list`, Testimonials `quote-wall`, FAQ `accordion-cards`, Final CTA `banner`; direction đầu tiên sử dụng trọn bộ biến thể mới. Thêm `sectionRhythm` nội bộ `benefit-first|proof-first|offer-first`, mỗi bộ gán đủ ba rhythm và chỉ sắp xếp các section provider đã chọn; Footer luôn cuối, required section giữ đủ, provider schema và public direction contract không lộ rhythm. TDD RED đúng nghiệp vụ: schema từ chối variant mới và ba hướng chỉ có hai thứ tự; GREEN focused 2 files/21 tests, full AI Core 8 files/86 tests, AI Core typecheck/lint và `git diff --check` pass. Full suite phát hiện icon-list làm mất owned feature media; đã sửa giữ ảnh server-owned trong list và regression trở lại xanh. Chưa commit/push; dừng trước Bước 4 để owner kiểm tra.
- [x] Follow-up Design Direction variety — Bước 4 ngày 2026-08-10: tăng chiều sâu thị giác chỉ bằng `styleSchema` hiện có, không thêm gradient/contract mới. Section thường xen kẽ `background`/`surface`; feature/testimonial/pricing/FAQ card đều có border token và shadow theo density `compact→sm`, `balanced→md`, `airy→lg`. Eyebrow dùng badge `primarySoft`/`primaryDark` và radius token; feature icon nằm trong shell vuông theo primary token. Mood editorial thêm đúng một divider server-owned giữa Hero và section đầu. TDD RED đúng nghiệp vụ: card còn shadow cố định và thiếu editorial divider; GREEN focused Blueprint 11/11, full AI Core 8 files/90 tests, typecheck/lint pass. Regression provider pricing được cập nhật theo invariant shadow mới. Heavy blueprint 6 features/3 plans/6 FAQs vẫn validate, <=500 nodes và <=1 MiB. Chưa commit/push; dừng trước Bước 5 để owner kiểm tra.
- [x] Follow-up Design Direction variety — Bước 5 ngày 2026-08-10: mở rộng regression Design System custom từ một bộ lên đủ 4 bộ × 3 hướng. Cả 12 direction giữ chính xác cùng `document.theme` custom (primary/background/text, Georgia/Arial, radius soft), heading typography expressive, section spacing airy và icon radius token; đồng thời mỗi bộ vẫn có ba Hero/Features variant khác nhau, ba tổ hợp section variant khác nhau và ba section rhythm khác nhau. Lượt focused đầu bị transform do thiếu một dấu ngoặc trong test (không tính là RED nghiệp vụ); sau khi sửa cú pháp, regression mới GREEN ngay mà không cần sửa production vì invariant ADR-0017 vẫn được Bước 2–4 bảo toàn. Focused `design-directions.test.ts` 14/14, full AI Core 8 files/90 tests, AI Core typecheck/lint và `git diff --check` pass ngoài cảnh báo LF/CRLF đã có. Chưa commit/push; dừng trước Bước 6 để owner kiểm tra.
- [x] Follow-up Design Direction variety — Bước 6 ngày 2026-08-10: ghi nhận quyết định kiến trúc trong ADR-0018 `Server-owned richer Design Directions` và thêm vào chỉ mục ADR. ADR chốt 4 bộ/12 hướng, section variant + rhythm + visual depth và SVG path đều do server sở hữu; provider vẫn chỉ cấp bounded content/media intent, custom Design System tiếp tục authoritative. Alternatives bị loại/hoãn được ghi rõ: để provider chọn visual token/layout/rhythm (phá trust boundary), thêm gradient/free-form decoration vào `styleSchema` (chạm contract/validator/render/export), hoặc chỉ tăng màu/glyph Unicode (không giải quyết đa dạng cấu trúc). Wireframe gallery được đồng bộ với vòng quay bốn bộ, ba rhythm, visual depth từ schema hiện có, SVG allowlist và ranh giới không CSS/JavaScript/gradient. Verification cuối: workspace `pnpm test` 29/29 tasks (AI Core 90/90, Web 293/293 cùng toàn bộ package suite), `pnpm typecheck` 16/16 tasks, `pnpm lint` 16/16 tasks và `pnpm build` 16/16 tasks đều pass; `git diff --check` không có whitespace error, chỉ cảnh báo LF/CRLF ở wireframe và provider test. Chưa chạy Playwright/coverage/live provider vì Bước 6 chỉ đồng bộ tài liệu. Chưa commit/push.
- [x] Follow-up bounded Gemini Design Direction planner ngày 2026-08-10: thay selection `round % presetSets` bằng đúng một structured text call `design-directions-v2` cho mỗi prepare/remix, gồm shared content blueprint, đúng ba allowlisted preset-ID proposals, ba Hero intents riêng và tối đa một shared feature intent. Provider không có quyền đối với raw token/style, SVG, HTML/CSS/JavaScript, node/ID, asset, document mutation hoặc publication. Schema strict vẫn từ chối unknown ID/extra field nhưng cho duplicate allowlisted ID đi tới server resolver; resolver loại duplicate/recent/similar bằng deterministic brief+round ordering và pairwise structural distance, không có Gemini repair call thứ hai. Remix chỉ nạp tối đa ba ID từ run trước trong cùng workspace/project. Worker dùng stable keys `direction-1-hero`…`direction-3-hero`, tối đa bốn media/run, batch hai, generated→Pexels→geometric placeholder fail-soft. Prepare/remix giữ project version 1 và revisions rỗng; chỉ explicit Choose áp atomic `REPLACE_DOCUMENT`, lên version 2 và tạo đúng một revision. RED xác nhận duplicate plan trước đây bị schema reject; GREEN AI Core 15/15 + typecheck, Worker/runtime 57/57 + typecheck, database 8/8 + typecheck, Guided Web 8/8 + typecheck. Guided Chromium 3/3 pass sau sửa contrast step badge, viewport toggle, publish primary action và Site Intelligence tabs/badges; Firefox 3/3, WebKit mobile 2/2 và primary retry 1/1 pass, tổng hành vi đa trình duyệt đã được kiểm chứng. ADR-0019 supersede đúng phần ADR-0018 nói provider không chọn visual variant; threat model/API contract/wireframe/quality roadmap đã đồng bộ authority matrix, one-call/no-repair, four-media cap và Choose boundary. Final workspace gates hậu cập nhật dependency: `pnpm test` 29/29 tasks (Web 294/294), `pnpm test:coverage` 29/29 tasks với mọi configured aggregate metric >=80%, `pnpm typecheck` 16/16, `pnpm lint` 16/16 và `pnpm build` 16/16 đều pass. Lượt coverage đầu hậu cập nhật dependency thoát 1 nhưng log bị truncate trước nguyên nhân; rerun error-scoped hoàn tất 29/29 nên không còn failure tái hiện. Production audit ban đầu phát hiện `nanoid` và `postcss` transitive advisory; workspace overrides + Web PostCSS dependency đã nâng lockfile lên `nanoid 3.3.18` và `postcss 8.5.26`, sau đó `pnpm audit --prod` báo không có known vulnerability. Safe secret-pattern scan chỉ thấy test/placeholder rõ ràng, không nhận diện credential thật. Final `git diff --check` không có whitespace error, chỉ có LF→CRLF notices. Đã dừng Worker cũ, clean-start root `pnpm dev` và xác nhận Web `localhost:3000`, Preview `127.0.0.1:3001`, Worker readiness/instance đều HTTP 200 với services `generation,asset,export`; không phát sinh request generation. Không gọi live Gemini/Image/Pexels, không sửa `.env`, không commit/push; giữ nguyên `note.txt` của owner và file `apps/web/next-env.d.ts` do Next build sinh.
- [x] Follow-up Guided owned-image local delivery ngày 2026-08-10: owner báo Hero/feature trong Gallery và Preview hiện icon ảnh lỗi dù direction đã có alt/owned asset ID. Root cause gồm hai lớp ở local topology: root `pnpm dev` không có listener cho cookie-free `ASSET_ORIGIN=http://127.0.0.1:3002`; sau khi thêm listener, proxy ban đầu dùng Node `fetch`, lớp này chuẩn hóa/không truyền wire-level `Host: 127.0.0.1:3002` tới Next nên exact-origin guard vẫn trả uniform 404. Không có lỗi provider hay thiếu media: bốn asset của run gần nhất đều `ready`, WebP, có private object metadata; direct native HTTP với exact Host trả 200. Fix thêm local asset server vào `scripts/dev.mjs`, đưa port 3002 vào preflight, asset health vào readiness, strip Cookie/Set-Cookie, và dùng `node:http`/`node:https` request để giữ exact isolated Host; production public handler, UUID/schema validation, checksum/MIME verification, private S3 và uniform 404/503 không bị nới lỏng. RED compile-time xác nhận thiếu `getDevPorts`, sau đó RED/GREEN proxy regression khóa exact Host + no-cookie; `pnpm dev:test` 7/7, gồm fail-closed với path ngoài `/a/<UUID>` và method khác GET. Clean restart xác nhận Web/Preview/Asset/Worker đều HTTP 200; cả bốn owned asset thực tế qua port 3002 trả 200 `image/webp` (52,948 / 103,848 / 78,756 / 96,984 byte), Chromium decode `complete=true`, `naturalWidth=1376`, `naturalHeight=768`. Focused Web public-asset + Guided 13/13, Web typecheck/lint và `git diff --check` pass ngoài LF/CRLF notices. Không gọi Gemini/Image/Pexels, không sửa `.env`, không commit/push và không đụng `note.txt`.
- [x] Follow-up Guided feature media placeholder ngày 2026-08-10: owner xác nhận owned Hero/feature bắt đầu hiển thị nhưng hai feature card còn có khung nền nhạt trông như ảnh lỗi. Root cause không còn ở asset delivery: Blueprint v2 gán `feature-1|2|3` theo chỉ số cho mọi feature rồi materialize `feature-media-slot-2/3` rỗng dù contract `design-directions-v2` chỉ cho tối đa một shared feature intent/asset. RED focused chạy đúng assertion nghiệp vụ: nhận node `feature-media-slot-2` rỗng (`mediaSlot=feature-2`, `minHeight=220`) thay vì `undefined`. Fix tối thiểu chỉ tạo fallback feature-media card khi blueprint thật sự có `item.image`; Design Directions không đưa provider URL/image vào section item nên feature không có planned/resolved media giờ chỉ render copy/icon, còn shared `feature-1` owned asset vẫn render bình thường. Không đổi media budget, không gọi thêm provider và không nới public asset/Host/cookie/checksum/MIME boundary. GREEN `design-directions.test.ts` 15/15, `blueprint-v2.test.ts` 11/11, AI Core typecheck/lint và `git diff --check` pass ngoài LF/CRLF notices. Chromium trên document mới materialize xác nhận không còn `feature-media-slot-1/2/3`, chỉ có `feature-image-1`; Hero decode 1376×768 và feature decode 1200×896 với `complete=true`. Không gọi Gemini/Image/Pexels, không sửa `.env`, không commit/push và không đụng `note.txt`.
- [x] Correction chuẩn media Design Directions v2 ngày 2026-08-10, supersede mô tả media ở các mục 2489 và 2491: owner xác nhận invariant sản phẩm luôn là một shared Hero + đúng ba shared feature images, không phải ba Hero theo direction + tối đa một feature. Strict `design-directions-v2` giờ yêu cầu `content.heroImage`, đủ ba unique slot `feature-1|2|3`, còn `directions[]` chỉ chứa `presetId`; old three-Hero envelope và thiếu/thừa/trùng feature slot fail closed. Worker resolve đúng bốn stable key `shared-hero`, `shared-feature-1`, `shared-feature-2`, `shared-feature-3` theo batch tối đa hai, gom một `OwnedMediaMap` và materialize cùng bốn owned asset ID vào cả ba document; direction vẫn khác bằng preset/composition/hierarchy/section rhythm/Design System treatment. Partial failure chỉ bỏ đúng feature image lỗi và không sinh `feature-media-slot-*` rỗng; Hero geometric fallback, private asset/import/WebP/checksum/Host/cookie boundary và explicit Choose `REPLACE_DOCUMENT` giữ nguyên. TDD RED hợp lệ: AI Core 3/15 fail và Worker 1/45 fail vì schema/path cũ từ chối corrected fixture; GREEN focused AI Core 15/15, Worker/runtime 57/57, database integration 8/8. Gemini output contract, deterministic E2E fixture, ADR-0019, API contract, wireframe, quality roadmap và threat model đã đồng bộ. Không tăng hard cap, không gọi Gemini/Image/Pexels live, không sửa `.env`, không commit/push, giữ `note.txt` và `apps/web/next-env.d.ts` của owner. Final workspace verification được ghi bổ sung sau khi chạy gates.
- [x] Follow-up Choose Design Direction + kiểm soát cache ngày 2026-08-11: frontend root cause là `GuidedOnboarding` đưa mọi `chooseDirection` rejection vào cùng trạng thái `failed` của prepare/remix, trong khi browser `readData` bỏ safe API error code; vì vậy lỗi áp dụng hướng bị báo sai thành “Không thể chuẩn bị hướng thiết kế”. TDD RED chạy đúng assertion nghiệp vụ: mong “Không thể áp dụng hướng đã chọn” nhưng nhận copy chuẩn bị; GREEN tách `chooseErrorCode`, giữ code/status đã redacted, trả lifecycle về `idle`, giữ ba card/brief/run và cho retry đúng cùng direction mà không gọi lại `saveBrief`/`createRun`/provider/media. API tests bao phủ đủ `not_found`, `stale_document_version`, `direction_not_found`, `run_not_selectable`, `invalid_design_document` và 500 `internal_error` redacted. Database integration với đúng một Hero + ba owned feature asset ID pass ngay, chứng minh snapshot hợp lệ, atomic `REPLACE_DOCUMENT`, version 1→2, duplicate same-direction idempotent và đúng một immutable revision; do đó không sửa/nới transaction hoặc document validation. Lỗi live 500 nhiều khả năng là hạ tầng `ENOSPC`: repo khoảng 17 GiB, gồm `.turbo/cache` khoảng 14 GiB và `apps/web/.next` khoảng 2.6 GiB; owner cho phép xóa đúng hai cache này, đưa repo xuống khoảng 716 MiB và ổ D có khoảng 19.51 GiB trống. `turbo.json` thêm `!.next/dev/**` vì Next 16 đặt dev cache dưới `.next/dev/cache`; sau toàn bộ build/test cache Turbo chỉ khoảng 0.017 GiB, `.next` khoảng 0.818 GiB và ổ D còn 18.66 GiB. Verification: focused Web/API 18/18; database four-image 9/9; full Web 295/295; full database 76/76; workspace test 29/29 tasks; typecheck/lint/build đều 16/16; `git diff --check` không có whitespace error, chỉ LF→CRLF notices. Focused Chromium deterministic journey xác nhận Choose trả 200, chuyển vào Editor, project `accepted` version 2 và một revision; test sau đó timeout ở bước đọc public Share URL tại dòng 148, ngoài phạm vi Choose, nên không ghi nhận full E2E pass. Coverage không rerun. Không gọi Gemini/Image/Pexels live, không sửa `.env`, không commit/push và không đụng `note.txt`.
- [x] Follow-up Custom Design System tương phản thấp ngày 2026-08-11: owner chọn chính sách **Dùng nguyên mọi nơi** sau khi Guided preview thay đổi nhưng nút `Tạo 3 hướng thiết kế` im lặng với `primary=#24eb94`, `background=#ffffff`, `text=#2c56ba`. Root cause là `guidedDesignSystemSchema` dùng contrast `superRefine` làm `websiteBriefSchema.safeParse` fail, còn frontend chỉ map lỗi brief cơ bản rồi âm thầm return. TDD RED xác nhận thiếu warning/UI submit và domain schema còn từ chối màu; GREEN tách strict structural validation (HEX sáu ký tự, font/preset allowlist, extra field rejection) khỏi `guidedDesignSystemWarnings`, biến ngưỡng text/background 4.5:1 và primary/background 3:1 thành advisory không chặn. Guided UI hiển thị warning có semantics/text, giữ exact màu, map malformed HEX vào đúng field với `aria-invalid`/`aria-describedby`, không xóa input và chỉ structural invalid mới chặn. Server-owned materializer giữ cùng exact custom theme/font/type/spacing/radius cho đủ 4 preset sets × 3 directions; provider request tiếp tục không có `designSystem`; Brand Kit contrast policy không đổi. ADR-0017, API contract và editor wireframe đã được amend. Verification: AI Core focused 15/15 và full 91/91; Guided Web focused 10/10 và full Web 296/296; focused deterministic Chromium 1/1 chứng minh warning không chặn, ba cards cùng `#24eb94`/Georgia/`#2c56ba`, một mock provider call và không gọi provider trả phí; workspace typecheck/lint/build 16/16. Workspace `pnpm test` mặc định chạy hai lần đều gặp PGlite hooks vượt timeout 10 giây khi các package chạy đồng thời (lượt đầu 1 database test, lượt hai 5 design-direction tests); các assertion còn lại pass. Database suite riêng không contention pass 10 files/76 tests, focused generation 16/16; final workspace test với `turbo run test --concurrency=1` pass 29/29 tasks, xác nhận failure trước là contention hạ tầng chứ không phải nghiệp vụ. `git diff --check` không có whitespace error, chỉ LF→CRLF notices. Không gọi Gemini/Image/Pexels live, không sửa `.env`, không commit/push và không đụng `note.txt`.
- [ ] Mentor/representative non-coder acceptance cho multi-page chưa được ghi nhận.

Bước tiếp theo theo product priority:

1. Thực hiện mentor/representative non-coder acceptance cho create/switch/navigation/preview/share/export/publish multi-page; ghi blocker hoặc acceptance trung thực.
2. Giữ Stage 10B1 `In review` cho tới khi acceptance hoàn tất; xử lý follow-up defect bằng TDD nếu phát hiện.
3. Chỉ sau khi 10B1 Completed mới lập ADR/triển khai 10B2 CMS; external Phase 7 gates vẫn độc lập và không chạy live provider nếu chưa được yêu cầu/ủy quyền.

External Phase 7 gates có thể được chạy riêng khi chuẩn bị private beta: controlled live Vercel smoke, third-party GitHub OAuth, managed backup/RPO/RTO/private operations network và bounded deployment-topology capacity. Không để các gate này thay thế evidence chọn capability Stage 10.

> Sau khi hoàn thành từng bước hoặc phase, bắt buộc cập nhật file này trước khi chuyển sang bước tiếp theo.
