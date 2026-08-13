# ZenUI private-beta incident runbook

Use safe aggregate IDs from the incident system, not user/project/job IDs in shared chat or metrics. Never paste prompts, documents, bearer links, raw URL queries, provider bodies, tokens, ciphertext, artifact keys or database URLs.

## Service not ready / database unavailable

1. Stop new beta invitations and inspect aggregate readiness/alert state.
2. Verify managed PostgreSQL health, connection pool saturation and migrations.
3. Do not reset/drop or restore over production. If recovery is required, follow `backup-restore.md` into a new target first.
4. Re-enable traffic only after readiness is stable and tenant-isolation smoke checks pass.

## Redis unavailable / queue backlog / expired leases

1. Admission should fail closed; do not switch to process-local production queues or rate limits.
2. Check Redis persistence/noeviction and BullMQ depth/oldest age.
3. Reduce admission, not durability. Run bounded recovery and inspect count-only outcomes.
4. Generation active crashes fail safely; exports may requeue before side effects; deployments with provider IDs reconcile. Never automatically replay ambiguous provider create.

## Worker crash

1. Confirm operations listener and worker processes stopped/started cleanly.
2. Run one recovery sweep; verify terminal protection and attempt caps.
3. Check for storage/provider errors and reconcile deployments without POST create.
4. Preserve failed metadata until reconciliation/manual review completes.

## Object store unavailable

1. Pause export/deployment admission and verify private bucket credentials/configuration.
2. Do not expose object keys or use public bucket fallback.
3. Retry only idempotent puts after readiness returns. Object cleanup requires a durable database candidate and must not delete referenced artifacts.

## Provider auth/rate/outcome unknown

1. Auth failure: disconnect/re-authorize; do not log the token.
2. Rate/transient: respect provider bounds and backoff; do not create retry storms.
3. Outcome unknown: lookup exact correlation. Zero/multiple matches stay manual; one match attaches and polls. Reconciliation never POSTs create.

## Token budget near/exhausted

1. Confirm PostgreSQL usage ledger and Redis reservation counters.
2. Reject new AI work safely; do not raise limits without owner approval and measured cost.
3. Reconcile failed-before-provider reservations when implemented; ledger remains authority.

## Credential key compromise

1. Stage a new key version and readers, then follow `credential-key-rotation.md`.
2. Re-encrypt in bounded compare-and-swap batches; verify old count zero before retirement.
3. Revoke affected provider connections where required. Never expose plaintext/ciphertext in evidence.

## Customer Leads capability incident

Customer Leads is implemented as managed Share intake plus encrypted project Inbox and remains `In review` pending owner local-live acceptance. Editor Canvas, isolated Preview, visual-only Share links and standalone ZIP must still never submit.

1. Disable the affected Share link to stop new intake. If Editor Preview, isolated Preview, ZIP or a link whose management DTO reports `leadFormsLive: false` submits, treat it as a security regression and stop the affected surface.
2. Verify visual-only output has no `action`/`method` and keeps `form-action 'none'`, `script-src 'none'` and `connect-src 'none'`. For a live managed Share, verify only `form-action` names the exact `SHARE_ORIGIN`; script/connect policies must remain `none`.
3. Inspect only bounded technical evidence. Never paste visitor values, raw IP, full URL, bearer Share slug, lead/binding/tenant ID, ciphertext, IV, auth tag, key version, database URL or encryption key into logs, metrics, tickets or chat.
4. For suspected authorization leakage, deny traffic first, then verify owner/editor permissions, viewer denial, project/workspace not-found isolation and authorization-before-decrypt. Do not use plaintext database inspection as product acceptance evidence.
5. For suspected key exposure, preserve encrypted records, stage a new Lead key version, keep old versions readable during controlled rotation and do not retire a version until bounded verification proves no record depends on it.
6. For retention failure, keep intake disabled if the disclosed 90-day promise cannot be met. Verify `LEAD_RETENTION_INTERVAL_SECONDS` and `LEAD_RETENTION_BATCH_SIZE`, run the bounded repository purge with count-only evidence and confirm the worker emits only `lead_retention_failed`/`worker_error` on failure.
7. Reopen only after focused public POST/receipt, authorization/decrypt, Inbox/contacted, retention and visual-only compiler/Preview/ZIP regression tests pass. Email forwarding, ad-hoc plaintext stores and CRM/webhook workarounds are forbidden.

## Share origin/CSP or image-policy regression

1. Disable affected share links and stop share/deploy admission.
2. Verify exact share/preview host isolation, CSP `img-src` exact sources, no scheme wildcard and no shared cookie domain. Preview and ZIP Lead Forms must stay visual-only with `form-action 'none'`; managed Share may name only exact `SHARE_ORIGIN` when an active immutable binding exists.
3. Confirm the HTTPS image allowlist and compiler/preview policies match. Allowlisted remote hosts still see viewer IP; `Referrer-Policy: no-referrer` must remain consistent with the visual-only baseline.
4. Run focused cross-browser share/preview/form/axe tests before reopening.
