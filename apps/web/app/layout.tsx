import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ZenUI — Tạo website cùng AI, theo cách của bạn',
    template: '%s | ZenUI',
  },
  description: 'Trợ lý AI đồng thiết kế website cho người không biết code, với nền tảng có cấu trúc, có thể so sánh và hoàn tác.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
