# Internal API Contract v1

This document defines the v1 conventions and tracks the Phase 2 endpoint implementation status. Implemented routes still follow the same envelopes and authorization invariants.

## Conventions

- Base path: `/api/v1`.
- Resource names: plural, lowercase and kebab-case.
- JSON fields: camelCase.
- Every request body/query/path input is schema-validated.
- Every protected operation authenticates the session and scopes the resource to a workspace.
- Collection endpoints use cursor pagination when needed.

## Envelopes

Success:

```json
{
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Safe user-facing message",
    "details": [
      { "path": "documentVersion", "code": "stale_document_version", "message": "Expected version 12" }
    ]
  }
}
```

No stack trace, SQL detail, provider token or provider response body is returned.

## Resources and implementation status

| Method | Path | Purpose | Key status | Phase 2 state |
|---|---|---|---|---|
| GET | `/api/v1/projects?workspaceId=:workspaceId` | List projects in an authorized workspace | 200/401/404/422 | Implemented |
| POST | `/api/v1/projects` | Create project in an authorized workspace | 201/401/403/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId` | Read authorized project | 200/404/422 | Implemented |
| PATCH | `/api/v1/projects/:projectId` | Rename an authorized project | 200/403/404/422 | Implemented |
| DELETE | `/api/v1/projects/:projectId` | Soft-archive an authorized project | 200/403/404/422 | Implemented |
| GET | `/api/v1/projects/:projectId/document` | Read the validated current draft and version | 200/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/commands` | Apply an atomic command batch | 200/401/403/404/409/422 | Implemented |
| GET | `/api/v1/projects/:projectId/revisions` | List immutable revisions | 200/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/revisions` | Snapshot the current server draft | 201/403/404/422 | Implemented |
| POST | `/api/v1/projects/:projectId/revisions/:revisionId/restore` | Restore into a new draft version | 200/403/404/409/422 | Implemented |
| POST | `/api/v1/projects/:projectId/generation-runs` | Queue AI generation/edit | 202/429 | Phase 3 |
| POST | `/api/v1/projects/:projectId/exports` | Queue immutable HTML artifact | 202 | Phase 4 |
| POST | `/api/v1/projects/:projectId/share-links` | Share one revision | 201 | Phase 5 |
| POST | `/api/v1/projects/:projectId/deployments` | Deploy one revision | 202/409/429 | Phase 6 |

## Optimistic document writes

Request:

```json
{
  "expectedVersion": 12,
  "commands": []
}
```

- The server compares `expectedVersion` with the current draft version.
- A mismatch returns HTTP 409 with `stale_document_version`.
- A command batch is all-or-nothing.
- One accepted batch increments the version once.

## Authorization invariant

```text
Authenticated user
       |
       v
Workspace membership ---- no ----> 404/403 without resource detail
       |
      yes
       v
Project belongs to workspace ---- no ----> 404
       |
      yes
       v
Permission for operation ---- no ----> 403
       |
      yes
       v
Execute resource operation
```

Read operations use 404 to avoid tenant enumeration. Auth.js sessions use HTTP-only, secure, same-site cookies. Every state-changing project route enforces an exact trusted `Origin` policy before parsing the body or invoking repository mutation; missing, `null` or foreign origins return safe HTTP 403 `invalid_origin`. The trusted origin is configured server-side with `APP_ORIGIN`.
