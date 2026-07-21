# Phase 0 Threat Model

## Scope

Assets:

- Auth.js session and workspace membership.
- Design Documents and immutable revisions.
- User prompts and Gemini responses.
- Vercel OAuth credentials and deployment artifacts.
- Share links and public preview content.
- AI/deployment usage budget.

## Trust boundaries

```text
+---------------- User browser ----------------+
|                                              |
|  +---------------- Editor ----------------+  |
|  | Authenticated; no provider secrets     |  |
|  +-------------------+--------------------+  |
|                      | HTTPS                 |
+----------------------+-----------------------+
                       v
+---------------- Application boundary ----------------+
| Auth / workspace authorization / schema validation   |
|                                                       |
|    +------------------+      +--------------------+    |
|    | PostgreSQL       |      | Queue / workers    |    |
|    | tenant data      |      | bounded jobs       |    |
|    +------------------+      +----------+---------+    |
+-----------------------------------------+--------------+
                                          |
                         +----------------+----------------+
                         |                                 |
                         v                                 v
               +------------------+             +------------------+
               | Google Gemini    |             | Vercel API       |
               | untrusted output |             | encrypted OAuth  |
               +------------------+             +------------------+

Separate browser origin:

Editor <---- validated postMessage ----> Sandboxed Preview
 auth cookies                            no editor credentials
```

## Data flow: AI generation/edit

```text
User prompt
    |
    v
Length/rate/policy validation
    |
    v
Minimal context builder ----> redact secrets
    |
    v
Google Gemini
    |
    v
Untrusted structured output
    |
    v
Zod schema -> semantic/tree/URL/limit validation
    |
    +---- invalid -> bounded repair (max 2) -> safe failure
    |
    v
Atomic command transaction
    |
    v
New document version/revision
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Prompt injection requests forbidden actions | Unauthorized changes/data exposure | Fixed system policy, minimal context, typed operation allowlist, no secret in prompt | 3 |
| Malformed model output | Broken document/editor crash | Strict schema, semantic validator, atomic apply, bounded repair | 0/3 |
| AI creates unsafe URL | XSS/data exfiltration | HTTP(S)/internal URL allowlist and compiler escaping | 0/4 |
| AI cost loop | Cost/availability | User/workspace rate limit, token/time/retry budget, usage ledger | 3 |

## Data flow: preview

```text
Validated Design Document
          |
          v
Shared deterministic renderer/compiler
          |
          v
Separate-origin iframe with sandbox + CSP
          |
          +---- no arbitrary generated JavaScript
          |
          v
Bridge script owned by application
          |
          v
Exact origin + event schema validation
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| Preview reads editor cookie/storage | Account compromise | Separate registrable origin, no shared cookies, no token in URL/message | 4 |
| Forged `postMessage` | Unauthorized editor action | Exact origin/source check and discriminated event schema | 4 |
| Generated HTML/script executes | XSS/exfiltration | No generated script, output escaping, strict CSP, iframe sandbox | 4 |
| Remote image tracks viewer | Privacy leakage | Document policy disclosure; optional proxy/allowlist before beta | 4/7 |

## Data flow: Vercel deployment

```text
User confirms revision
        |
        v
Authorization + idempotency check
        |
        v
Immutable export artifact
        |
        v
Queue job ----> encrypted server-only OAuth credential
        |
        v
Vercel API
        |
        v
Redacted status/error + deployed URL
```

Threats and controls:

| Threat | Impact | Required control | Owner phase |
|---|---|---|---|
| OAuth token exposed | External account compromise | Server-only encrypted storage, write-only logs, redaction, revoke flow | 6 |
| Double deployment | Cost/confusion | Idempotency key unique per request/revision/target | 6 |
| Draft changes during deploy | Wrong release | Pin immutable revision and artifact hash | 6 |
| Overbroad OAuth scope | Larger blast radius | Minimum scopes and explicit user confirmation | 6 |

## Workspace isolation

- Every protected table carries direct or derivable `workspaceId`.
- Resource services accept authenticated workspace context, not arbitrary client ownership claims.
- Cross-workspace access must fail before returning resource metadata.
- Provider connections belong to a workspace/user and cannot be referenced by another tenant.
- Authorization integration tests are required in Phase 2 and Phase 6.

## MVP policy decisions

- Images use validated remote HTTP(S) URLs; uploads are deferred.
- Contact Form is visual-only; no submission backend in MVP.
- Export is one standalone HTML file.
- Share links are persistent by default, pinned to a revision and disable-able.
- Fonts come from a controlled allowlist; custom font upload is deferred.
- Design limits: 500 nodes, depth 12, serialized JSON 1 MiB.

## Residual risks

1. Remote image URLs can disclose viewer IP; decide proxying before public beta.
2. Provider model behavior can change; maintain regression fixtures/evals.
3. Separate-origin deployment configuration can regress; verify headers/origins in E2E.
4. Static HTML has limited interactions because arbitrary JavaScript is intentionally excluded.
