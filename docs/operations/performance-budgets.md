# Beta performance budgets and capacity procedure

## Budgets

These are private-beta service budgets, not production promises:

| Operation | p95 budget |
|---|---:|
| Authenticated read API | 500 ms |
| Authenticated mutation/autosave API | 750 ms |
| Public share response | 750 ms |
| Redis admission | 100 ms |
| Export/deploy artifact processing | 5,000 ms |

Global safety budgets: error rate ≤1% and oldest queued job ≤120 seconds. The executable source of truth is `BETA_PERFORMANCE_BUDGETS` in `@zenui/operations-core`.

## Test topology

`infra/topology/compose.yaml` pins local PostgreSQL, Redis with AOF/noeviction, and MinIO. It is deterministic infrastructure evidence only; it is not proof of multi-AZ availability or provider capacity.

## Procedure

1. Record date, machine CPU/RAM, Docker resource limits and image versions.
2. Start topology and wait for all health checks.
3. Apply migrations and seed synthetic tenant/project/revision/job data. Never use production data or credentials.
4. Warm each path before measurement.
5. Run fixed request count and concurrency through `pnpm capacity:smoke`, recording p50/p95/p99, errors and queue oldest age.
6. Exercise Redis admission atomicity, PostgreSQL API reads/writes, BullMQ generation/export/deployment enqueue/claim, MinIO put/get, public share compile, graceful shutdown and recovery.
7. Stop immediately at configured request/concurrency/timeout caps; do not turn this into an unbounded or third-party load test.
8. Tune pool/concurrency/polling only from measured evidence and rerun the same scenario.

## Backpressure and bounded tuning

- Worker concurrency defaults to two per generation/export/deployment queue and remains bounded to 16. Change it only after recording queue age, database pool pressure and artifact/provider latency under the same scenario.
- `DATABASE_POOL_MAX` defaults to eight and is independent of one queue's concurrency so enabling several workers cannot silently multiply the pool.
- Admission pauses at either `WORKER_QUEUE_PAUSE_AT_DEPTH` or `WORKER_QUEUE_PAUSE_AT_OLDEST_AGE_SECONDS`. It resumes only after both lower resume thresholds are reached. This hysteresis prevents oscillation; accepted durable work is never dropped.
- BullMQ delivery retries remain bounded and exponential. Generation application work is not automatically replayed after an active crash; recovery remains side-effect aware.
- The HTTP harness accepts GET requests to loopback HTTP only, follows no redirects, caps requests at 10,000, concurrency at 100 and timeout at 30 seconds. This guard prevents accidental third-party load testing.

## Required report fields

- Git working-tree identifier (no commit required), Node/pnpm/Docker versions.
- Host CPU/RAM and Docker limits.
- Scenario, count, concurrency, duration and timeout.
- p50/p95/p99, error rate and queue oldest age.
- Pass/fail against the executable budget.
- Skipped external-provider checks and known topology differences.

## Local evidence — 2026-07-23

Environment: Windows 10 host, 8 logical CPUs, 8,182,689,792 bytes RAM; Docker Engine 29.6.2; Node v22.23.1; pnpm 11.13.1; working-tree base `f0be26f`. Docker reported a 7.621 GiB container memory ceiling. Images were PostgreSQL 17.7 Alpine, Redis 8.2.3 Alpine and MinIO `RELEASE.2025-09-07T16-13-09Z`.

| Scenario | Bounds | Result |
|---|---|---|
| Local loopback authenticated-read harness | 50 warmups, 1,000 requests, concurrency 20, timeout 1,000 ms | p50 18.26 ms, p95 31.60 ms, p99 45.96 ms, 0/1,000 errors, 984.11 ms duration, queue age 0; pass against 500 ms/1%/120 s budgets |
| Redis protocol baseline | 2,000 PING operations, concurrency 20 | 83,333 inline requests/s at p50 0.127 ms; 90,909 multibulk requests/s at p50 0.119 ms |
| PostgreSQL read baseline | pgbench scale 1, 10 clients, 2 threads, 100 transactions/client | 1,000/1,000 processed, 0 failures, 0.437 ms average, 22,898 TPS excluding connection setup |
| Idle topology resource snapshot | one no-stream sample after checks | PostgreSQL 36.16 MiB, Redis 5.742 MiB, MinIO 70.02 MiB; no container exceeded 2.63% CPU in the sample |

The HTTP result validates harness behavior and a local Node response path, not authenticated ZenUI/BullMQ/S3 end-to-end capacity. Redis and PostgreSQL protocol baselines are supporting diagnostics only and do not replace operation-level p95 evidence. No Gemini or Vercel request was made. Full production-topology, object-store artifact, public-share, queue-drain, crash-under-load and provider capacity remain deployment-environment gates.
