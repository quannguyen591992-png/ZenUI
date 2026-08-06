import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  loadAssistantV2EvalDataset,
  loadEvalDataset,
  loadSiteIntelligenceEvalDataset,
  runAssistantV2Eval,
  runDeterministicEval,
  runSiteIntelligenceEval,
} from '../src/eval.js'

const fixture = fileURLToPath(new URL('./fixtures/eval-v1.json', import.meta.url))
const siteIntelligenceFixture = fileURLToPath(new URL('./fixtures/site-intelligence-eval-v1.json', import.meta.url))
const assistantV2Fixture = fileURLToPath(new URL('./fixtures/assistant-v2-eval-v1.json', import.meta.url))

describe('TD-009 deterministic prompt-quality eval', () => {
  it('passes all versioned generation/edit/safety cases through the production pipeline', async () => {
    const report = await runDeterministicEval(await loadEvalDataset(fixture))
    expect(report).toMatchObject({
      version: 'td-009-v1', total: 6, passed: 6, failed: 0, passRate: 1, accepted: true,
      thresholds: { passRate: 1, maxRepairAttempts: 0 },
    })
    expect(report.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'injection', code: 'scope_violation', passed: true }),
      expect.objectContaining({ id: 'invalid-image', code: 'invalid_model_output', passed: true }),
    ]))
  })

  it('rejects malformed datasets and reports misses without raw prompts or outputs', async () => {
    await expect(runDeterministicEval({ version: 'td-009-v1', cases: [] })).rejects.toThrow()
    const report = await runDeterministicEval({
      version: 'td-009-v1',
      cases: [{ id: 'mismatch', mode: 'generate', prompt: 'Create valid output', expected: 'scope_violation' }],
    })
    expect(report).toMatchObject({ accepted: false, passed: 0, failed: 1 })
    expect(JSON.stringify(report)).not.toContain('Create valid output')
    expect(JSON.stringify(report)).not.toContain('nodes')
  })

  it('passes the versioned Vietnamese and English site-intelligence eval set', async () => {
    const report = runSiteIntelligenceEval(await loadSiteIntelligenceEvalDataset(siteIntelligenceFixture))

    expect(report).toMatchObject({
      version: 'site-intelligence-eval-v1', total: 2, passed: 2, failed: 0, passRate: 1, accepted: true,
      locales: ['en', 'vi'],
    })
    expect(report.results.every(result => result.evidenceGrounded && result.citationsGrounded)).toBe(true)
    expect(JSON.stringify(report)).not.toContain('NovaFlow')
    expect(JSON.stringify(report)).not.toContain('LaunchMap')
  })

  it('passes the bounded bilingual AI Co-designer v2 intent, scope and semantic media eval', async () => {
    const judgeInputs: unknown[] = []
    const report = await runAssistantV2Eval(await loadAssistantV2EvalDataset(assistantV2Fixture), {
      mediaJudge: {
        evaluateBatch: input => {
          judgeInputs.push(input)
          return Promise.resolve({
            output: input.candidates.map(candidate => ({
              candidateId: candidate.candidateId,
              semanticRelevance: 0.96,
              representationMatch: 0.97,
              mustIncludeCoverage: 0.95,
              compositionFit: 0.94,
              websiteUsability: 0.93,
              confidence: 0.96,
              violations: [],
              safeReason: 'Deterministic fixture match.',
            })),
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          })
        },
      },
    })
    expect(report).toMatchObject({
      version: 'assistant-v2-eval-v1', total: 12, passed: 12, failed: 0, accepted: true,
      thresholds: { routeAccuracy: 0.95, scopeEscapes: 0, semanticMediaPassRate: 0.85 },
      metrics: { routeAccuracy: 1, scopeEscapes: 0, semanticMediaPassRate: 1 },
      locales: ['en', 'vi'],
    })
    expect(judgeInputs).toHaveLength(2)
    expect(judgeInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        brief: expect.objectContaining({ representation: 'process-diagram', peoplePolicy: 'forbidden' }),
        candidates: [expect.objectContaining({ bytes: expect.any(Uint8Array) })],
      }),
      expect.objectContaining({
        brief: expect.objectContaining({ representation: 'product-ui', peoplePolicy: 'forbidden' }),
        candidates: [expect.objectContaining({ bytes: expect.any(Uint8Array) })],
      }),
    ]))
    expect(JSON.stringify(report)).not.toMatch(/prompt|generationPrompt|searchQuery|bytes|provider/)
  })

  it('fails the semantic media gate when the deterministic judge rejects every fixture candidate', async () => {
    const dataset = await loadAssistantV2EvalDataset(assistantV2Fixture)
    const report = await runAssistantV2Eval(dataset, {
      mediaJudge: {
        evaluateBatch: input => Promise.resolve({
          output: input.candidates.map(candidate => ({
            candidateId: candidate.candidateId,
            semanticRelevance: 0.1,
            representationMatch: 0.1,
            mustIncludeCoverage: 0.1,
            compositionFit: 0.1,
            websiteUsability: 0.1,
            confidence: 0.9,
            violations: ['wrong_representation'],
            safeReason: 'Deterministic mismatch.',
          })),
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      },
    })

    expect(report).toMatchObject({
      accepted: false,
      metrics: { semanticMediaPassRate: 0 },
    })
  })
})
