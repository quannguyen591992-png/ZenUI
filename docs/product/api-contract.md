# Internal API Contract v1

This Phase 0 document defines conventions; endpoints are implemented in later phases.

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

## Planned resources

| Method | Path | Purpose | Key status |
|---|---|---|---|
| POST | `/api/v1/projects` | Create project in current workspace | 201 |
| GET | `/api/v1/projects/:projectId` | Read authorized project | 200/404 |
| PUT | `/api/v1/projects/:projectId/document` | Replace validated draft at expected version | 200/409/422 |
| POST | `/api/v1/projects/:projectId/commands` | Apply atomic command batch | 200/409/422 |
| GET | `/api/v1/projects/:projectId/revisions` | List immutable revisions | 200 |
| POST | `/api/v1/projects/:projectId/revisions/:revisionId/restore` | Restore into a new draft version | 200/409 |
| POST | `/api/v1/projects/:projectId/generation-runs` | Queue AI generation/edit | 202/429 |
| POST | `/api/v1/projects/:projectId/exports` | Queue immutable HTML artifact | 202 |
| POST | `/api/v1/projects/:projectId/share-links` | Share one revision | 201 |
| POST | `/api/v1/projects/:projectId/deployments` | Deploy one revision | 202/409/429 |

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

Read operations may use 404 to avoid tenant enumeration. State-changing operations use CSRF-safe Auth.js session patterns and same-site secure cookies.
