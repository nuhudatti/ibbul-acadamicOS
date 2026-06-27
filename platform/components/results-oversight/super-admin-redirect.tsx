'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

/**
 * Blocks Super Admin from operational HOD result workflows.
 * Redirects to read-only Results Oversight dashboard.
 */
export function SuperAdminOversightGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      router.replace('/admin/results-oversight')
    }
  }, [user, router])

  if (user?.role === 'SUPER_ADMIN') {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-500">
        Redirecting to Results Oversight…
      </div>
    )
  }

  return <>{children}</>
}
