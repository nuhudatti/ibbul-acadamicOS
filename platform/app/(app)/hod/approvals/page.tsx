'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Review Queue removed — pending approvals live under All Results. */
export default function ApprovalsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/hod/results?pending=1')
  }, [router])
  return null
}
