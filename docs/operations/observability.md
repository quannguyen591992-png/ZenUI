# ZenUI beta observability

ZenUI exposes Prometheus metrics from private web and worker endpoints and provisions one Grafana dashboard plus Prometheus alerts from `infra/observability/`.

## Boundaries

- `/api/health/live` and worker `/health/live` report process liveness only.
- Readiness probes PostgreSQL/Redis and worker object-store configuration under bounded timeouts. Responses contain only dependency names and `ready|degraded`.
- Metrics require the internal bearer `METRICS_BEARER_TOKEN`. Production must also restrict these endpoints at the private network/gateway layer.
- Metric labels are strict allowlists. User, workspace, project, job, request, share slug and URL values are forbidden to prevent sensitive data leakage and unbounded cardinality.
- No prompt, document, provider body, token, ciphertext or artifact path is emitted.

## LangSmith AI traces

LangSmith is an optional AI-trace destination only. ZenUI sends traces directly from the Worker through OpenTelemetry OTLP/HTTP; LangChain, LangSmith auto-instrumentation and prompt/output capture are not part of the runtime. Prometheus/Grafana remain authoritative for infrastructure and low-cardinality operational metrics. PostgreSQL `usage_records` remains authoritative for durable token accounting, admission and quota decisions.

Tracing is disabled by default. To opt in, configure all server-only values and restart the Worker:

```env
LANGSMITH_TRACING_ENABLED=true
LANGSMITH_API_KEY=<LangSmith API key>
LANGSMITH_PROJECT=<private project name>
LANGSMITH_CORRELATION_SECRET=<at least 32 random bytes>
LANGSMITH_OTLP_ENDPOINT=https://api.smith.langchain.com/otel/v1/traces
LANGSMITH_TRACE_SAMPLE_RATIO=1
LANGSMITH_EXPORT_TIMEOUT_MS=5000
LANGSMITH_BATCH_DELAY_MS=1000
LANGSMITH_MAX_QUEUE_SIZE=512
LANGSMITH_SHUTDOWN_TIMEOUT_MS=2000
```

When enabled, startup fails closed for missing credentials, placeholder API keys, weak correlation secrets, invalid bounds or a non-HTTPS/credentialed/query-bearing endpoint. After startup, exporting is fail-open: collector errors, queue pressure, network timeouts and bounded shutdown cannot change an AI generation result.

The trace model is intentionally narrow:

- Root chains: `zenui.ai.generation`, `zenui.ai.proposal` and `zenui.ai.design_directions`.
- LLM children: bounded Gemini operations such as landing blueprint, edit operations, design-direction planning, assistant planning, semantic style/layout/composition planning, visual brief, media judging and image generation.
- Allowed metadata: operation/lane/mode/delivery, provider/model, prompt version, direction round, safe outcome/error code, repair/media/candidate counts, token totals and an HMAC correlation digest.
- Correlation uses HMAC-SHA-256 over the private run ID. The raw run, user, workspace, project and asset IDs are never exported.

The Worker must never export raw prompts, Website Briefs, original/refinement requests, Design Documents, blueprints, generated copy, command payloads, provider request/response/schema, image bytes, Lead Form values, email/phone/IP, private URLs/object keys, stack traces, error messages, OAuth/encryption material or API keys. Do not enable OpenTelemetry or LangSmith auto-instrumentation that captures inputs/outputs; it bypasses this allowlist.

For production, start with a lower `LANGSMITH_TRACE_SAMPLE_RATIO` if trace volume or cost requires it. Sampling is decided at the root so an accepted trace retains its child spans. To disable immediately, set `LANGSMITH_TRACING_ENABLED=false` and restart the Worker. To rotate credentials, create a replacement LangSmith key and correlation secret, restart the Worker, verify metadata-only traces, then revoke the old key. Rotating the correlation secret deliberately breaks digest continuity.

## User AI usage reporting

The authenticated Dashboard route `/dashboard/usage` is separate from the private operations dashboard and from LangSmith. It reads durable PostgreSQL `usage_records` and always hard-binds queries to the current authenticated user and workspace. Even workspace owners cannot use this view to inspect another member's usage.

- The default range is 30 days and the maximum is 90 days. Browser IANA timezone is used consistently for the “today” KPI and daily chart buckets.
- Token totals show input and output separately and include every persisted text and Gemini-image component. Detail rows also expose nullable text and image components: a component is shown only when that call actually has its tokens, while the labelled call total remains the aggregate used by KPIs and charts. Provider/model, project and search filters are server-side and paginated; model filtering/search covers both the text model and image model.
- All USD values are labelled **estimated cost**. Pricing is exact-match and component-based: text and generated-image usage keep separate immutable pricing-version/rate/cost snapshots in integer micro-USD. Image-only calls do not display a zero-cost text model/component; mixed calls display text and image token/cost breakdowns independently. The row total is the sum of known components, never one model rate applied to another modality.
- The current text catalog version is `google-gemini-2026-08-13`, sourced from <https://ai.google.dev/gemini-api/docs/pricing>. It exact-matches `gemini-3.1-flash-lite` standard text pricing at USD 0.25 per 1M input tokens and USD 1.50 per 1M output tokens (including thinking tokens), alongside the supported Gemini 2.5 models.
- The image catalog version `google-gemini-image-2026-08-13` exact-matches `google-gemini / gemini-3.1-flash-image / 1K`: USD 0.50 per 1M input tokens and USD 60 per 1M image-output tokens. A documented 1K output is 1,120 image tokens, or 67,200 micro-USD before input cost. Updating either catalog affects only later records; historical snapshots are never recalculated.
- Image accounting is collected at the provider-response boundary. Every successful Gemini response that yields image bytes is recorded immediately, before import, semantic judging, candidate selection or document mutation. Therefore rejected/unselected candidates and images followed by an import/judge/run failure still count; a later Pexels fallback does not erase Gemini cost already incurred.
- Provider `usageMetadata` is authoritative when it includes image-output usage. If that metadata is unavailable for a known model/size, ZenUI may retain the documented 1K output-token fallback but marks the result **partial** because unknown input usage is not free. Unknown image model/size remains **unpriced**.
- Pexels selections are recorded separately as stock count. They never create a Gemini image model, token count or charge. A stock-only run can therefore have `image: null`, a non-zero stock count and no fabricated generated-image cost.
- A homogeneous set of generated-image events can be aggregated into one immutable run snapshot. Heterogeneous provider/model/size/token-source events remain explicitly incomplete rather than being priced as though one rate represented all events.
- Legacy rows remain nullable and uncertain. ZenUI does not backfill provider, image model, token source, token usage or price from the current environment, image appearance or later catalog. An unknown component is never displayed as zero-cost usage.
- `priced` means every required component is known; `partial` exposes the known subtotal and an incomplete reason; `unpriced` exposes no monetary total. Dashboard rows show text model, image model/size/count, image token source, Pexels stock count and text/image cost breakdown where available.
- The reporting API never returns prompts, Website Briefs, Design Documents, image bytes, object keys, raw provider payloads, Lead data, PII, LangSmith identifiers or resource secrets. It does not call Gemini, LangSmith, Pexels or Vercel and does not change admission, quotas, token budgets or generation behavior. PostgreSQL snapshots are the user-facing billing-estimate authority; LangSmith remains metadata-only observability.

## Dashboard

`ZenUI Beta Operations` includes:

- Text-labelled Ready/Degraded service status.
- Oldest queue age and AI budget status tiles.
- Queue age and worker outcome time series with legends/tooltips.
- A current-state table as the non-color accessibility equivalent.

The categorical palette was validated in light and dark modes with the dataviz palette validator on 2026-07-23. Light-mode low-contrast hues are backed by visible labels/table view; status colors always include an icon and text.

## Alert coverage

Prometheus rules cover readiness, queue age, expired leases, worker failure ratio, unknown provider outcomes, token budget pressure/exhaustion and storage/provider bursts. Every alert points to `incident-runbook.md`.

## Local verification

1. Copy `infra/observability/secrets/metrics_bearer_token.example` to the ignored `metrics_bearer_token` file and set the same value in `METRICS_BEARER_TOKEN`.
2. Start web and worker operations endpoints.
3. Run `docker compose -f infra/observability/compose.yaml config` and then `up -d`.
4. Verify Prometheus rules/targets on `127.0.0.1:9090` and Grafana provisioning on `127.0.0.1:3002`.
5. Render the dashboard and inspect text wrapping, legends, tooltip reachability and the table view before treating provisioning as complete.
