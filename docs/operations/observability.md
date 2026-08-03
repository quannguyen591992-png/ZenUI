# ZenUI beta observability

ZenUI exposes Prometheus metrics from private web and worker endpoints and provisions one Grafana dashboard plus Prometheus alerts from `infra/observability/`.

## Boundaries

- `/api/health/live` and worker `/health/live` report process liveness only.
- Readiness probes PostgreSQL/Redis and worker object-store configuration under bounded timeouts. Responses contain only dependency names and `ready|degraded`.
- Metrics require the internal bearer `METRICS_BEARER_TOKEN`. Production must also restrict these endpoints at the private network/gateway layer.
- Metric labels are strict allowlists. User, workspace, project, job, request, share slug and URL values are forbidden to prevent sensitive data leakage and unbounded cardinality.
- No prompt, document, provider body, token, ciphertext or artifact path is emitted.

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
