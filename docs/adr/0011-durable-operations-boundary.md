# ADR-0011: Durable recovery and private observability boundary

- Status: Accepted
- Date: 2026-07-23

## Context

Private beta needs crash-safe queue processing, ambiguous deployment reconciliation, key rotation, bounded capacity evidence and operator telemetry without exposing tenant/resource data. BullMQ delivery alone cannot establish whether external side effects occurred, while public health/metrics details would expose topology and create unbounded-cardinality/privacy risks.

## Decision

1. PostgreSQL durable rows remain application authority and carry bounded lease, heartbeat and attempt metadata. Recovery is batch-limited and side-effect aware: active generation fails safe; export can requeue before completed storage effects; deployment create ambiguity reconciles by exact provider correlation and never automatically POSTs create.
2. Vercel credentials use an active-version keyring with exact-version decrypt and offline compare-and-swap rotation.
3. Prometheus/Grafana is the beta observability stack. Metric labels are strict finite allowlists and exclude resource/user/request/slug/URL values.
4. Liveness reports process state only. Readiness returns aggregate dependency names/status under timeouts. Metrics require a constant-time internal bearer check and private network control.
5. Capacity/load commands are bounded and loopback/local-topology only by default. Local Docker evidence is not represented as production HA/capacity.
6. Conservative retention is idempotent, batch-limited and redacts/de-references sensitive terminal metadata without deleting projects/revisions or usage authority.

## Consequences

- Recovery can reason about side-effect stages and avoids duplicate model/provider mutations.
- Operators receive actionable dashboard/alerts without sensitive/high-cardinality fields.
- More durable metadata, migrations, sweeper logic and operational ceremonies are required.
- Production topology, managed backup RPO/RTO, private network configuration and external-provider acceptance remain deployment responsibilities rather than inferred from local Compose.
