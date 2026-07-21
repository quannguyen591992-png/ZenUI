# ADR-0002: TypeScript pnpm/Turborepo monorepo

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

The editor, worker, schema, command engine and compiler need shared types while retaining clear runtime boundaries.

## Decision

Use Node 22+, TypeScript strict, pnpm workspaces and Turborepo. Keep `apps/web` and `apps/worker` separate from reusable packages.

## Alternatives Considered

### Single Next.js application
- **Pros**: Less initial configuration.
- **Cons**: Couples long-running AI/deploy work to the web runtime.
- **Why not**: Worker isolation is an explicit product boundary.

### Multiple repositories
- **Pros**: Strong isolation.
- **Cons**: Harder atomic contract changes and duplicated tooling.
- **Why not**: Premature for one product team.

## Consequences

### Positive
- Shared contracts remain type-safe and independently tested.
- Worker can be deployed separately later.

### Negative
- More initial build configuration.

### Risks
- Circular dependencies are mitigated by package direction: schema -> registry -> commands; apps consume packages.
