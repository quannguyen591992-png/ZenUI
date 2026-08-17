import { fireEvent, render, screen } from '@testing-library/react'
import { createValidDesignFixture } from '@zenui/design-schema'
import { describe, expect, it } from 'vitest'

import { DesignDocumentRenderer } from '../app/components/design-document-renderer'

describe('Design Document renderer', () => {
  it('renders semantic content, links, images, icons and viewport styles', () => {
    const document = createValidDesignFixture()
    document.nodes['container-1']!.children.push('link-1', 'icon-1', 'spacer-1', 'divider-1')
    document.nodes['link-1'] = {
      id: 'link-1', type: 'link', parentId: 'container-1', children: [],
      props: { text: 'Read docs', href: '/docs' }, style: {}, responsive: {},
    }
    document.nodes['icon-1'] = {
      id: 'icon-1', type: 'icon', parentId: 'container-1', children: [],
      props: { name: 'star', label: 'Featured' }, style: {}, responsive: {},
    }
    document.nodes['spacer-1'] = {
      id: 'spacer-1', type: 'spacer', parentId: 'container-1', children: [],
      props: { size: 20 }, style: {}, responsive: {},
    }
    document.nodes['divider-1'] = {
      id: 'divider-1', type: 'divider', parentId: 'container-1', children: [],
      props: {}, style: {}, responsive: {},
    }

    const { container } = render(<DesignDocumentRenderer document={document} viewport="mobile" />)
    expect(container.querySelector('#section-1')).toHaveAttribute('data-node-id', 'section-1')
    expect(screen.getByRole('heading', { name: 'Build your next product' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Product preview' })).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByRole('link', { name: 'Read docs' })).toHaveAttribute('href', '/docs')
    expect(screen.getByRole('img', { name: 'Featured' }).querySelector('svg path')).toHaveAttribute('d')
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(container.querySelector('hr')).toBeInTheDocument()
  })

  it('renders an accessible visual-only Lead Form and prevents submission', () => {
    const document = createValidDesignFixture()
    document.nodes['lead-form-1'] = {
      id: 'lead-form-1', type: 'lead-form', parentId: 'container-1', children: [],
      props: {
        title: 'Request a consultation',
        description: 'Tell us how we can help.',
        submitLabel: 'Send request',
        successCopy: 'Thank you.',
        fields: [
          { key: 'email', type: 'email', label: 'Work email', required: true, placeholder: 'you@example.com' },
          {
            key: 'need', type: 'select', label: 'What do you need?', required: false,
            options: [{ label: 'Consultation', value: 'consultation' }],
          },
        ],
        consent: { label: 'I agree to be contacted', required: true },
      },
      style: {
        width: 'full', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto',
      }, responsive: {},
    }
    document.nodes['container-1']!.children.push('lead-form-1')

    const { container } = render(<DesignDocumentRenderer document={document} viewport="desktop" />)
    const form = screen.getByRole('form', { name: 'Request a consultation' })
    expect(form).toHaveAttribute('id', 'lead-form-1')
    expect(screen.getByLabelText('Work email')).toHaveAttribute('id', 'lead-form-1-email')
    expect(screen.getByLabelText('Work email')).toHaveAttribute('name', 'email')
    expect(screen.getByLabelText('Work email')).toBeRequired()
    expect(screen.getByLabelText('What do you need?')).toHaveValue('consultation')
    expect(screen.getByLabelText('I agree to be contacted')).toBeRequired()
    expect(screen.getByText('Bản xem trước — chưa gửi dữ liệu')).toBeVisible()
    expect(form).not.toHaveAttribute('action')
    expect(form).not.toHaveAttribute('method')
    expect(form).toHaveStyle({
      width: '100%',
      maxWidth: '720px',
      marginLeft: 'auto',
      marginRight: 'auto',
    })

    const event = new Event('submit', { bubbles: true, cancelable: true })
    form.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(container.textContent).not.toContain('Thank you.')
  })

  it('prevents canonical typed action navigation in the React preview', () => {
    const document = createValidDesignFixture()
    document.nodes['button-1']!.props = {
      text: 'Visit docs',
      action: { type: 'external_url', url: 'https://example.com/docs' },
    }

    render(<DesignDocumentRenderer document={document} viewport="desktop" />)
    const link = screen.getByRole('link', { name: 'Visit docs' })
    expect(link).toHaveAttribute('href', 'https://example.com/docs')
    expect(fireEvent.click(link)).toBe(false)
  })

  it('omits hidden sections without removing them from the document', () => {
    const document = createValidDesignFixture()
    document.nodes['section-1']!.props = { hidden: true }

    render(<DesignDocumentRenderer document={document} viewport="desktop" compact className="preview" />)
    expect(screen.getByLabelText('Bản xem trước website')).toHaveClass('is-compact', 'preview')
    expect(screen.queryByText('Build your next product')).toBeNull()
    expect(document.nodes['heading-1']).toBeDefined()
  })
})
