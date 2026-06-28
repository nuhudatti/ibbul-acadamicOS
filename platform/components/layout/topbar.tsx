'use client'

import { usePathname } from 'next/navigation'
import { Bell, Menu, ChevronRight } from 'lucide-react'
import { cn, getRoleLabel, getRoleColor } from '@/lib/utils'
import { safeDisplayText } from '@/lib/api-errors'
import { useAuthStore, useUIStore } from '@/lib/store'
import { usePlatformBrand } from '@/hooks/use-platform-brand'
import { PlatformLogo } from '@/components/branding/platform-logo'

const BREADCRUMBS: Record<string, string> = {
  '/dashboard': 'Command Centre',
  '/faculty': 'Faculty Center',
  '/results': 'My Results',
  '/hod/upload': 'Add Results',
  '/hod/results': 'All Results',
  '/admin/upload-batches': 'Upload History',
  '/hod/department': 'People & Invites',
  '/learning': 'Learning',
  '/learning/catalog': 'Course Catalog',
  '/learning/my-offerings': 'My Offerings',
  '/admin/users': 'User Management',
  '/admin/assignments': 'Assign Lecturers',
  '/admin/academic-structure': 'Courses Catalogue',
  '/admin/audit': 'Activity Log',
  '/admin/analytics': 'Reports & Insights',
  '/settings': 'Settings',
}

const SECTION_MAP: Record<string, string> = {
  '/dashboard': 'Home',
  '/results': 'Results',
  '/hod': 'Results',
  '/learning': 'Learning',
  '/faculty': 'Faculty',
  '/admin': 'Administration',
  '/settings': 'Settings',
}

export function Topbar() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const { setSidebarOpen } = useUIStore()
  const { platformShortName, tagline } = usePlatformBrand()

  const pageName = (() => {
    if (pathname === '/learning' && (user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD')) {
      return 'Virtual Learning'
    }
    const match = Object.keys(BREADCRUMBS).find((k) => pathname === k || pathname.startsWith(k + '/'))
    return match ? BREADCRUMBS[match] : platformShortName
  })()

  const sectionKey = Object.keys(SECTION_MAP).find((k) => pathname.startsWith(k))
  const section = sectionKey ? SECTION_MAP[sectionKey] : null

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 bg-white border-b border-slate-200/80 sticky top-0 z-30 flex-shrink-0">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-700 via-ibbul-gold to-brand-700 opacity-60" />

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="lg:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-brand-50 touch-manipulation"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <PlatformLogo size="xs" className="hidden sm:flex" />

        <nav className="flex items-center gap-1 text-sm min-w-0 truncate ml-1">
          <span className="hidden md:inline font-display text-brand-800">{platformShortName}</span>
          {section && section !== pageName && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 hidden md:inline" />
              <span className="text-slate-500 truncate hidden md:inline">{section}</span>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
          <span className="text-slate-900 font-semibold truncate">{pageName}</span>
        </nav>
      </div>

      <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500 flex-shrink-0 mr-2">
        <span className="text-[10px] uppercase tracking-widest text-ibbul-gold font-semibold">{tagline}</span>
      </div>

      <div className="hidden md:flex items-center gap-2 text-sm text-slate-500 flex-shrink-0">
        <span>{greeting},</span>
        <span className="font-semibold text-slate-800">{safeDisplayText(user?.first_name, 'User')}</span>
        {user?.role && (
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', getRoleColor(user.role))}>
            {getRoleLabel(user.role)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button
          type="button"
          className="relative p-2 rounded-xl text-slate-500 hover:bg-brand-50 hover:text-brand-700 touch-manipulation"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-ibbul-gold" />
        </button>
        <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center text-white text-xs font-bold ring-2 ring-brand-100">
          {user?.first_name?.[0]?.toUpperCase() ?? 'U'}
        </div>
      </div>
    </header>
  )
}
