# ADR-0004: Auth.js, PostgreSQL, Drizzle and workspace-ready authorization

**Date**: 2026-07-21  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

The MVP UI can focus on individual users, but projects, provider connections and future collaboration need an explicit ownership boundary.

## Decision

Use Auth.js sessions, PostgreSQL, Drizzle ORM and `Workspace`/`WorkspaceMember` ownership from the first schema. Every protected resource query is workspace-scoped.

## Alternatives Considered

### User-owned projects only
- **Pros**: Simpler tables.
- **Cons**: Expensive authorization migration for teams.
- **Why not**: Workspace readiness is a confirmed requirement.

### SaaS auth with organizations
- **Pros**: Faster team UI.
- **Cons**: External dependency and duplicated authorization truth.
- **Why not**: Auth.js/Postgres was selected for control.

## Consequences

### Positive
- Stable tenant boundary and future member roles.
- Parameterized Drizzle queries and explicit migrations.

### Negative
- More tables before team invitation exists.

### Risks
- Cross-tenant access is mitigated by service-layer workspace checks and authorization integration tests.
