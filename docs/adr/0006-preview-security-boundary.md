# ADR-0006: Separate-origin preview and no arbitrary generated JavaScript

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

AI and user-controlled design content must be rendered interactively without gaining access to editor sessions or secrets.

## Decision

Host previews on a separate origin in a sandboxed iframe. Exchange only schema-validated `postMessage` events with exact origin checks. MVP output contains generated HTML/CSS but no arbitrary generated JavaScript.

## Alternatives Considered

### Same-origin iframe
- **Pros**: Simpler development.
- **Cons**: Expands XSS impact to authenticated editor data.
- **Why not**: Violates the trust boundary.

### Arbitrary script sandbox
- **Pros**: Rich interactions.
- **Cons**: Requires code-execution isolation, egress and resource controls.
- **Why not**: Not required for static landing-page MVP.

## Consequences

### Positive
- Smaller XSS and credential-exfiltration surface.
- Preview bridge can be audited and tested independently.

### Negative
- Generated pages have limited custom interactions.

### Risks
- Origin mistakes and CSP regressions are mitigated by dedicated security tests in Phase 4.
