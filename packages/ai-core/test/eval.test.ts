import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  loadEvalDataset,
  loadSiteIntelligenceEvalDataset,
  runDeterministicEval,
  runSiteIntelligenceEval,
} from '../src/eval.js'

const fixture = fileURLToPath(new URL('./fixtures/eval-v1.json', import.meta.url))
const siteIntelligenceFixture = fileURLToPath(new URL('./fixtures/site-intelligence-eval-v1.json', import.meta.url))

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
})
