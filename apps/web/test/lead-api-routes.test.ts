import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeDependencies = vi.hoisted(() => ({
  trustedOrigin: 'http://localhost:3000',
  getSession: vi.fn(),
  access: {
    findMembership: vi.fn(),
    projectBelongsToWorkspace: vi.fn(),
  },
  keyring: { decrypt: vi.fn() },
  leads: {
    list: vi.fn(),
    listWorkspace: vi.fn(),
    countNew: vi.fn(),
    findEncryptedById: vi.fn(),
    markContacted: vi.fn(),
  },
}))

vi.mock('../lib/server/lead-route-dependencies', () => ({
  createLeadRouteDependencies: () => routeDependencies,
}))

import {
  GET as getLeadDetail,
  PATCH as patchLead,
} from '../app/api/v1/projects/[projectId]/leads/[leadId]/route'
import { GET as getLeadCount } from '../app/api/v1/projects/[projectId]/leads/count/route'
import { GET as getLeads } from '../app/api/v1/projects/[projectId]/leads/route'
import { GET as getWorkspaceLeads } from '../app/api/v1/workspaces/[workspaceId]/leads/route'

const projectId = '11111111-1111-4111-8111-111111111111'
const workspaceId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const leadId = '44444444-4444-4444-8444-444444444444'
const summary = {
  id: leadId,
  status: 'new' as const,
  version: 1,
  formTitle: 'Nhận tư vấn',
  receivedAt: new Date('2026-08-13T08:00:00.000Z'),
  expiresAt: new Date('2026-11-11T08:00:00.000Z'),
  contactedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  routeDependencies.getSession.mockResolvedValue({ userId })
  routeDependencies.access.findMembership.mockResolvedValue({
    userId,
    workspaceId,
    role: 'owner',
  })
  routeDependencies.access.projectBelongsToWorkspace.mockResolvedValue(true)
  routeDependencies.leads.list.mockResolvedValue([summary])
  routeDependencies.leads.listWorkspace.mockResolvedValue({
    items: [{
      ...summary,
      projectId,
      projectName: 'Landing page',
    }],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  })
  routeDependencies.leads.countNew.mockResolvedValue({ newCount: 1 })
  routeDependencies.leads.findEncryptedById.mockResolvedValue({
    summary,
    envelope: {
      ciphertext: 'ciphertext',
      iv: 'initialization-vector',
      authTag: 'authentication-tag',
      keyVersion: 1,
    },
    context: {
      workspaceId,
      projectId,
      shareLinkId: '55555555-5555-4555-8555-555555555555',
      revisionId: '66666666-6666-4666-8666-666666666666',
      formNodeId: 'lead-form-1',
      leadId,
    },
  })
  routeDependencies.keyring.decrypt.mockReturnValue({
    formTitle: 'Nhận tư vấn',
    fields: [{
      key: 'email',
      type: 'email',
      label: 'Email',
      value: 'visitor@example.test',
    }],
  })
  routeDependencies.leads.markContacted.mockResolvedValue({
    accepted: true,
    lead: {
      ...summary,
      status: 'contacted',
      version: 2,
      contactedAt: new Date('2026-08-13T09:00:00.000Z'),
    },
  })
})

describe('Customer Leads routes', () => {
  it('wires the workspace Inbox route to the workspace handler', async () => {
    const response = await getWorkspaceLeads(new Request(
      `http://localhost:3000/api/v1/workspaces/${workspaceId}/leads`,
    ), { params: Promise.resolve({ workspaceId }) })

    expect(response.status).toBe(200)
    expect(routeDependencies.leads.listWorkspace).toHaveBeenCalledWith(
      { userId, workspaceId },
      { page: 1, pageSize: 25 },
    )
  })

  it('wires project list and count routes to their handlers', async () => {
    const query = `?workspaceId=${workspaceId}`
    const context = { params: Promise.resolve({ projectId }) }

    const listed = await getLeads(new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/leads${query}`,
    ), context)
    const count = await getLeadCount(new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/leads/count${query}`,
    ), context)

    expect(listed.status).toBe(200)
    expect(count.status).toBe(200)
    expect(routeDependencies.leads.list).toHaveBeenCalled()
    expect(routeDependencies.leads.countNew).toHaveBeenCalled()
  })

  it('wires lead detail and mark-contacted routes', async () => {
    const context = { params: Promise.resolve({ projectId, leadId }) }
    const detail = await getLeadDetail(new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/leads/${leadId}?workspaceId=${workspaceId}`,
    ), context)
    const patched = await patchLead(new Request(
      `http://localhost:3000/api/v1/projects/${projectId}/leads/${leadId}`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ workspaceId, expectedVersion: 1 }),
      },
    ), context)

    expect(detail.status).toBe(200)
    expect(patched.status).toBe(200)
    expect(routeDependencies.leads.findEncryptedById).toHaveBeenCalled()
    expect(routeDependencies.leads.markContacted).toHaveBeenCalled()
  })
})
