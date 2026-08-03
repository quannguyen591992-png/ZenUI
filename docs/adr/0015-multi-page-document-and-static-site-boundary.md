# ADR-0015: Multi-page Design Document and immutable static-site boundary

**Date**: 2026-07-29  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

ZenUI v1 stores exactly one page and compiles one `index.html`. Stage 10B1 must add bounded pages, navigation, safe deep links and whole-site publication without splitting the source of truth or weakening immutable revision, preview, asset and no-user-code boundaries. Existing v1 drafts and revisions must remain readable and public output must not be rewritten in place.

## Decision

Use Design Document v2 with ordered stable page IDs, one mandatory Home page, unique canonical slugs, one parentless root per page and navigation/internal links that reference page IDs. Keep the complete site in one JSONB draft and revision snapshot; accept v1 at read boundaries through a lossless idempotent v1-to-v2 migration, while all new writes use v2. Compile each immutable snapshot into a deterministic bounded static-site manifest shared by Preview, Share, ZIP Export and Vercel Deploy.

The fixed Stage 10B1 budgets are:

- 20 pages and 20 navigation items;
- 500 nodes total, depth 12 per page and 1 MiB serialized Design Document;
- canonical slugs up to 80 characters and four path segments;
- 20 HTML files, 2 MiB per HTML file and 8 MiB total compiled site;
- 10 MiB maximum deterministic ZIP export.

Home uses `/`; other slugs are lowercase ASCII kebab-case paths. Reserved names, dot segments, encoded separators/dots, backslashes, query/fragment/control characters, duplicate separators and case/Unicode-normalization collisions fail closed. Output paths are derived only from validated slugs. Rollback is read-compatible rather than lossy: v2 is not down-converted to v1, and production rollback uses a forward migration if persistence metadata ever changes.

## Alternatives Considered

### Store pages in separate relational rows
- **Pros**: Page-level querying and independent updates.
- **Cons**: Splits atomic command/history/revision ownership and complicates immutable release snapshots.
- **Why not**: Stage 10B1 needs one validated site transaction and the existing JSONB document already provides bounded storage.

### Store internal navigation as slugs
- **Pros**: Simple renderer input.
- **Cons**: Renaming a slug silently breaks links and duplicates path authority.
- **Why not**: Stable page IDs preserve intent; the compiler resolves the current canonical route.

### Publish only the active page
- **Pros**: Minimal changes to current export/deploy workers.
- **Cons**: Deep links fail and Share, Export and Deploy no longer represent the same website revision.
- **Why not**: Stage 10B1 promises whole-site immutable publication.

### Rewrite every stored v1 snapshot to v2
- **Pros**: One stored version after migration.
- **Cons**: Mutates immutable revision history and creates a risky bulk data migration.
- **Why not**: Read-time compatibility plus write-time canonicalization preserves old evidence and avoids destructive DML.

## Consequences

### Positive
- Canvas, Preview, Share, Export and Deploy share one route and render authority.
- Page rename/reorder and navigation remain atomic, undoable and optimistic.
- Existing single-page drafts/revisions remain readable without rewriting history.
- Static output has no public database dependency, build command or generated JavaScript.

### Negative
- Compiler, export and deployment artifacts must support multiple bounded files and deterministic ZIP packaging.
- Active-page state must be threaded through editor, AI proposal scope and Preview bridge.
- Code rollback after v2 writes requires a reader that understands v2.

### Risks
- Route traversal, collision and ZIP-slip risks are mitigated by shared canonical slug validation, derived paths and property tests.
- Broken internal references are blocked or shown as explicit impact before destructive commands.
- Artifact amplification is bounded before storage/provider calls by page/file/per-file/aggregate budgets.
- Publication drift is mitigated by compiling only immutable revision/export/deployment snapshots through the shared manifest.
