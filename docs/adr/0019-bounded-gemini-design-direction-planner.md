# ADR-0019: Bounded Gemini Design Direction planning

**Date**: 2026-08-10
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ADR-0018 expanded ZenUI's server-owned Design Direction catalog to twelve richer presets, but production selection still derived the visible trio from `round`. Every new project therefore began with the same set, regardless of its brief. ZenUI also needs a stable content-level media baseline so users compare composition, hierarchy, section rhythm and Design System treatment across directions rather than comparing different imagery.

ZenUI needs brief-relevant exploration without giving Gemini authority over the Design Document, custom Design System, raw styles, executable output, assets or publication. Prepare and remix must remain transient, bounded and reviewable, with exactly one structured text request per explicit action.

## Decision

ZenUI uses Gemini as a bounded semantic visual planner for Design Directions. One `design-directions-v2` response contains one shared content blueprint and exactly three direction entries. Each direction entry may select only a `presetId` from the server-owned twelve-ID allowlist and contains no media fields. The shared content blueprint provides one Hero image intent and exactly three feature-image intents for `feature-1`, `feature-2` and `feature-3`.

The provider envelope is strict and versioned. Unknown preset IDs, extra fields, missing/duplicate media slots, URLs, provider result IDs, asset IDs, credentials, raw style values, tokens, SVG, HTML, CSS, JavaScript, nodes, document IDs, mutation instructions and publication instructions are rejected. Duplicate allowlisted preset IDs are permitted at this parsing boundary so the server can repair them deterministically; the model never decides whether a duplicate is acceptable in the final gallery.

After parsing, ZenUI resolves the final three preset IDs server-side. It preserves provider choices only when they are distinct, not recently displayed where alternatives exist, and meet the bounded structural-distance threshold. Duplicate, excluded or overly similar choices are substituted from the same allowlisted catalog using a deterministic brief-and-round seed and maximum-minimum-distance selection. Previous-run exclusion may be relaxed only when necessary to obtain three choices; diversity inside the visible trio is never relaxed. Repair performs no second Gemini call.

Preset definitions, visual signatures, names, rationale patterns, section variants, story rhythm, tokens, SVG paths and materialized Design Documents remain server-owned. A custom Guided Design System remains authoritative for colors, fonts, typography, spacing and radius. Every materialized document still passes registry, semantic, node/depth and serialized-size validation.

Media resolution uses four server-generated stable keys: `shared-hero`, `shared-feature-1`, `shared-feature-2` and `shared-feature-3`. The model supplies only bounded query and localized alt text; it cannot supply a key or storage reference. Resolution requires the four-media product budget, is processed in batches of at most two, and follows the existing generated-image → fixed-provider import → fail-soft path. The same successful ready opaque owned asset IDs are materialized into all three directions. A failed feature slot is omitted without creating an empty media panel; Hero may retain its server-owned geometric fallback.

Prepare and remix persist only validated transient direction snapshots and minimal previous-preset history. They do not change the accepted document, project version or revision history. The sole acceptance boundary remains the user's explicit **Choose this direction** action, which revalidates the server-owned direction and applies one atomic `REPLACE_DOCUMENT` transaction with one immutable revision.

This decision supersedes only ADR-0018's statement that the provider does not choose a visual variant. Gemini may now propose allowlisted preset IDs, but ZenUI remains the final authority over validation, diversity repair and materialization. All other ADR-0018 server-owned catalog, visual treatment, SVG and custom Design System invariants remain in force.

## Authority matrix

| Concern | Gemini may provide | ZenUI remains authoritative |
|---|---|---|
| Shared page content | Bounded content blueprint | Schema, semantic constraints and document materialization |
| Direction selection | Three allowlisted preset ID proposals | Exclusions, duplicate/similarity repair and final trio |
| Shared media | One Hero and exactly three feature query/alt intents | Stable keys, four-media budget, provider fallback, import and owned assets |
| Visual system | Nothing | Custom Design System, tokens, fonts, spacing, radius and contrast |
| Document structure | Nothing | Presets, variants, rhythm, nodes, IDs, registry and limits |
| Mutation/publication | Nothing | Explicit Choose transaction, revision, share, export and deploy |

## Alternatives Considered

### Keep selecting preset sets from `round`
- **Pros**: Fully deterministic and no planner changes.
- **Cons**: Every first run starts with the same trio and ignores the brief when choosing visual character.
- **Why not**: It preserves the repetitive behavior reported in production and underuses the twelve-preset catalog.

### Let Gemini author layouts, tokens or complete Design Documents
- **Pros**: Wider apparent creative range.
- **Cons**: Weakens schema authority, custom Design System guarantees, scope proofs, deterministic rendering and safe export.
- **Why not**: Model output would become a source-of-truth mutation rather than a bounded suggestion.

### Reject duplicate IDs before deterministic resolution
- **Pros**: A superficially stricter provider envelope.
- **Cons**: Prevents the server's bounded repair path from producing a safe diverse trio and would require failure or another paid call.
- **Why not**: Strict authority is preserved more effectively by accepting only allowlisted IDs and deterministically repairing the final gallery without hidden provider work.

### Call Gemini again to repair invalid or repetitive plans
- **Pros**: The model could attempt a more semantically tailored replacement.
- **Cons**: Hidden cost and latency, less predictable call accounting and another injection/malformed-output surface.
- **Why not**: One explicit action must equal exactly one text-provider call; server-owned deterministic substitution is sufficient.

### Use direction-specific Hero images
- **Pros**: Each card can appear more immediately different.
- **Cons**: Consumes three of four media slots on decorative variation, leaves only one feature image, and makes it harder to compare the server-owned layout and Design System treatment on the same content.
- **Why not**: The product baseline is one shared Hero plus three shared feature images. Direction variety belongs to bounded preset composition, hierarchy, section rhythm and visual treatment rather than a different media budget.

## Consequences

### Positive
- First-run direction selection can reflect the brief rather than always showing the first preset set.
- Final galleries remain deterministic, structurally diverse and resistant to duplicate or recent provider choices.
- All three directions use the same Hero and three feature assets, making visual comparisons content-consistent while preserving server-owned structural variety.
- Prepare/remix call accounting and the explicit Choose mutation boundary remain unchanged.
- Provider authority is narrow, auditable and independent of the Design Document source of truth.

### Negative
- The system now maintains a versioned planner catalog, structural signatures and deterministic substitution policy.
- A provider-selected preset can be replaced, so the materialized result may differ from the initial planner proposal.
- Every conforming prepare/remix run reserves exactly four media resolutions, although each slot remains fail-soft and the hard cap does not increase.

### Risks
- Catalog signatures may stop reflecting meaningful structural differences as presets evolve; pairwise-distance regression tests must change with intentional catalog updates.
- Model output may be malformed or injected; strict parsing, bounded context and the authority matrix fail closed before media or materialization.
- Provider or image behavior may change; deterministic fixtures cover contracts but do not replace a separately authorized paid live smoke.
- Previous-run history could expose private content if broadened; only up to three allowlisted preset IDs from the same workspace/project are loaded and provider payloads remain private.
