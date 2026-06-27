'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { FacultyGovernanceCenter } from '@/components/faculty/faculty-governance-center'

export default function FacultyGovernancePage() {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'FACULTY_ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, router])

  if (user?.role !== 'FACULTY_ADMIN') return null

  return <FacultyGovernanceCenter />
}
