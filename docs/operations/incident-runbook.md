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

## Share origin/CSP or image-policy regression

1. Disable affected share links and stop share/deploy admission.
2. Verify exact share/preview host isolation, CSP `img-src` exact sources, no scheme wildcard and no shared cookie domain.
3. Confirm the HTTPS image allowlist and compiler/preview policies match. Allowlisted remote hosts still see viewer IP.
4. Run focused cross-browser share/preview/axe tests before reopening.
