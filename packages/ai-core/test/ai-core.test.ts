import { createValidDesignFixture, validateDesignDocument } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import {
  AI_PROMPT_VERSION,
  aiCopyEditResponseJsonSchema,
  aiOperationBatchSchema,
  buildPromptContext,
  createMockLlmProvider,
  generationJobSchema,
  landingPageBlueprintJsonSchema,
  landingPageBlueprintSchema,
  landingPageBlueprintV2Schema,
  materializeLandingPageBlueprint,
  generationRequestSchema,
  generationStatusEventSchema,
  materializeAiCommands,
  normalizeAiEditResponse,
  runGeneration,
  type LLMProvider,
} from '../src/index.js'

const blueprint = {
  version: 1 as const,
  brand: 'ZenUI',
  theme: {
    primary: '#2563eb', background: '#ffffff', text: '#0f172a',
    headingFont: 'Manrope' as const, bodyFont: 'Manrope' as const,
  },
  navbar: {
    links: [{ text: 'Features', href: '#features' }],
    cta: { text: 'Get started', href: '#start' },
  },
  hero: {
    badge: 'AI landing pages',
    heading: 'Build better products faster',
    paragraph: 'Create a safe, structured landing page with AI.',
    cta: { text: 'Start now', href: '#start' },
  },
  features: [
    { icon: 'star' as const, heading: 'Structured output', paragraph: 'Every page stays valid.' },
    { icon: 'check' as const, heading: 'Safe editing', paragraph: 'Commands protect your document.' },
  ],
  closingCta: {
    heading: 'Ready to build?', paragraph: 'Create your landing page now.',
    cta: { text: 'Create page', href: '#start' },
  },
}

const blueprintV2 = {
  version: 2 as const,
  pagePreset: 'product-launch' as const,
  brand: 'ZenUI Launch',
  theme: {
    preset: 'violet' as const, mood: 'bold' as const, density: 'balanced' as const,
    headingFont: 'Manrope' as const, bodyFont: 'Manrope' as const,
  },
  navbar: {
    variant: 'compact' as const,
    links: [{ text: 'Benefits', href: '#benefits' }, { text: 'FAQ', href: '#faq' }],
    cta: { text: 'Join waitlist', href: '#start' },
  },
  hero: {
    variant: 'centered' as const,
    badge: 'Launching soon', heading: 'Meet the next generation of structured design',
    paragraph: 'Create polished, editable landing pages with a safe AI workflow.',
    primaryCta: { text: 'Join waitlist', href: '#start' },
    secondaryCta: { text: 'Explore benefits', href: '#benefits' },
  },
  sections: [
    {
      type: 'features' as const, variant: 'grid' as const, eyebrow: 'Built differently',
      heading: 'Quality without giving up control', paragraph: 'Every output remains structured and editable.',
      items: [
        { icon: 'star' as const, heading: 'Polished presets', paragraph: 'Reviewed compositions create stronger visual hierarchy.' },
        { icon: 'check' as const, heading: 'Safe output', paragraph: 'The model never owns HTML, CSS, JavaScript, or node IDs.' },
        { icon: 'arrow-right' as const, heading: 'Fast iteration', paragraph: 'Generate a complete page and keep improving individual sections.' },
      ],
    },
    {
      type: 'faq' as const, variant: 'stacked' as const, heading: 'Questions before launch',
      items: [
        { question: 'Is the page editable?', answer: 'Yes. Every generated element remains a structured design node.' },
        { question: 'Does AI run code?', answer: 'No. ZenUI materializes only allowlisted typed content.' },
        { question: 'Can we export it?', answer: 'Yes. The same validated document compiles to standalone HTML.' },
      ],
    },
    {
      type: 'final-cta' as const, variant: 'panel' as const,
      heading: 'Be first to build with ZenUI Launch', paragraph: 'Join the waitlist and get early access.',
      primaryCta: { text: 'Join waitlist', href: '#start' },
    },
    {
      type: 'footer' as const, variant: 'simple' as const,
      tagline: 'Structured AI design for ambitious teams.', columns: [],
      copyright: '© 2026 ZenUI Launch.',
    },
  ],
}

const request = {
  generationRunId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  userId: '44444444-4444-4444-8444-444444444444',
  mode: 'generate' as const,
  prompt: 'Create a focused product landing page',
  expectedVersion: 1,
}

describe('AI contracts', () => {
  it('validates strict generation requests, jobs and safe SSE events', () => {
    expect(generationRequestSchema.safeParse({
      workspaceId: request.workspaceId,
      requestId: crypto.randomUUID(),
      mode: 'generate',
      prompt: request.prompt,
      expectedVersion: 1,
    }).success).toBe(true)
    expect(generationRequestSchema.safeParse({
      workspaceId: request.workspaceId,
      requestId: crypto.randomUUID(),
      mode: 'edit-selection',
      prompt: request.prompt,
      expectedVersion: 1,
    }).success).toBe(false)
    expect(generationJobSchema.safeParse({
      generationRunId: request.generationRunId,
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      userId: request.userId,
    }).success).toBe(true)
    expect(generationJobSchema.safeParse(request).success).toBe(false)
    expect(generationStatusEventSchema.safeParse({
      runId: request.generationRunId,
      status: 'completed',
      repairAttempt: 0,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      documentVersion: 2,
      revisionId: crypto.randomUUID(),
    }).success).toBe(true)
    expect(generationStatusEventSchema.safeParse({
      runId: request.generationRunId,
      status: 'failed',
      prompt: 'must not leak',
    }).success).toBe(false)
  })

  it('exports a compact landing-page blueprint without tree, metadata or raw style fields', () => {
    const schema = landingPageBlueprintJsonSchema as { properties?: Record<string, unknown>; required?: string[] }

    expect(landingPageBlueprintSchema.safeParse(blueprint).success).toBe(true)
    expect(schema.required).toEqual(expect.arrayContaining(['version', 'brand', 'theme', 'hero', 'features']))
    expect(schema.properties).not.toHaveProperty('projectId')
    expect(schema.properties).not.toHaveProperty('nodes')
    expect(schema.properties).not.toHaveProperty('pages')
    expect(JSON.stringify(schema)).not.toMatch(/parentId|children|rawCss|javascript/i)
    expect(JSON.stringify(schema).length).toBeLessThan(12_000)
  })

  it('rejects blueprint tree control, unsafe content and unbounded feature lists', () => {
    expect(landingPageBlueprintSchema.safeParse({ ...blueprint, nodes: {} }).success).toBe(false)
    expect(landingPageBlueprintSchema.safeParse({
      ...blueprint,
      hero: { ...blueprint.hero, cta: { text: 'Run', href: 'javascript:alert(1)' } },
    }).success).toBe(false)
    expect(landingPageBlueprintSchema.safeParse({
      ...blueprint,
      features: Array.from({ length: 7 }, (_, index) => ({
        icon: 'star', heading: `Feature ${index}`, paragraph: 'Description',
      })),
    }).success).toBe(false)
  })

  it('materializes a deterministic valid document with server-owned metadata', () => {
    const current = createValidDesignFixture()
    current.projectId = request.projectId
    const first = materializeLandingPageBlueprint({ blueprint, current })
    const second = materializeLandingPageBlueprint({ blueprint, current })

    expect(first).toEqual(second)
    expect(first).toMatchObject({ accepted: true })
    if (!first.accepted) return
    expect(first.document.projectId).toBe(request.projectId)
    expect(first.document.version).toBe(1)
    expect(first.document.nodes['hero-heading']?.props).toMatchObject({ text: blueprint.hero.heading })
    expect(first.document.nodes['feature-card-1']).toBeDefined()
    expect(first.document.nodes['feature-card-2']).toBeDefined()
    expect(validateDesignDocument(first.document).success).toBe(true)
  })

  it('accepts only allowlisted metadata-free AI operations', () => {
    expect(aiOperationBatchSchema.safeParse({
      summary: 'Update the heading',
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Safer AI editing' } }],
    }).success).toBe(true)
    expect(aiOperationBatchSchema.safeParse({
      summary: 'Forged metadata',
      operations: [{
        type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Bad' },
        source: 'system', documentVersion: 999, commandId: 'forged',
      }],
    }).success).toBe(false)
    expect(aiOperationBatchSchema.safeParse({
      summary: 'Forbidden root replacement',
      operations: [{ type: 'REPLACE_DOCUMENT', document: createValidDesignFixture() }],
    }).success).toBe(false)
  })

  it('normalizes only context-authorized static copy edits into trusted update operations', () => {
    const context = buildPromptContext({
      mode: 'edit-selection',
      prompt: 'Đổi tiêu đề Hero ngắn gọn hơn',
      document: createValidDesignFixture(),
      selectedNodeId: 'heading-1',
    })

    expect(normalizeAiEditResponse({
      summary: 'Shortened Hero heading',
      updates: [{ nodeId: 'heading-1', property: 'text', value: 'AI chăm sóc khách hàng hiệu quả hơn' }],
    }, context)).toEqual({
      summary: 'Shortened Hero heading',
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'AI chăm sóc khách hàng hiệu quả hơn' } }],
    })
    for (const response of [
      { summary: 'Unknown node', updates: [{ nodeId: 'paragraph-1', property: 'text', value: 'No' }] },
      { summary: 'Invalid property', updates: [{ nodeId: 'heading-1', property: 'arbitrary', value: 'No' }] },
      { summary: 'Uneditable property', updates: [{ nodeId: 'heading-1', property: 'label', value: 'No' }] },
      { summary: 'Wrong scalar type', updates: [{ nodeId: 'heading-1', property: 'level', value: '2' }] },
      { summary: 'Serialized style object', updates: [{ nodeId: 'heading-1', property: 'text', value: '{"marginLeft":"auto","marginRight":"auto"}' }] },
      { summary: 'Serialized style array', updates: [{ nodeId: 'heading-1', property: 'text', value: '[{"marginLeft":"auto"}]' }] },
      { summary: 'Empty', updates: [] },
    ]) expect(normalizeAiEditResponse(response, context)).toBeNull()
  })

  it('runs a static copy edit through validation without mutating rejected documents', async () => {
    const current = createValidDesignFixture()
    const accepted = createMockLlmProvider([{ output: {
      summary: 'Shortened heading',
      updates: [{ nodeId: 'heading-1', property: 'text', value: 'A clearer promise' }],
    } }])

    await expect(runGeneration({
      provider: accepted,
      job: { ...request, mode: 'edit-selection', selectedNodeId: 'heading-1' },
      document: current,
      maxRepairAttempts: 0,
    })).resolves.toMatchObject({
      accepted: true,
      commands: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'A clearer promise' } }],
    })

    const rejected = createMockLlmProvider([{ output: {
      summary: 'Escaped heading',
      updates: [{ nodeId: 'paragraph-1', property: 'text', value: 'Escaped' }],
    } }])
    await expect(runGeneration({
      provider: rejected,
      job: { ...request, mode: 'edit-selection', selectedNodeId: 'heading-1' },
      document: current,
      maxRepairAttempts: 0,
    })).resolves.toMatchObject({ accepted: false, code: 'invalid_model_output' })
    expect(current.nodes['heading-1']?.props).not.toMatchObject({ text: 'A clearer promise' })
    expect(current.nodes['paragraph-1']?.props).not.toMatchObject({ text: 'Escaped' })
  })

  it('uses a static bounded Gemini copy-edit response schema', () => {
    const serialized = JSON.stringify(aiCopyEditResponseJsonSchema)
    expect(serialized.length).toBeLessThan(8_000)
    expect(serialized).not.toContain('heading-1')
    expect(serialized).not.toContain('oneOf')
    expect(serialized).not.toContain('anyOf')
    expect(serialized).not.toContain('INSERT_NODE')
    expect(serialized).toContain('updates')
    expect(serialized).toContain('property')
  })

  it('materializes trusted command metadata and enforces selected subtree scope', () => {
    const document = createValidDesignFixture()
    const accepted = materializeAiCommands({
      mode: 'edit-selection',
      selectedNodeId: 'container-1',
      document,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Scoped' } }],
      runId: request.generationRunId,
      expectedVersion: 1,
    })
    expect(accepted).toMatchObject({ accepted: true })
    if (accepted.accepted) {
      expect(accepted.commands[0]).toMatchObject({
        source: 'ai', documentVersion: 1, commandId: `${request.generationRunId}-0`,
      })
    }

    expect(materializeAiCommands({
      mode: 'edit-selection',
      selectedNodeId: 'heading-1',
      document,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'paragraph-1', patch: { text: 'Escaped' } }],
      runId: request.generationRunId,
      expectedVersion: 1,
    })).toMatchObject({ accepted: false, code: 'scope_violation' })
    expect(materializeAiCommands({
      mode: 'edit-selection',
      selectedNodeId: 'heading-1',
      document,
      operations: [{ type: 'UPDATE_THEME', patch: { colors: document.theme.colors } }],
      runId: request.generationRunId,
      expectedVersion: 1,
    })).toMatchObject({ accepted: false, code: 'scope_violation' })
    expect(materializeAiCommands({
      mode: 'edit-selection',
      selectedNodeId: 'heading-1',
      document,
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { arbitrary: 'forbidden' } }],
      runId: request.generationRunId,
      expectedVersion: 1,
    })).toMatchObject({ accepted: false, code: 'invalid_model_output' })
  })

  it('generates a Blueprint v2 document while keeping Blueprint v1 compatibility', async () => {
    expect(landingPageBlueprintV2Schema.safeParse(blueprintV2).success).toBe(true)
    const provider = createMockLlmProvider([{ output: blueprintV2 }])
    const current = createValidDesignFixture()
    current.projectId = request.projectId

    const result = await runGeneration({ provider, job: request, document: current, maxRepairAttempts: 0 })

    expect(result).toMatchObject({ accepted: true, repairAttempts: 0, promptVersion: AI_PROMPT_VERSION })
    if (!result.accepted) return
    expect(result.document.projectId).toBe(request.projectId)
    expect(result.document.version).toBe(2)
    expect(result.document.nodes['hero-heading']?.props).toMatchObject({ text: blueprintV2.hero.heading })
    expect(result.document.nodes['faq-section']).toBeDefined()
    expect(result.document.nodes['footer-section']).toBeDefined()
    expect(result.commands).toEqual([expect.objectContaining({ type: 'REPLACE_DOCUMENT', source: 'ai' })])
  })

  it('generates a validated document through the command layer and strips forged ownership', async () => {
    const provider = createMockLlmProvider([{ output: blueprint }])
    const current = createValidDesignFixture()
    current.projectId = request.projectId

    const result = await runGeneration({ provider, job: request, document: current })

    expect(result).toMatchObject({ accepted: true, repairAttempts: 0, promptVersion: AI_PROMPT_VERSION })
    if (!result.accepted) return
    expect(result.document.projectId).toBe(request.projectId)
    expect(result.document.version).toBe(2)
    expect(result.document.nodes['hero-heading']?.props).toMatchObject({ text: blueprint.hero.heading })
    expect(result.commands).toEqual([expect.objectContaining({ type: 'REPLACE_DOCUMENT', source: 'ai' })])
  })

  it('provides only bounded repair codes for invalid blueprints', async () => {
    const repairs: readonly string[][] = []
    const provider: LLMProvider = {
      name: 'repair-inspector', model: 'repair-model',
      generateLandingPageBlueprint(input) {
        if (input.repair) (repairs as string[][]).push(input.repair.issues)
        return Promise.resolve({ output: { ...blueprint, nodes: {} }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })
      },
      generateOperations: () => Promise.reject(new Error('not used')),
    }

    const result = await runGeneration({ provider, job: request, document: createValidDesignFixture(), maxRepairAttempts: 1 })

    expect(result).toMatchObject({ accepted: false, code: 'invalid_model_output' })
    expect(repairs).toEqual([['invalid_blueprint']])
  })

  it('repairs invalid output at most twice and accumulates usage', async () => {
    const valid = blueprint
    const provider = createMockLlmProvider([
      { output: { arbitrary: 'invalid' }, usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } },
      { output: { still: 'invalid' }, usage: { inputTokens: 5, outputTokens: 6, totalTokens: 11 } },
      { output: valid, usage: { inputTokens: 7, outputTokens: 8, totalTokens: 15 } },
    ])

    const result = await runGeneration({ provider, job: request, document: createValidDesignFixture(), maxRepairAttempts: 2 })

    expect(result).toMatchObject({
      accepted: true,
      repairAttempts: 2,
      usage: { inputTokens: 15, outputTokens: 18, totalTokens: 33 },
    })
  })

  it('preserves the document when repair is exhausted or selected operations escape scope', async () => {
    const current = createValidDesignFixture()
    const invalid = createMockLlmProvider([
      { output: { invalid: true } },
      { output: { invalid: true } },
      { output: { invalid: true } },
    ])
    const exhausted = await runGeneration({ provider: invalid, job: request, document: current, maxRepairAttempts: 2 })
    expect(exhausted).toMatchObject({ accepted: false, code: 'invalid_model_output', repairAttempts: 2 })
    expect(current.version).toBe(1)

    const scopedJob = { ...request, mode: 'edit-selection' as const, selectedNodeId: 'heading-1' }
    const escaped = createMockLlmProvider([{ output: {
      summary: 'Escape selection',
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'paragraph-1', patch: { text: 'No' } }],
    } }])
    expect(await runGeneration({ provider: escaped, job: scopedJob, document: current, maxRepairAttempts: 0 }))
      .toMatchObject({ accepted: false, code: 'scope_violation' })
  })

  it('materializes every allowlisted page operation without trusting model metadata', () => {
    const document = createValidDesignFixture()
    const operations = [
      { type: 'INSERT_NODE', parentId: 'container-1', index: 0, node: {
        id: 'ai-heading', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'AI', level: 2 }, style: {}, responsive: {},
      } },
      { type: 'MOVE_NODE', nodeId: 'paragraph-1', newParentId: 'container-1', newIndex: 0 },
      { type: 'REMOVE_NODE', nodeId: 'image-1' },
      { type: 'DUPLICATE_NODE', nodeId: 'heading-1', newNodeId: 'heading-copy', targetParentId: 'container-1', index: 1 },
      { type: 'UPDATE_STYLE', nodeId: 'heading-1', patch: { color: '#112233' } },
      { type: 'UPDATE_RESPONSIVE_STYLE', nodeId: 'heading-1', breakpoint: 'mobile', patch: { fontSize: 24 } },
      { type: 'UPDATE_THEME', patch: { colors: document.theme.colors } },
      { type: 'REPLACE_SUBTREE', nodeId: 'heading-1', rootNodeId: 'replacement-heading', nodes: [{
        id: 'replacement-heading', type: 'heading', parentId: 'container-1', children: [],
        props: { text: 'Replacement', level: 2 }, style: {}, responsive: {},
      }] },
    ]

    const result = materializeAiCommands({
      mode: 'edit-page', document, operations,
      runId: request.generationRunId, expectedVersion: 1,
    })

    expect(result).toMatchObject({ accepted: true })
    if (result.accepted) {
      expect(result.commands).toHaveLength(operations.length)
      expect(result.commands.every(command => command.source === 'ai' && command.documentVersion === 1)).toBe(true)
    }
    expect(materializeAiCommands({
      mode: 'edit-page', document, operations: [],
      runId: request.generationRunId, expectedVersion: 1,
    })).toEqual({ accepted: false, code: 'invalid_model_output' })
  })

  it('runs valid page operations and rejects malformed edit batches', async () => {
    const current = createValidDesignFixture()
    const valid = createMockLlmProvider([{ output: {
      summary: 'Update page heading',
      operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'AI page edit' } }],
    } }])
    const pageJob = { ...request, mode: 'edit-page' as const }
    expect(await runGeneration({ provider: valid, job: pageJob, document: current }))
      .toMatchObject({ accepted: true, summary: 'Update page heading' })

    const malformed = createMockLlmProvider([{ output: { summary: '', operations: [] } }])
    expect(await runGeneration({ provider: malformed, job: pageJob, document: current, maxRepairAttempts: 0 }))
      .toMatchObject({ accepted: false, code: 'invalid_model_output' })
  })

  it('rejects invalid jobs, missing selections and provider timeouts safely', async () => {
    expect(() => buildPromptContext({
      mode: 'edit-selection', prompt: 'Edit', document: createValidDesignFixture(), selectedNodeId: 'missing',
    })).toThrow('selected_node_not_found')
    await expect(runGeneration({
      provider: createMockLlmProvider([]),
      job: { ...request, prompt: '' },
      document: createValidDesignFixture(),
    })).rejects.toThrow('invalid_generation_job')

    const timeoutProvider: LLMProvider = {
      name: 'timeout', model: 'timeout-model',
      generateLandingPageBlueprint: input => new Promise((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      }),
      generateOperations: () => Promise.reject(new Error('not used')),
    }
    expect(await runGeneration({
      provider: timeoutProvider, job: request, document: createValidDesignFixture(), timeoutMs: 1,
    })).toMatchObject({ accepted: false, code: 'provider_timeout' })
  })

  it('normalizes invalid usage and unknown provider failures', async () => {
    const provider: LLMProvider = {
      name: 'unknown', model: 'unknown-model',
      generateLandingPageBlueprint: () => Promise.reject(new Error('internal provider body')),
      generateOperations: () => Promise.reject(new Error('not used')),
    }
    expect(await runGeneration({ provider, job: request, document: createValidDesignFixture() }))
      .toMatchObject({ accepted: false, code: 'provider_error', usage: { totalTokens: 0 } })

    const missingUsage = createMockLlmProvider([{ output: blueprint }])
    expect(await runGeneration({ provider: missingUsage, job: request, document: createValidDesignFixture() }))
      .toMatchObject({ accepted: true, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } })
  })

  it('retries only transient provider failures within the call budget', async () => {
    let calls = 0
    const provider: LLMProvider = {
      name: 'fake',
      model: 'fake-model',
      generateLandingPageBlueprint() {
        calls += 1
        if (calls === 1) return Promise.reject(Object.assign(new Error('temporary'), { code: 'provider_transient' }))
        return Promise.resolve({ output: blueprint, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } })
      },
      generateOperations() { return Promise.reject(new Error('not used')) },
    }
    expect(await runGeneration({ provider, job: request, document: createValidDesignFixture(), maxTransientRetries: 1 }))
      .toMatchObject({ accepted: true })
    expect(calls).toBe(2)

    const authFailure: LLMProvider = {
      ...provider,
      generateLandingPageBlueprint() {
        return Promise.reject(Object.assign(new Error('denied'), { code: 'provider_auth' }))
      },
    }
    expect(await runGeneration({ provider: authFailure, job: request, document: createValidDesignFixture() }))
      .toMatchObject({ accepted: false, code: 'provider_auth' })
  })
})
