# ADR-0007: Redis and BullMQ for AI admission and jobs

**Date**: 2026-07-22  
**Status**: accepted  
**Deciders**: Project owner, engineering

## Context

AI generation needs shared rate/budget controls, durable asynchronous work and reconnectable status across serverless web instances and separate workers. Per-process counters or an in-memory production queue would reset on deploy and split state across replicas.

## Decision

Use Redis atomic Lua admission gates and BullMQ for AI jobs, with PostgreSQL `generation_runs` as durable lifecycle state. SSE polls the authorized durable run record, while BullMQ `jobId` equals the generation run ID and repository claiming/completion is idempotent.

## Alternatives Considered

### Synchronous generation in Next.js routes
- **Pros**: Fewer moving parts.
- **Cons**: Request timeout risk, poor recovery and no separate worker concurrency boundary.
- **Why not**: Provider latency and repair loops do not fit a reliable request lifecycle.

### Process-local counters and queue
- **Pros**: Simple local development.
- **Cons**: Resets on deploy, diverges across replicas and fails open in serverless environments.
- **Why not**: It cannot enforce workspace budgets or durable production work.

### Redis Pub/Sub as SSE source of truth
- **Pros**: Low-latency status delivery.
- **Cons**: Events are ephemeral and reconnect can miss terminal state.
- **Why not**: PostgreSQL polling is simpler and durable for MVP volume; Pub/Sub can be added later after measurement.

## Consequences

### Positive
- Shared atomic limits and bounded TTL keys.
- At-least-once jobs with idempotent application and durable audit/usage records.
- SSE reconnect reads canonical status instead of replaying ephemeral messages.

### Negative
- Redis is a required production dependency for AI admission and queueing.
- Database polling adds bounded load and latency compared with push delivery.

### Risks
- Queue crash/dead-letter recovery and load tuning remain Phase 7 work; monitor queue depth, run latency and polling load before beta.
