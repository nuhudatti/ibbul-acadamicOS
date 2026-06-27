'use client'

import { useEffect, useCallback, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Compass } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { learningAPI } from '@/lib/api'
import { ExaminerTeachingHub } from '@/components/modules/learning/examiner-teaching-hub'
import { StudentLearningHub } from '@/components/modules/learning/student-learning-hub'
import { HodLearningOversight } from '@/components/governance/hod-learning-oversight'
import { LPageHeader, LSkeleton, LButton } from '@/components/modules/learning/learning-ui'
import type { Enrollment } from '@/lib/types'

export default function LearningHubPage() {
  const { user } = useAuthStore()
  const isStudent = user?.role === 'STUDENT'
  const isExaminer = user?.role === 'EXAMINER'
  const isHod = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD'
  const isDean = user?.role === 'FACULTY_ADMIN'

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])

  const load = useCallback(async () => {
    if (!isStudent) return
    setLoading(true)
    try {
      const [statsResp, enrollResp] = await Promise.allSettled([
        learningAPI.getDashboardStats(),
        learningAPI.getMyEnrollments(),
      ])
      if (statsResp.status === 'fulfilled') setStats(statsResp.value.data ?? {})
      if (enrollResp.status === 'fulfilled') setEnrollments(enrollResp.value.data ?? [])
    } catch {
      toast.error('Failed to load learning data')
    } finally {
      setLoading(false)
    }
  }, [isStudent])

  useEffect(() => {
    if (isExaminer || isHod || isDean) return
    if (isStudent) load()
    else setLoading(false)
  }, [isStudent, isExaminer, isHod, isDean, load])

  if (isExaminer) {
    return <ExaminerTeachingHub />
  }

  if (isHod || isDean) {
    return <HodLearningOversight />
  }

  return (
    <div className="space-y-6">
      <LPageHeader
        eyebrow="Virtual Learning"
        title="My courses"
        description="Your enrolled courses only — continue where you left off. Browse the catalog when you want to join something new."
        action={
          <Link href="/learning/catalog">
            <LButton variant="secondary">
              <Compass className="w-4 h-4" /> Browse catalog
            </LButton>
          </Link>
        }
      />

      {isStudent ? (
        <StudentLearningHub
          stats={stats}
          enrollments={enrollments}
          catalog={[]}
          loading={loading}
          onEnrolled={load}
          mode="home"
        />
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4">
          <LSkeleton className="h-40" />
          <LSkeleton className="h-40" />
        </div>
      ) : null}
    </div>
  )
}
