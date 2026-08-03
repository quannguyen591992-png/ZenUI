# Phase 7 trust-boundary audit matrix

**Status:** Deterministic audit complete — 2026-07-23

This matrix turns the Phase 7 security review into testable boundaries. “Verified” means the relevant deterministic unit/integration/E2E evidence passed in the final Phase 7 completion gate. External live-provider acceptance remains separately recorded as skipped when credentials/configuration are unavailable.

| Boundary | Untrusted input / asset | Required controls | Deterministic evidence | Phase 7 status |
|---|---|---|---|---|
| Authenticated project APIs | Session cookie, workspace/project IDs, JSON command/input | Auth.js session, exact Origin before body/DB for mutations, strict Zod, RBAC, tenant-safe 404, optimistic version | `authorization.test.ts`, `project-api.test.ts`, `authenticated.spec.ts` | Verified |
| AI API → Gemini → command layer | Prompt, document text, provider output | Prompt treated as data, minimal context, fixed policy, no secrets, strict schema/semantic/relationship validation, subtree scope, bounded timeout/retry/repair, atomic apply | `ai-core.test.ts`, `prompt-context.test.ts`, `generation-api.test.ts`, `ai-generation.spec.ts`, TD-009 deterministic eval 6/6 | Verified; live Gemini skipped |
| Editor → preview origin | Design document, channel/origin/source events | Separate hostname, sandbox, exact source/origin/channel/schema, deny CSP, no editor credentials, no generated script | `preview-bridge.test.ts`, preview runtime tests, `secure-preview.test.tsx`, `preview-export.spec.ts` | Verified |
| Public share host | Bearer slug, viewer fingerprint, immutable revision | Separate hostname, exact host, no Auth.js cookie, slug entropy, hashed Redis keys, no-store/noindex, immutable revision, disable lookup on every request | share core/repository/API/UI tests and `share.spec.ts` | Verified |
| Export API/worker/object store | Version, queue job, document snapshot, artifact bytes | Auth/RBAC/Origin, immutable snapshot, local-ID queue job, private deterministic S3 key, compiler limit, BFF download, no-store, no user code | export core/repository/API/worker tests and `preview-export.spec.ts` | Verified |
| Vercel OAuth/deployment | OAuth state/code/token, configuration, provider response, revision/target | One-time hashed Redis state, owner RBAC, exact Origin/redirect, minimum scopes, AES-GCM tenant-bound AAD, immutable revision, redacted DTO/log/queue, no ambiguous create retry | deployment core/server/repository/API/worker/UI tests and `deployment.spec.ts` | Verified; live Vercel skipped |
| Queue/worker lifecycle | Redis/BullMQ delivery, stale job, worker crash | Local IDs only, durable lease + heartbeat, bounded attempt, side-effect-aware recovery, dead-letter safe code, terminal idempotency, graceful shutdown | repository/recovery/topology tests and safe failure-event test | Verified |
| Operations endpoints | Health probes, Prometheus scrape token | No-store, bounded timeout, aggregate readiness only, internal bearer constant-time check, fail closed, no tenant/resource labels | operations-core, web and worker operations tests; Prometheus configuration/rules validation | Verified |
| Remote images | User/AI-supplied image URL, viewer IP | HTTPS only, configured exact/subdomain hostname allowlist, reject credentials/ports/private literals/suffix confusion, same CSP source across outputs | schema/compiler/preview/share/export/deploy tests | Verified |
| Private beta access | OAuth profile email | Strict normalized server-side email allowlist, generic denial, defense in depth, E2E bypass only under existing non-production guard | auth/component tests and three-browser E2E | Verified; third-party OAuth live flow skipped |
| Backup/restore/retention | Database dump, encrypted credential, terminal metadata, artifacts | No secret logging, explicit non-production restore target, checksum, tenant/invariant verification, batched dry-run cleanup, no automatic project/revision deletion | Docker restore drill, retention tests and backup guard tests 3/3 | Verified for local deterministic topology |

## Redaction invariants

The following values are forbidden in public responses, queue payloads, metrics labels and routine logs unless a more restrictive internal encrypted-at-rest boundary explicitly requires them:

- OAuth access token/code, client secret, encryption key, ciphertext, IV or authentication tag.
- Prompt, raw model/provider response, Design Document, compiled HTML or artifact body/key.
- Provider configuration/team/deployment IDs.
- Share slug, raw viewer fingerprint, external URL query.
- User/workspace/project/request/job IDs in Prometheus labels.

Operator reports are count-only and pass through `@zenui/operations-core` strict schemas.

## Completion rule

No row may be marked complete from document review alone. Phase 7 completion requires relevant unit/integration/E2E evidence plus the final security scan. Live Gemini/Vercel checks require explicit credentials and must be recorded as skipped when unavailable.
