# ADR-0012: Production image import and immutable asset delivery boundary

- Status: Accepted
- Date: 2026-07-24

## Context

Browser-direct third-party images were sufficient for a bounded local visual demo, but they disclose viewer IP addresses, can redirect or disappear, and leave image availability outside ZenUI's revision boundary. Accepting a model- or user-supplied URL at a server proxy would introduce SSRF, decompression-bomb and content-confusion paths. Production rendering also needs one image reference that remains consistent across Canvas, isolated Preview, Share, Export and Deploy without storing an environment-specific public origin in the Design Document.

## Decision

1. Pexels is the first official image provider behind a provider-neutral server-only adapter. Gemini may emit only a bounded search query paired with descriptive alt text; it cannot select a download URL. The adapter calls the fixed Pexels search endpoint, validates the response and returns a provider result ID, attribution and a source URL from the provider's exact approved image host.
2. Image import runs in the worker through `@zenui/asset-core`. Queue payloads contain local IDs only, never provider credentials or an arbitrary remote URL. Every request validates HTTPS URL structure, exact hostname and DNS A/AAAA answers and rejects any private/reserved/mixed destination. Stage 10A's fixed-provider adapter uses a stricter no-redirect policy: any 3xx response fails closed instead of following another hop. A future transport that permits redirects must pin the validated address while retaining the original hostname/SNI and revalidate every hop before replacing this stricter policy.
3. The importer enforces declared and streamed byte limits, accepts only matching JPEG/PNG/WebP MIME and magic bytes, bounds decoded pixels and dimensions, rejects malformed/animated/unsupported input, auto-rotates, strips metadata, resizes within limits and deterministically re-encodes WebP with Sharp. It verifies output size, computes SHA-256 and stores the immutable object in the existing private S3-compatible bucket.
4. PostgreSQL owns a workspace/project-scoped asset lifecycle (`queued`, `importing`, `ready`, `failed`) and safe provider/attribution/object metadata. Provider API keys, S3 credentials, raw model output and provider response bodies are never persisted or exposed. Import failure uses an allowlisted error code; an optional generated image is omitted without another Gemini call or mutation of the accepted document.
5. New Design Documents store the strict canonical image shape `{ assetId, alt }`, where `assetId` is a random opaque UUID. Existing `{ src, alt }` documents remain readable during migration and continue through the existing remote-host validation. Public origin and object-store keys are not document data.
6. The shared renderer resolves canonical images as `${ASSET_ORIGIN}/a/<assetId>` for Canvas, Preview, Share, Export and Deploy. Production requires an exact cookie-free asset hostname separate from the editor hostname. A public route returns only ready assets from private storage with exact `image/webp`, content length, strong ETag, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: cross-origin`, and no cookie or tenant/object/provider metadata.
7. Public asset URLs are unguessable bearer references, not an authorization boundary for confidential media. Random UUIDs prevent practical enumeration; asset IDs are not derived only from public content hashes. Deleting, revoking or private-media access semantics are outside this generated public landing-page stage.

## Alternatives considered

### Continue browser-direct provider CDN URLs

- Simpler and avoids worker/storage work.
- Rejected because provider hosts observe each viewer, content can change or disappear, and immutable revisions do not own their image bytes.

### Expose an arbitrary URL proxy/import endpoint

- Would support more providers and future user-supplied URLs with one API.
- Rejected because it turns untrusted URLs into a general SSRF primitive and conflicts with the fixed-provider, local-ID-only queue boundary.

### Serve assets through an authenticated editor-cookie endpoint

- Reuses existing session and project authorization.
- Rejected because Share/Export/Deploy are public surfaces, editor cookies must not cross the asset host boundary, and immutable public pages need stable cacheable URLs.

### Use only the normalized content hash as the public asset ID

- Naturally deduplicates identical bytes.
- Rejected because it reveals cross-project equality, makes IDs predictable when source bytes are known and couples public routing to storage deduplication. SHA-256 remains internal integrity metadata; the public ID is random.

### Store the full asset URL in every Design Document

- Requires no renderer configuration.
- Rejected because environment-specific origins would be frozen into revisions and could diverge between Canvas, Preview, Share, Export and Deploy.

## Consequences

- Generated production pages no longer contact Pexels/Unsplash and one immutable asset URL is shared by every rendering surface.
- The system gains a high-risk network ingestion boundary that requires explicit SSRF, redirect, DNS-pinning, raster-decoding, storage-integrity and redaction tests before release.
- Pexels attribution/result metadata remains durable and server-owned for future product presentation, while public delivery reveals only normalized image bytes.
- Worker latency and private storage usage increase; import and generation/provider retry budgets must remain independent.
- Legacy remote images remain a temporary privacy/availability risk until migrated; new generation must use canonical asset references.
- A live credentialed Pexels smoke remains an explicit external gate. Deterministic tests and local fixtures must not call Pexels or Gemini.
