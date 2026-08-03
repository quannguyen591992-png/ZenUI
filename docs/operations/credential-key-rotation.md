# Provider credential key rotation

ZenUI keeps Vercel OAuth credentials encrypted with AES-256-GCM and tenant-bound AAD. The worker reads a versioned keyring from `PROVIDER_CREDENTIAL_KEYS` and encrypts only with `PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION` while retaining explicitly configured previous keys for decryption.

## Rotation ceremony

1. Generate a new 32-byte random key outside the repository and encode it as base64.
2. Add the new version to `PROVIDER_CREDENTIAL_KEYS` on every web/worker instance while leaving the old version present. Do not change the active version yet.
3. Deploy and verify every instance can start with the expanded keyring.
4. Change `PROVIDER_CREDENTIAL_ACTIVE_KEY_VERSION` to the new version and deploy readers/writers.
5. Run the offline rotation command in dry-run mode. Its output is count-only and must not contain connection IDs, ciphertext or plaintext.
6. Run bounded batches. Each row decrypts by its envelope version and updates with compare-and-swap on the expected old version.
7. Verify `countCredentialsByKeyVersion(oldVersion) === 0` and exercise a provider status operation.
8. Remove the old key only after the zero-count check, a backup/restore checkpoint and the agreed rollback window.

## Failure and rollback

- Unknown/missing key versions fail closed with `credential_decryption_failed`.
- A compare-and-swap miss is counted as failed and never overwrites a concurrently rotated/disconnected row.
- If a batch fails, keep both versions deployed, correct the cause and rerun; rotation is idempotent at the row/version boundary.
- Rollback means restoring the previous keyring and active version. Never attempt to reconstruct a retired key from database data.
- Do not expose rotation through a browser/API endpoint and do not log environment values or credential envelopes.
