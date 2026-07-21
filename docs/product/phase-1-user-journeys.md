# Phase 1 User Journeys and Test Contract

## Journey 1 — Build a simple hero

As a creator, I want to drag a heading into a section so that I can construct a landing page without code.

Acceptance tests:

- Empty Page accepts a Section but rejects Heading directly.
- Section accepts Container; Container accepts Heading, Paragraph, Image and Button.
- Drop indicator matches the resulting child index.
- Layers and Canvas display the same hierarchy.

## Journey 2 — Edit content and appearance

As a creator, I want to select a heading and change its text and color so that the design reflects my message.

Acceptance tests:

- Canvas click and Layers click select the same node ID.
- Inspector initializes from node props/style.
- A text edit emits `UPDATE_PROPS`; a color edit emits `UPDATE_STYLE`.
- Invalid color and unknown style properties are rejected without document mutation.

## Journey 3 — Reorder safely

As a creator, I want to move components within valid containers so that I can refine information hierarchy.

Acceptance tests:

- Moving a leaf between compatible containers succeeds.
- Moving a Section into its descendant is rejected with `cycle_detected`.
- Moving a Button directly under Page is rejected with `invalid_parent_child`.
- Failed batches are atomic.

## Journey 4 — Undo and redo

As a creator, I want to undo and redo edits so that experimentation is reversible.

Acceptance tests:

- Accepted commands return inverse commands.
- Undo restores the previous props/style/position.
- Redo restores the accepted change.
- A new edit after undo clears the redo branch.

## Journey 5 — Reload without loss

As a creator, I want the draft to survive a reload so that I can continue working.

Acceptance tests:

- A valid document is serialized with schema and document version.
- Reload validates before rendering.
- Invalid or unsupported documents show a recoverable error and do not render.

## Journey 6 — Export standalone HTML

As a creator, I want to download one HTML file so that the page can run independently.

Acceptance tests:

- The reference document compiles to deterministic HTML/CSS.
- Export contains no arbitrary generated script.
- Image URLs and link destinations follow the safe URL policy.
- Opening the file renders the same hierarchy and supported styles as Canvas fixtures.

## TDD sequence

```text
Schema/command test RED
        |
        v
Minimal contract GREEN
        |
        v
Renderer/DnD test RED
        |
        v
Editor flow GREEN
        |
        v
Playwright critical journey
```

Coverage gate: at least 80% branches, functions, lines and statements for executable editor/domain packages.
