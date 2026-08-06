import { readFile } from 'node:fs/promises'

import { createValidDesignFixture } from '@zenui/design-schema'
import { z } from 'zod'

import { websiteBriefSchema } from './guided-brief'
import {
  analyzeSiteIntelligence,
  siteIntelligenceFindingCodeSchema,
} from './site-intelligence'

import {
  buildAssistantContextPack,
  createMockLlmProvider,
  planAssistantIntent,
  evaluateMediaCandidates,
  runGeneration,
  type AssistantIntent,
  type LandingPageBlueprint,
  type MediaCandidateJudge,
  type VisualBrief,
} from './index'

const evalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  mode: z.enum(['generate', 'edit-page', 'edit-selection']),
  prompt: z.string().min(3).max(500),
  selectedNodeId: z.string().optional(),
  expected: z.enum(['accepted', 'scope_violation', 'invalid_model_output']),
}).strict()

const evalDatasetSchema = z.object({
  version: z.literal('td-009-v1'),
  cases: z.array(evalCaseSchema).min(1).max(100),
}).strict()

const siteIntelligenceEvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(['vi', 'en']),
  brief: websiteBriefSchema,
  expectedFindingCodes: z.array(siteIntelligenceFindingCodeSchema).min(1).max(24),
}).strict()

const siteIntelligenceEvalDatasetSchema = z.object({
  version: z.literal('site-intelligence-eval-v1'),
  cases: z.array(siteIntelligenceEvalCaseSchema).min(2).max(20),
}).strict().superRefine((value, context) => {
  const locales = new Set(value.cases.map(testCase => testCase.locale))
  if (!locales.has('vi') || !locales.has('en')) {
    context.addIssue({ code: 'custom', path: ['cases'], message: 'Vietnamese and English cases are required' })
  }
})

const assistantV2EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.enum(['vi', 'en']),
  target: z.string().min(1).max(100),
  request: z.string().trim().min(3).max(500),
  expectedIntent: z.union([z.enum(['copy', 'media', 'style', 'layout', 'composition']), z.literal('forbidden')]),
  expectedScope: z.enum(['page', 'section', 'element']),
  representation: z.enum(['photo', 'editorial-illustration', 'process-diagram', 'product-ui', 'abstract']).optional(),
  semanticMediaPass: z.boolean().optional(),
}).strict().superRefine((value, context) => {
  if (value.expectedIntent === 'media' && (!value.representation || value.semanticMediaPass === undefined)) {
    context.addIssue({ code: 'custom', path: ['representation'], message: 'Media eval cases require representation and semantic outcome' })
  }
})

const assistantV2EvalDatasetSchema = z.object({
  version: z.literal('assistant-v2-eval-v1'),
  cases: z.array(assistantV2EvalCaseSchema).min(10).max(100),
}).strict().superRefine((value, context) => {
  const locales = new Set(value.cases.map(testCase => testCase.locale))
  if (!locales.has('vi') || !locales.has('en')) {
    context.addIssue({ code: 'custom', path: ['cases'], message: 'Vietnamese and English cases are required' })
  }
  const intents = new Set(value.cases.map(testCase => testCase.expectedIntent))
  for (const intent of ['copy', 'media', 'style', 'layout', 'composition', 'forbidden'] as const) {
    if (!intents.has(intent)) context.addIssue({ code: 'custom', path: ['cases'], message: `Missing ${intent} eval slice` })
  }
})

export interface EvalCaseResult {
  id: string
  passed: boolean
  accepted: boolean
  code: string | null
  repairAttempts: number
}

const evalBlueprint: LandingPageBlueprint = {
  version: 1,
  brand: 'ZenUI',
  theme: {
    primary: '#2563eb',
    background: '#ffffff',
    text: '#0f172a',
    headingFont: 'Manrope',
    bodyFont: 'Manrope',
  },
  hero: {
    badge: 'Structured design',
    heading: 'Build a polished landing page',
    paragraph: 'Generate a safe page from a compact, validated blueprint.',
    cta: { text: 'Get started', href: '#start' },
  },
  features: [
    { icon: 'star', heading: 'Focused content', paragraph: 'Keep the message clear and useful.' },
    { icon: 'check', heading: 'Safe structure', paragraph: 'Let the server own the document tree.' },
  ],
  closingCta: {
    heading: 'Ready to build?',
    paragraph: 'Create your first page now.',
    cta: { text: 'Create page', href: '#start' },
  },
}

function responseFor(testCase: z.infer<typeof evalCaseSchema>) {
  if (testCase.id === 'injection') return {
    summary: 'Attempt scope escape',
    operations: [{ type: 'UPDATE_PROPS', nodeId: 'paragraph-1', patch: { text: 'Forbidden' } }],
  }
  if (testCase.id === 'invalid-image') return {
    ...evalBlueprint,
    hero: { ...evalBlueprint.hero, image: { src: 'javascript:alert(1)', alt: 'Unsafe' } },
  }
  if (testCase.mode === 'generate') return evalBlueprint
  return {
    summary: 'Improve heading',
    operations: [{ type: 'UPDATE_PROPS', nodeId: 'heading-1', patch: { text: 'Clear heading' } }],
  }
}

export async function loadEvalDataset(path: string) {
  return evalDatasetSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}

export async function loadSiteIntelligenceEvalDataset(path: string) {
  return siteIntelligenceEvalDatasetSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}

export async function loadAssistantV2EvalDataset(path: string) {
  return assistantV2EvalDatasetSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}

function siteIntelligenceEvalDocument() {
  const document = createValidDesignFixture()
  document.nodes['section-1'] = {
    ...document.nodes['section-1']!,
    type: 'hero',
    props: { label: 'Introduction' },
  }
  document.nodes['paragraph-1']!.props = {
    text: Array.from({ length: 90 }, () => 'message').join(' '),
  }
  document.nodes['heading-1']!.style = { color: '#f8fafc' }
  document.nodes['container-1']!.responsive = { mobile: { gridColumns: 2 } }
  document.nodes['button-1']!.props = { text: 'Learn more', href: '#more' }
  return document
}

export function runSiteIntelligenceEval(datasetInput: unknown) {
  const dataset = siteIntelligenceEvalDatasetSchema.parse(datasetInput)
  const results = dataset.cases.map(testCase => {
    const review = analyzeSiteIntelligence({
      document: siteIntelligenceEvalDocument(),
      brief: testCase.brief,
    })
    const findingCodes = new Set(review.findings.map(finding => finding.code))
    const expectedFindingsPresent = testCase.expectedFindingCodes.every(code => findingCodes.has(code))
    const evidenceGrounded = review.findings.every(finding => (
      finding.evidence.length > 0
      && finding.evidence.every(item => item.nodeId.length > 0 && item.sectionNodeId.length > 0)
    ))
    const citationsGrounded = review.findings.every(finding => (
      finding.citations.some(citation => citation.kind === 'goal' && citation.value === testCase.brief.primaryGoal)
      && finding.citations.some(citation => citation.kind === 'audience' && citation.value === testCase.brief.audience)
    ))
    return {
      id: testCase.id,
      locale: testCase.locale,
      passed: expectedFindingsPresent && evidenceGrounded && citationsGrounded,
      expectedFindingsPresent,
      evidenceGrounded,
      citationsGrounded,
    }
  })
  const passed = results.filter(result => result.passed).length
  return {
    version: dataset.version,
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: passed / results.length,
    accepted: passed === results.length,
    locales: [...new Set(results.map(result => result.locale))].sort(),
    results,
  }
}

function deterministicAssistantIntent(request: string): AssistantIntent {
  if (/image|photo|picture|visual|diagram|dashboard|ảnh|hình|sơ đồ|bảng quy trình/i.test(request)) return 'media'
  if (/recompose|split layout|sắp xếp lại|bố cục chia đôi/i.test(request)) return 'composition'
  if (/center this section|mobile friendly|căn giữa section|khoảng cách thoáng/i.test(request)) return 'layout'
  if (/emphasis|nhấn mạnh|căn giữa tiêu đề/i.test(request)) return 'style'
  return 'copy'
}

function deterministicMediaBrief(testCase: z.infer<typeof assistantV2EvalCaseSchema>): VisualBrief {
  const representation = testCase.representation!
  const noPeople = /no people|không có người/i.test(testCase.request)
  return {
    version: 'visual-brief-v1',
    subject: representation === 'process-diagram' ? 'Product development process' : 'Product dashboard interface',
    message: 'A website-ready visual matching the requested representation',
    representation,
    composition: representation === 'process-diagram' ? 'Five linked stages' : 'Centered dashboard overview',
    mustInclude: representation === 'process-diagram' ? ['five stages'] : ['dashboard interface'],
    mustAvoid: noPeople ? ['people'] : [],
    peoplePolicy: noPeople ? 'forbidden' : 'allowed',
    textPolicy: 'symbolic-only',
    style: 'clean editorial website visual',
    palette: [],
    aspectRatio: 'wide',
    focalArea: 'center',
    generationPrompt: 'Deterministic eval fixture prompt',
    searchQuery: null,
    alt: representation === 'process-diagram' ? 'Five-stage product process diagram' : 'Product dashboard interface',
  }
}

const deterministicMediaJudge: MediaCandidateJudge = {
  evaluateBatch: input => Promise.resolve({
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
  }),
}

export async function runAssistantV2Eval(
  datasetInput: unknown,
  dependencies: { mediaJudge?: MediaCandidateJudge } = {},
) {
  const dataset = assistantV2EvalDatasetSchema.parse(datasetInput)
  const results = []
  let routeCorrect = 0
  let scopeEscapes = 0
  let semanticMediaPassed = 0
  let semanticMediaTotal = 0
  for (const testCase of dataset.cases) {
    const document = createValidDesignFixture()
    const context = buildAssistantContextPack({
      document,
      selectedNodeId: testCase.target,
      request: testCase.request,
      locale: testCase.locale,
    })
    const intended = testCase.expectedIntent === 'forbidden'
      ? 'copy'
      : deterministicAssistantIntent(testCase.request)
    const planned = await planAssistantIntent({
      context,
      provider: {
        plan: () => Promise.resolve({
          output: {
            version: 'assistant-plan-v2',
            intent: intended,
            confidence: 0.99,
            reason: 'Deterministic fixture classification.',
            targetNodeId: testCase.target,
            scope: testCase.expectedScope,
          },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        }),
      },
    })
    const forbiddenPassed = testCase.expectedIntent === 'forbidden'
      && !planned.accepted
      && planned.code === 'forbidden_action'
    const routePassed = testCase.expectedIntent === 'forbidden'
      ? forbiddenPassed
      : planned.accepted
        && planned.plan.intent === testCase.expectedIntent
        && planned.plan.scope === testCase.expectedScope
    if (routePassed) routeCorrect += 1
    if (!planned.accepted && planned.code === 'scope_violation') scopeEscapes += 1
    let semanticPassed = true
    if (testCase.expectedIntent === 'media') {
      semanticMediaTotal += 1
      const candidateId = `${testCase.id}-candidate`
      const semantic = await evaluateMediaCandidates({
        brief: deterministicMediaBrief(testCase),
        candidates: [{
          candidateId,
          assetId: `00000000-0000-4000-8000-${String(semanticMediaTotal).padStart(12, '0')}`,
          source: 'generated',
          bytes: new Uint8Array([semanticMediaTotal, 90, 69, 78]),
        }],
        judge: dependencies.mediaJudge ?? deterministicMediaJudge,
      })
      semanticPassed = testCase.semanticMediaPass === semantic.accepted
      if (semanticPassed) semanticMediaPassed += 1
    }
    results.push({ id: testCase.id, locale: testCase.locale, passed: routePassed && semanticPassed })
  }
  const routeAccuracy = routeCorrect / dataset.cases.length
  const semanticMediaPassRate = semanticMediaTotal === 0 ? 0 : semanticMediaPassed / semanticMediaTotal
  const thresholds = { routeAccuracy: 0.95, scopeEscapes: 0, semanticMediaPassRate: 0.85 }
  const passed = results.filter(result => result.passed).length
  return {
    version: dataset.version,
    total: results.length,
    passed,
    failed: results.length - passed,
    accepted: routeAccuracy >= thresholds.routeAccuracy
      && scopeEscapes === thresholds.scopeEscapes
      && semanticMediaPassRate >= thresholds.semanticMediaPassRate,
    locales: [...new Set(results.map(result => result.locale))].sort(),
    thresholds,
    metrics: { routeAccuracy, scopeEscapes, semanticMediaPassRate },
    results,
  }
}

export async function runDeterministicEval(datasetInput: unknown) {
  const dataset = evalDatasetSchema.parse(datasetInput)
  const results: EvalCaseResult[] = []
  for (const [index, testCase] of dataset.cases.entries()) {
    const run = await runGeneration({
      provider: createMockLlmProvider([{ output: responseFor(testCase) }]),
      job: {
        generationRunId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        projectId: '11111111-1111-4111-8111-111111111111',
        workspaceId: '22222222-2222-4222-8222-222222222222',
        userId: '33333333-3333-4333-8333-333333333333',
        mode: testCase.mode,
        prompt: testCase.prompt,
        expectedVersion: 1,
        ...(testCase.selectedNodeId ? { selectedNodeId: testCase.selectedNodeId } : {}),
      },
      document: createValidDesignFixture(),
      maxRepairAttempts: 0,
      maxTransientRetries: 0,
    })
    const accepted = run.accepted
    const code = accepted ? null : run.code
    results.push({
      id: testCase.id,
      passed: testCase.expected === 'accepted' ? accepted : code === testCase.expected,
      accepted,
      code,
      repairAttempts: run.repairAttempts,
    })
  }
  const passed = results.filter(result => result.passed).length
  return {
    version: dataset.version,
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: passed / results.length,
    thresholds: { passRate: 1, maxRepairAttempts: 0 },
    accepted: passed === results.length && results.every(result => result.repairAttempts === 0),
    results,
  }
}
