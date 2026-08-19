'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'

import { roleLabel } from '../../lib/ui-copy'

export type DashboardRole = 'owner' | 'editor' | 'viewer'

export interface DashboardSession {
  userId: string
  workspaceId: string
  role: DashboardRole
}

interface DashboardShellProps {
  children: ReactNode
  session: DashboardSession
  localAuth?: boolean
  signOutAction?: () => Promise<void>
  pathname?: string
}

const DashboardSessionContext = createContext<DashboardSession | null>(null)

export function useDashboardSession(): DashboardSession {
  const session = useContext(DashboardSessionContext)
  if (!session) throw new Error('Dashboard session is unavailable')
  return session
}

function activePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

function DashboardIcon({ name }: { name: 'projects' | 'customers' | 'usage' | 'templates' | 'settings' }) {
  if (name === 'projects') {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
  }
  if (name === 'customers') {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  }
  if (name === 'usage') {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V9" /><path d="M10 19V5" /><path d="M16 19v-7" /><path d="M22 19H2" /></svg>
  }
  if (name === 'templates') {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7.26 19.7l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.26 14H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.3 7.18l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 3.18V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.82 10H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" /></svg>
}

export function DashboardShell({
  children,
  session,
  localAuth = false,
  signOutAction,
  pathname: pathnameOverride,
}: DashboardShellProps) {
  const runtimePathname = usePathname()
  const pathname = pathnameOverride ?? runtimePathname
  const navigation = [
    { href: '/dashboard', label: 'Dự án', icon: 'projects' as const, visible: true },
    { href: '/dashboard/customers', label: 'Khách hàng', icon: 'customers' as const, visible: session.role !== 'viewer' },
    { href: '/dashboard/usage', label: 'Sử dụng AI', icon: 'usage' as const, visible: true },
  ]

  return (
    <DashboardSessionContext.Provider value={session}>
      <div className="dashboard-pro-layout">
        <aside className="dashboard-sidebar">
          <div className="sidebar-brand"><Link className="zenui-brand-gradient" href="/">ZenUI</Link></div>
          <nav className="sidebar-nav" aria-label="Dashboard">
            {navigation.filter(item => item.visible).map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={activePath(pathname, item.href) ? 'active' : undefined}
                aria-current={activePath(pathname, item.href) ? 'page' : undefined}
              >
                <DashboardIcon name={item.icon} />
                {item.label}
              </Link>
            ))}
            <span className="disabled" aria-disabled="true">
              <DashboardIcon name="templates" />
              Mẫu (Templates) <span className="badge-soon">Soon</span>
            </span>
            <span className="disabled" aria-disabled="true">
              <DashboardIcon name="settings" />
              Cài đặt <span className="badge-soon">Soon</span>
            </span>
          </nav>
          <div className="sidebar-footer">
            <div className="account-info">
              <div className="avatar">{session.role.charAt(0).toUpperCase()}</div>
              <div className="details">
                <span className="role">{roleLabel(session.role)}</span>
                <span className="workspace">Không gian làm việc</span>
              </div>
            </div>
            {localAuth ? (
              <form action="/api/local/session/logout" method="post">
                <button type="submit" className="btn-logout">Đăng xuất</button>
              </form>
            ) : signOutAction ? (
              <form action={signOutAction}>
                <button type="submit" className="btn-logout">Đăng xuất</button>
              </form>
            ) : null}
          </div>
        </aside>
        <div className="dashboard-shell-content">{children}</div>
      </div>
    </DashboardSessionContext.Provider>
  )
}
