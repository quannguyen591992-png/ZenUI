# ADR-0005: Vercel as the first deployment provider

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

Users need one-click deployment without expanding MVP into several provider integrations.

## Decision

Integrate Vercel first through a deployment adapter. Deploy immutable revisions with idempotent jobs; keep OAuth credentials encrypted and server-only.

## Alternatives Considered

### Netlify
- **Pros**: Strong static-site fit.
- **Cons**: Adds a second ecosystem while Next.js/Vercel is the selected platform.
- **Why not**: One provider is sufficient.

### Internal static hosting
- **Pros**: Full control.
- **Cons**: Creates hosting operations and abuse responsibilities.
- **Why not**: It distracts from the builder.

## Consequences

### Positive
- Clear MVP deploy path and URL lifecycle.
- Adapter leaves room for future providers.

### Negative
- OAuth/API availability is an external dependency.

### Risks
- Duplicate deploys and leaked tokens are mitigated by idempotency, encryption, redaction and least privilege.
