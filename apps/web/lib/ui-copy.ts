import type { DeploymentErrorCode } from '@zenui/deployment-core'
import type { ComponentType } from '@zenui/design-schema'
import type { ExportErrorCode } from '@zenui/export-core'

export type WebRole = 'owner' | 'editor' | 'viewer'
export type WebViewport = 'desktop' | 'tablet' | 'mobile'

const roleLabels: Record<WebRole, string> = {
  owner: 'Chủ sở hữu',
  editor: 'Người chỉnh sửa',
  viewer: 'Người xem',
}

const viewportLabels: Record<WebViewport, string> = {
  desktop: 'Máy tính',
  tablet: 'Máy tính bảng',
  mobile: 'Điện thoại',
}

const componentLabels: Record<ComponentType, string> = {
  page: 'Trang',
  section: 'Phần nội dung',
  container: 'Khung chứa',
  stack: 'Nhóm xếp chồng',
  columns: 'Nhóm cột',
  column: 'Cột',
  divider: 'Đường phân cách',
  spacer: 'Khoảng trống',
  heading: 'Tiêu đề',
  paragraph: 'Đoạn văn',
  image: 'Hình ảnh',
  button: 'Nút',
  link: 'Liên kết',
  icon: 'Biểu tượng',
  badge: 'Nhãn',
  navbar: 'Thanh điều hướng',
  hero: 'Phần mở đầu',
  'feature-card': 'Thẻ lợi ích',
  'lead-form': 'Biểu mẫu khách hàng',
}

const exportErrorLabels: Record<ExportErrorCode, string> = {
  invalid_document: 'Website hiện tại chưa hợp lệ để xuất.',
  artifact_too_large: 'Tệp xuất vượt quá giới hạn dung lượng.',
  storage_unavailable: 'Kho lưu trữ tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
  export_failed: 'Không thể hoàn tất tệp HTML an toàn.',
  queue_unavailable: 'Hàng đợi xuất tệp đang bận. Vui lòng thử lại sau.',
  stale_document_version: 'Website đã thay đổi. Hãy đợi lưu xong rồi xuất lại.',
}

const deploymentErrorLabels: Record<DeploymentErrorCode, string> = {
  connection_missing: 'Chưa có kết nối Vercel.',
  connection_disabled: 'Kết nối Vercel đã bị tắt.',
  invalid_revision: 'Phiên bản đã chọn không còn hợp lệ.',
  invalid_artifact: 'Tệp website chưa hợp lệ để xuất bản.',
  artifact_too_large: 'Tệp website vượt quá giới hạn dung lượng.',
  storage_unavailable: 'Kho lưu trữ tạm thời chưa sẵn sàng.',
  queue_unavailable: 'Hàng đợi xuất bản đang bận. Vui lòng thử lại sau.',
  provider_auth: 'Kết nối Vercel cần được xác thực lại.',
  provider_rate_limit: 'Vercel đang giới hạn yêu cầu. Vui lòng thử lại sau.',
  provider_transient: 'Vercel tạm thời chưa sẵn sàng. Vui lòng thử lại sau.',
  provider_timeout: 'Vercel phản hồi quá lâu. Vui lòng kiểm tra lại sau.',
  provider_outcome_unknown: 'Chưa xác định được kết quả xuất bản. Hãy kiểm tra lại trạng thái trước khi thử lại.',
  provider_error: 'Vercel không thể hoàn tất lần xuất bản này.',
}

const commandErrorLabels: Record<string, string> = {
  parent_not_found: 'Không tìm thấy vị trí đích.',
  invalid_parent_child: 'Không thể đặt thành phần vào vị trí này.',
  index_out_of_bounds: 'Vị trí sắp xếp không hợp lệ.',
  invalid_command: 'Thao tác này chưa hợp lệ.',
  node_not_found: 'Không tìm thấy thành phần.',
  root_operation_forbidden: 'Không thể di chuyển phần gốc của trang.',
  cycle_detected: 'Thao tác này sẽ tạo cấu trúc lặp không hợp lệ.',
  document_invalid: 'Website chưa hợp lệ sau thay đổi.',
}

export function roleLabel(role: WebRole): string {
  return roleLabels[role]
}

export function viewportLabel(viewport: WebViewport): string {
  return viewportLabels[viewport]
}

export function componentLabel(type: ComponentType): string {
  return componentLabels[type]
}

export function exportErrorLabel(code: ExportErrorCode): string {
  return exportErrorLabels[code]
}

export function deploymentErrorLabel(code: DeploymentErrorCode): string {
  return deploymentErrorLabels[code]
}

export function commandErrorLabel(code: string): string {
  return commandErrorLabels[code] ?? 'Không thể áp dụng thay đổi này.'
}

export function generationErrorLabel(code: string): string {
  switch (code) {
    case 'invalid_model_output': return 'Trang được tạo chưa đạt cấu trúc an toàn. Hãy thử mô tả ngắn gọn và tập trung hơn.'
    case 'budget_exceeded': return 'Yêu cầu AI vượt quá giới hạn xử lý an toàn. Hãy rút gọn mô tả rồi thử lại.'
    case 'scope_violation': return 'Thay đổi được đề xuất vượt ra ngoài phần nội dung đã chọn.'
    case 'stale_document_version': return 'Website đã thay đổi trong khi AI xử lý. Hãy tải phiên bản mới nhất rồi thử lại.'
    case 'provider_timeout':
    case 'provider_rate_limit':
    case 'provider_transient': return 'Dịch vụ AI tạm thời chưa sẵn sàng. Vui lòng thử lại sau.'
    case 'provider_auth': return 'Kết nối AI cần được cấu hình lại.'
    case 'provider_bad_request': return 'Cấu hình yêu cầu AI chưa tương thích. Vui lòng báo quản trị viên kiểm tra cấu hình mô hình.'
    case 'queue_unavailable': return 'Hàng đợi AI đang bận. Vui lòng thử lại sau.'
    case 'provider_error': return 'Dịch vụ AI không thể xử lý yêu cầu này. Hãy thử lại với mô tả ngắn gọn hơn.'
    default: return 'AI không thể hoàn tất yêu cầu này một cách an toàn.'
  }
}

export function newComponentProps(type: ComponentType): Record<string, unknown> | null {
  switch (type) {
    case 'heading': return { text: 'Tiêu đề mới', level: 2 }
    case 'paragraph': return { text: 'Đoạn văn mới' }
    case 'image': return { src: 'https://images.example.com/placeholder.png', alt: 'Hình ảnh minh họa' }
    case 'button': return { text: 'Hành động chính', action: { type: 'external_url', url: 'https://example.com' } }
    case 'link': return { text: 'Liên kết', action: { type: 'external_url', url: 'https://example.com' } }
    case 'icon': return { name: 'star', label: 'Ngôi sao' }
    case 'badge': return { text: 'Mới' }
    case 'navbar': return { brand: 'ZenUI' }
    case 'hero': return { label: 'Phần mở đầu' }
    case 'feature-card': return { title: 'Lợi ích', description: 'Mô tả lợi ích nổi bật.' }
    case 'lead-form': return {
      title: 'Yêu cầu tư vấn',
      description: 'Hãy cho chúng tôi biết nhu cầu của bạn.',
      submitLabel: 'Gửi yêu cầu',
      successCopy: 'Cảm ơn bạn. Chúng tôi sẽ sớm liên hệ.',
      fields: [
        { key: 'name', type: 'text', label: 'Họ và tên', required: true, placeholder: 'Tên của bạn' },
        { key: 'email', type: 'email', label: 'Email', required: true, placeholder: 'ban@example.com' },
      ],
    }
    default: return null
  }
}
