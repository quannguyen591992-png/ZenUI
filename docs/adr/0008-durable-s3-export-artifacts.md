# ADR-0008: Durable snapshot exports with BullMQ and private S3 artifacts

**Date**: 2026-07-22  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

Exporting current browser state directly cannot provide immutable, retryable or tenant-audited artifacts. Phase 4 needs standalone HTML that remains tied to one canonical document version and can later feed share/deploy without exposing object-storage credentials.

## Decision

Create a durable export run that transactionally snapshots the authorized canonical document at an exact optimistic version. Queue only IDs through BullMQ; the worker compiles with the shared deterministic compiler, enforces a byte limit and uploads to a private deterministic S3-compatible key. The browser reads redacted status and downloads through an authenticated BFF proxy.

## Alternatives Considered

### Browser-only export
- **Pros**: No queue or object storage.
- **Cons**: Uses mutable local state, cannot recover or audit, and cannot be reused by deploy.
- **Why not**: It violates the immutable artifact contract.

### Public or presigned object URL
- **Pros**: Less bandwidth through the BFF.
- **Cons**: Expands URL leakage and storage-policy surface.
- **Why not**: MVP prioritizes tenant authorization and key secrecy over direct object delivery.

## Consequences

### Positive
- Export is immutable, idempotent and reusable by later deployment work.
- Object keys and credentials remain server-only.
- Compiler and preview consistency has one source of truth.

### Negative
- Production export requires PostgreSQL, Redis/BullMQ and S3-compatible storage.
- The BFF proxies artifact bytes.

### Risks
- Queue/storage outages return safe durable failures; deeper dead-letter/recovery/load tuning remains Phase 7.
- Remote HTTP(S) images are referenced, not packaged, so availability/privacy limitations remain documented.
