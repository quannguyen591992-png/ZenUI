# ADR-0010: Encrypted Vercel OAuth and immutable static deployment boundary

**Date**: 2026-07-22  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

ZenUI must deploy one selected revision without exposing provider credentials or coupling browser state to an external release. Vercel's external Integration flow returns a one-time code and configuration scope, while deployment creation and status polling use bearer-authenticated REST APIs.

## Decision

Use a 256-bit one-time Redis OAuth state bound to user/workspace/return path, then validate the Vercel configuration and minimum deployment/configuration scopes before encrypting the access token with AES-256-GCM and tenant-bound AAD. A BullMQ worker compiles the immutable revision, stores a private deterministic artifact, creates one static Vercel deployment and polls bounded status to a redacted durable state.

## Alternatives Considered

### Store a Vercel personal token
- **Pros**: Simpler setup.
- **Cons**: Manual secret handling, broad/unclear lifecycle and no installation revoke semantics.
- **Why not**: The accepted product decision requires OAuth and minimum scopes.

### Deploy the current draft from the browser
- **Pros**: Fewer backend records.
- **Cons**: Mutable, unauditable, exposes provider access to the client and breaks idempotency.
- **Why not**: Deployment must pin an immutable revision.

### Retry Vercel create requests automatically
- **Pros**: Masks transient network errors.
- **Cons**: A timeout may occur after the provider accepted the request, creating duplicates.
- **Why not**: Ambiguous outcomes require a new explicit user-confirmed request.

## Consequences

### Positive
- Provider tokens remain encrypted and server-only.
- Deployment state, revision/artifact checksum and idempotency are durable and tenant-scoped.
- The worker never runs arbitrary generated JavaScript or user build commands.

### Negative
- Production requires a configured Vercel Integration, Redis/BullMQ, PostgreSQL, S3-compatible storage and encryption-key operations.
- Polling adds bounded worker occupancy; webhook/reconciliation hardening remains later work.

### Risks
- Lost/rotated encryption keys make credentials undecryptable; a key-rotation ceremony belongs to Phase 7.
- Queue crash/dead-letter reconciliation, provider webhooks and production capacity testing remain Phase 7.
