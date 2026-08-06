import { pathToFileURL } from 'node:url'

import {
  loadAssistantV2EvalDataset,
  loadEvalDataset,
  loadSiteIntelligenceEvalDataset,
  runAssistantV2Eval,
  runDeterministicEval,
  runSiteIntelligenceEval,
} from '../packages/ai-core/dist/eval.js'

export function parseAssistantRolloutConfig(environment = process.env) {
  const mode = environment.AI_ASSISTANT_ROLLOUT_MODE ?? 'disabled'
  if (!['disabled', 'shadow', 'opt-in'].includes(mode)) throw new Error('AI_ASSISTANT_ROLLOUT_MODE is invalid')
  const samplePercent = Number(environment.AI_ASSISTANT_SHADOW_SAMPLE_PERCENT ?? '0')
  if (!Number.isInteger(samplePercent) || samplePercent < 0 || samplePercent > 100) {
    throw new Error('AI_ASSISTANT_SHADOW_SAMPLE_PERCENT is invalid')
  }
  if (mode !== 'shadow' && samplePercent !== 0) {
    throw new Error('AI_ASSISTANT_SHADOW_SAMPLE_PERCENT requires shadow rollout mode')
  }
  return { mode, samplePercent }
}

export function parseLiveEvalConfig(environment = process.env) {
  if (environment.AI_EVAL_LIVE !== 'true') return { live: false }
  if (!environment.GOOGLE_GENERATIVE_AI_API_KEY) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required')
  if (!environment.GEMINI_MODEL) throw new Error('GEMINI_MODEL is required')
  const maxCases = Number(environment.AI_EVAL_MAX_CASES ?? '3')
  const maxTokens = Number(environment.AI_EVAL_MAX_TOKENS ?? '4096')
  const concurrency = Number(environment.AI_EVAL_CONCURRENCY ?? '1')
  if (!Number.isInteger(maxCases) || maxCases < 1 || maxCases > 10) throw new Error('AI_EVAL_MAX_CASES is invalid')
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 8192) throw new Error('AI_EVAL_MAX_TOKENS is invalid')
  if (!Number.isInteger(concurrency) || concurrency !== 1) throw new Error('AI_EVAL_CONCURRENCY must be 1')
  return { live: true, maxCases, maxTokens, concurrency }
}

async function main(environment = process.env) {
  const dataset = await loadEvalDataset(new URL('../packages/ai-core/test/fixtures/eval-v1.json', import.meta.url))
  const report = await runDeterministicEval(dataset)
  console.log(JSON.stringify({
    version: report.version,
    mode: 'deterministic',
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    accepted: report.accepted,
  }))
  if (!report.accepted) process.exitCode = 1

  const siteIntelligenceDataset = await loadSiteIntelligenceEvalDataset(
    new URL('../packages/ai-core/test/fixtures/site-intelligence-eval-v1.json', import.meta.url),
  )
  const siteIntelligenceReport = runSiteIntelligenceEval(siteIntelligenceDataset)
  console.log(JSON.stringify({
    version: siteIntelligenceReport.version,
    mode: 'deterministic',
    total: siteIntelligenceReport.total,
    passed: siteIntelligenceReport.passed,
    failed: siteIntelligenceReport.failed,
    locales: siteIntelligenceReport.locales,
    accepted: siteIntelligenceReport.accepted,
  }))
  if (!siteIntelligenceReport.accepted) process.exitCode = 1

  const assistantV2Dataset = await loadAssistantV2EvalDataset(
    new URL('../packages/ai-core/test/fixtures/assistant-v2-eval-v1.json', import.meta.url),
  )
  const assistantV2Report = await runAssistantV2Eval(assistantV2Dataset)
  console.log(JSON.stringify({
    version: assistantV2Report.version,
    mode: 'deterministic',
    total: assistantV2Report.total,
    passed: assistantV2Report.passed,
    failed: assistantV2Report.failed,
    metrics: assistantV2Report.metrics,
    accepted: assistantV2Report.accepted,
  }))
  if (!assistantV2Report.accepted) process.exitCode = 1

  const live = parseLiveEvalConfig(environment)
  if (!live.live) {
    console.log(JSON.stringify({ mode: 'live', outcome: 'skipped', reason: 'AI_EVAL_LIVE_not_enabled' }))
    return
  }
  throw new Error('live_eval_adapter_not_configured')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ mode: 'live', outcome: 'failed', code: 'eval_failed' }))
    process.exitCode = 1
  })
}
