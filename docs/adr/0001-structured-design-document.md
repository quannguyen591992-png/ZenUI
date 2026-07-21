# ADR-0001: Structured editor and Design Document source of truth

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

The MVP must support responsive drag-and-drop, AI edits, undo/redo, revision history and deterministic HTML export. Arbitrary DOM or source-code mutation would make these surfaces drift.

## Decision

Use block-based drag-and-drop and a versioned Design Document JSON as the only design source of truth. User and AI changes both use validated commands.

## Alternatives Considered

### Raw HTML/CSS
- **Pros**: Fast initial generation.
- **Cons**: Unstable element identity and difficult inverse operations.
- **Why not**: It cannot reliably support structured editing and future migrations.

### Pixel-positioned canvas
- **Pros**: Free-form visual control.
- **Cons**: Poor responsive behavior and fragile HTML export.
- **Why not**: It conflicts with the landing-page output requirement.

## Consequences

### Positive
- One model drives canvas, preview, AI, revisions and export.
- Parent-child constraints and atomic validation are testable.

### Negative
- Only registered components and styles are supported.
- Schema migration becomes a permanent responsibility.

### Risks
- Registry/compiler drift is mitigated by one shared registry and contract tests.
