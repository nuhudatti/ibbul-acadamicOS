'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { BookOpen } from 'lucide-react'
import { learningAPI } from '@/lib/api'
import { StudentLearningHub } from '@/components/modules/learning/student-learning-hub'
import { LPageHeader, LButton } from '@/components/modules/learning/learning-ui'
import type { Enrollment, LMSOffering } from '@/lib/types'

/** Course catalog — all published offerings from all lecturers at the student's level. */
export default function LearningCatalogPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [catalog, setCatalog] = useState<LMSOffering[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsResp, enrollResp, catalogResp] = await Promise.allSettled([
        learningAPI.getDashboardStats(),
        learningAPI.getMyEnrollments(),
        learningAPI.getCatalog(),
      ])
      if (statsResp.status === 'fulfilled') setStats(statsResp.value.data ?? {})
      if (enrollResp.status === 'fulfilled') setEnrollments(enrollResp.value.data ?? [])
      if (catalogResp.status === 'fulfilled') setCatalog(catalogResp.value.data ?? [])
      else toast.error('Could not load course catalog')
    } catch {
      toast.error('Failed to load courses')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <LPageHeader
        eyebrow="Course catalog"
        title="Browse & enroll"
        description="All published courses from every lecturer at your level. New uploads appear here as soon as they are published."
        action={
          <Link href="/learning">
            <LButton variant="secondary">
              <BookOpen className="w-4 h-4" /> My courses
            </LButton>
          </Link>
        }
      />
      <StudentLearningHub
        stats={stats}
        enrollments={enrollments}
        catalog={catalog}
        loading={loading}
        onEnrolled={load}
        mode="catalog"
      />
    </div>
  )
}
