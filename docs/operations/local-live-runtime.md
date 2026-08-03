# Local-live runtime

ZenUI local-live mode runs the product against local PostgreSQL, Redis/BullMQ and MinIO while sending AI generation to the configured Gemini model. It does not use PGlite or in-process generation/export mocks.

## Safety boundary

- Set `ZENUI_LOCAL_AUTH_ENABLED=true` only for local non-production work.
- `NODE_ENV=production` always disables the guarded local identity.
- Do not enable `ZENUI_LOCAL_AUTH_ENABLED` and `ZENUI_E2E_ENABLED` together.
- Local identity is fixed and signed with `AUTH_SECRET`; it is not a password login or production fallback.
- Keep `VERCEL_DEPLOYMENT_ENABLED=false` until a real Vercel Integration, OAuth configuration and credential keyring are available.
- Use `WORKER_SERVICES=generation,asset,export` for the current local stack. This starts the bounded asset normalizer but no Vercel deployment or reconciliation worker.
- Set `ASSET_ORIGIN=http://127.0.0.1:3002` and keep it isolated from the `localhost` editor hostname. Owned normalized assets are resolved from this cookie-free origin in Canvas, Preview, Share, Export and Deploy.
- Set `PEXELS_API_KEY` only in the server/worker environment. Search returns redacted result IDs and previews; import jobs carry only local IDs and the worker re-resolves the fixed provider result.
- `REMOTE_IMAGE_HOST_ALLOWLIST` remains a migration-only exact-host policy for legacy documents. New image and logo references use owned asset IDs rather than remote URLs.

## Local endpoints

- Editor: `http://localhost:3000`
- Isolated preview: `http://127.0.0.1:3001`
- Cookie-free asset origin: `http://127.0.0.1:3002`
- Worker health: `http://127.0.0.1:9464/health/ready`
- MinIO console: `http://127.0.0.1:59001`

The root ignored `.env` must point to topology ports `55432` (PostgreSQL), `56379` (Redis) and `59000` (MinIO API). Real secrets remain in `.env` and must not be copied into this document.

## Start

```bash
pnpm local:up
pnpm dev
```

Root `pnpm dev` starts Web, Preview and the Worker through Turbo. It fails before spawning if ports `3000`, `3001` or `9464` are already occupied, so stop the previous ZenUI process first rather than running overlapping topologies. The Worker reads `WORKER_SERVICES`, must report ready at `http://127.0.0.1:9464/health/ready`, and exposes only its random instance ID plus enabled service names at `/health/instance`; startup verifies that the current instance has `generation` enabled. For production-style non-watch execution, run `pnpm --filter @zenui/worker start` instead.

Run `pnpm local:up` after pulling database changes so every pending migration is applied before Worker recovery starts. A dependency-health response alone is not sufficient evidence if the database schema is stale.

`pnpm local:up` applies forward migrations, idempotently seeds the fixed local owner/workspace and creates the `zenui` MinIO bucket. Running it again is safe and does not delete projects.

Create the local session from the browser console at the editor origin:

```js
await fetch('/api/e2e/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ identity: 'owner' }),
})
location.reload()
```

Despite the compatibility route name, local-live mode uses PostgreSQL and real infrastructure. Only `ZENUI_E2E_ENABLED=true` selects PGlite and deterministic mocks.

## Verified local behavior

- Web readiness checks PostgreSQL and Redis.
- Worker readiness checks PostgreSQL, Redis and the exact MinIO bucket.
- AI requests persist a durable run, enqueue metadata-only BullMQ work and call Gemini from the worker.
- For a capped one-call Generate smoke, set `AI_GENERATE_MAX_REPAIR_ATTEMPTS=0`, `AI_PROVIDER_MAX_TRANSIENT_RETRIES=0`, `AI_PROVIDER_HTTP_ATTEMPTS=1`, `AI_GENERATION_QUEUE_ATTEMPTS=1` and a recovery interval longer than the smoke window before starting Web/worker. The first accepted browser action is then the only admitted provider call; do not click Generate again.
- Asset jobs read private uploads or fixed Pexels result IDs, validate MIME/magic and decoded limits, normalize deterministic WebP, then publish immutable bytes through the exact asset host.
- The fixed-provider download policy is no-redirect and fail-closed. Any 3xx response becomes a safe import failure; do not enable automatic redirect following without a new per-hop DNS/address-pinning/SNI security review.
- Brand Kit save/apply is owner-only and versioned. Applying requires the current saved draft version; optional logos must be ready workspace assets.
- Export compiles in the worker, uploads privately to MinIO and downloads through the authenticated BFF.
- Share pins an immutable revision and renders with noindex/no-store/CSP on the isolated local share host.
- Deploy UI reports that Vercel is not configured; it does not silently use a mock provider.

## Current cost note

The first successful live edit completed through Gemini but consumed 47,883 aggregate tokens because the full operations contract was embedded and repair attempts were used. Do not use repeated live smoke requests until the contract/context budget is optimized. Deterministic tests remain the default regression gate.

## Stop

Stop the web, preview and worker processes gracefully, then run:

```bash
pnpm local:down
```

This stops containers without deleting volumes. There is intentionally no automatic reset in the default local workflow.
