# ADR-0009: Separate-host public sharing of immutable revisions

**Date**: 2026-07-22  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

A public share URL is a bearer capability and must not expose editor sessions, tenant metadata or a moving draft. Phase 5 also needs disable semantics that take effect immediately without depending on public object storage or a worker.

## Decision

Serve `/s/:slug` only on a configured `SHARE_ORIGIN` whose hostname differs from `APP_ORIGIN`. Each unguessable 192-bit slug pins one immutable revision; the public route performs a database lookup and synchronously compiles that snapshot with the shared deterministic compiler into noindex, no-store, script-free HTML. Authenticated owner-only APIs create, list and disable links with exact-Origin checks, workspace RBAC and Redis admission.

## Alternatives Considered

### Share the current draft
- **Pros**: No revision selection step.
- **Cons**: Output changes silently and races autosave.
- **Why not**: Violates immutable sharing and auditability.

### Publish a public S3 object
- **Pros**: Cheap static delivery.
- **Cons**: Revocation/cache invalidation and public object policy add storage lifecycle scope.
- **Why not**: Phase 5 can safely reuse bounded synchronous compilation; public artifacts can be reconsidered after measured load.

### Serve share on the editor hostname
- **Pros**: Simpler routing.
- **Cons**: Browser sends host-scoped editor cookies and expands the public rendering boundary.
- **Why not**: Public viewers must not receive or depend on editor credentials.

## Consequences

### Positive
- Draft changes cannot alter an existing share.
- Disable is enforced on the next request with `no-store` responses.
- Public output has no React runtime, generated JavaScript or mutation controls.

### Negative
- Every share view performs a database read and bounded compile.
- Production needs separate DNS/origin configuration and must avoid shared cookie `Domain`.

### Risks
- Slug guessing is mitigated by 192-bit entropy and public Redis limits.
- `noindex` is defense-in-depth, not authorization; anyone with the URL can view while active.
- Remote image hosts can still learn viewer IP addresses; proxy/packaging remains Phase 7 policy work.
