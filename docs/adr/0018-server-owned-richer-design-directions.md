# ADR-0018: Server-owned richer Design Directions

**Date**: 2026-08-10
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ZenUI's three generated Design Directions shared too much visual structure: only two fixed preset sets existed, section order rarely changed, icons used a very small Unicode glyph set, and existing border, shadow and surface capabilities were underused. The gallery therefore did not communicate three meaningfully different design stories, especially after repeated requests for other directions.

The product needs more visible variety without allowing the AI provider to author visual tokens, CSS, node trees or section rhythm, and without weakening the custom Design System invariant established by ADR-0017. The Design Document security and export boundaries must remain unchanged.

## Decision

ZenUI owns Design Direction variety on the server. Four fixed preset sets provide twelve unique directions; each set contains three distinct bounded layouts, section variants and narrative rhythms. Richer variants, alternating surfaces, token-based borders and shadows, eyebrow and icon treatments, and editorial dividers are materialized only through the existing Design Document schema.

Icons use an allowlisted set of server-owned inline SVG paths. Neither the provider nor user input can supply SVG paths. The provider supplies bounded content and media intent only and cannot choose visual tokens or section rhythm. ADR-0019 supersedes only the original visual-selection restriction: the provider may propose allowlisted server-owned preset IDs, while ZenUI validates, repairs and materializes the final trio.

A custom Guided Design System remains authoritative across all preset sets: all twelve documents preserve the same validated colors, fonts, typography, spacing and radius while server-owned layout, variant and story rhythm remain diverse. No gradient capability or arbitrary styling field is added to the Design Document contract.

## Alternatives Considered

### Let the AI provider choose visual tokens, variants and section order
- **Pros**: Potentially broader combinations with fewer fixed presets.
- **Cons**: Non-deterministic visual policy, harder validation and weaker proof that a custom Design System remains authoritative.
- **Why not**: It crosses the provider boundary and gives model output authority over layout and styling that ZenUI intentionally keeps server-owned.

### Add gradients or free-form decorative styles to `styleSchema`
- **Pros**: More decorative range and stronger visual contrast between some directions.
- **Cons**: Changes the Design Document contract and requires coordinated validator, renderer, preview, compiler, export and compatibility work.
- **Why not**: Existing background, border, radius, shadow and spacing capabilities are sufficient for this upgrade. Gradient support is deferred to a separately reviewed contract change.

### Keep Unicode icon glyphs and only add more preset colors
- **Pros**: Small implementation change.
- **Cons**: Platform-dependent rendering, limited visual coherence and directions that still differ mostly by color.
- **Why not**: It does not address hierarchy, section rhythm or consistent icon rendering.

## Consequences

### Positive
- Each gallery set communicates three visibly different design stories rather than palette-only alternatives.
- Four deterministic sets avoid immediate repetition while preserving safe round wrapping.
- Inline SVG icons render consistently across editor, preview and compiled output without accepting executable or provider-authored markup.
- Provider scope, custom Design System authority and current Design Document limits remain unchanged.

### Negative
- Every new direction or section variant requires a server-owned preset, renderer behavior and regression coverage.
- Fixed presets provide bounded rather than unbounded visual exploration.
- More visual nodes and treatments increase the importance of document-size and node-limit tests.

### Risks
- Preset additions could drift from custom tokens; regression coverage checks all four sets and twelve directions against one exact custom theme.
- New variants could omit required content or owned media; materialization tests verify required sections, media compatibility and valid documents.
- Richer documents could exceed limits; the heaviest covered blueprint remains within 500 nodes and 1 MiB.
- SVG data could become an injection path; paths remain compile-time allowlisted constants and are never read from provider or user props.
