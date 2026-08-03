import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseLiveEvalConfig } from './ai-eval.mjs'

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
})
