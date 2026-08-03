# Database backup and restore procedure

## Scope and safety

ZenUI uses PostgreSQL custom-format dumps plus a SHA-256 manifest. Dumps and manifests are ignored by Git. The wrappers emit count-only operator results and never print database URLs, passwords, row contents, credentials, prompts, documents or artifact keys.

A restore is refused when `RESTORE_TARGET_ENVIRONMENT=production`. By default the target must contain no user tables; `RESTORE_ALLOW_NONEMPTY=true` is an explicit non-production operator override only. Production recovery must use the managed-database recovery procedure and a separately approved change record.

## Backup

1. Select an encrypted, access-controlled output directory outside the repository.
2. Set `DATABASE_URL` and `BACKUP_OUTPUT=/secure/path/zenui-YYYYMMDD.dump`.
3. Run `pnpm backup:database` on a host with matching PostgreSQL client tools.
4. Store the generated `.dump.sha256.json` beside the dump.
5. Record only the operator result, byte count, checksum and timestamps in the recovery ticket; do not paste the URL or dump.

## Restore drill

1. Create a new non-production empty database; never restore over the source.
2. Set `RESTORE_DATABASE_URL`, `RESTORE_INPUT`, `RESTORE_MANIFEST` and `RESTORE_TARGET_ENVIRONMENT=test|staging`.
3. Run `pnpm restore:database`.
4. Apply/check migrations and compare source/restore aggregate table counts.
5. Verify tenant isolation, project/revision immutability, usage totals, artifact metadata and one encrypted provider credential decrypt with the staged keyring. Do not print plaintext/ciphertext.
6. Revoke access and destroy the drill database/dump under the environment's secure deletion policy.

## Local evidence — 2026-07-23

The Docker PostgreSQL 17.7 topology was dumped in custom format, checksum-verified, copied into the container and restored into a new `zenui_restore` database. Source and restored databases both contained four public tables at this pre-migration topology point. The first wrapper attempt correctly failed because PostgreSQL client binaries were absent on the Windows host; the successful drill ran the same `pg_dump`/`pg_restore` flags inside the pinned container. No dump or manifest remains in the workspace.

This local drill proves wrapper guards, custom-format integrity and basic restore mechanics. It does not prove managed-provider point-in-time recovery, encryption-at-rest, offsite replication, RPO/RTO or production-sized restore duration; those remain deployment-environment gates.
