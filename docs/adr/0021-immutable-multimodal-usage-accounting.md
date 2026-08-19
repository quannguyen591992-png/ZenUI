# ADR-0021: Immutable multimodal AI usage accounting

**Date**: 2026-08-19
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ZenUI originally persisted text-token usage and its pricing snapshot in PostgreSQL, but generated-image operations had no durable provider/model/token/pricing component. A real Gemini image response could therefore incur cost while a `replace-media` row showed zero text tokens or a Design Direction row exposed only its text subtotal. The Worker already knew the configured image model, but using the current configuration to reinterpret old records would fabricate historical facts. Applying text output rates to image tokens would also produce incorrect prices.

Image accounting has a different lifecycle from accepted document content. Gemini can return chargeable image bytes before import, semantic judging, candidate selection or document mutation. A candidate may be rejected, unselected or followed by Pexels fallback while the provider call has still incurred. LangSmith traces are optional, sampled and fail-open, so they cannot be the durable user-facing accounting authority.

## Decision

ZenUI uses component-based, immutable multimodal accounting in PostgreSQL `usage_records`.

1. Text and generated-image usage have separate exact-match pricing catalogs and immutable snapshots. Rates, pricing version and calculated integer micro-USD values are persisted at run completion/failure; later catalog changes do not recalculate historical records.
2. Gemini image usage is collected at the provider-response boundary as soon as a response yields image bytes. Collection occurs before import, judging, selection and mutation. Every successful image response counts even when the candidate is rejected/unselected, a downstream step fails or the flow later selects Pexels.
3. The image component records actual provider/model, supported image size, generated count, input/output/total tokens and token source. Provider `usageMetadata` is preferred. The documented 1K output-token amount may be used only as an explicit fallback for a known model/size; because input usage is unknown, that snapshot remains partial rather than treating input as free.
4. Pexels is a separate stock source. Stock selections increment `stockCount` and never manufacture a Gemini model, image tokens or generated-image cost. Gemini cost already collected before stock fallback is retained.
5. Homogeneous image events in one run may be aggregated. Heterogeneous provider/model/size/token-source events are retained as incomplete and are not priced under a representative rate.
6. Report status is component-aware: `priced` means every required component is known, `partial` exposes only a known subtotal plus a reason, and `unpriced` exposes no monetary total. Unknown components are never displayed or aggregated as zero cost.
7. Migration 0019 adds nullable image usage/pricing snapshot columns only. It performs no historical DML backfill. Old records keep unknown provider/model/tokens/pricing as null; neither current environment configuration nor image appearance is accepted as historical evidence.
8. Usage API queries remain hard-bound to the current authenticated user and workspace. Public report data may include safe provider/model/size/count/token/source/price fields and Pexels stock count, but never prompts, image bytes, object keys, raw provider responses, credentials, PII or LangSmith identifiers.
9. PostgreSQL remains the durable accounting and user-facing cost-estimate authority. LangSmith stays metadata-only observability and cannot drive report prices, admission or quota decisions.

## Alternatives Considered

### Treat zero text tokens as a zero-cost image operation

- **Pros**: No schema or worker changes.
- **Cons**: Misrepresents real provider spend and makes generated images look free.
- **Why not**: Missing modality accounting is uncertainty, not evidence of zero cost.

### Price image output with the text model catalog

- **Pros**: Reuses the existing pricing code and columns.
- **Cons**: Image output has a different model, unit rate and documented token amount; one blended rate cannot preserve an auditable snapshot.
- **Why not**: It produces incorrect estimates and hides which component incurred cost.

### Count only the selected or successfully imported image

- **Pros**: Aligns accounting with content visible in the accepted document.
- **Cons**: Drops provider calls for rejected candidates, failed imports/judges and pre-fallback Gemini generations even though those calls incurred.
- **Why not**: Accounting must follow successful provider responses, not later product selection.

### Backfill historical rows from the current image model configuration

- **Pros**: Makes old Dashboard rows appear complete.
- **Cons**: Configuration can change and historical rows do not prove provider, model, size, response token usage or whether Pexels was used.
- **Why not**: This would fabricate immutable billing facts.

### Use LangSmith as the cost source

- **Pros**: Reuses an external trace UI.
- **Cons**: Tracing is optional, sampled, metadata-only and fail-open; export failures must not alter generation.
- **Why not**: User-facing accounting requires durable transactional state independent of telemetry availability.

## Consequences

### Positive

- Newly generated Gemini images show their actual model, token source and estimated component cost.
- All successful chargeable image responses remain counted through candidate rejection, downstream failure and Pexels fallback.
- Dashboard totals combine known text and image costs without presenting unknown cost as zero.
- Historical uncertainty remains explicit and auditable.
- Pexels stock use remains distinguishable from Gemini image generation.

### Negative

- `usage_records`, report contracts and Dashboard rows carry more nullable component fields.
- A run containing heterogeneous image events cannot expose one aggregated image detail object until storage supports per-event reporting.
- Documented-token fallback produces only a partial estimate because provider input usage is unknown.

### Risks

- New image models/sizes remain unpriced until an exact catalog entry is reviewed and added.
- Provider metadata semantics can evolve; adapters and fixtures must validate fields before persistence.
- Future code could accidentally collect after selection rather than at response time; Worker regression tests must preserve the provider-boundary rule.
- Pricing sources change over time; new catalog versions must be additive and must never mutate persisted snapshots.
