import { readFile } from 'node:fs/promises'

import { createValidDesignFixture } from '@zenui/design-schema'
import { z } from 'zod'

import { websiteBriefSchema } from './guided-brief'
import {
  analyzeSiteIntelligence,
  siteIntelligenceFindingCodeSchema,
} from './site-intelligence'

import {
  createMockLlmProvider,
  runGeneration,
  type LandingPageBlueprint,
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
