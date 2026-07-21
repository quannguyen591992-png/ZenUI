# ADR-0003: Google Gemini behind an LLM provider adapter

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

The product needs structured design generation and edit operations but must not couple business contracts to one model SDK.

## Decision

Use Google Gemini as the first provider behind an `LLMProvider` interface. Treat every provider response as untrusted and validate schema plus document semantics server-side.

## Alternatives Considered

### Provider calls directly in routes
- **Pros**: Fewer abstractions.
- **Cons**: Model errors, usage and structured output leak into application logic.
- **Why not**: It blocks testing and later provider replacement.

### Multiple providers in MVP
- **Pros**: Immediate fallback.
- **Cons**: Doubles evaluation and operational scope.
- **Why not**: One adapter implementation is enough for MVP.

## Consequences

### Positive
- Mockable AI tests and normalized errors/usage.
- Provider replacement does not change Design Document contracts.

### Negative
- Adapter capability differences require explicit handling.

### Risks
- Malformed or injected output is mitigated by minimal context, strict schemas, semantic validation and atomic apply.
