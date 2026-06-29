'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FileText, BookOpen,
  Users, Upload, Settings, ChevronLeft, ChevronRight,
  BarChart3, ShieldCheck, Building2, LogOut,
  ChevronDown, Layers, UserCheck, X,
} from 'lucide-react'
import { cn, getRoleLabel } from '@/lib/utils'
import { safeDisplayText } from '@/lib/api-errors'
import { safeStr } from '@/lib/safe-string'
import { useAuthStore, useUIStore } from '@/lib/store'
import { usePlatformBrand } from '@/hooks/use-platform-brand'
import { PlatformLogo } from '@/components/branding/platform-logo'
import type { UserRole } from '@/lib/types'

interface NavItem {
  label: string
  href?: string
  icon: React.ComponentType<{ className?: string }>
  roles?: UserRole[]
  modules?: string[]
  children?: Omit<NavItem, 'children'>[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Results',
    icon: FileText,
    modules: ['results'],
    children: [
      { label: 'Results Oversight', href: '/admin/results-oversight', icon: FileText, roles: ['SUPER_ADMIN'] },
      { label: 'My Results', href: '/results', icon: FileText, roles: ['STUDENT'] },
      { label: 'Assigned Results', href: '/lecturer/results', icon: FileText, roles: ['EXAMINER'] },
      { label: 'All Results', href: '/hod/results', icon: FileText, roles: ['DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN'] },
      { label: 'Add Results', href: '/hod/upload', icon: Upload, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Upload History', href: '/admin/upload-batches', icon: FileText, roles: ['DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN'] },
    ],
  },
  {
    label: 'Learning',
    icon: BookOpen,
    modules: ['learning'],
    children: [
      { label: 'Learning Hub', href: '/learning', icon: BookOpen, roles: ['STUDENT', 'EXAMINER', 'FACULTY_ADMIN', 'SUPER_ADMIN'] },
      { label: 'Virtual Learning', href: '/learning', icon: BookOpen, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Discover courses', href: '/learning/catalog', icon: BookOpen, roles: ['STUDENT'] },
      { label: 'My Offerings', href: '/learning/my-offerings', icon: BookOpen, roles: ['EXAMINER'] },
    ],
  },
  {
    label: 'Governance',
    icon: Building2,
    modules: ['admin'],
    roles: ['SUPER_ADMIN'],
    children: [
      { label: 'Governance Center', href: '/admin/governance', icon: Building2, roles: ['SUPER_ADMIN'] },
      { label: 'Academic Structure', href: '/admin/academic-structure', icon: Layers, roles: ['SUPER_ADMIN'] },
      { label: 'Leadership & Roles', href: '/admin/users', icon: Users, roles: ['SUPER_ADMIN'] },
      { label: 'Institutional Analytics', href: '/admin/analytics', icon: BarChart3, roles: ['SUPER_ADMIN'] },
      { label: 'Audit Logs', href: '/admin/audit', icon: ShieldCheck, roles: ['SUPER_ADMIN'] },
    ],
  },
  {
    label: 'Faculty Governance',
    icon: Building2,
    modules: ['admin'],
    roles: ['FACULTY_ADMIN'],
    children: [
      { label: 'Faculty Center', href: '/faculty', icon: Building2, roles: ['FACULTY_ADMIN'] },
      { label: 'Academic Structure', href: '/admin/academic-structure', icon: Layers, roles: ['FACULTY_ADMIN'] },
      { label: 'Faculty Staff', href: '/admin/users', icon: Users, roles: ['FACULTY_ADMIN'] },
      { label: 'Assignments', href: '/admin/assignments', icon: UserCheck, roles: ['FACULTY_ADMIN'] },
      { label: 'Faculty Analytics', href: '/admin/analytics', icon: BarChart3, roles: ['FACULTY_ADMIN'] },
      { label: 'Audit Logs', href: '/admin/audit', icon: ShieldCheck, roles: ['FACULTY_ADMIN'] },
    ],
  },
  {
    label: 'Administration',
    icon: Building2,
    modules: ['admin'],
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
    children: [
      { label: 'People & Invites', href: '/hod/department', icon: Users, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Assign Lecturers', href: '/admin/assignments', icon: UserCheck, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Courses Catalogue', href: '/admin/academic-structure', icon: Layers, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Activity Log', href: '/admin/audit', icon: ShieldCheck, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
      { label: 'Reports & Insights', href: '/admin/analytics', icon: BarChart3, roles: ['DEPARTMENT_ADMIN', 'HOD'] },
    ],
  },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const ICON_BOX = 'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors'
const ICON_SIZE = 'w-[17px] h-[17px]'

interface SidebarProps {
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { sidebarCollapsed, setSidebarCollapsed, setSidebarOpen } = useUIStore()
  const { platformShortName, tagline } = usePlatformBrand()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(
      user?.role === 'SUPER_ADMIN'
        ? ['Results', 'Governance']
        : user?.role === 'FACULTY_ADMIN'
          ? ['Results', 'Faculty Governance']
          : ['Results', 'Learning', 'Administration']
    )
  )

  const toggleExpand = (label: string) => {
    if (sidebarCollapsed) return
    setExpandedItems((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  const roleHasLearningAccess = (role: string | undefined) =>
    role === 'STUDENT' || role === 'EXAMINER' || role === 'DEPARTMENT_ADMIN' ||
    role === 'HOD' || role === 'FACULTY_ADMIN' || role === 'SUPER_ADMIN'

  const canSeeItem = (item: NavItem): boolean => {
    if (item.roles && user && !item.roles.includes(user.role)) return false
    if (item.modules && user) {
      const hasModule = item.modules.some((m) => {
        if (user.module_access?.includes(m as 'results' | 'learning' | 'admin')) return true
        return m === 'learning' && roleHasLearningAccess(user.role)
      })
      if (!hasModule) return false
    }
    return true
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  const contextLine =
    safeDisplayText(user?.department_name) ||
    safeDisplayText(user?.faculty_name) ||
    (user?.role === 'SUPER_ADMIN' ? 'Institution-wide' : null)

  const navItemClass = (active: boolean) =>
    cn(
      'group relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-150',
      active
        ? 'bg-white/[0.12] text-white shadow-sm'
        : 'text-white/65 hover:text-white hover:bg-white/[0.07]',
      sidebarCollapsed ? 'justify-center px-2 py-2.5 mx-1.5' : 'px-3 py-2.5 mx-3'
    )

  const iconBoxClass = (active: boolean) =>
    cn(
      ICON_BOX,
      active
        ? 'bg-ibbul-gold/20 text-ibbul-gold'
        : 'bg-white/[0.06] text-white/70 group-hover:bg-white/10 group-hover:text-white'
    )

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full w-full',
        'bg-[#062b1a] text-white shadow-sidebar',
        'border-r border-white/[0.06]'
      )}
    >
      {/* Gold top accent */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-ibbul-gold/80 to-transparent" />

      {/* Header */}
      <div
        className={cn(
          'relative flex items-center gap-3 px-4 h-[72px] border-b border-white/[0.08] flex-shrink-0',
          sidebarCollapsed && 'justify-center px-2'
        )}
      >
        <PlatformLogo size="sm" variant="on-dark" showRing={false} />
        {!sidebarCollapsed && (
          <div className="flex-1 min-w-0 pr-6">
            <div className="font-display text-[15px] leading-tight text-white tracking-tight truncate">
              {platformShortName}
            </div>
            <div className="text-[10px] text-ibbul-gold/90 uppercase tracking-[0.14em] font-medium truncate">
              {tagline}
            </div>
            {contextLine && (
              <div className="text-[10px] text-white/40 truncate mt-0.5">{contextLine}</div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute right-3 top-3 p-1.5 rounded-lg text-white/60 hover:bg-white/10 hover:text-white z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 no-scrollbar">
        {!sidebarCollapsed && (
          <p className="px-6 mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">
            Navigation
          </p>
        )}
        {NAV.map((item) => {
          if (!canSeeItem(item)) return null
          const visibleChildren = item.children?.filter(canSeeItem) ?? []

          if (visibleChildren.length > 0) {
            const expanded = expandedItems.has(item.label)
            const anyChildActive = visibleChildren.some((c) => c.href && isActive(c.href))

            return (
              <div key={item.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleExpand(item.label)}
                  className={cn(navItemClass(anyChildActive), 'w-auto text-left')}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {anyChildActive && !sidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-ibbul-gold" />
                  )}
                  <span className={iconBoxClass(anyChildActive)}>
                    <item.icon className={ICON_SIZE} />
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1">{item.label}</span>
                      {expanded ? (
                        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                      )}
                    </>
                  )}
                </button>
                {!sidebarCollapsed && expanded && (
                  <div className="ml-[52px] mr-4 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                    {visibleChildren.map((child) =>
                      child.href ? (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onNavigate}
                          className={cn(
                            'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] transition-colors',
                            isActive(child.href)
                              ? 'bg-ibbul-gold/15 text-gold-100 font-semibold border-l-2 border-ibbul-gold -ml-px pl-[calc(0.625rem+1px)]'
                              : 'text-white/55 hover:text-white hover:bg-white/[0.05]'
                          )}
                        >
                          <child.icon className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
                          {child.label}
                        </Link>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            )
          }

          if (item.href) {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={navItemClass(active)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                {active && !sidebarCollapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-ibbul-gold" />
                )}
                <span className={iconBoxClass(active)}>
                  <item.icon className={ICON_SIZE} />
                </span>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </Link>
            )
          }
          return null
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.08] p-3 flex-shrink-0">
        {!sidebarCollapsed && user && (
          <div className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-ibbul-gold to-gold-600 text-[#062b1a] flex items-center justify-center text-xs font-bold flex-shrink-0 ring-2 ring-white/10">
              {user.first_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold truncate text-white/95">
                {safeDisplayText(user.first_name) || safeDisplayText(user.full_name, 'User')}
              </div>
              <div className="text-[10px] text-white/40 truncate">
                {safeDisplayText(user.department_name) ||
                  safeStr(getRoleLabel(user.role), 'User').replace(/^\w/, (c) => c.toUpperCase())}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-medium',
            'text-white/50 hover:text-red-200 hover:bg-red-500/10 transition-colors',
            sidebarCollapsed && 'justify-center px-2'
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!sidebarCollapsed && 'Sign out'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className={cn(
          'hidden lg:flex absolute top-[50%] -translate-y-1/2 -right-3 z-50',
          'w-6 h-6 rounded-full bg-white border border-slate-200 shadow-card',
          'items-center justify-center text-brand-700 hover:bg-brand-50'
        )}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  )
}
