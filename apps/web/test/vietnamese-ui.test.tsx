import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { metadata } from '../app/layout'
import Loading from '../app/loading'
import { createVietnameseStarterDocument } from '../lib/starter-document'
import {
  commandErrorLabel,
  componentLabel,
  deploymentErrorLabel,
  exportErrorLabel,
  generationErrorLabel,
  newComponentProps,
  roleLabel,
  viewportLabel,
} from '../lib/ui-copy'

describe('Vietnamese-first Web interface contract', () => {
  it('uses Vietnamese metadata and loading copy', () => {
    expect(metadata.description).toContain('người không biết code')
    render(<Loading />)
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải ZenUI')
  })

  it('maps stable internal values to Vietnamese labels', () => {
    expect(['owner', 'editor', 'viewer'].map(role => roleLabel(role as Parameters<typeof roleLabel>[0])))
      .toEqual(['Chủ sở hữu', 'Người chỉnh sửa', 'Người xem'])
    expect(['desktop', 'tablet', 'mobile'].map(viewport => viewportLabel(viewport as Parameters<typeof viewportLabel>[0])))
      .toEqual(['Máy tính', 'Máy tính bảng', 'Điện thoại'])
    expect(componentLabel('container')).toBe('Khung chứa')

    const exportCodes = ['invalid_document', 'artifact_too_large', 'storage_unavailable', 'export_failed', 'queue_unavailable', 'stale_document_version'] as const
    for (const code of exportCodes) expect(exportErrorLabel(code)).not.toContain(code)

    const deploymentCodes = [
      'connection_missing', 'connection_disabled', 'invalid_revision', 'invalid_artifact',
      'artifact_too_large', 'storage_unavailable', 'queue_unavailable', 'provider_auth',
      'provider_rate_limit', 'provider_transient', 'provider_timeout',
      'provider_outcome_unknown', 'provider_error',
    ] as const
    for (const code of deploymentCodes) expect(deploymentErrorLabel(code)).not.toContain(code)
  })

  it('localizes generation, command and new-component defaults without changing internal values', () => {
    for (const code of [
      'invalid_model_output', 'budget_exceeded', 'scope_violation', 'stale_document_version',
      'provider_timeout', 'provider_rate_limit', 'provider_transient', 'provider_auth',
      'provider_bad_request', 'provider_error', 'queue_unavailable', 'unknown',
    ]) expect(generationErrorLabel(code)).not.toContain(code)
    expect(generationErrorLabel('provider_bad_request')).toContain('yêu cầu AI chưa tương thích')

    for (const code of [
      'parent_not_found', 'invalid_parent_child', 'index_out_of_bounds', 'invalid_command',
      'node_not_found', 'root_operation_forbidden', 'cycle_detected', 'document_invalid', 'unknown',
    ]) expect(commandErrorLabel(code)).not.toContain(code)

    for (const type of [
      'heading', 'paragraph', 'image', 'button', 'link', 'icon', 'badge', 'navbar',
      'hero', 'feature-card', 'section',
    ] as const) {
      const props = newComponentProps(type)
      if (type === 'section') expect(props).toBeNull()
      else expect(props).not.toBeNull()
    }
  })

  it('creates a valid Vietnamese starter document without changing stable node IDs', () => {
    const document = createVietnameseStarterDocument()
    expect(document.nodes['heading-1']?.props).toMatchObject({ text: 'Biến ý tưởng thành website của riêng bạn' })
    expect(document.nodes['paragraph-1']?.props).toMatchObject({ text: 'Bắt đầu với một trang có cấu trúc rõ ràng và dễ chỉnh sửa.' })
    expect(document.nodes['button-1']?.props).toMatchObject({ text: 'Bắt đầu ngay' })
  })
})
