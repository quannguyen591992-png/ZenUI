# Internal API Contract v1

This document defines the v1 conventions and tracks the Phase 2 endpoint implementation status. Implemented routes still follow the same envelopes and authorization invariants.

## Conventions

- Base path: `/api/v1`.
- Resource names: plural, lowercase and kebab-case.
- JSON fields: camelCase.
- Every request body/query/path input is schema-validated.
- Every protected operation authenticates the session and scopes the resource to a workspace.
- Collection endpoints use cursor pagination when needed.

## Envelopes

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Safe user-facing message",
    "details": [
      { "path": "documentVersion", "code": "stale_document_version", "message": "Expected version 12" }
    ]
  }
}
```

No stack trace, SQL detail, provider token or provider response body is returned.

## Resources and implementation status

| Method | Path | Purpose | Key status | Phase 2 state |
|---|---|---|---|---|
| GET | `/api/v1/projects?workspaceId=:workspaceId` | List projects in an authorized workspace | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects` | Create project in an authorized workspace | 201/401/403/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId` | Read authorized project | 200/404/422 | Implemented |
| PATCH | `/api/v1/projects/:projectId` | Rename an authorized project | 200/403/404/422 | Implemented |
| DELETE | `/api/v1/projects/:projectId` | Soft-archive an authorized project | 200/403/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId/document` | Read the validated current draft and version | 200/404/422 | Implemented |
| GET/PUT | `/api/v1/projects/:projectId/brief` | Read/save the editable onboarding brief | 200/401/403/404/409/422 | Implemented |
| POST | `/api/v1/projects/:projectId/design-direction-runs` | Admit one bounded content request and queue three server-owned directions | 202/401/403/404/409/422/429/503 | Implemented |
| GET/DELETE | `/api/v1/projects/:projectId/design-direction-runs/:runId` | Read redacted state or best-effort cancel a queued run | 200/401/403/404/409/422 | Implemented |
| GET | `/api/v1/projects/:projectId/design-direction-runs/:runId/events` | Stream redacted direction lifecycle via SSE | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/design-direction-runs/:runId/choose` | Atomically accept one server-owned direction | 200/401/403/404/409/422 | Implemented |
| POST | `/api/v1/projects/:projectId/commands` | Apply an atomic command batch | 200/401/403/404/409/422 | Implemented |
| GET | `/api/v1/projects/:projectId/revisions` | List immutable revisions | 200/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/revisions` | Snapshot the current server draft | 201/403/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/revisions/:revisionId/restore` | Restore into a new draft version | 200/403/404/409/422 | Implemented |
| GET | `/api/v1/projects/:projectId/generation-runs?workspaceId=:workspaceId&limit=:limit` | List recent redacted AI run metadata | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/generation-runs` | Admit and queue AI generation/edit | 202/401/403/404/409/422/429/503 | Implemented |
| GET | `/api/v1/projects/:projectId/generation-runs/:runId?workspaceId=:workspaceId` | Read one redacted AI run | 200/401/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId/generation-runs/:runId/events?workspaceId=:workspaceId` | Stream validated durable run status via SSE | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/exports` | Snapshot and queue immutable HTML artifact | 202/401/403/404/409/422/429/503 | Implemented |
| GET | `/api/v1/projects/:projectId/exports/:exportId?workspaceId=:workspaceId` | Read redacted durable export status | 200/401/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId/exports/:exportId/download?workspaceId=:workspaceId` | Download completed standalone HTML through authenticated BFF | 200/401/404/422/503 | Implemented |
| GET | `/api/v1/projects/:projectId/share-links?workspaceId=:workspaceId` | List redacted owner-managed share links | 200/401/403/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/share-links` | Create one immutable revision link | 201/401/403/404/422/429/503 | Implemented |
| DELETE | `/api/v1/projects/:projectId/share-links/:shareLinkId` | Disable one share link | 200/401/403/404/422 | Implemented |
| GET | `/s/:slug` on `SHARE_ORIGIN` | Render one active immutable revision publicly | 200/404/429/500 | Implemented |
| GET | `/api/v1/provider-connections/vercel?workspaceId=:workspaceId` | Read redacted Vercel connection state | 200/401/403/404/422 | Implemented |
| POST | `/api/v1/provider-connections/vercel/authorize` | Create one-time Vercel installation state/URL | 200/401/403/404/422 | Implemented |
| GET | `/api/v1/provider-connections/vercel/callback` | Consume OAuth callback, validate scopes and store encrypted token | 303/401/403/422/500 | Implemented |
| DELETE | `/api/v1/provider-connections/vercel?workspaceId=:workspaceId` | Revoke and disconnect Vercel | 200/401/403/404/422/503 | Implemented |
| GET/POST | `/api/v1/projects/:projectId/deployments` | List or deploy one immutable revision | 200/202/401/403/404/409/422/429/503 | Implemented |
| GET | `/api/v1/projects/:projectId/deployments/:deploymentId?workspaceId=:workspaceId` | Read one redacted deployment status | 200/401/403/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId/assets?workspaceId=:workspaceId` | List project assets plus workspace brand assets as redacted lifecycle DTOs | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/assets/uploads` | Accept one raw bounded JPEG/PNG/WebP upload and enqueue normalization | 202/401/403/404/413/415/422/429/503 | Implemented |
| GET | `/api/v1/projects/:projectId/assets/search` | Search the fixed Pexels adapter with redacted previews/result IDs | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/assets/imports` | Import one fixed-provider result ID; source URL is not accepted | 202/401/403/404/422/429/503 | Implemented |
| GET | `/api/v1/projects/:projectId/assets/:assetId` | Poll one authorized redacted asset lifecycle | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/assets/:assetId/derivatives` | Create one immutable bounded crop/resize derivative | 202/401/403/404/409/422/429/503 | Implemented |
| POST | `/api/v1/projects/:projectId/assets/:assetId/archive` | Soft-archive one project asset without deleting immutable bytes | 200/401/403/404/422 | Implemented |
| GET/PUT | `/api/v1/workspaces/:workspaceId/brand-kit` | Read or optimistic-save the owner-managed versioned Brand Kit | 200/401/403/404/409/422 | Implemented |
| POST | `/api/v1/projects/:projectId/brand-kit/apply` | Atomically apply one Brand Kit version to the expected draft version | 200/401/403/404/409/422 | Implemented |
| GET | `/a/:assetId` on exact `ASSET_ORIGIN` | Serve only integrity-checked ready WebP bytes without cookies/tenant metadata | 200/304/404/503 | Implemented |

## Stage 10B1 multi-page contract

Stage 10B1 keeps the existing project command endpoint as the only page/navigation mutation boundary; it does not add page CRUD routes that could bypass document validation.

- Reads accept Design Document v1 or v2. The shared parser losslessly and idempotently migrates v1 to canonical v2 in memory; mutable writes persist v2, while immutable v1 revision snapshots are not rewritten.
- V2 contains ordered pages with stable IDs and distinct roots plus bounded navigation items referencing page IDs. One Home page with slug `/` is mandatory.
- Page create/rename/slug/reorder/duplicate/delete and navigation updates are typed commands submitted to `POST /api/v1/projects/:projectId/commands` with `expectedVersion`; a batch remains all-or-nothing and increments the document version once.
- Internal links reference stable page IDs and optional fragments. The compiler resolves them to the current canonical route. Destructive commands return a safe validation/impact error rather than silently retargeting links.
- Slugs are canonical `/` or lowercase ASCII kebab-case paths, at most 80 characters/four segments. Reserved segments, dot traversal, percent-encoded separators/dots, backslashes, duplicate separators, query/fragment/control characters and normalization collisions are rejected.
- Fixed limits are 20 pages/navigation items, 500 total nodes, depth 12 per page and 1 MiB document JSON. Static publication is bounded to 20 HTML files, 2 MiB each and 8 MiB aggregate; deterministic ZIP export is capped at 10 MiB.
- Public Share serves both `/s/:slug` and validated `/s/:slug/:path*` from one immutable revision. Export is a deterministic ZIP and Deploy submits the same sorted static-site files. Queue payloads remain local IDs only.

## Optimistic document writes

Request:

```json
{
  "expectedVersion": 12,
  "commands": []
}
```

- The server compares `expectedVersion` with the current draft version.
- A mismatch returns HTTP 409 with `stale_document_version`.
- A command batch is all-or-nothing.
- One accepted batch increments the version once.
- Revision list/create responses expose only `{ id, documentVersion, source, summary, createdAt }`. `documentVersion` lets Simple mode reuse the immutable snapshot matching the latest saved server version; document snapshots, project IDs and creator metadata remain server-only.

## Authorization invariant

```text
Authenticated user
       |
       v
Workspace membership ---- no ----> 404/403 without resource detail
       |
      yes
       v
Project belongs to workspace ---- no ----> 404
       |
      yes
       v
Permission for operation ---- no ----> 403
       |
      yes
       v
Execute resource operation
```

Read operations use 404 to avoid tenant enumeration. Auth.js sessions use HTTP-only, secure, same-site cookies. Every state-changing project route enforces an exact trusted `Origin` policy before parsing the body or invoking repository mutation; missing, `null` or foreign origins return safe HTTP 403 `invalid_origin`. The trusted origin is configured server-side with `APP_ORIGIN`.

## AI generation runs

Create request:

```json
{
  "workspaceId": "uuid",
  "requestId": "uuid",
  "mode": "generate | edit-page | edit-selection",
  "prompt": "Create a focused product landing page",
  "expectedVersion": 12,
  "selectedNodeId": "heading-1"
}
```

- `selectedNodeId` is required only for `edit-selection` and must exist in the authorized current document.
- `requestId` makes retries idempotent per project.
- Admission uses Redis atomic user/workspace windows and a workspace daily token reservation. A denial returns HTTP 429 with `Retry-After` and either `ai_rate_limit_exceeded` or `ai_budget_exceeded`.
- Accepted work returns HTTP 202 and a `Location` header for the durable run resource. Queue failure marks the durable run failed and returns safe HTTP 503 `queue_unavailable`.
- Runs expose only status, repair count, provider/model identifiers, usage totals, safe error code, revision ID and resulting document version. Prompt and raw provider output are never returned.
- SSE sends `event: status` frames validated by the shared event schema, heartbeat comments, and closes on `completed`/`failed` or client abort. The server polls durable PostgreSQL state, so reconnect does not depend on ephemeral Pub/Sub history.
- Successful completion compares the original expected version, persists one canonical document increment, one immutable `source=ai` revision and one usage record in one transaction. A stale result fails without overwriting the draft or creating a revision.
- Image changes are validated again against the server-configured HTTPS hostname policy. A denied host returns HTTP 422 `invalid_image_host`; the allowlist itself is not returned to AI repair output or browser errors.

## Contextual AI proposals

Stage 7 moves user-facing AI editing from direct apply to durable reviewable proposals:

- `POST /api/v1/projects/:projectId/ai-proposals` accepts `workspaceId`, idempotent `requestId`, `action=request|refine|try-another`, optional `intent=standard|remix-section|replace-media|style|layout|composition`, `expectedVersion`, optional `selectedNodeId`, bounded prompt, up to three allowlisted `feedbackCodes` for `refine`, and replacement proposal ID where required. Scope and generation mode are derived server-side from the authorized current document; browser-authored scope, commands and proposal documents are rejected. Media/style require an exact element, while layout/composition require the exact selected top-level section.
- Every proposal stores a private bounded lineage snapshot (maximum eight turns) with original request, immutable target/scope, context fingerprint, prior proposal IDs, rejected candidate IDs and structured feedback. Refine/Try another reuse that accepted-base context; worker semantic resolvers receive only the original request and bounded feedback required for the current turn. Lineage, feedback internals, prompts and fingerprints are not returned by public proposal DTOs.
- `GET` collection/item and SSE event routes return only redacted proposal lifecycle, canonical plain-language scope, summary and the validated proposed document when ready. Prompt, commands, provider/model/token/repair metadata and raw provider output are not returned in Simple mode.
- The worker reuses generation admission, BullMQ and AI Core but completes a proposal snapshot without changing the current draft, version or revisions.
- `POST .../:proposalId/accept` is the only apply authority. It revalidates the exact stored command batch against the current version/scope, verifies the result equals the reviewed snapshot and atomically updates one draft version plus one AI revision. Duplicate Accept is idempotent; stale acceptance returns 409 without overwrite.
- `POST .../:proposalId/discard` and `POST .../:proposalId/cancel` are mutation-free for the accepted document. Refine/Try another create replacement proposals against the same accepted base and only supersede the prior proposal after the replacement is ready.
- Every mutation enforces exact trusted Origin, Auth.js session, workspace RBAC and tenant-not-found semantics. Queue payloads contain local IDs only.

The legacy generation-run read surface remains compatible for existing audit history, but production Web submissions use proposals rather than worker-completion direct apply.

## Guided Brief and design-direction runs

Prepare request:

```json
{
  "workspaceId": "uuid",
  "requestId": "uuid",
  "expectedVersion": 1,
  "round": 0,
  "brief": {
    "description": "ordinary-language idea",
    "offer": "what is offered",
    "audience": "who it serves",
    "primaryGoal": "one main outcome",
    "cta": "visible next action",
    "tone": "desired character",
    "brandDetails": "optional notes",
    "mustHaveSections": ["introduction", "benefits", "contact"]
  }
}
```

- Only onboarding projects and members with `mutateDocument` permission may save a brief, prepare directions, cancel or choose. Exact trusted Origin is required for every mutation; cross-tenant resources use not-found semantics.
- One prepare/remix action reserves one bounded budget and queues local IDs only. Queue attempts are one; this lane has zero automatic semantic repair and zero transient provider retry, so one action cannot silently become multiple paid model calls.
- Provider output is a strict content blueprint only. It cannot choose node IDs, raw style/theme/layout IDs, HTML/CSS/JavaScript or arbitrary URLs. The server owns versioned direction contracts and materializes exactly three validated documents all-or-nothing.
- Public run DTOs contain lifecycle, safe error and exactly three `{ id, name, character, rationale, document }` directions after completion. Provider/model/prompt/usage/content-blueprint/storage details are redacted.
- Preparing, viewing, replacing and cancelling directions do not mutate the current document, version or revisions. Choose accepts only a server-owned direction ID, revalidates current run/version/document, applies one `REPLACE_DOCUMENT` transaction and atomically creates one AI revision plus the onboarding-to-accepted transition.
- Duplicate Choose for the same accepted direction is idempotent. Stale, failed, cancelled or superseded sets cannot be selected; browser-supplied documents and preset IDs are rejected.

## Image assets and Brand Kit

- Upload mutation uses raw request bytes, not unbounded multipart parsing. Query metadata includes validated workspace/request/scope/filename/default-alt; `Content-Length`, declared MIME and stream length are checked before durable work is queued.
- Search responses expose only fixed-provider result ID, dimensions, preview URL, alt suggestion and safe attribution. Import accepts the result ID rather than any source URL. Queue jobs contain only local asset/project/workspace/user IDs.
- Asset lifecycle DTOs expose only opaque ID, scope, source kind (`upload|pexels|generated|derivative`), status, ready dimensions/bytes/content type, default alt, safe attribution/error, archive state and timestamps. Source/object keys, checksum, generated prompt/bytes/model metadata, provider download URL/body and credentials remain server-only.
- Guided creation resolves one shared bounded media set (Hero plus at most three content slots) for all directions. The worker tries configured image generation once per slot, then fixed-provider Pexels import, then returns `null` so materialization keeps the safe fallback. Deterministic run+slot request IDs make retries idempotent and the public document receives only ready opaque asset IDs.
- Derivatives accept normalized crop fractions and bounded output dimensions. They create a new asset ID, never overwrite the parent and become selectable only after `ready`.
- Command writes may replace legacy remote image props with canonical `{ assetId, alt, decorative }`. Deletion uses JSON-safe `null` patch values; the command layer interprets `null`/`undefined` as property removal before full document validation.
- Brand Kit save is owner-only and optimistic by kit version. Optional logos must be ready workspace assets; colors pass syntax/contrast validation and fonts come from the allowlist. Apply requires expected Brand Kit/document versions and persists one atomic command transaction.
- Public asset delivery is host-guarded and cookie-free. It returns only ready integrity-checked `image/webp` with exact length, strong ETag, immutable cache, `nosniff` and cross-origin resource policy; malformed/non-ready/wrong-host IDs use uniform 404.

## Secure HTML exports

Create request:

```json
{
  "workspaceId": "uuid",
  "requestId": "uuid",
  "expectedVersion": 12
}
```

- Exact trusted `Origin`, Auth.js session, workspace membership and `mutateDocument` permission are checked before snapshot/enqueue.
- `requestId` is idempotent per project. The repository snapshots the validated canonical draft at exactly `expectedVersion`; stale requests return HTTP 409.
- Shared Redis user/workspace windows return HTTP 429 with `Retry-After`. Accepted work returns HTTP 202 and `Location`; queue failure moves the durable run to safe failed state and returns HTTP 503.
- Status responses contain only run/project IDs, state, expected/document version, safe error, timestamps and `{ bytes, checksum, contentType, routeCount }`; document snapshot and object-storage key are never public.
- Completed downloads are tenant-scoped and proxied by the BFF with fixed filename `zenui-export.zip`, `Content-Type: application/zip`, `Content-Length`, checksum ETag, `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- The worker compiles every validated route from the immutable snapshot, authorizes and integrity-checks every referenced owned WebP, emits depth-correct relative `assets/<assetId>.webp` paths with CSP `img-src 'self'`, creates a sorted deterministic path-safe ZIP within the 10 MiB budget and uploads it to a private S3-compatible key. The ZIP contains no runtime asset origin or private object key and never executes user code.

## Public revision sharing

Create request:

```json
{
  "workspaceId": "uuid",
  "revisionId": "uuid",
  "requestId": "uuid"
}
```

- Only `manageProject` members can list, create or disable share links. Mutations enforce exact `APP_ORIGIN` before body parsing, and cross-tenant resources use not-found semantics.
- `requestId` is idempotent per project. The server creates a 32-character base64url slug from 24 random bytes and pins it to a revision belonging to that project. Phase 5 creates persistent links (`expiresAt: null`), while the nullable database field keeps future expiry policy migration-free.
- Management responses contain only link ID, revision ID, public URL, derived status (`active | disabled | expired`), expiry and timestamps. They never return workspace/project IDs, raw document snapshots or storage metadata.
- Redis atomically limits create requests per user/workspace. HTTP 429 includes `Retry-After`; production has no process-local fallback.
- Public `GET /s/:slug` and `/s/:slug/:path*` are accepted only on exact `SHARE_ORIGIN`, which must use a hostname different from `APP_ORIGIN`. They do not authenticate, read editor sessions or accept tenant IDs; malformed or traversal-like paths fail with uniform 404.
- Active links synchronously compile the requested canonical route from the immutable revision with the shared deterministic compiler. Structured internal page links receive the share-slug prefix. Responses are standalone script-free HTML with CSP in header/meta, `X-Robots-Tag: noindex, nofollow, noarchive`, `no-store`, `no-referrer`, `nosniff`, restrictive Permissions Policy and no `Set-Cookie`.
- Malformed, missing, disabled, expired or wrong-host links return generic HTTP 404. Public view limits use keyed hashes rather than raw slug/IP Redis keys and return generic HTTP 429.

## Vercel connection and immutable deployment

- Vercel is the only Phase 6 provider. External installation uses a 256-bit one-time Redis state bound to user/workspace/return path, exact redirect URI and the server-only client secret. Vercel does not document PKCE for this integration flow.
- The callback exchanges the one-time code only after atomic state consumption, validates exact configuration/team and minimum `read-write:deployment`, `read-write:integration-configuration` and `read-write:project` permissions, then encrypts the access token with AES-256-GCM and tenant/connection/configuration-bound AAD.
- Connection DTOs return only local ID, provider, redacted status and timestamps. Configuration/team IDs, scopes, token and ciphertext never reach the browser. Disconnect revokes provider configuration before clearing ciphertext; transient revoke failures retain the encrypted record for retry.
- Deployment create requires owner `manageProject`, exact trusted Origin, `confirmed: true`, explicit `preview | production` target and a revision belonging to the project. `requestId` is unique per project, so retries/double-click return one durable run and enqueue once.
- Deployment queue payloads contain local IDs only. The worker reads the immutable revision snapshot, authorizes each referenced ready project/workspace asset, fetches private WebP bytes, verifies exact length and SHA-256, compiles depth-correct relative `assets/<assetId>.webp` paths with `img-src 'self'`, uploads one deterministic private bundle and sends validated HTML (`utf-8`) plus WebP (`base64`) files to Vercel. No runtime `ASSET_ORIGIN`, private object key, user build command or generated JavaScript is sent.
- Với target `production`, Vercel có thể bảo vệ generated deployment URL dù production domain vẫn public. Worker chỉ hoàn tất deployment bằng exact canonical alias `${providerProjectName}.vercel.app` khi Vercel trả alias đó cùng `target=production` và `aliasAssigned=true`; không suy đoán alias và không trả generated URL cho nút Mở/Sao chép. Target `preview` tiếp tục dùng URL riêng của deployment.
- Statuses are `queued -> uploading -> building -> ready`, with safe failure from non-terminal states. Public status contains local ID, revision, provider/target/status, allowlisted error and validated `https://*.vercel.app` URL only.
- Redis applies shared user/workspace deployment admission. Provider create is never automatically retried after an ambiguous network outcome; polling and known transient status requests are bounded. Production requires PostgreSQL, Redis/BullMQ, private S3-compatible storage, a Vercel Integration and encryption secrets.
