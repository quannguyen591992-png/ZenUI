# Phase 0 Threat Model

## Scope

Assets:

- Auth.js session and workspace membership.
- Design Documents and immutable revisions.
- User prompts and Gemini responses.
- Vercel OAuth credentials and deployment artifacts.
- Share links and public preview content.
- AI/deployment usage budget.

## Trust boundaries

```text
+---------------- User browser ----------------+
|                                              |
|  +---------------- Editor ----------------+  |
|  | Authenticated; no provider secrets     |  |
|  +-------------------+--------------------+  |
|                      | HTTPS                 |
+----------------------+-----------------------+
                       v
+---------------- Application boundary ----------------+
| Auth / workspace authorization / schema validation   |
|                                                       |
|    +------------------+      +--------------------+    |
|    | PostgreSQL       |      | Queue / workers    |    |
|    | tenant data      |      | bounded jobs       |    |
|    +------------------+      +----------+---------+    |
+-----------------------------------------+--------------+
                                          |
                         +----------------+----------------+
                         |                                 |
                         v                                 v
               +------------------+             +------------------+
               | Google Gemini    |             | Vercel API       |
               | untrusted output |             | encrypted OAuth  |
               +------------------+             +------------------+

Separate browser origin:

Editor <---- validated postMessage ----> Sandboxed Preview
 auth cookies                            no editor credentials
```

## Data flow: AI generation/edit

```text
User prompt
    |
    v
Length/rate/policy validation
    |
    v
Minimal context builder ----> redact secrets
    |
    v
Google Gemini
    |
    v
Untrusted structured output
    |
    v
Zod schema -> semantic/tree/URL/limit validation
    |
    +---- invalid -> bounded repair (max 2) -> safe failure
    |
    v
Atomic command transaction
    |
    v
New document version/revision
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Prompt injection requests forbidden actions | Unauthorized changes/data exposure | Fixed system policy, minimal context, typed operation allowlist, no secret in prompt | 3 |
| Malformed model output | Broken document/editor crash | Strict schema, semantic validator, atomic apply, bounded repair | 0/3 |
| AI creates unsafe URL | XSS/data exfiltration | HTTP(S)/internal URL allowlist and compiler escaping | 0/4 |
| AI cost loop | Cost/availability | Atomic Redis user/workspace rate window, daily token reservation, provider timeout, bounded retry/repair, PostgreSQL usage ledger | 3 |

Phase 3 implementation boundary:

- The browser submits prompt and scope to an authenticated exact-Origin API; it never receives the Gemini key or raw model response.
- `@zenui/ai-core` builds minimal registry/theme/page-or-subtree context under a byte budget and treats user/document text as untrusted data, not policy.
- Gemini structured output is parsed through strict Zod contracts, semantic document/registry checks and the command transaction layer. Server-owned command IDs, source, project ID and document version are never trusted from model output.
- Selection edits may only target the selected subtree and may not change theme or outside nodes. Scope escape becomes a safe failed run.
- Invalid output gets at most two repair attempts. Provider auth/validation errors fail fast; transient errors have a separate bounded retry budget and timeout.
- Durable `generation_runs` and `usage_records` are workspace-scoped. Legacy direct-apply completion atomically updates one optimistic document version and creates one immutable AI revision; stale completion preserves the current draft.
- Stage 7 user-facing editing uses a proposal delivery lane: worker completion stores validated commands, an isolated proposed snapshot and usage only. It cannot update the accepted draft or create a revision. Public proposal DTOs omit prompt, commands, provider/model/token details and raw output.
- Accept is the sole proposal apply authority: an authenticated exact-Origin transaction re-reads the tenant-scoped ready proposal/current draft, validates captured scope/version, replays stored commands, compares the canonical result with the reviewed snapshot, then performs one draft increment and one AI revision. Snapshot mismatch, scope escape, stale version, duplicate race, cancelled/discarded state or late worker completion fail closed with no partial mutation.
- Refine/Try another rematerialize against the accepted base rather than chaining unaccepted mutations. Durable `proposal-lineage-v1` is tenant-scoped, bounded to eight turns and stores no chain-of-thought/provider body; target, scope and context fingerprint are immutable. Public DTOs redact lineage, original request and feedback internals. Cancel/discard and mode/sheet transitions do not create commands, revisions or autosave effects.
- Co-designer rollout fails closed: `disabled` executes no v2 calls; `shadow` deterministically samples planner-only observation while v1 remains authoritative and UI-hidden; `opt-in` is required for active v2 lanes. Operations metrics use fixed-cardinality enums and aggregate counts only, excluding prompts, bytes, IDs, object keys, credentials and provider bodies.
- Redis admission uses one Lua transaction over TTL-scoped user/workspace/token keys. Production has no process-local rate-limit or mock-provider fallback.
- BullMQ carries a strict job schema with run ID as `jobId`; the worker has bounded concurrency, SDK retries disabled, redacted error logs and `executesUserCode: false`.
- SSE authenticates every connection, reads durable PostgreSQL status and emits only schema-validated status/usage/safe error metadata; prompts, secrets and provider bodies are excluded.
- The deterministic mock provider/in-process processor requires the existing non-production E2E guard and cannot activate in production.

## Data flow: preview

```text
Validated Design Document
          |
          v
Shared deterministic renderer/compiler
          |
          v
Separate-origin iframe with sandbox + CSP
          |
          +---- no arbitrary generated JavaScript
          |
          v
Bridge script owned by application
          |
          v
Exact origin + event schema validation
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Preview reads editor cookie/storage | Account compromise | Separate registrable origin, no shared cookies, no token in URL/message | 4 |
| Forged `postMessage` | Unauthorized editor action | Exact origin/source check and discriminated event schema | 4 |
| Generated HTML/script executes | XSS/exfiltration | No generated script, output escaping, strict CSP, iframe sandbox | 4 |
| Remote image tracks viewer | Privacy leakage | HTTPS-only exact/subdomain hostname allowlist shared by validation/compiler/preview CSP, no credentials/custom ports/IP literals, `Referrer-Policy: no-referrer`; no proxy in beta | 4/7 |

Phase 4 implementation boundary:

- Local/E2E uses editor `localhost:3000` and preview `127.0.0.1:3001`; production must use a distinct hostname with no shared cookie `Domain`. A port difference alone is not a cookie boundary, so matching hostnames are rejected by server configuration.
- The preview iframe uses only `allow-scripts allow-same-origin`; it does not grant forms, popups, downloads, top navigation or device permissions. `allow-same-origin` is acceptable only because the configured document is cross-origin and exact-Origin messaging requires a stable origin.
- `@zenui/preview-bridge` requires protocol version, UUID channel, strict discriminated payload, exact `event.origin`, exact iframe/parent `event.source`, and matching channel. Parent posts only to exact `PREVIEW_ORIGIN`; wildcard targets and `null` origins are rejected.
- Preview headers use deny-by-default CSP, app-owned script, nonce-bound dynamic stylesheet, exact `frame-ancestors`, `no-referrer`, `nosniff`, restrictive Permissions Policy and `no-store`; no cookie is set.
- The browser-safe renderer creates nodes with DOM APIs and text content. Generated HTML, event handlers, JavaScript and raw CSS are not accepted; validator + registry relationship checks precede render.
- Standalone export uses the same canonical render plan, deterministic stylesheet and SHA-256 CSP style hash. The portable artifact has `script-src 'none'`, resolves owned images through relative same-site paths with `img-src 'self'`, has no runtime origin dependency and has a bounded byte size.
- Durable exports snapshot one authorized version, run through BullMQ and a worker with `executesUserCode: false`, authorize every referenced project/workspace asset, recheck exact byte length and SHA-256, package exact WebP bytes, and are stored under a private deterministic S3-compatible key. Browser responses and artifact HTML never expose object keys, credentials, `localhost` or `127.0.0.1`; authenticated BFF download is bounded and `no-store`.
- Phase 7 requires `REMOTE_IMAGE_HOST_ALLOWLIST` at web, worker and preview startup. Images are HTTPS only; entries are exact hosts or explicit `*.example.com` subdomain rules. Validation normalizes case/trailing dots and rejects credentials, custom ports, localhost and IP literals. Compiler/preview CSP uses the same exact sources rather than scheme wildcards.
- The local visual-demo policy may add only the exact CDN hosts `images.unsplash.com` and `images.pexels.com`; it does not permit provider-domain wildcards, `source.unsplash.com` or arbitrary HTTPS. The browser fetches these images directly, so this mode adds no application-server SSRF request path. Gemini receives only the approved hostnames as generation capability metadata, and server validation remains authoritative.
- Stage 4 replaces that residual production path with the asset-import boundary below. Legacy URL documents remain readable during migration, but all newly generated production documents must store opaque ZenUI asset IDs.

Export threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Object-store credential/key exposed | Artifact compromise | Server-only S3 credentials, private deterministic keys, BFF proxy, redacted DTO/logging | 4 |
| Oversized export/download | Memory or bandwidth abuse | 1 MiB document limit, compiler artifact limit, Redis admission, persisted byte metadata and exact download length | 4 |
| Export races newer draft | Wrong artifact | Transactional snapshot at exact optimistic version; job reads immutable snapshot | 4 |
| Forged export access | Cross-tenant disclosure | Auth/RBAC/project ownership on create, status and download; not-found semantics | 4 |
| Cross-project, archived, non-ready or corrupt owned asset | Tenant disclosure or broken public artifact | Project/workspace publication lookup, ready/non-archived gate, private object fetch and exact length/SHA-256 recheck before storage/provider calls | 10B1 |
| Local runtime/object key compiled into public artifact | Images resolve only on owner machine or leak internals | Relative same-site asset paths, `img-src 'self'`, package exact WebP bytes, regression scan for localhost/loopback/object keys | 10B1 |
| Generated Vercel deployment URL exposed as public address | Visitors hit Vercel Authentication instead of public production site | Production completes only with exact Vercel-confirmed `${providerProjectName}.vercel.app` alias; generated URL remains preview/protection-scoped | 10B1 |

## Data flow: production image import and delivery

```text
Gemini image query + alt text
          |
          v
Fixed Pexels provider adapter
          |
          v
Validated provider result ID + attribution + source URL
          |
          v
Worker secure importer
  URL structure / exact host / DNS A+AAAA global-only
  fixed-provider no-redirect fail-closed transport
  timeout / declared+streamed bytes / MIME+magic
          |
          v
Sharp bounded decode -> auto-rotate -> resize
  strip metadata -> deterministic WebP -> SHA-256
          |
          +---- failure -> safe asset code + omit optional image
          |
          v
Private S3-compatible object + ready PostgreSQL asset
          |
          v
Design Document stores random opaque assetId
          |
          v
Runtime: exact cookie-free ASSET_ORIGIN /a/<assetId>
          |                         Publication worker
          v                         authorize + length/SHA-256 recheck
Canvas / Preview / Share            |
                                    v
                              Export / Deploy bundle
                              relative assets/<assetId>.webp
```

Stage 4 security invariants:

- Only the fixed server-side provider adapter can introduce a source URL. Browser, model and BullMQ payloads cannot submit an arbitrary URL; queue jobs carry local durable IDs only.
- Pexels credentials, S3 credentials, raw provider bodies and source download URLs stay server/worker-only and are absent from Design Documents, public DTOs, queue data and logs.
- Every hop is HTTPS without userinfo, custom port, fragment, localhost or IP literal. Hostnames are normalized and matched against an exact source-host policy before DNS resolution.
- All A and AAAA answers must be globally routable. A single private, loopback, link-local, carrier-grade NAT, documentation, benchmark, multicast, reserved, unspecified or IPv4-mapped-private answer rejects the hop; mixed public/private answer sets fail closed.
- Stage 10A uses the runtime TLS stack with the original exact allowlisted hostname and certificate/SNI verification after fail-closed A/AAAA classification. The fixed-provider adapter rejects every redirect instead of following it. If a future adapter permits redirects or supplies a custom transport, it must pin a validated address, preserve original hostname/SNI and revalidate each hop before replacing this stricter policy.
- Declared length is an early-rejection aid, not authority. A streaming byte counter and total/per-hop deadlines remain mandatory for absent, false or slow Content-Length responses.
- Only JPEG, PNG and non-animated WebP inputs are accepted when HTTP MIME and magic bytes agree. SVG, GIF, unknown/polyglot, malformed raster and oversized decoded geometry fail before persistence.
- Sharp uses a hard decoded-pixel limit, strips all source metadata, auto-rotates and emits a bounded deterministic WebP. Normalized byte length and SHA-256 are persisted and rechecked at delivery.
- Private object storage remains non-public. The public route resolves only a random ready asset ID, validates exact asset host before data access, and reveals no workspace/project/object key/provider internals.
- Asset responses are cookie-free and immutable with exact `image/webp`, content length, strong ETag, `nosniff` and cross-origin resource policy. Invalid, missing and non-ready IDs use uniform not-found semantics; storage integrity/unavailability uses a safe service error.
- Import errors are allowlisted and redacted. Optional image failure falls back to no image without consuming Gemini repair/retry budget or issuing another model request.
- Guided Directions use one strict `design-directions-v2` planner envelope per explicit prepare/remix action. It contains one shared content blueprint with one Hero `query`/localized `alt`, exactly three unique feature-media intents (`feature-1`, `feature-2`, `feature-3`), and exactly three direction entries containing only allowlisted preset-ID proposals. The model cannot submit a URL, Pexels result ID, media key, object key, owned asset ID, credential, raw style/token, SVG, HTML/CSS/JavaScript, node/ID, mutation or publication instruction.
- Duplicate allowlisted preset IDs may reach the server resolver, but unknown IDs, missing/duplicate media slots and authority-bearing fields fail strict parsing. ZenUI deterministically substitutes duplicate, recently displayed or structurally similar choices from its server-owned catalog using bounded brief/round ordering. It never calls Gemini again for repair, never relaxes within-gallery diversity and exposes at most three previous allowlisted preset IDs from the same workspace/project as exclusions.
- The worker generates stable private keys `shared-hero`, `shared-feature-1`, `shared-feature-2` and `shared-feature-3`. A conforming run requires exactly four media intents, resolves them in batches of at most two, tries bounded generated bytes first, then the fixed provider adapter and secure importer, and materializes the same successful opaque ready asset IDs into all three directions.
- Generated bytes cross the same hostile-image boundary as uploads/imports: bounded MIME/magic/pixels/bytes validation, metadata stripping, WebP normalization, private immutable object storage and integrity metadata. Prompt, exclusions, content/visual plan, enhanced prompt, raw bytes, model/provider metadata and source object keys are server-only and excluded from document/public DTO/queue/log surfaces.
- The hybrid image resolver is optional and fail-soft: generation safety/quota/auth/timeout or provider/storage/import failure cannot fail the three-direction run. Each media intent gets at most one generated attempt and one Pexels fallback; a failed feature slot is omitted without an empty media panel, Hero may keep the server-owned geometric placeholder, and reload/resize/direction switch does not issue provider calls.
- Planner authority remains asymmetric: Gemini may propose shared copy, three allowlisted preset IDs and bounded media query/alt text; ZenUI exclusively owns final preset resolution, custom Design System tokens, section variants/rhythm, nodes/IDs, assets, document validation and every mutation/publication action.
- Preparing, remixing or resolving media stores only transient validated snapshots and does not mutate the accepted document, project version or revisions. Only explicit **Choose this direction** revalidates one server-owned snapshot and applies atomic command-layer `REPLACE_DOCUMENT`; stale, duplicate or forged choices fail closed.
- Manual or contextual replacement requires an exact user-selected image node or server-owned media slot. The API derives `replace-media` server-side from target + bounded language and rejects section/page targets. Preparing an owned asset does not mutate the accepted document; only explicit apply/Accept emits validated command-layer `UPDATE_PROPS` or atomic `REPLACE_SUBTREE`, preserving history, optimistic version checks and tenant authorization.

### SSRF and hostile-image test matrix

The matrix is an implementation gate for `@zenui/asset-core`; every row requires a deterministic test with injected DNS/transport/storage and no external network access.

| Case | Required result | Verification point |
|---|---|---|
| HTTPS provider URL on exact approved image host | Accept URL and continue to DNS | Normalized exact-host policy; no suffix/prefix confusion |
| HTTP, FTP or protocol-relative URL | Reject before DNS | HTTPS-only parser |
| URL with username/password, fragment or custom port | Reject before DNS | URL-structure validation |
| `localhost`, trailing-dot spoof, Unicode/confusable or disallowed host | Reject before DNS | Canonical hostname and exact allowlist |
| IPv4, bracketed IPv6 or numeric/encoded IP literal | Reject before DNS | Host syntax guard |
| DNS returns loopback/private/link-local/CGNAT/reserved IPv4 | Reject hop | Global-address classifier |
| DNS returns loopback/ULA/link-local/multicast/reserved IPv6 | Reject hop | Global-address classifier |
| DNS returns IPv4-mapped IPv6 for a denied IPv4 range | Reject hop | Mapped-address normalization |
| DNS returns mixed public and denied answers | Reject entire hop | Fail-closed all-answer policy |
| DNS returns a denied or mixed answer set | Reject before download request | Injected resolver/global-address classifier |
| TLS certificate does not match original hostname | Reject connection | Runtime TLS hostname/SNI verification remains enabled |
| Any provider redirect, including approved-host or relative targets | Reject without following | Fixed-provider `redirect: manual` fail-closed policy |
| Redirect to HTTP, userinfo, custom port, disallowed host or IP | Reject without a next request | No-redirect policy plus URL guard tests |
| Future transport proposes redirect support | Must revalidate URL/host/DNS, pin address and preserve hostname/SNI before adoption | ADR/security review and deterministic transport tests required |
| Connect/header timeout | Abort with safe timeout error | Per-hop deadline |
| Body stalls after headers / slow stream exceeds total deadline | Abort stream with safe timeout error | Total deadline independent of chunks |
| Content-Length exceeds input cap | Reject before body read | Declared-length early bound |
| Content-Length absent or lower than actual bytes | Abort exactly at streamed-byte cap | Streaming counter is authoritative |
| Empty body | Reject as invalid image | Minimum content/magic validation |
| Allowed MIME and matching JPEG/PNG/WebP magic | Continue to bounded decode | MIME plus signature agreement |
| Allowed MIME with mismatched signature | Reject before decode | Content-confusion guard |
| Generic/unknown MIME with otherwise valid raster | Reject | Exact MIME allowlist |
| SVG, GIF, animated WebP or unknown/polyglot input | Reject | Raster type/animation policy |
| Truncated or malformed raster | Reject with safe decode error | Sharp failure mapping; no raw exception/body |
| Decoded pixel count exceeds limit (decompression bomb) | Reject during bounded decode | Sharp `limitInputPixels` and metadata dimensions |
| Width/height exceeds configured dimensions | Resize within policy or reject when impossible | Bounded geometry contract |
| EXIF orientation and embedded ICC/EXIF/XMP metadata | Correct orientation; output contains no source metadata | Auto-rotate and metadata-stripping assertions |
| Normalized WebP exceeds output byte cap | Reject before storage | Post-encode byte bound |
| Successful normalization | Store exact WebP once with SHA-256 and private immutable key | Store boundary arguments and checksum |
| Object-store write fails or returns inconsistent metadata | Mark safe failure; do not mark ready | Durable state transition and cleanup policy |
| Worker loses lease/crashes during import | Recover only through bounded durable claim semantics | Attempt/lease repository tests |
| Invalid, missing, queued, importing or failed public asset ID | Uniform 404 without storage read or tenant metadata | Public route state gate |
| Ready row but object length/checksum differs | Safe 503; never serve corrupted bytes | Delivery integrity verification |
| Request uses editor/foreign host instead of exact asset host | Reject before database/object access | Host/origin boundary test |
| Successful public delivery | Exact immutable headers, no `Set-Cookie`, no source/provider/object metadata | Route response test |
| Provider, importer or storage error logging | Only allowlisted code and bounded operation labels | Secret/source URL/provider-body redaction scan |

## Data flow: public revision share

```text
Owner selects immutable revision
          |
          v
Exact-Origin + owner RBAC + Redis admission
          |
          v
Random 192-bit slug -> ShareLink (active)
          |
          v
Viewer on separate SHARE_ORIGIN
          |
          v
Active/unexpired lookup -> canonical compiler -> static HTML
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Share URL guessed | Public data disclosure | 192-bit random base64url slug, hashed link/viewer Redis limits | 5 |
| Share receives editor cookie | Account/session exposure | Separate hostname, exact share-host guard, no shared cookie Domain, no `Set-Cookie` | 5 |
| Disabled content remains cached | Revocation bypass | Database lookup per request and `Cache-Control: no-store, max-age=0` | 5 |
| Search indexing exposes link | Wider discovery | `X-Robots-Tag` plus robots meta `noindex, nofollow, noarchive`; noindex is not authorization | 5 |
| Draft changes public output | Content integrity loss | Link references immutable revision snapshot only | 5 |
| Tenant metadata leaked | Workspace enumeration | Public route accepts only slug; HTML/DTO omit project/workspace/revision IDs | 5 |

Phase 5 implementation boundary:

- Local/E2E uses editor `localhost:3000` and share `127.0.0.1:3000`; production requires a separate share hostname. Host-scoped editor cookies are not a port boundary.
- Management requires `manageProject`, exact `APP_ORIGIN`, workspace/project/revision ownership and safe 404 tenant isolation. Create is idempotent by project/request UUID; disable is terminal and idempotent.
- Public rendering does not call Auth.js, read session cookies or expose editor controls. It reuses the canonical compiler with `script-src 'none'`, strict CSP, no generated event handlers/raw CSS and bounded output.
- Raw bearer slugs and viewer IP/fingerprints are not logged or stored in Redis keys; keyed hashes are used for public admission.
- Links are persistent by default. `expiresAt` is nullable for future policy but Phase 5 has no expiry UI.
- Residual risk remains for remote HTTP(S) images: no-referrer suppresses page URL leakage but cannot hide viewer IP from the image host.

## Data flow: Vercel deployment

```text
User confirms revision
        |
        v
Authorization + idempotency check
        |
        v
Immutable export artifact
        |
        v
Queue job ----> encrypted server-only OAuth credential
        |
        v
Vercel API
        |
        v
Redacted status/error + deployed URL
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| OAuth token exposed | External account compromise | Server-only encrypted storage, write-only logs, redaction, revoke flow | 6 |
| Double deployment | Cost/confusion | Idempotency key unique per request/revision/target | 6 |
| Draft changes during deploy | Wrong release | Pin immutable revision and artifact hash | 6 |
| Overbroad OAuth scope | Larger blast radius | Minimum scopes and explicit user confirmation | 6 |
| OAuth state replay/CSRF | Attach attacker configuration | 256-bit Redis state, HMAC-hashed key, 10-minute TTL, atomic consume, bind user/workspace/return path | 6 |
| Ciphertext moved across tenant records | Credential misuse | AES-256-GCM AAD binds provider/workspace/connection/configuration/key version | 6 |
| Ambiguous create retry | Duplicate external deployment | No automatic create retry after timeout/network ambiguity; explicit new confirmed request only | 6 |
| Raw provider error leakage | Token/account metadata exposure | Zod provider boundary and allowlisted error codes only | 6 |

## Multi-page route and static-site boundary

Stage 10B1 compiles one immutable Design Document revision into a bounded static route manifest. Browser/API input never supplies filesystem paths or provider file names directly.

```text
Validated Design Document v1/v2 snapshot
                 |
                 v
Canonical page IDs + safe normalized slugs
                 |
                 v
Shared deterministic route manifest
       |              |              |
       v              v              v
Share deep path   ZIP Export   Vercel static files
```

| Threat | Impact | Required control | Owner stage |
|---|---|---|---|
| `../`, encoded slash/dot or backslash slug | Path traversal / overwrite | Shared canonical slug schema; derive output paths only after validation | 10B1 |
| Case/Unicode-equivalent routes | Ambiguous or shadowed content | ASCII kebab-case normalization plus canonical collision key | 10B1 |
| Reserved app/static route collision | Public route confusion | Deny fixed reserved segments and filenames | 10B1 |
| Cross-page node ownership | Orphan/cycle or wrong-page mutation | One distinct parentless root per page; every node reachable from exactly one root | 10B1 |
| Broken page-ID navigation/link | Dead deep link | Full-document reference validation and destructive impact preview; no silent retarget | 10B1 |
| ZIP slip / arbitrary provider file | File overwrite or publish escape | Sorted manifest paths derived from canonical slugs; reject absolute/dot paths before ZIP/provider calls | 10B1 |
| Page/file amplification | Memory, storage or provider abuse | 20 pages/files, 2 MiB/file, 8 MiB site and 10 MiB ZIP hard limits | 10B1 |
| Draft changes after publication | Public content drift | Share/Export/Deploy compile immutable revision/run snapshots only | 10B1 |
| Public share path probes | Resource/tenant disclosure | Exact share host, validated route lookup, uniform 404 and existing keyed admission | 10B1 |
| v1 snapshot rewrite | Loss of immutable history | Read-compatible lossless migration; never bulk-rewrite stored revisions | 10B1 |

## Workspace isolation

- Every protected table carries direct or derivable `workspaceId`.
- Resource services accept authenticated workspace context, not arbitrary client ownership claims.
- Cross-workspace access must fail before returning resource metadata.
- Provider connections belong to a workspace/user and cannot be referenced by another tenant.
- Phase 6 stores Vercel access tokens only as AES-256-GCM ciphertext with a random 96-bit IV, 128-bit authentication tag, explicit key version and tenant-bound AAD. Public APIs, queue payloads and logs never contain token, code, configuration/team ID, ciphertext, document or artifact key.
- Only owners with `manageProject` may connect/disconnect or create deployments. Every mutation checks exact `APP_ORIGIN` before body parsing; deployment pins a revision belonging to the authorized project and requires `confirmed: true`.
- Production OAuth state/rate/queue use shared Redis/BullMQ with no process-local fallback. Guarded in-process fake Vercel behavior remains unavailable when `NODE_ENV=production` or `ZENUI_E2E_ENABLED` is not true.
- Authorization integration tests are required in Phase 2 and Phase 6.
- Phase 2 project mutations require an exact `APP_ORIGIN` match before body parsing or repository access; missing, `null` and foreign origins fail with a safe 403.
- The Playwright-only identity route and PGlite runtime require both non-production `NODE_ENV` and `ZENUI_E2E_ENABLED=true`; identities are allowlisted, signed, expiring and stored in an HTTP-only same-site cookie. The route returns 404 when the guard is disabled.
- Local UI login is a distinct guarded boundary: `/api/local/session` and its logout route require non-production `ZENUI_LOCAL_AUTH_ENABLED=true`, exact `APP_ORIGIN`, a fixed bootstrapped owner identity and a signed expiring HTTP-only SameSite cookie. They return 404 in production and E2E mode, do not accept arbitrary identity/workspace/role, and validate callback paths to `/dashboard` or `/projects/<UUID>` to prevent open redirects.
- `/` is public and session-independent. `/dashboard` and project pages enforce a server-side runtime-session gate before rendering authenticated client surfaces; expired client sessions offer an explicit login link instead of infinite retries.

## MVP policy decisions

- Legacy images may use validated remote HTTPS URLs on the configured hostname allowlist during migration. Stage 4 generated production images use fixed-provider SSRF-safe import, private immutable storage and opaque ZenUI asset IDs; arbitrary URL proxy/upload remains forbidden.
- Contact Form is visual-only; no submission backend in MVP.
- Stage 10B1 Export is one deterministic bounded ZIP containing the complete immutable static-site route manifest; legacy v1 snapshots still compile as a one-route site.
- Share links are persistent by default, pinned to a revision and disable-able.
- Fonts come from a controlled allowlist; custom font upload is deferred.
- Design limits: 500 nodes, depth 12, serialized JSON 1 MiB.

## Residual risks

1. Legacy allowlisted remote HTTPS image documents can still reveal viewer IP and redirect/change content until migrated. Stage 4 asset URLs are intentionally public bearer references for generated public pages; they are not suitable for confidential media and need future deletion/retention policy.
2. Provider licensing/attribution requirements and API behavior can change; retain durable result/attribution metadata and require a separately authorized live Pexels acceptance gate before production enablement.
3. Provider model behavior can change; maintain regression fixtures/evals. Phase 3 deterministic contract tests do not replace an opt-in live Gemini smoke/evaluation with configured credentials.
4. Redis/BullMQ delivery is at-least-once; durable idempotent claiming and lease recovery must prevent duplicate asset/object side effects as well as existing generation/export/deployment effects.
5. SSE uses authenticated database polling for durable reconnect semantics; very high concurrent run volume will require measured polling/backpressure tuning.
6. Separate-origin asset/preview/share deployment configuration can regress; verify exact hosts, cookie absence, CSP and headers in E2E and deployment smoke tests.
7. Static HTML has limited interactions because arbitrary JavaScript is intentionally excluded.
