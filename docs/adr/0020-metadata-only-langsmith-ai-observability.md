# ADR-0020: Metadata-only LangSmith AI observability

**Date**: 2026-08-17
**Status**: accepted
**Deciders**: Project owner, engineering

## Context

ZenUI already exposes private Prometheus metrics and a Grafana operations dashboard, while PostgreSQL `usage_records` provides durable token accounting. Those boundaries do not show one end-to-end AI run with its Gemini calls, structured validation/repair stages and safe outcome. Adding LangChain or automatic prompt/output instrumentation only to obtain tracing would widen the trusted surface and could export user content, Design Documents, provider payloads or resource identifiers.

## Decision

ZenUI sends optional AI traces directly from the Worker to LangSmith through OpenTelemetry OTLP/HTTP. The integration is disabled by default and uses a dedicated adapter with typed, allowlisted metadata. It does not add LangChain and does not register global or automatic instrumentation.

Each Generation, Proposal or Design Direction job has one root chain span. Gemini text, planner, judge and image SDK calls create LLM child spans inside the active root. Exported data is limited to stable operation/lane/mode enums, provider/model, prompt version, direction round, safe outcome/error code, repair/media/candidate counts and token totals. A server-only HMAC-SHA-256 digest correlates a run without exporting its raw ID.

Raw prompts, Website Briefs, refinement requests, Design Documents, generated content, commands, provider requests/responses/schemas, Lead Form data, image bytes, private URLs/object keys, user/workspace/project/asset IDs, stack traces, error messages and credentials are forbidden. The adapter never calls `recordException` and accepts no generic business-layer attribute API.

Configuration is strict when enabled. Startup rejects missing credentials, weak correlation secrets, invalid sampling/timeouts/queue bounds and unsafe endpoints. Once running, exporter, flush and shutdown failures are bounded and fail-open so observability cannot alter AI business outcomes.

Prometheus/Grafana remain the infrastructure and low-cardinality operations authority. PostgreSQL `usage_records` remains the durable token-accounting authority and continues to drive admission/quota decisions. LangSmith is an analytical trace view only.

## Alternatives Considered

### Add LangChain for tracing

- **Pros**: Native integrations and conventions.
- **Cons**: Introduces a framework into provider-neutral business logic and increases the chance of implicit prompt/output capture.
- **Why not**: ZenUI needs a narrow tracing boundary, not a new AI execution framework.

### Enable OpenTelemetry or LangSmith auto-instrumentation

- **Pros**: Less manual wiring and broad coverage.
- **Cons**: May capture request bodies, model responses, HTTP headers or high-cardinality resource values outside the privacy allowlist.
- **Why not**: Coverage is less important than preserving the explicit metadata-only boundary.

### Use LangSmith for token accounting or admission

- **Pros**: One external dashboard for traces and cost.
- **Cons**: External telemetry is sampled, non-durable and unavailable during exporter failures.
- **Why not**: Durable accounting and business enforcement must stay in PostgreSQL and existing admission controls.

## Consequences

### Positive

- AI run latency, hierarchy, outcomes, repairs and token totals become inspectable without exporting user content.
- The provider-neutral adapter and structured Design Document boundaries remain unchanged.
- LangSmith outages cannot fail generation or block Worker shutdown indefinitely.
- The integration can be disabled or sampled without changing application behavior.

### Negative

- Manual instrumentation must be maintained when a new provider operation or assistant lane is added.
- Metadata-only traces cannot inspect prompt or response text inside LangSmith.
- HMAC correlation continuity is lost when the correlation secret rotates.

### Risks

- A future developer may try to add arbitrary span attributes or auto-instrumentation; typed contracts, privacy tests and this ADR must remain review gates.
- Sampling can hide rare failures; Prometheus alerts and durable repository outcomes remain the complete operational record.
- Provider error objects can contain sensitive data; only allowlisted safe codes may reach span status/attributes.
