import { render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('heading', { name: 'Build your next product' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Product preview' })).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.getByRole('link', { name: 'Read docs' })).toHaveAttribute('href', '/docs')
    expect(screen.getByLabelText('Featured')).toHaveTextContent('★')
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(container.querySelector('hr')).toBeInTheDocument()
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
