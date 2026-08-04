import { createValidDesignFixture, validateDesignDocument, type DesignDocument } from '@zenui/design-schema'

export function createVietnameseStarterDocument(): DesignDocument {
  const document = createValidDesignFixture()
  document.pages[0]!.name = 'Trang chủ'
  document.nodes['heading-1']!.props = { text: 'Biến ý tưởng thành website của riêng bạn', level: 1 }
  document.nodes['paragraph-1']!.props = { text: 'Bắt đầu với một trang có cấu trúc rõ ràng và dễ chỉnh sửa.' }
  document.nodes['image-1']!.props = { src: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80', alt: 'Bản xem trước website' }
  document.nodes['button-1']!.props = { text: 'Bắt đầu ngay', href: '#start' }
  const validation = validateDesignDocument(document)
  if (!validation.success) throw new Error('vietnamese_starter_document_invalid')
  return validation.data
}
