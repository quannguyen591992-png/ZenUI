# Vietnamese-first Interface Contract

Status: Accepted for the current MVP
Date: 2026-07-27

## Capability

ZenUI uses Vietnamese as the default and only product-interface language in the current MVP. A Vietnamese-speaking non-coder can understand onboarding, editing, AI status, recovery, preview, share, export and publish controls without relying on English product terminology.

## Fixed constraints

- All visible product copy, validation, loading/error/recovery states, live-region announcements, accessible labels, dialog titles and metadata use Vietnamese.
- Brand and technical standard names remain unchanged when translation would reduce clarity: ZenUI, Vercel, AI, HTML, JSON, SHA-256, OAuth.
- Internal component types, API fields, enum values, status/error codes, route names and package contracts remain stable English identifiers.
- User-authored content and AI output are not translated automatically. A website may use the language of its brief even though ZenUI chrome remains Vietnamese.
- Existing saved Design Documents are not migrated or rewritten. New projects receive a validated Vietnamese starter document.
- User-facing failures map internal codes to safe, actionable Vietnamese copy and do not expose raw provider/storage/database details.
- Public-share fallback responses and standalone page titles use Vietnamese while preserving no-store, noindex and CSP boundaries.

## Surfaces

- Public Landing Page, private-beta Login, authenticated Dashboard, local-development login/logout, authentication loading/error and private-beta guidance.
- Production editor and Advanced controls, including Components/Layers/Inspector vocabulary.
- AI generation/edit status, preview, revision, recovery and autosave.
- Share, HTML export and Vercel deployment.
- Deterministic non-coder prototype on desktop and narrow surfaces.
- Public read-only share fallback responses.

## Public access and authentication route contract

- `/` là Landing Page công khai và không yêu cầu database/session để render; trang này chỉ mô tả capability ZenUI hiện có.
- `/login` là điểm vào private beta. Production dùng GitHub OAuth + email allowlist; guarded local mode dùng fixed local owner đã bootstrap và signed HTTP-only cookie.
- `/dashboard` và `/projects/<projectId>` yêu cầu session, chuyển về `/login` với callback nội bộ đã validate khi chưa đăng nhập.
- Public registration, email/password, password reset và tự tạo workspace không thuộc phase này; CTA dùng “Yêu cầu quyền truy cập beta”, không hứa capability chưa có.

## Locale boundary

This slice intentionally does not add a multi-locale framework. Typed browser-safe mappings are used for the single-locale MVP. A future English toggle requires a separate product decision, locale routing/persistence contract and bilingual regression suite.

Stage 5 fixtures must still exercise Vietnamese and English briefs. The interface remains Vietnamese; generated website content follows the user brief.

## Usability acceptance evidence

The project owner reported on 2026-07-27 that:

- the mentor accepted the deterministic prototype;
- one representative non-coder completed the journey;
- no blocking friction requiring a prototype revision was reported.

No measured completion time or confidence score was supplied, so none is inferred or recorded.
