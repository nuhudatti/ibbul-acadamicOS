'use client'
import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore, useUIStore } from '@/lib/store'
import { tokenStorage } from '@/lib/api'
import { isTokenExpired } from '@/lib/utils'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { cn } from '@/lib/utils'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, user, _hasHydrated, logout, refreshUser } = useAuthStore()
  const { sidebarCollapsed, sidebarOpen, setSidebarOpen } = useUIStore()
  const profileSynced = useRef(false)

  useEffect(() => {
    if (!_hasHydrated) return
    const access = tokenStorage.getAccess()
    if (!access || isTokenExpired(access)) {
      logout()
      router.replace('/login')
      return
    }
    if (!isAuthenticated) return
    if (user?.is_first_login) router.replace('/first-login')
  }, [_hasHydrated, isAuthenticated, user?.is_first_login, router, logout])

  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || profileSynced.current) return
    profileSynced.current = true
    const run = () => { refreshUser().catch(() => {}) }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 2000 })
    } else {
      setTimeout(run, 50)
    }
  }, [_hasHydrated, isAuthenticated, refreshUser])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname, setSidebarOpen])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 1024) setSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setSidebarOpen])

  const access = typeof window !== 'undefined' ? tokenStorage.getAccess() : null
  const tokenOk = access && !isTokenExpired(access)

  if (!_hasHydrated) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#f4f6f8]">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!tokenOk) {
    return null
  }

  const sidebarWidth = sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#f4f6f8]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-full flex-shrink-0',
          'transition-transform duration-200 ease-out lg:transition-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'w-[min(100vw-3rem,280px)]',
          sidebarWidth,
          'lg:static lg:z-auto'
        )}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="w-full max-w-[1440px] mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
