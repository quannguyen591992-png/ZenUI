# ZenUI private-beta privacy and retention

This policy describes the private-beta application boundary. It is an engineering policy, not legal advice. The beta operator must publish processor identities, company contact details and jurisdiction-specific notices before inviting external users.

## Data and purpose

| Data | Purpose | Access |
|---|---|---|
| Account email/name and workspace membership | Authentication, authorization and beta access | Authorized application operators and workspace members as role permits |
| Design Documents, projects and immutable revisions | Editing, history, export, share and deployment | Workspace members; public viewers only through an active bearer share |
| AI prompt and run metadata | Requested generation/edit, quality and safe failure diagnosis | Authorized user, server worker and configured Gemini processor |
| Token usage ledger | Enforce budget and aggregate usage accounting | Server/operator aggregate surfaces |
| Export/deployment artifact metadata | Produce/download/deploy immutable output and reconcile jobs | Authorized workspace and private object store/worker |
| Vercel OAuth credential | Deployment to the selected account | Server only, AES-256-GCM encrypted; never browser/log/metric/queue payload |
| Operational health/metrics | Reliability, capacity and incident response | Internal bearer and private network only; bounded labels contain no resource IDs |

ZenUI does not intentionally store raw Gemini responses in logs or metrics. Contact forms are visual only. MVP accepts remote image URLs rather than uploaded image files.

## Processors and disclosures

- Google Gemini receives the minimum prompt/document context required for the selected AI operation. Model output is untrusted and schema/semantic validated.
- Vercel receives one validated static deployment artifact and deployment metadata only after owner confirmation.
- The configured S3-compatible object store holds private export/deployment artifacts.
- An active public share is a bearer link: anyone who obtains it can view the pinned revision until disabled. `noindex` reduces discovery but is not authorization.
- Remote images are browser-fetched. Even with no-referrer, the image host sees viewer IP/network metadata and can remove or change the asset. The Phase 7 HTTPS hostname allowlist narrows hosts but is not an anonymizing proxy. Local visual demos may use the exact `images.unsplash.com` and `images.pexels.com` CDN hosts; no provider wildcard or arbitrary HTTPS source is allowed.
- The production target is fetch-normalize-store: a guarded worker imports bounded raster content, strips metadata, re-encodes it and stores an immutable ZenUI-owned asset. Until that pipeline ships, remote-image privacy and availability remain explicit limitations.

## Conservative beta retention

- Structured operational logs managed by the deployment backend: 14 days. Logs must exclude prompt, document, token, ciphertext, artifact key, provider body, bearer slug and raw URL query.
- AI prompt and terminal generation metadata: prompt content is redacted after 30 days; safe durable audit/usage aggregates remain. Projects and immutable revisions are not deleted by this job.
- Failed terminal export/deployment metadata: sensitive snapshots/artifact/provider references are de-referenced after 30 days once deployment reconciliation is no longer pending. `provider_outcome_unknown` is excluded until reconciled/manual review.
- Disabled share metadata: retained for 90 days then marked cleaned. Public lookup stops immediately at disable; cleanup is not the revocation mechanism.
- Projects, current documents and revisions: retained until owner deletion. Automated retention never deletes them.
- Object deletion is a separate idempotent operation driven from durable database candidates; an object still referenced by an active database row must not be deleted.

Cleanup runs in bounded batches, supports dry-run and returns count-only results. Rows receive `retained_cleanup_at` so repeated execution is idempotent. Operators must run dry-run, inspect aggregate counts, execute and rerun to confirm zero candidates.

## User controls and incidents

Owners can disable public links, disconnect Vercel credentials, export standalone HTML and retain/restore immutable revisions. Project deletion and account data-request workflows are not yet exposed as complete beta self-service; requests use the beta support/incident contact published by the operator.

Suspected credential exposure requires disabling the connection, rotating the keyring under the documented ceremony and reviewing deployment reconciliation. Suspected bearer-link exposure requires immediate disable. Database recovery follows the checksum-verified restore procedure and must not reuse production credentials in drills.

## Known limitations

- Private beta is not represented as a compliance certification or production high-availability service.
- Local Docker evidence does not prove managed-provider backup/RPO/RTO, multi-region availability or production capacity.
- No image privacy proxy/package exists; allowlisted remote hosts still see viewer network metadata.
- Live Gemini/Vercel acceptance depends on explicit credentials and remains recorded as skipped when absent.
