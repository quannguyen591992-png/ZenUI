import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NonCoderPrototype } from '../app/prototype/non-coder/non-coder-prototype'

async function reachEditor() {
  const user = userEvent.setup()
  render(<NonCoderPrototype />)
  await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))
  const gallery = await screen.findByRole('region', { name: 'Các hướng thiết kế' })
  expect(within(gallery).getAllByTestId('direction-card')).toHaveLength(3)
  await user.click(within(gallery).getAllByRole('button', { name: 'Chọn hướng này' })[0]!)
  await screen.findByRole('heading', { name: 'Câu chuyện trang' })
  return user
}

describe('non-coder deterministic prototype', () => {
  it('validates the guided brief without erasing entered content', async () => {
    const user = userEvent.setup()
    render(<NonCoderPrototype />)

    const offer = screen.getByLabelText('Bạn cung cấp sản phẩm hoặc dịch vụ gì?')
    await user.clear(offer)
    await user.type(offer, 'A calm planning workspace')
    const audience = screen.getByLabelText('Website dành cho ai?')
    await user.clear(audience)
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    expect(screen.getByText('Hãy cho biết website này dành cho ai')).toBeVisible()
    expect(offer).toHaveValue('A calm planning workspace')
  })

  it('creates exactly three visibly distinct directions from one brief', async () => {
    const user = userEvent.setup()
    render(<NonCoderPrototype />)
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    const gallery = await screen.findByRole('region', { name: 'Các hướng thiết kế' })
    const cards = within(gallery).getAllByTestId('direction-card')
    expect(cards).toHaveLength(3)
    expect(within(cards[0]!).getByText('Đà tiến rõ ràng')).toBeVisible()
    expect(within(cards[1]!).getByText('Người bạn đáng tin')).toBeVisible()
    expect(within(cards[2]!).getByText('Khởi động nổi bật')).toBeVisible()
    expect(within(gallery).getAllByText('Đặt lịch tư vấn').length).toBeGreaterThanOrEqual(3)
  })

  it('keeps technical terminology out of the Simple-mode happy path', async () => {
    await reachEditor()

    const editor = screen.getByRole('main', { name: 'Trình chỉnh sửa theo phần' })
    expect(editor).toHaveTextContent('Đang chỉnh: Phần Lợi ích')
    expect(editor).not.toHaveTextContent(/node id|breakpoint|token count|revision id|deployment provider/i)
  })

  it('keeps the accepted website unchanged when a proposal is discarded', async () => {
    const user = await reachEditor()
    const before = screen.getByTestId('accepted-document-fingerprint').textContent

    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    await screen.findByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })
    await user.click(screen.getByRole('button', { name: 'Bỏ đề xuất' }))

    expect(screen.getByTestId('accepted-document-fingerprint')).toHaveTextContent(before ?? '')
    expect(screen.getByRole('heading', { name: 'Câu chuyện trang' })).toBeVisible()
  })

  it('changes the accepted website only after accepting the reviewed proposal', async () => {
    const user = await reachEditor()
    const before = screen.getByTestId('accepted-document-fingerprint').textContent

    await user.click(screen.getByRole('button', { name: 'Đề xuất thay đổi' }))
    await screen.findByRole('heading', { name: 'Kiểm tra thay đổi được đề xuất' })
    expect(screen.getByTestId('accepted-document-fingerprint')).toHaveTextContent(before ?? '')
    await user.click(screen.getByRole('button', { name: 'Chấp nhận thay đổi' }))

    await screen.findByText('Đã lưu')
    expect(screen.getByTestId('accepted-document-fingerprint').textContent).not.toBe(before)
  })

  it('preserves output through a Simple and Advanced mode round trip', async () => {
    const user = await reachEditor()
    const before = screen.getByTestId('accepted-document-fingerprint').textContent

    await user.click(screen.getByRole('button', { name: 'Mở điều khiển nâng cao' }))
    expect(screen.getByRole('heading', { name: 'Điều khiển nâng cao' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Quay lại Đơn giản' }))

    expect(screen.getByTestId('accepted-document-fingerprint')).toHaveTextContent(before ?? '')
  })

  it('simulates Chia sẻ and Xuất bản locally without making network requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const user = await reachEditor()

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))
    await user.click(screen.getByRole('button', { name: 'Tạo liên kết chia sẻ' }))
    expect(screen.getByText('prototype.local/share/novaflow')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Đóng chia sẻ' }))

    await user.click(screen.getByRole('button', { name: 'Xuất bản' }))
    await user.click(screen.getByLabelText('Tôi hiểu website này sẽ được công khai.'))
    await user.click(screen.getByRole('button', { name: 'Xuất bản website' }))
    expect(await screen.findByText('Website prototype của bạn đã hoạt động')).toBeVisible()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('exposes deterministic failed, offline, and stale review states', async () => {
    const user = userEvent.setup()
    render(<NonCoderPrototype />)

    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'brief-invalid')
    expect(screen.getByRole('alert')).toHaveTextContent('Một chi tiết trong bản mô tả cần được kiểm tra')
    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'brief-failed')
    expect(screen.getByRole('alert')).toHaveTextContent("Bản mô tả của bạn vẫn an toàn")

    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'directions-loading')
    expect(screen.getByRole('status')).toHaveTextContent('Đang tạo ba hướng thiết kế')
    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'directions-failed')
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa có website nào được tạo')

    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'save-unsaved')
    expect(screen.getByRole('status')).toHaveTextContent('vẫn đang được lưu')
    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'save-offline')
    expect(screen.getByRole('alert')).toHaveTextContent('kết nối lại để lưu và xuất bản')

    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'proposal-failed')
    expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('Website của bạn vẫn giữ nguyên'))).toBe(true)
    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'proposal-stale')
    expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('đã thay đổi trong khi bản xem trước mở'))).toBe(true)

    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'publish-progress')
    expect(screen.getByRole('status')).toHaveTextContent('Đang xuất bản website prototype đã lưu gần nhất')
    await user.selectOptions(screen.getByLabelText('Trạng thái kiểm tra'), 'publish-failed')
    expect(screen.getByRole('alert')).toHaveTextContent("Không thể xuất bản prototype này")
  })

  it('replaces directions deterministically and previews one without choosing it', async () => {
    const user = userEvent.setup()
    render(<NonCoderPrototype />)
    await user.click(screen.getByRole('button', { name: 'Tạo 3 hướng thiết kế' }))

    await user.click(screen.getByRole('button', { name: 'Thử ba hướng khác' }))
    expect(screen.getByText('Rõ ràng và điềm tĩnh')).toBeVisible()
    expect(screen.getByText('Đang chuẩn bị ba lựa chọn khác. Các hướng hiện tại vẫn được giữ.')).toBeVisible()

    const firstCard = screen.getAllByTestId('direction-card')[0]!
    await user.click(within(firstCard).getByRole('button', { name: 'Xem lớn hơn' }))
    expect(screen.getByRole('dialog', { name: 'Bản xem trước lớn của Rõ ràng và điềm tĩnh' })).toBeVisible()
    expect(screen.getByTestId('accepted-document-fingerprint')).toHaveTextContent('no-accepted-document')
    await user.click(screen.getByRole('button', { name: 'Đóng Bản xem trước lớn của Rõ ràng và điềm tĩnh' }))
    expect(within(firstCard).getByRole('button', { name: 'Xem lớn hơn' })).toHaveFocus()
  })

  it('closes the preview with Escape and restores focus to its opener', async () => {
    const user = await reachEditor()
    const opener = screen.getByRole('button', { name: 'Xem trước' })
    await user.click(opener)
    expect(screen.getByRole('dialog', { name: 'Xem trước website của bạn' })).toBeVisible()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Xem trước website của bạn' })).toBeNull()
    expect(opener).toHaveFocus()
  })
})
