import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAssistantRolloutConfig, parseLiveEvalConfig } from './ai-eval.mjs'

describe('guarded live AI eval configuration', () => {
  it('skips by default without requiring credentials', () => {
    assert.deepEqual(parseLiveEvalConfig({}), { live: false })
  })

  it('requires explicit credentials and bounded limits', () => {
    assert.throws(() => parseLiveEvalConfig({ AI_EVAL_LIVE: 'true' }), /GOOGLE_GENERATIVE_AI_API_KEY/)
    const base = {
      AI_EVAL_LIVE: 'true', GOOGLE_GENERATIVE_AI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-test',
    }
    assert.deepEqual(parseLiveEvalConfig(base), {
      live: true, maxCases: 3, maxTokens: 4096, concurrency: 1,
    })
    assert.throws(() => parseLiveEvalConfig({ ...base, AI_EVAL_MAX_CASES: '11' }), /MAX_CASES/)
    assert.throws(() => parseLiveEvalConfig({ ...base, AI_EVAL_MAX_TOKENS: '100000' }), /MAX_TOKENS/)
    assert.throws(() => parseLiveEvalConfig({ ...base, AI_EVAL_CONCURRENCY: '2' }), /must be 1/)
  })

  it('keeps rollout modes explicit and fail closed', () => {
    assert.deepEqual(parseAssistantRolloutConfig({}), { mode: 'disabled', samplePercent: 0 })
    assert.deepEqual(parseAssistantRolloutConfig({ AI_ASSISTANT_ROLLOUT_MODE: 'shadow', AI_ASSISTANT_SHADOW_SAMPLE_PERCENT: '10' }), {
      mode: 'shadow', samplePercent: 10,
    })
    assert.deepEqual(parseAssistantRolloutConfig({ AI_ASSISTANT_ROLLOUT_MODE: 'opt-in' }), {
      mode: 'opt-in', samplePercent: 0,
    })
    assert.throws(() => parseAssistantRolloutConfig({ AI_ASSISTANT_ROLLOUT_MODE: 'default' }), /invalid/)
    assert.throws(() => parseAssistantRolloutConfig({ AI_ASSISTANT_ROLLOUT_MODE: 'shadow', AI_ASSISTANT_SHADOW_SAMPLE_PERCENT: '101' }), /invalid/)
  })
})
