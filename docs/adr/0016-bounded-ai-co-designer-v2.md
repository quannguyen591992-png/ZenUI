# ADR-0016: Bounded AI Co-designer v2 planning and materialization

**Date**: 2026-08-04
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ZenUI's proposal-first assistant safely prepares copy edits and exact media replacement, but its deterministic keyword router and single generated-or-stock image path cannot reliably distinguish a process diagram, product UI, illustration or photograph. Expanding the assistant by accepting arbitrary model-authored document trees, CSS or code would weaken the structured Design Document, exact-scope validation and explicit Accept boundary established by ADR-0013. The next capability must improve semantic quality, multi-turn refinement and bounded layout assistance without granting the model mutation or publication authority.

## Decision

ZenUI implements AI Co-designer v2 as a versioned, feature-flagged planning layer. Deterministic guards establish an authorized target and reject forbidden actions; a provider-neutral structured planner may then emit only bounded intent/spec contracts. Server-owned materializers convert accepted specs into validated `DesignCommand` transactions and isolated proposal snapshots. Worker completion never mutates the accepted draft, selects a final candidate on the user's behalf or publishes a revision.

The initial authority matrix is:

| Intent | Maximum initial scope | Model output | Server-owned execution |
|---|---|---|---|
| `copy` | exact element | bounded existing text-prop edits | `UPDATE_PROPS` allowlist |
| `media` | exact image/media slot | visual brief and candidate preference | owned asset import/generation, semantic gate, exact media command |
| `style` | exact element | semantic style tokens only | allowlisted `UPDATE_STYLE` / `UPDATE_RESPONSIVE_STYLE` |
| `layout` | selected top-level section | recipe ID and bounded parameters | server-owned layout recipe preserving content/assets |
| `composition` | selected top-level section | composite template ID and preservation choices | bounded `REPLACE_SUBTREE` inside the selected section |

Page requests may produce an ordered review plan but cannot be silently materialized as one unrestricted whole-document change. Arbitrary HTML, CSS, JavaScript, code execution, external URLs, cross-page mutation, authentication, CMS mutation and publish/deploy remain outside model authority.

Media v2 uses a structured visual brief, bounded candidate generation and a provider-neutral semantic judge. Representation-incompatible fallback is forbidden: diagram, product-UI and illustration intents never silently degrade to a stock photograph. If every candidate fails technical or semantic gates, the proposal fails softly and the accepted document remains unchanged.

Rollout is fail-closed behind an explicit `AI_ASSISTANT_ROLLOUT_MODE`: `disabled` exposes and executes no v2 lane, `shadow` deterministically samples planner calls while keeping the v1 proposal authoritative, and `opt-in` is the only mode that permits `AI_ASSISTANT_V2_ENABLED`. Independent planner, media-judge, multi-candidate, style, layout and composition flags still require their prerequisites. Provider calls are admitted against separate text/image/judge budgets, and only transient provider failures may be retried. The v1 proposal lane remains the rollback path while v2 is disabled or shadowed.

Refinement state is durable but bounded. Each proposal stores allowlisted feedback codes and a private `proposal-lineage-v1` snapshot with the original request, immutable target/scope, context fingerprint and at most eight turns. Worker resolvers receive only the original request plus structured feedback needed for the current refinement; public proposal DTOs redact the lineage, provider context and prompts.

## Alternatives Considered

### Let the model generate a complete replacement document
- **Pros**: Broad creative freedom and fewer server materializers.
- **Cons**: Large prompts, difficult scope proofs, unstable output and a wider injection/code boundary.
- **Why not**: It makes model output an authority over the source of truth and conflicts with ADR-0001 and ADR-0013.

### Extend only the deterministic keyword router
- **Pros**: Cheap, predictable and easy to test.
- **Cons**: Cannot robustly infer representation, visual constraints or nuanced multilingual intent.
- **Why not**: It preserves the current failure mode where a technically valid image can be semantically unrelated.

### Use one generated image and fall back to the first stock result
- **Pros**: Lowest latency and implementation cost.
- **Cons**: No semantic comparison, poor no-people/process/product-UI handling and silent random fallback.
- **Why not**: Technical validity is insufficient for a co-designer; unsuitable fallback must fail softly.

### Enable all v2 lanes in one release
- **Pros**: Faster apparent feature completion.
- **Cons**: Couples planner, media, style, layout, data and UI migrations; rollback and attribution become difficult.
- **Why not**: Vertical, independently flagged slices provide safer evaluation and cost control.

## Consequences

### Positive
- Model reasoning improves intent and media relevance without gaining direct document authority.
- Exact scope, command validation, stale checks, proposal review and explicit Accept remain reusable invariants.
- Semantic media failures are visible and non-destructive instead of becoming unrelated stock content.
- Independent kill switches and accounting make quality, latency and cost attributable per lane.

### Negative
- The system gains additional versioned schemas, provider calls, durable candidate state and review UI states.
- Multi-candidate generation and judging increase latency and provider cost.
- Server-owned style/layout catalogs require deliberate product maintenance.

### Risks
- Planner or judge output may be malformed or injected; strict Zod parsing, deterministic context boundaries and server authorization remain authoritative.
- Judges may be confidently wrong; hard technical gates remain separate, evaluations measure false acceptance, and the user still chooses and accepts.
- Retries may duplicate cost/assets; per-run limits and deterministic run/brief/candidate idempotency keys are required before media v2 rollout.
- Feature flags may form invalid combinations; runtime configuration rejects dependent lanes unless the master and prerequisite flags are enabled.
