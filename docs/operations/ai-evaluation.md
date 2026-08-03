# TD-009 AI evaluation

## Deterministic gate

`pnpm ai:eval` runs two versioned deterministic fixture sets:

1. `td-009-v1` passes generation/edit/safety cases through the same `runGeneration`, command transaction, schema, semantic and registry pipeline used by the worker. It covers generate, responsive intent, edit-page, edit-selection, prompt-injection scope escape and unsafe image output.
2. `site-intelligence-eval-v1` evaluates Vietnamese and English Website Briefs against deterministic Site Intelligence v1. It requires the expected content/mobile findings plus page evidence and exact brief goal/audience citations.

The mandatory threshold is 100% expected outcomes with zero repairs for the generation/edit set and 100% evidence-grounded outcomes for the Site Intelligence set. Reports contain case IDs, locales and aggregate flags only; prompts, briefs, generated documents, raw model output and provider bodies are excluded.

AI Core source keeps extensionless relative imports for workspace/Turbopack compatibility. Its build step adds explicit `.js` specifiers only to emitted `dist` files so the evaluation CLI can execute the ESM artifact directly in Node.

## Guarded live acceptance

Live evaluation is opt-in only:

- `AI_EVAL_LIVE=true`
- explicit `GOOGLE_GENERATIVE_AI_API_KEY` and `GEMINI_MODEL`
- `AI_EVAL_MAX_CASES` between 1 and 10 (default 3)
- `AI_EVAL_MAX_TOKENS` between 256 and 8192 (default 4096)
- `AI_EVAL_CONCURRENCY=1`

The current runner validates these caps and fails closed, but the live Gemini adapter is intentionally not enabled until an operator provides explicit credentials and accepts the cost. It does not retry storms or persist raw prompt/output artifacts. Until that credentialed acceptance is implemented and passes, TD-009 and the Phase 7 external-quality exit item remain open.

## Evidence

- 2026-07-23: deterministic `td-009-v1` passed 6/6 expected outcomes with zero repairs. Guard parser passed 2/2. Live outcome: `Skipped — AI_EVAL_LIVE_not_enabled`; no Gemini call and no cost incurred.
- 2026-07-28: deterministic `td-009-v1` remained 6/6 and `site-intelligence-eval-v1` passed 2/2 across `en` and `vi`. Guard parser remained 2/2. Live outcome remained skipped; no Gemini call or provider cost was incurred.
