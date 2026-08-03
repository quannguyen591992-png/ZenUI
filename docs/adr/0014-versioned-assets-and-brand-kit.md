# ADR-0014: Versioned owned assets and atomic Brand Kit application

- Status: Accepted
- Date: 2026-07-29

## Context

ADR-0012 defines the secure network, normalization, storage and public-delivery boundary for production images. Stage 10A also needs explicit ownership and mutation rules for user uploads, immutable crop derivatives, optional workspace logos and a Brand Kit that can be edited independently without changing an already published revision.

## Decision

1. Every asset is scoped to exactly one workspace and is either project-owned or workspace-owned. Project images cannot be reused across projects by guessing IDs; Brand Kit logos must be ready workspace assets.
2. Raw uploads are bounded by the BFF before a private source object is created. Import/processing jobs carry local IDs only. A crop/resize creates a new derivative asset ID and never overwrites the parent.
3. New Design Document image and logo references contain opaque owned asset IDs plus accessible metadata. Legacy remote `src` remains readable during migration, but one node cannot retain both remote and owned source authority.
4. Removing a legacy property in a persisted command uses JSON `null`; the command patch layer treats `null` and in-memory `undefined` as deletion before strict document validation. This keeps browser autosave semantically equivalent to local command execution.
5. One versioned Brand Kit belongs to each workspace. Name, contrast-validated colors and allowlisted heading/body fonts are valid without a logo. If present, the logo is a ready workspace asset.
6. Saving the Brand Kit uses optimistic kit versioning. Applying it requires both expected Brand Kit and draft versions and executes one atomic command transaction that maps only theme, navbar and explicit brand slots.
7. Revisions snapshot the applied theme and asset IDs. Later Brand Kit edits, asset archive operations or draft changes do not alter Share, Export or Deployment output from an older revision. Stage 10A archives library records but does not hard-delete normalized public bytes or perform garbage collection.

## Alternatives considered

### Store workspace-wide mutable asset URLs in documents

- Rejected because changing the URL or Brand Kit would silently alter old revisions and couple documents to one environment.

### Overwrite an asset when cropping

- Rejected because existing drafts and immutable revisions would change bytes without a document-version transition.

### Apply Brand Kit changes client-side as independent autosaves

- Rejected because partial success could mix old and new theme/navbar/logo state and optimistic conflicts would be difficult to recover safely.

### Require a logo for every Brand Kit

- Rejected because name/color/font identity is useful independently, while forcing an upload would block the non-coder happy path.

### Hard-delete archived assets immediately

- Rejected because immutable revisions and public artifacts may still reference the bytes. Reference-aware garbage collection is a separate future capability.

## Consequences

- Asset and Brand Kit mutations remain auditable, tenant-scoped, reversible at the document layer and stable across publication surfaces.
- Storage usage grows because derivatives and archived normalized bytes are retained through Stage 10A.
- Server and client command implementations must preserve JSON-safe deletion semantics.
- Brand Kit apply requires a server transaction and explicit version-conflict recovery rather than optimistic UI-only mutation.
- A future garbage collector must prove that no draft, revision, share, export or deployment references an asset before deletion.
