# AI website co-designer roadmap

## Capability

ZenUI giúp người không biết code đi từ một ý tưởng kinh doanh đến website responsive hoàn chỉnh: mô tả mục tiêu bằng ngôn ngữ tự nhiên, chọn một hướng thiết kế, tinh chỉnh theo section bằng hội thoại hoặc thao tác trực quan, xem trước thay đổi trước khi chấp nhận, rồi share hoặc publish mà không phải hiểu component hierarchy, CSS, breakpoint hay revision.

ZenUI giữ một structured, reversible and publishable engine ở bên dưới: Design Document vẫn là source of truth; mọi mutation vẫn qua command layer; Canvas, Preview, Share, Export và Deploy tiếp tục dùng deterministic renderer/compiler; AI không sinh raw HTML, CSS hay JavaScript tùy ý.

## Target user and product promise

Primary user:

1. Người không chuyên lập trình cần tạo landing page hoặc website giới thiệu nhanh.
2. Marketer, creator, mentor hoặc chủ doanh nghiệp nhỏ muốn tự kiểm soát nội dung và publish.
3. Developer và agency là secondary users, được phục vụ qua Advanced mode và output/handoff hiện có.

Product promise:

> **Mô tả ý tưởng. Cùng AI hoàn thiện. Xuất bản website.**

ZenUI không yêu cầu primary user học mental model của Webflow trước khi có kết quả. Trải nghiệm **Thiết kế trực quan** (`simple`) dùng brief, design directions, section actions và contextual AI; Components, Layers và Inspector vẫn tồn tại qua progressive disclosure trong **Chỉnh sửa chuyên sâu** (`advanced`). Quản lý các phiên bản bất biến và khôi phục website khả dụng ở cả hai trải nghiệm qua cùng server boundary.

## Research-informed direction

Nguồn tham khảo công khai:

- [Webflow](https://webflow.com/) cho thấy một website lifecycle platform mạnh với visual development, CMS, hosting, collaboration, analytics và optimization. Độ sâu CSS/classes/breakpoints/components là lợi thế cho professional teams nhưng tạo learning curve không phù hợp làm happy path cho primary user của ZenUI.
- [Claude Design](https://claude.com/product/design) đặt prompt-to-draft, nhiều design directions, contextual feedback, direct canvas manipulation và iterative refinement ở trung tâm. Trải nghiệm này gần với mục tiêu non-coder của ZenUI hơn, dù Claude Design tạo nhiều loại visual artifact và thường handoff sang công cụ khác để hoàn thiện/publish.

ZenUI không tuyên bố feature parity, không sao chép giao diện/thương hiệu và chưa đưa ra kết luận benchmark định lượng. Quyết định sản phẩm là lấy interaction model gần Claude Design, kết hợp với lợi thế riêng của ZenUI: website có cấu trúc, responsive, reversible và publishable ngay trong một sản phẩm.

## Current baseline

- Gemini Generate bị giới hạn bởi Blueprint v2; server sở hữu node IDs, layout, responsive rules và section materialization.
- Blueprint v2 hỗ trợ SaaS, course, agency, portfolio và product-launch intents; theme, mood, density; navbar/hero variants; logo cloud, stats, feature grid/bento/alternating rows, testimonials, pricing, FAQ, final CTA và footer.
- Editor có Components, Layers, Inspector, Canvas selection, drag/drop, responsive viewports, autosave, undo/redo và revisions.
- AI có generate, whole-page edit và selected-node edit nhưng hiện lộ ba mode kỹ thuật cho người dùng và apply trực tiếp document khi hoàn thành.
- Canvas/Preview responsive parity, standalone Export, immutable Share và owner-confirmed Deploy đã có deterministic/local gates.
- Local demo có thể browser-fetch ảnh từ exact Unsplash/Pexels CDN hosts. Production asset import/storage đã có ADR/security matrix nhưng runtime chưa triển khai.

## Roadmap pivot: old direction → new direction

| Prior direction | New non-coder-first direction |
|---|---|
| Blank prompt as the main starting point | Guided brief captures audience, goal, CTA, style and must-have content without requiring prompt engineering |
| Generate one page and refine it | Produce three bounded design directions, let the user choose or remix before committing |
| Primitive-first Components/Layers/Inspector | Section-first Simple mode; primitives move behind Advanced mode |
| User selects Generate/Edit page/Edit selection | One contextual AI composer infers scope from current selection |
| AI completion applies immediately; Undo is recovery | AI proposes an isolated change; user accepts, refines, tries another or discards |
| Node IDs, token counts, revision and provider language visible | Plain-language design actions and simplified Preview/Share/Publish; technical details remain available when useful |
| Infrastructure hardening is the immediate next step | Deterministic UX prototype and mentor/non-coder acceptance precede more production infrastructure |
| Compete through editor breadth | Differentiate through guided thinking, section remix, design explanation, audience lens and safe AI control |

## Historical delivery — completed foundation

### Stage 1 — Safe visual local demo

- Exact `images.unsplash.com` and `images.pexels.com` allowlist shared by generation validation, editor, preview, share, export and CSP.
- Gemini can return a hero image URL with descriptive alt text; an invalid image omits only the image and never triggers a paid repair.
- Local browser-direct images use no-referrer and no credentials. The CDN can still see viewer IP and content can change or disappear.

Exit evidence:

- A live Generate completed without repair under the configured token budget.
- Hero image rendered in Canvas and isolated Preview across responsive sizes without CSP or parity regression.

### Stage 2 — Blueprint v2 and section preset registry

- Strict Blueprint v2 supports five page intents and bounded theme, mood, density, navbar, hero and ordered section variants.
- Server-owned section preset registry/materializer covers logo cloud, stats, feature layouts, testimonials, pricing, static FAQ, final CTA and footer.
- Gemini selects typed content and presets rather than raw HTML/CSS; the server creates IDs/tree/styles and retains Blueprint v1 compatibility.
- Optional denied images are omitted safely and Generate keeps zero semantic repair by default.

Implementation evidence (2026-07-24): AI Core typecheck/lint and 23 focused tests passed; worker typecheck/lint and 18 focused worker tests passed. The later live acceptance below superseded the earlier open visual gate.

### Stage 3 — Design-system depth and renderer parity

Completed capabilities:

1. Shared Canvas/compiler viewport and style resolver.
2. Semantic button, link, heading, paragraph, badge and image rendering with keyboard-visible focus.
3. Page-intent-aware typography and bounded SaaS spacing.
4. Stable pricing order with Growth highlighted in place.
5. Bounded bento spans and balanced testimonial spotlight with deterministic mobile collapse.
6. Responsive hero image aspect ratio/crop/placeholder behavior.
7. Bounded 980/768/390 Canvas surfaces and matching isolated Preview viewport simulation.

Final gate (2026-07-24): live visual acceptance was received; `pnpm lint`, `pnpm typecheck`, `pnpm test`, serial `pnpm test:coverage`, `pnpm build` and `pnpm test:e2e` passed. Evidence covered 15 workspace lint/typecheck/build tasks, 381 unit/integration tests, 27 coverage tasks with every configured metric at or above 80%, and 48/48 Playwright journeys across Chromium, Firefox and WebKit. Six axe audits reported zero serious/critical violations. Durable `generation_runs` remained 26 with latest timestamp `2026-07-24T08:19:09.642Z`; the final gate made no Gemini request.

## Experience-led delivery sequence

### Stage 4 — Product experience reset and deterministic specification

**User-visible outcome**

A reviewable, deterministic prototype demonstrates the complete non-coder journey:

```text
Guided Brief
    -> Design Direction Gallery
    -> Section-first Editor
    -> AI Change Review
    -> Preview / Share / Publish
```

**Scope**

- Freeze the capability contract, primary persona and Simple/Advanced boundary.
- Replace the old editor wireframe with desktop/narrow wireflows for onboarding, direction choice, contextual section actions, proposal review and simplified publishing.
- Define plain-language UI vocabulary and progressive disclosure rules.
- Build a deterministic prototype using fixtures and existing renderer primitives; do not call Gemini.

**Non-goals**

- No production AI orchestration, provider call, asset importer, CMS or analytics.
- No removal of existing advanced editor capabilities.

**Exit criteria**

- Every screen/state in the happy path is specified, including empty/loading/error/cancel paths.
- Primary user never needs to understand container, node ID, breakpoint, token, revision or deployment provider.
- Advanced mode has an explicit entry/exit and preserves Components/Layers/Inspector access.
- Mentor reviews the deterministic prototype before Stage 5 implementation begins.

**Verification gates**

- Documentation consistency and accessibility review of the wireflow.
- Deterministic browser prototype at desktop/mobile with no external AI request.

**Completion evidence (2026-07-27)**

- Owner reported mentor acceptance and successful journey completion by one representative non-coder; no blocking friction was reported. Measured time/confidence were not supplied and are not inferred.
- Vietnamese-first UI contract is canonical at `docs/product/vietnamese-interface-contract.md`; current Web surfaces and deterministic prototype use Vietnamese while internal contracts and user-authored/generated website language remain stable.
- Web package tests/coverage/typecheck/lint/build passed, with 155 tests and coverage statements 86.03%, branches 80.80%, functions 88.96%, lines 90.97%. Full Playwright passed 57/57 across Chromium, Firefox and WebKit; existing axe gates remained at zero serious/critical violations. No live Gemini/Pexels/provider request was introduced by localization.

### Stage 5 — Guided Brief and Design Direction Gallery

**User-visible outcome**

A user describes their business in ordinary language, reviews a structured brief, then compares three meaningfully different website directions before choosing one.

**Scope**

- Brief fields: business/offer, audience, primary goal, CTA, tone/style, supplied brand details and must-have sections.
- Natural-language input can populate the brief, but every field remains directly editable.
- Generate one bounded content blueprint and materialize three server-owned combinations of theme/layout/preset; do not make three paid model calls.
- Show concise rationale plus desktop/mobile previews; support choose, regenerate directions and remix constraints.

**Non-goals**

- No free-form Figma canvas or arbitrary style generation.
- No promise that three directions are statistically unique; diversity must come from explicit bounded direction contracts.

**Exit criteria**

- A non-coder can finish the brief without prompt-engineering knowledge.
- Three directions preserve the same business goal/content requirements while differing visibly in layout, hierarchy and visual character.
- Choosing a direction creates one valid editable document; unchosen drafts do not pollute project history.

**Verification gates**

- TDD for brief/direction contracts and deterministic materialization.
- Fixture acceptance in Vietnamese and English across representative page intents.
- Browser journey covers brief edit, direction comparison, mobile preview and selection.

**Production completion evidence (2026-07-27)**

- Strict brief/content-only blueprint/direction contracts, additive onboarding persistence, one-call queue/worker/API lifecycle and atomic Choose are implemented. Existing projects remain accepted; newly created projects enter Guided Brief.
- Production Vietnamese Brief/Gallery preserves editable values, keeps current cards during replacement, renders exactly three server-owned directions with desktop/mobile previews and opens the existing Advanced editor only after Choose.
- AI Core 38, database 49, worker 36 and Web 168 tests passed. Workspace lint/typecheck/build passed 15/15. Stage 5 journeys passed in Chromium, Firefox and WebKit, including 390px and axe with zero serious/critical findings. Deterministic E2E asserted one provider-adapter call, no version/revision mutation before Choose and exactly one version/revision afterward.
- No live Gemini/Pexels/Vercel request was made. Aggregate database/worker branch coverage remains below the workspace 80% gate and is tracked as TD-010 rather than reported as green.

### Stage 6 — Section-first editor and progressive disclosure

**User-visible outcome**

The default editor lets a user work with meaningful website sections rather than layout primitives.

**Scope**

- Section select, reorder, duplicate, hide/show, delete and replace-layout actions.
- Contextual section toolbar with labels such as Rewrite, Try another layout, Move, Hide and More.
- Page Story outline uses purpose-oriented labels: introduce, explain value, build trust, handle objections, call to action.
- Components, Layers and Inspector move into explicit Advanced mode without losing their existing behavior.
- Responsive behavior remains automatic by default; viewport preview stays available.

**Non-goals**

- No pixel-coordinate editing or full CSS class system.
- No advanced animation timeline.

**Exit criteria**

- Simple mode happy path contains no primitive placement instruction such as “select a container”.
- All section actions remain commands with undo/redo, autosave and valid Design Document invariants.
- Switching Simple/Advanced mode does not alter document output.

**Verification gates**

- Component and command tests for every section action.
- Canvas/Layers/Inspector regression tests in Advanced mode.
- Cross-browser section-first E2E and accessibility audits.

**Production completion evidence (2026-07-28)**

- Accepted projects now enter a production Simple editor with ordered Page Story, purpose labels, section selection and command-backed reorder, whole-subtree duplicate, hide/show, guarded delete and deterministic replace-layout. The existing Components/Layers/Inspector/AI/Revisions surface remains available through an explicit confirmed Advanced transition.
- Simple and Advanced share one EditorState, command/history and autosave coordinator. Mode, viewport and narrow-sheet state are presentation-only; returning from a primitive selection maps back to its containing top-level section.
- Additive top-level `hidden` props preserve authored `display` layout. Canvas, shared browser renderer and standalone compiler use the same visibility rule, while Page Story keeps hidden sections recoverable.
- Rewrite remains an explicit disabled “Sắp có” action because contextual AI proposal review belongs to Stage 7. No Gemini, Pexels or Vercel call is part of Stage 6.
- Focused Stage 6 editor E2E passed 3/3 Chromium and 6/6 Firefox/WebKit, including the 390px Story sheet and focus restoration. Database coverage is 89.64/80.38/97.41/95.43, worker 93.33/82.06/92.98/96.41 and Web 84.49/80.38/83.58/89.25 (statements/branches/functions/lines); temporary Stage 5 Web exclusions were removed and TD-010 is closed.

### Stage 7 — Unified contextual AI and proposed-change review

**User-visible outcome**

The user selects a page, section or element and tells ZenUI what they want through one composer. ZenUI previews a bounded proposal before changing the accepted page.

**Scope**

- Remove the Generate/Edit page/Edit selection mode dropdown from the Simple-mode happy path; infer scope from selection and state it in plain language.
- Offer context-aware suggestions such as Shorter, More premium, Change layout, Improve CTA and Try another direction.
- Materialize AI output into an isolated proposed document/subtree.
- Review state supports before/after or proposal preview plus Accept, Refine, Try another and Discard.
- Only Accept applies the command transaction and creates autosave/revision effects.

**Non-goals**

- No silent apply, no automatic publish and no unrestricted model operations.
- No extra repair/provider request solely because an optional visual element failed.

**Exit criteria**

- Discard leaves document version/history unchanged.
- Accept applies exactly the reviewed proposal atomically.
- Refine retains proposal context without mutating the accepted document.
- Scope is always visible and selection escape is rejected safely.

**Verification gates**

- RED/GREEN proposal lifecycle, stale version, scope and no-mutation tests.
- Deterministic provider fixtures first; a capped credentialed smoke is a separately approved gate.
- Cross-browser before/after, accept/discard/refine journeys and axe audits.

**Production implementation evidence (2026-07-28)**

- Added canonical page/section/element scope derivation and isolated proposal materialization in AI Core. Stored provider operations remain constrained by the existing command allowlist, selected-subtree checks, registry validation and Design Document limits.
- Added additive durable proposal fields to generation runs and ADR-0013. Worker completion stores a ready proposal and usage only; it does not change the draft or create a revision.
- Added exact-Origin/RBAC proposal collection, item, SSE, Accept, Discard and Cancel routes. Queue payloads remain local IDs. Only Accept replays and verifies the reviewed commands/snapshot in one transaction and creates one AI revision.
- Enabled production Simple-mode contextual composer, Rewrite prompt shortcut, narrow Ask sheet and Current/Proposed review with Accept, Refine, Try another and Discard. Accepted Canvas state remains unchanged before Accept.
- Deterministic tests cover isolated materialization, scope escape, durable ready/discard/accept/stale behavior, worker proposal completion, redacted API behavior and component no-autosave lifecycle. Live Gemini/Pexels/Vercel remains separately authorized and was not part of this implementation gate.

### Stage 8 — Distinctive non-coder intelligence

**User-visible outcome**

ZenUI helps users reason about website effectiveness, not merely manipulate components.

**Scope**

- **Page Story Map:** explains each section's role and detects missing narrative steps.
- **Constraint-preserving Remix:** generates section alternatives while preserving accepted copy, CTA, brand and surrounding structure unless the user explicitly changes them.
- **Explain this design:** answers why hierarchy, placement, color or layout choices support the brief.
- **Audience Lens:** reviews clarity, trust, objections and CTA for the selected audience/goal.
- **Automatic mobile/content review:** flags overflow, excessive hero length, weak contrast, unclear CTA and missing trust evidence with actionable fixes.

**Non-goals**

- No claim that heuristic/AI review predicts conversion.
- No autonomous application of recommendations without user acceptance.

**Exit criteria**

- Every recommendation cites the relevant brief goal and page/section evidence.
- Remix invariants prove preserved constraints.
- Users can dismiss findings and the system does not repeatedly apply or re-open them without new evidence.

**Verification gates**

- Versioned deterministic eval set in Vietnamese and English.
- Mentor review and task-based usability test with representative non-coders.
- Zero serious/critical axe issues and no responsive/CSP regression.

**Production implementation evidence (2026-07-28; status `In review`)**

- Deterministic Site Intelligence v1 now derives a Page Story, evidence-grounded audience/content/mobile findings and four design explanations from the accepted Design Document and Website Brief. Review snapshots are version-bound and do not mutate the document.
- Remix requests capture protected copy, CTA, brand/theme and surrounding-structure fingerprints. The proposal repository revalidates these constraints both when a proposal becomes ready and again at Accept; explicit allowed changes remain narrowly typed.
- Durable per-actor dismissal state is tenant-scoped. The same evidence stays dismissed; changed evidence produces a new finding fingerprint and becomes reviewable without rewriting the old record.
- Production Simple mode exposes review, evidence focus, explanations, AI suggestion handoff and Remix through the existing proposal boundary. Guided onboarding now hands the accepted brief directly into the editor after Choose, so intelligence is available without reload.
- Technical gates passed: workspace lint/typecheck/build 15/15, 493 tests, all configured coverage metrics at or above 80%, bilingual `site-intelligence-eval-v1` 2/2, db:check, and the Guided production journey on Chromium/Firefox/WebKit 3/3 with zero serious/critical axe violations in the intelligence panel.
- Mentor/task-based usability acceptance was confirmed by the owner on 2026-07-28; no blocking friction was reported. Stage 8 is therefore marked Completed. No live Gemini/Pexels/Vercel request was made for this deterministic implementation gate.

### Stage 9 — Simplified publish and mentor acceptance

**Status: `Completed` (2026-07-28)**

**User-visible outcome**

A user previews and publishes the latest saved website without understanding revision/provider internals.

**Scope**

- Simple actions: Preview, Share and Publish latest saved version.
- Human-readable confirmation summarizes what becomes public and provides the destination URL/status.
- Advanced details can reveal immutable revision and provider target when needed.
- Preserve owner confirmation, immutable artifact and safe deployment boundaries underneath.

**Non-goals**

- No custom domains, complex environments or automatic deploy without confirmation in this stage.

**Exit criteria**

- First-time non-coder journey completes brief → direction → edit → review → publish without Advanced mode.
- Recovery/error copy is actionable and contains no internal error/provider terminology in the default surface.
- Mentor gives explicit acceptance against the intended product direction.

**Verification gates**

- Chromium/Firefox/WebKit critical journey, mobile/desktop screenshots and axe audit.
- Share/Export/Deploy regression tests prove immutable output and current security controls remain intact.
- Full lint/typecheck/test/coverage/build/E2E gate after acceptance.

**Production completion evidence (2026-07-28; status `Completed`)**

- Simple mode now exposes plain-language Preview, Share and Publish actions. Share and Publish reuse or create the immutable revision matching the latest safely saved server version; dirty/saving/offline/error/conflict states cannot start a new public action.
- Simple Share removes revision selection, explains link visibility/noindex behavior, supports copy/open and requires confirmation before disabling. Simple Publish summarizes project/CTA/public destination, requires explicit public confirmation, always sends the immutable production target and reveals provider/revision/status only inside collapsed Advanced details.
- Chỉnh sửa chuyên sâu retains HTML Export, technical document-version context, revision-selecting Share, target-selecting Vercel Deploy and the legacy AI assistant; manual named revision management and restore are also available in Thiết kế trực quan through the same immutable revision boundary. No existing security/developer capability was removed.
- TDD RED evidence covered the missing public `documentVersion`, missing Simple Share/Publish components and missing project-name handoff. Focused repository/Web tests are green; final Web coverage is 83.97/80.08/81.34/88.47 (statements/branches/functions/lines).
- The first-time Guided journey passed on Chromium/Firefox/WebKit 3/3, including latest-saved edit, isolated Preview, immutable Share and explicit production Publish without Advanced mode. Mobile 390px Share/Publish axe checks and focused Share/Export/Deploy security regressions passed.
- Workspace lint/typecheck/build passed 15/15; serial workspace tests passed 27/27 tasks with 502 tests; Web/database coverage remained above 80%; db:check and deterministic AI eval passed. Full cross-browser E2E exposed Advanced-flow and test-selector/persistence regressions, all were repaired; the definitive rerun passed 72/72 on Chromium/Firefox/WebKit.
- Owner confirmed that the mentor accepted the final simplified publishing experience on 2026-07-28 and reported no blocker. Stage 9 is therefore `Completed`. No live Gemini/Pexels/Vercel call was made; deployment evidence used the guarded deterministic E2E runtime.

### Stage 10 — Website lifecycle expansion

**Status: `Stage 10B1 In review` (Stage 10A completed 2026-07-29; Stage 10B1 implementation and all technical gates complete, including full cross-browser; mentor/non-coder acceptance remains open)**

The non-coder creation/publish loop is accepted. The owner selected two lifecycle tracks for Stage 10 and committed to implement them sequentially rather than opening all post-MVP candidates at once:

```text
Stage 10A — Image Asset Pipeline + Brand Kit
    ↓ accepted technical/product gate
Stage 10B1 — Multi-page Foundation
    ↓ accepted schema/migration/publication gate
Stage 10B2 — CMS + Structured Content
    ↓ accepted lifecycle gate
Stage 10 Completed
```

#### Stage 10A — Image Asset Pipeline + Brand Kit

User-visible outcome:

- Upload and privately store normalized JPEG/PNG/WebP assets.
- Search and import Pexels images through a server-owned adapter.
- Replace, non-destructively crop/resize and optimize images.
- Edit meaningful alt text or explicitly mark decorative images.
- Manage and preview a workspace brand kit containing owned logos, validated colors and approved heading/body fonts.
- Apply image and brand changes through command/proposal review with undo/redo; never mutate accepted content when a provider/worker merely completes.
- Render the same immutable owned asset on Canvas, isolated Preview, Share, Export and Publish.

Fixed boundaries:

- ADR-0012 remains authoritative: local-ID-only queue payloads, per-hop SSRF/DNS-pinned TLS validation, bounded raster decoding, deterministic WebP, private storage and a cookie-free asset origin.
- No arbitrary URL proxy, SVG/video/arbitrary font upload, browser-held provider credential or authenticated editor-cookie public asset route.
- Asset IDs are opaque; immutable revisions pin asset/brand values. Archive/reference-aware garbage collection must not break old public output.
- Stage 10A completes only after hostile-image/security tests, desktop/mobile cross-browser journeys, full quality gates and mentor/non-coder acceptance.

#### Stage 10B1 — Multi-page Foundation

User-visible outcome:

- Create, rename, reorder, duplicate and safely delete bounded pages.
- Manage navigation and safe unique routes in Simple mode.
- Preview deep links and Share/Export/Publish the complete immutable site.

Fixed boundaries:

- Design Document v2 ADR and lossless/idempotent v1 migration are required before implementation.
- One home page is mandatory; page IDs are stable; slugs are normalized and protected from traversal/reserved/collision cases.
- Internal links refer to page IDs and compile to deterministic static routes.
- Global document/node/depth/JSON and compiled route/file/byte budgets must be decided before RED tests; existing limits are not silently relaxed.
- Stage 10B1 completes only after migration, route-security, immutable multi-route publication, cross-browser/mobile/axe and mentor acceptance gates.

#### Stage 10B2 — CMS + Structured Content

User-visible outcome:

- Define bounded typed collections and manage reusable entries in a Simple CMS surface.
- Bind list/detail templates to typed fields and publish deterministic static routes for content such as a blog.
- Preview and recover from missing fields, broken bindings, slug collisions and publication budget errors without writing code.

Fixed boundaries:

- Collection schema/entry/release ownership ADR is required before implementation.
- Field types are bounded and validated; rich text/links are sanitized and no arbitrary HTML/JavaScript is accepted.
- Immutable releases pin collection schema, entry versions and templates; public output has no database/runtime dependency.
- Blog is a preset on generic collection contracts, not a one-off schema.
- Stage 10B2 completes only after migration/security/capacity, full static-publication, cross-browser/mobile/axe and mentor acceptance gates.

Entry/order rules:

- Stage 10A runtime is first. Stage 10B contracts may be designed early, but large runtime/schema mutations do not run in parallel with 10A.
- Stage 10B1 precedes 10B2 because CMS route generation depends on the multi-page schema/compiler/release boundary.
- Comments/approvals/shared design systems and analytics/experimentation/personalization/localization remain outside Stage 10.
- Phase 7 external live-provider/managed-topology gates remain an independent private-beta readiness track.

## Production asset implementation record

Production Asset Pipeline runtime was deferred by the 2026-07-27 product-priority pivot, re-opened on 2026-07-28 and reached its deterministic technical gate on 2026-07-29:

- [ADR-0012](../adr/0012-production-image-asset-boundary.md) remains the trust-boundary authority; [ADR-0014](../adr/0014-versioned-assets-and-brand-kit.md) records Stage 10A ownership/versioning decisions.
- `@zenui/asset-core`, additive PostgreSQL schema/repositories, fixed-provider/raw-upload APIs, BullMQ/Sharp/private-object workflow and exact cookie-free public asset route are implemented.
- New accepted image/logo references use opaque owned IDs. Legacy browser-direct allowlisted image URLs remain read-only migration compatibility and must not be described as production-private or immutable.
- Canvas, isolated Preview, Share, Export and Deploy use the same environment asset resolver. Simple mode provides upload/search/import, immutable crop presets, alt/decorative review and Brand Kit preview/save/apply.
- Deterministic hostile-image/security tests, configured coverage, build and 81 cross-browser E2E tests are green. No live Pexels/Gemini/Vercel call was made.
- Stage 10A is `Completed`: on 2026-07-29 the owner reported that the practical image/Brand Kit walkthrough was currently stable and requested progression; later defects remain follow-up work.
- Stage 10B1 is `In review` under [ADR-0015](../adr/0015-multi-page-document-and-static-site-boundary.md). Design Document v2/v1 migration, command-backed Page Manager/Navigation, active-route Preview/Share, deterministic ZIP Export and bounded multi-file Deploy are implemented. Fixed budgets remain 20 pages/navigation items, 500 total nodes, depth 12 per page, 1 MiB JSON, 80-character/four-segment slugs, 20 HTML files, 2 MiB per file, 8 MiB compiled aggregate and 10 MiB ZIP. Workspace lint/typecheck/test/coverage/build/db/eval/audit/diff/security gates are green, every configured coverage metric is at least 80%, and the definitive Playwright run passed 84/84 in 12.2 minutes across Chromium/Firefox/WebKit with 390px and axe serious/critical coverage. Mentor/representative non-coder acceptance remains open, so Stage 10B2 stays blocked.

## Product-wide invariants

- Design Document JSON remains the source of truth.
- User and AI mutations go through the same validated command layer.
- Simple mode changes presentation and workflow, not document correctness or security boundaries.
- Canvas, Preview, Share, Export and Deploy preserve renderer parity.
- AI proposals are visibly scoped, reviewable, reversible and never auto-published.
- Responsive output should work automatically before exposing manual breakpoint controls.
- No arbitrary generated JavaScript, raw CSS, build command or arbitrary URL proxy.
- Do not claim competitive superiority or conversion improvement without benchmark/user evidence.
