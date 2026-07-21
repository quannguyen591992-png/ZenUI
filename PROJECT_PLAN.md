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
| Mục tiêu MVP | Prompt tạo landing page, kéo-thả có cấu trúc, chỉnh sửa trực quan, AI chỉnh sửa, export, share và deploy |
| Trạng thái tổng thể | Implementation |
| Phase hiện tại | Phase 1 — Editor Core Prototype |
| Ngày tạo | 2026-07-21 |
| Cập nhật gần nhất | 2026-07-21 |
| Người chịu trách nhiệm cập nhật | Developer/AI agent thực hiện phase |
| Phiên bản tài liệu | 0.2.0 |

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

Xây dựng một ứng dụng web cho phép người dùng mô tả landing page bằng ngôn ngữ tự nhiên, nhận thiết kế do AI tạo, chỉnh sửa thiết kế bằng click và kéo-thả component có cấu trúc, xem preview tức thời, khôi phục lịch sử, sau đó export thành HTML/CSS, tạo link chia sẻ hoặc deploy một revision cụ thể.

## 1.2. Giá trị người dùng

Người dùng có thể đi từ ý tưởng đến website hoạt động mà không phải tự viết toàn bộ code, đồng thời vẫn kiểm soát được bố cục và nội dung thông qua visual editor.

## 1.3. Định vị MVP

MVP là:

> **AI Landing Page Builder với block-based responsive drag-and-drop.**

MVP không phải:

- Bản sao đầy đủ của Vercel v0.
- Trình thiết kế tự do theo tọa độ như Figma.
- IDE thay thế VS Code.
- Trình sinh ứng dụng full-stack tổng quát.

## 1.4. Đối tượng người dùng mục tiêu ban đầu

Ưu tiên theo thứ tự:

1. Người không chuyên lập trình cần tạo landing page nhanh.
2. Marketer, creator hoặc chủ doanh nghiệp nhỏ.
3. Developer cần tạo bản nháp giao diện và export source.
4. Agency cần tạo prototype cho khách hàng.

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
    | Export HTML| | Share   | | Deploy   |
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
| 1 | Editor Core Prototype | Not started | Renderer, command system, drag/drop cơ bản | Phase 0 |
| 2 | Editor Foundation | Not started | Dashboard, registry, canvas, layers, inspector, persistence | Phase 1 |
| 3 | AI Generation & Editing | Not started | Prompt tạo trang và AI operations | Phase 2 |
| 4 | Secure Preview & Export | Not started | Preview sandbox, HTML compiler/export | Phase 2 |
| 5 | Share | Not started | Immutable public revision link | Phase 4 |
| 6 | Deploy | Not started | Một provider, OAuth, deploy job | Phase 4 |
| 7 | Hardening & Beta | Not started | Security, E2E, performance, recovery | Phase 3–6 |

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

- [ ] Viết schema tests trước implementation.
- [ ] Viết command reducer tests.
- [ ] Implement component registry.
- [ ] Implement renderer.
- [ ] Implement selection.
- [ ] Implement drag/drop từ palette.
- [ ] Implement reorder.
- [ ] Implement invalid-drop rejection.
- [ ] Implement basic inspector.
- [ ] Implement undo/redo.
- [ ] Implement persistence.
- [ ] Implement HTML compiler.
- [ ] Viết E2E happy path.

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

- [ ] Unit tests command/schema pass.
- [ ] E2E core flow pass.
- [ ] Build/typecheck/lint pass.
- [ ] Không có cycle/orphan/duplicate node sau fuzz/property tests cơ bản.

## 14.5. Phase Completion Record

```text
Status: Not started
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

- [ ] Project CRUD và authorization tests.
- [ ] Layers tree đồng bộ canvas.
- [ ] Drag/drop giữa các container.
- [ ] Composite components.
- [ ] Inspector content/layout/typography/appearance.
- [ ] Responsive overrides.
- [ ] Autosave state machine.
- [ ] Conflict handling.
- [ ] Revision snapshot.
- [ ] Restore flow.
- [ ] Loading/error/empty states.
- [ ] E2E editor workflow.

## 15.4. Exit criteria

- [ ] Có ít nhất 15 component dùng được.
- [ ] Canvas và Layers luôn đồng bộ.
- [ ] Invalid parent/child bị từ chối.
- [ ] Autosave và reload không mất dữ liệu.
- [ ] Restore revision hoạt động.
- [ ] Desktop/tablet/mobile render đúng override.
- [ ] Authorization không cho truy cập chéo workspace.
- [ ] Test/build/lint/typecheck/E2E pass.

## 15.5. Phase Completion Record

```text
Status: Not started
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

- [ ] Provider interface.
- [ ] Mock provider cho tests.
- [ ] Create-design prompt contract.
- [ ] Edit-operations prompt contract.
- [ ] Structured output validation.
- [ ] Semantic validation.
- [ ] Atomic transaction.
- [ ] Repair limit.
- [ ] Timeout/retry classification.
- [ ] SSE statuses.
- [ ] Usage ledger.
- [ ] Prompt injection boundary tests.
- [ ] AI operation regression fixtures.
- [ ] E2E prompt -> edit -> revision.

## 16.4. Exit criteria

- [ ] Prompt tạo landing page hợp lệ.
- [ ] AI sửa selected node đúng scope.
- [ ] AI sửa toàn trang bằng operations.
- [ ] Invalid AI output không thay đổi current document.
- [ ] Repair không chạy quá giới hạn.
- [ ] Mỗi run có status, usage và error code.
- [ ] Mỗi AI edit thành công tạo revision.
- [ ] Test/build/lint/typecheck/E2E pass.

## 16.5. Phase Completion Record

```text
Status: Not started
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

- [ ] Preview bridge schemas.
- [ ] Origin validation.
- [ ] No editor credentials in preview.
- [ ] CSP/security headers.
- [ ] Arbitrary script rejection.
- [ ] Dangerous URL rejection.
- [ ] Compiler deterministic tests.
- [ ] Standalone export.
- [ ] Export error handling.
- [ ] Pixel/DOM snapshot comparison ở mức phù hợp.
- [ ] Security tests cho iframe/XSS.

## 17.4. Exit criteria

- [ ] Preview không truy cập được cookie/token editor.
- [ ] Message giả từ origin khác bị từ chối.
- [ ] Design nguy hiểm bị reject/sanitize theo policy.
- [ ] File export mở độc lập.
- [ ] Preview và export tương đương trong bộ fixtures.
- [ ] Test/build/lint/typecheck/E2E/security checks pass.

## 17.5. Phase Completion Record

```text
Status: Not started
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

# 18. Phase 5 — Share

## 18.1. Mục tiêu

Cho phép tạo link public chỉ đọc tới một revision bất biến.

## 18.2. Checklist

- [ ] ShareLink schema.
- [ ] Random unguessable slug.
- [ ] Revision pinning.
- [ ] Read-only rendering.
- [ ] `noindex` mặc định.
- [ ] Disable link.
- [ ] Expiration-ready schema.
- [ ] Rate limit.
- [ ] Authorization cho quản lý link.
- [ ] E2E create/view/disable.

## 18.3. Exit criteria

- [ ] Draft thay đổi không làm share revision cũ thay đổi.
- [ ] Viewer không thể sửa hoặc truy cập editor data.
- [ ] Disabled link không còn xem được.
- [ ] Không lộ project/workspace ID nhạy cảm.
- [ ] Test/build/lint/typecheck/E2E pass.

## 18.4. Phase Completion Record

```text
Status: Not started
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

# 19. Phase 6 — Deploy

## 19.1. Mục tiêu

Deploy một immutable revision qua một provider và trả URL/trạng thái rõ ràng.

## 19.2. Checklist

- [ ] Chọn provider đầu tiên.
- [ ] OAuth hoặc credential flow an toàn.
- [ ] ProviderConnection encryption.
- [ ] Immutable artifact.
- [ ] Deployment state machine.
- [ ] Idempotency.
- [ ] Queue/worker.
- [ ] Provider status polling/webhook.
- [ ] Redacted logs.
- [ ] Retry policy.
- [ ] Disconnect/revoke.
- [ ] E2E hoặc provider sandbox integration test.

## 19.3. Exit criteria

- [ ] Một revision deploy thành công và trả URL.
- [ ] Double-click không tạo deploy trùng.
- [ ] Provider error hiển thị rõ và không lộ secret.
- [ ] Token không xuất hiện ở browser/log/database plaintext.
- [ ] Deployment luôn chỉ tới revision đã chọn.
- [ ] Test/build/lint/typecheck/integration/E2E pass.

## 19.4. Phase Completion Record

```text
Status: Not started
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

# 20. Phase 7 — Hardening & Beta

## 20.1. Mục tiêu

Đưa sản phẩm từ feature-complete sang trạng thái có thể cho người dùng thật trải nghiệm có kiểm soát.

## 20.2. Checklist

- [ ] End-to-end critical journeys.
- [ ] Authorization/RBAC audit.
- [ ] XSS/iframe/security audit.
- [ ] AI prompt injection review.
- [ ] Upload validation.
- [ ] Rate limit/load test.
- [ ] Queue recovery.
- [ ] Worker crash recovery.
- [ ] Database backup/restore test.
- [ ] Observability dashboards.
- [ ] Alerting.
- [ ] Usage/budget guardrails.
- [ ] Performance budget.
- [ ] Accessibility review.
- [ ] Beta onboarding.
- [ ] Privacy/retention policy.
- [ ] Runbook cho incident phổ biến.

## 20.3. Exit criteria

- [ ] Toàn bộ MVP acceptance criteria đạt.
- [ ] Không còn critical/high security issue đã biết.
- [ ] Critical E2E pass ổn định.
- [ ] Có recovery procedure đã kiểm tra.
- [ ] Có usage/cost limits.
- [ ] Có monitoring và error reporting.
- [ ] Known limitations được công bố rõ.

## 20.4. Phase Completion Record

```text
Status: Not started
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
Next phase readiness: Production planning
```

---

# 21. MVP acceptance criteria tổng thể

## AI

- [ ] Prompt tạo landing page hợp lệ.
- [ ] Mọi output được schema validation.
- [ ] AI sửa toàn trang hoặc selected node.
- [ ] Invalid output không phá document.
- [ ] Run có loading/success/error/usage.

## Drag-and-drop

- [ ] Ít nhất 15 component có thể kéo vào canvas.
- [ ] Reorder section.
- [ ] Move component giữa container hợp lệ.
- [ ] Invalid target bị từ chối.
- [ ] Drag/drop có undo/redo.
- [ ] Layers và canvas đồng bộ.

## Visual editing

- [ ] Click node mở đúng inspector.
- [ ] Sửa text/style cập nhật tức thời.
- [ ] Desktop/tablet/mobile.
- [ ] Autosave và reload không mất dữ liệu.

## Revision

- [ ] AI edit tạo revision.
- [ ] Restore revision.
- [ ] Share/deploy pin immutable revision.

## Output

- [ ] Export HTML chạy độc lập.
- [ ] Preview/export nhất quán.
- [ ] Share chỉ đọc.
- [ ] Deploy trả URL hoặc lỗi rõ.
- [ ] Idempotent deploy.

## Security

- [ ] Preview không đọc editor credentials.
- [ ] Không arbitrary generated JavaScript.
- [ ] Không truy cập chéo workspace/project.
- [ ] Provider token không lộ client/log.
- [ ] Input từ user/AI/API được validate.

---

# 22. Verification strategy

## 22.1. Test pyramid

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

## 22.2. Test bắt buộc khi thay đổi hành vi

- Command handler: unit + inverse command test.
- Schema/invariant: validation tests.
- Drag/drop: component/integration + E2E critical path.
- AI contract: mock fixtures + invalid output tests.
- API endpoint: auth/input/error integration tests.
- Preview/export: consistency + security test.
- Deploy: state/idempotency/error tests.

## 22.3. Verification loop cuối mỗi phase

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

# 23. Security checklist

## Auth/RBAC

- [ ] Mọi project query có workspace ownership check.
- [ ] Share viewer không có editor permission.
- [ ] Deploy/export kiểm tra quyền.
- [ ] Provider connection thuộc đúng workspace/user.

## Input

- [ ] API schemas.
- [ ] AI output schemas.
- [ ] Command semantic validation.
- [ ] URL allowlist/protocol validation.
- [ ] Upload MIME/extension/size validation.

## Preview

- [ ] Separate origin.
- [ ] Sandbox iframe.
- [ ] CSP.
- [ ] Origin checks.
- [ ] No auth credential.
- [ ] No arbitrary script.

## Secrets

- [ ] Environment/secrets manager.
- [ ] Encryption at rest cho provider credentials.
- [ ] No secrets in prompt/log/error/client.
- [ ] Redaction.
- [ ] Revoke/disconnect.

## Abuse/cost

- [ ] AI rate limit.
- [ ] Deploy rate limit.
- [ ] Export/share rate limit.
- [ ] Max document nodes/depth/size.
- [ ] AI token/time/retry budget.
- [ ] Worker CPU/RAM/time limits nếu chạy code/build.

---

# 24. Observability

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

# 25. Risk Register

| ID | Rủi ro | Mức độ | Khả năng | Giảm thiểu | Trạng thái |
|---|---|---:|---:|---|---|
| R-001 | Drag/drop tree tạo cycle/orphan | Cao | Trung bình | Command validation + property tests | Open |
| R-002 | AI output không ổn định | Cao | Cao | Structured output, semantic validation, bounded repair | Open |
| R-003 | Preview XSS ảnh hưởng editor | Critical | Trung bình | Separate origin, CSP, no arbitrary JS | Open |
| R-004 | Preview và export khác nhau | Cao | Trung bình | Shared compiler + consistency tests | Open |
| R-005 | Autosave ghi đè thay đổi mới | Cao | Trung bình | Optimistic version + conflict handling | Open |
| R-006 | Provider token bị lộ | Critical | Thấp/Trung bình | OAuth, encryption, redaction, server-only | Open |
| R-007 | Scope tăng thành full v0 quá sớm | Cao | Cao | Enforce non-goals và phase gates | Open |
| R-008 | Chi phí AI vượt kiểm soát | Cao | Trung bình | Budget, rate limit, usage ledger, minimal context | Open |
| R-009 | Component registry thiếu nhất quán | Cao | Trung bình | Single registry contract dùng cho renderer/AI/compiler | Open |
| R-010 | Deploy API thay đổi/phụ thuộc bên thứ ba | Trung bình | Trung bình | Provider adapter + error handling | Open |

---

# 26. Open Questions

Không còn open question chặn Phase 1. Các quyết định Phase 0 đã được chuyển vào Decision Log và ADR tương ứng.

Câu hỏi không chặn cần xem lại ở phase owner:

1. Có proxy/allowlist ảnh remote trước public beta hay chấp nhận disclosure rủi ro theo tài liệu? Owner: Phase 4/7.
2. Chính sách expiry tùy chọn cho share link có được bổ sung sau MVP không? Owner: Phase 5.
3. Queue/cache provider cụ thể cho worker là gì? Chốt khi bắt đầu Phase 3/6 dựa trên deployment topology.

Không tự suy diễn câu trả lời thành product truth. Khi chốt, chuyển câu trả lời vào Decision Log.

---

# 27. Decision Log

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

Khi một quyết định lớn thay đổi, phải:

- Thêm dòng mới thay vì xóa lịch sử.
- Đánh dấu quyết định cũ `Superseded`.
- Ghi ID quyết định thay thế.
- Nếu đã có thư mục ADR, tạo/cập nhật ADR tương ứng.

---

# 28. Known Issues & Technical Debt

| ID | Phase phát sinh | Nội dung | Mức độ | Kế hoạch xử lý | Trạng thái |
|---|---|---|---|---|---|
| TD-001 | Planning | Stack/provider/auth chưa chốt | Blocking | Chốt trong Phase 0 | Closed — 2026-07-21, D-007 đến D-011/ADR-0002 đến ADR-0005 |
| TD-002 | Planning | Chưa có schema implementation | Blocking | Phase 0/1 | Closed — 2026-07-21, Zod + semantic validator + JSON Schema và tests |
| TD-003 | Planning | Chưa có threat model chi tiết | High | Phase 0 và cập nhật Phase 4/6 | Closed — 2026-07-21, `docs/security/threat-model.md`; phải review lại ở Phase 4/6 |
| TD-004 | Phase 0 | `REPLACE_SUBTREE` mới parse contract, chưa thực thi | Medium | Implement bằng TDD cùng undo/redo command reducer | Open — Phase 1 |
| TD-005 | Phase 0 | Web/worker scaffold chưa có behavioral tests | Low | Thêm tests khi Phase 1/3 tạo behavior thực tế | Open — phase owner |

Không xóa technical debt đã đóng; chuyển trạng thái sang `Closed` và ghi phase/ngày xử lý.

---

# 29. Progress Log

| Ngày | Phase | Thay đổi | Kết quả kiểm chứng | Người cập nhật |
|---|---|---|---|---|
| 2026-07-21 | Phase 0 | Tạo kế hoạch tổng thể, workflow ASCII, phase gates và update protocol | Review nội dung tài liệu; chưa có code/test | AI Agent |
| 2026-07-21 | Phase 0 | Scaffold monorepo; đóng băng Design Document/command/registry contracts; thêm ADR, wireframe, API contract và threat model; sửa lint/type narrowing | `pnpm lint`, `pnpm typecheck`, `pnpm test` (44/44), `pnpm test:coverage`, `pnpm build` đều pass; executable package statement coverage >=80% | AI Agent |
| 2026-07-21 | Cross-phase | Đổi tên sản phẩm thành ZenUI và npm workspace scope thành `@zenui` | Chạy lại lint, typecheck, test và build sau rename | AI Agent |

Mỗi phiên triển khai có thay đổi đáng kể phải thêm một dòng vào bảng này.

---

# 30. Quy trình bắt đầu một task phát triển

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

# 31. Ước lượng ban đầu

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

# 32. Handoff hiện tại

Trạng thái hiện tại: **Phase 0 completed; ready for direct Phase 1 implementation using TDD.**

Bước tiếp theo:

1. Bắt đầu Phase 1 từ renderer dùng Design Document và registry hiện có.
2. Viết RED tests cho command reducer/undo-redo, gồm thực thi `REPLACE_SUBTREE`.
3. Implement palette, selection và structured drag/drop với invalid-target rejection.
4. Thêm inspector text/color và persistence đơn giản theo user journeys đã chốt.
5. Implement deterministic standalone HTML compiler dùng chung render descriptors.
6. Thêm Playwright happy path cho kéo-thả -> sửa -> reorder -> undo/redo -> reload -> export.
7. Chạy đầy đủ Phase 1 gates và cập nhật Completion Record trước khi chuyển Phase 2.

> Sau khi hoàn thành từng bước hoặc phase, bắt buộc cập nhật file này trước khi chuyển sang bước tiếp theo.
