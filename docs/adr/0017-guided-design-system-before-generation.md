# ADR-0017: Guided Design System before direction generation

**Date**: 2026-08-06
**Amended**: 2026-08-11
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ZenUI previously selected visual tokens while materializing each Design Direction. A user who already knows their colors, typography, spacing and radius therefore had to create a website first, then apply a Brand Kit afterward. That workflow makes the initial directions inconsistent with the user's intended visual identity.

The product needs a small, demonstrable Design System capability without allowing arbitrary CSS, fonts, document trees or model-controlled visual authority.

## Decision

ZenUI accepts a bounded Design System as part of the Guided Brief before directions are generated. The user chooses either ZenUI-generated styling or a custom set of structurally validated primary/background/text HEX colors, allowlisted fonts, and typography, spacing and radius presets.

The provider receives only the content portion of the brief. Server-owned materialization applies the validated custom tokens to every direction while direction presets continue to determine layout and narrative variants. The chosen direction remains the only accepted-document mutation through the existing atomic `REPLACE_DOCUMENT` transaction.

As amended on 2026-08-11, contrast checks for a Guided custom Design System are advisory rather than blocking. ZenUI warns when text/background is below 4.5:1 or primary/background is below 3:1, but preserves the exact user-selected primary, background and text colors and still generates the directions. This amendment does not change Brand Kit validation policy.

## Alternatives Considered

### Apply Brand Kit only after generation
- **Pros**: Reuses the existing editor workflow.
- **Cons**: Initial directions do not reflect the user's supplied identity.
- **Why not**: It adds an avoidable second styling pass and weakens the preview/choice experience.

### Let the provider choose visual tokens
- **Pros**: Fewer deterministic token mappings.
- **Cons**: Unstable results, weak scope proof and model authority over visual policy.
- **Why not**: The model must not author arbitrary style or change a user-approved Design System.

### Build a full free-form token editor
- **Pros**: Broad flexibility.
- **Cons**: Large validation, responsive, migration and UX scope.
- **Why not**: The MVP is intended to demonstrate the capability with safe, maintainable presets.

## Consequences

### Positive
- Initial direction previews and accepted websites can match user identity from the first generation.
- The existing brief JSONB persistence, queue-ID boundary, Design Document validation and atomic acceptance flow remain reusable.
- The bounded tokens can be expanded later without accepting raw CSS or external fonts.

### Negative
- Materializer code must apply typography and spacing presets consistently, not just update document theme metadata.
- Guided Brief adds more inputs and validation states for users choosing custom styling.

### Risks
- Insufficient contrast can reduce accessibility; Guided Brief presents a non-blocking warning and makes clear that the exact colors will remain unchanged. The user may proceed with the readability risk.
- Design system data could leak into provider prompts; the provider request explicitly projects out `designSystem`, with regression coverage.
- Legacy briefs lack this field; parsing normalizes missing values to ZenUI mode before UI/materialization.
