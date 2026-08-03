# ADR-0013: Durable AI proposals before accepted document mutation

**Date**: 2026-07-28  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

ZenUI's original generation pipeline applied a validated AI result directly to the current Design Document when the worker completed. Stage 7 introduces a non-coder co-design flow in which users must review Current versus Proposed and explicitly accept a change. A worker completion, SSE event, browser reload or replacement request must never become authority to mutate the accepted website.

The existing provider-neutral AI Core, Redis admission, BullMQ queue, PostgreSQL generation runs, validated DesignCommand transaction and immutable revisions already provide the required safety primitives. Creating a second AI job stack would duplicate cost, recovery and authorization boundaries.

## Decision

Extend durable generation runs additively with a proposal delivery lane and proposal lifecycle. The worker materializes and validates an isolated proposed document plus its exact command batch, stores those server-owned artifacts and marks the proposal ready. It does not update the project draft or create a revision.

Only the authenticated exact-Origin Accept action may atomically:

1. re-read the ready proposal and current authorized draft;
2. require the exact expected document version and captured scope;
3. replay and validate the stored command batch;
4. require the result to equal the reviewed proposed snapshot;
5. update the draft once, create one AI revision and mark the proposal accepted.

Discard, cancel, refine, try-another and failed/stale proposals never change the accepted document. Queue payloads continue to contain local IDs only. Prompt/raw provider output and stored commands are not public API fields.

## Alternatives Considered

### Keep direct apply and use Undo as review
- **Pros**: No database or API lifecycle change.
- **Cons**: The accepted website changes before user consent; revisions/autosave are polluted; stale or unwanted output becomes visible state.
- **Why not**: Contradicts D-024 and the accepted product rule “AI proposes, user decides.”

### Store proposals only in browser memory
- **Pros**: Small server change.
- **Cons**: Reload loses review state; browser becomes authority for proposal artifacts; multi-tab stale checks and durable cancellation are unreliable.
- **Why not**: Weakens trust, recovery and exact-accept guarantees.

### Create a separate proposal queue and repository stack
- **Pros**: Strong physical separation.
- **Cons**: Duplicates admission, provider, retry, lease, usage and recovery logic.
- **Why not**: The distinction is delivery authority, not provider execution; an additive lane is smaller and easier to audit.

## Consequences

### Positive
- Worker completion alone cannot mutate accepted website state.
- Current/Proposed review is durable, tenant-scoped and reload-safe.
- Accept is exact, atomic, idempotent and stale-safe.
- Existing AI Core, Redis/BullMQ and usage accounting are reused.

### Negative
- Generation run schema and lifecycle become more complex.
- Proposed documents and commands require bounded transient storage and cleanup.
- UI must handle preparing, ready, cancelled, stale and invalid-scope states explicitly.

### Risks
- Stored proposal artifacts could drift or be tampered with; Accept must replay commands and compare the canonical result to the reviewed snapshot.
- At-least-once jobs can finish after cancel; terminal proposal state must make late completion a no-op.
- Proposal snapshots may contain user content; retention cleanup must redact transient artifacts without deleting accepted revisions.
