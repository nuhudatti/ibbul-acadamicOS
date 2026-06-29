'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'

/**
 * Rehydrate persisted auth after mount so SSR HTML matches the first client render.
 * Prevents React hydration errors (#418/#423) from localStorage state.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const finish = () => setReady(true)
    const persist = useAuthStore.persist

    if (persist.hasHydrated()) {
      finish()
      return
    }

    const unsub = persist.onFinishHydration(() => {
      finish()
    })
    persist.rehydrate()
    return unsub
  }, [])

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#f4f6f8]">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
