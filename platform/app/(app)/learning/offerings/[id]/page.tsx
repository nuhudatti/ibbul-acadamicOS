'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Settings, Users, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { learningAPI, academicsAPI } from '@/lib/api'
import { buildLearningPath } from '@/lib/learning-utils'
import { LearningPath } from '@/components/modules/learning/learning-path'
import { EnrollBanner } from '@/components/modules/learning/student-learning-hub'
import {
  LPageHeader, LCard, LBadge, LProgressRing, LButton, LBreadcrumb, LEmpty, LSkeleton,
} from '@/components/modules/learning/learning-ui'
import { GradeChip } from '@/components/ui/grade-chip'
import { getSemesterLabel, resolveResultCourse } from '@/lib/utils'
import type { LMSOfferingDetail, Result } from '@/lib/types'

export default function OfferingDetailPage() {
  const params = useParams()
  const id = Number(params.id)
  const { user } = useAuthStore()
  const isExaminer = user?.role === 'EXAMINER'

  const [loading, setLoading] = useState(true)
  const [offering, setOffering] = useState<LMSOfferingDetail | null>(null)
  const [officialResult, setOfficialResult] = useState<Result | null>(null)

  const loadOffering = useCallback(() => {
    if (!id) return
    setLoading(true)
    learningAPI.getOfferingDetail(id)
      .then((r) => setOffering(r.data))
      .catch(() => toast.error('Failed to load course'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    loadOffering()
  }, [loadOffering])

  useEffect(() => {
    if (!offering || user?.role !== 'STUDENT') return
    academicsAPI.getMyResults()
      .then((r) => {
        const list: Result[] = r.data.results ?? []
        const match = list.find(
          (res) =>
            (res.course_code === offering.course_code || res.course === offering.course)
            && res.session === offering.session
            && res.semester === offering.semester
        )
        setOfficialResult(match ?? null)
      })
      .catch(() => setOfficialResult(null))
  }, [offering, user?.role])

  const steps = useMemo(
    () => buildLearningPath(offering?.modules, { isInstructor: isExaminer }),
    [offering?.modules, isExaminer]
  )

  const pathProgress = useMemo(() => {
    const total = steps.length
    const completed = steps.filter((s) => s.status === 'completed').length
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 }
  }, [steps])

  if (loading) {
    return (
      <div className="space-y-4">
        <LSkeleton className="h-32 w-full" />
        <LSkeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!offering) {
    return (
      <LEmpty
        icon={BookOpen}
        title="Course not found"
        description="This offering may not be available in your scope."
      />
    )
  }

  const pct = isExaminer ? 0 : (pathProgress.percent || offering.progress_percent || 0)
  const isStudent = user?.role === 'STUDENT'
  const previewMode = isStudent && !offering.is_enrolled

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <LBreadcrumb items={[
        { label: 'Learning', href: '/learning' },
        { label: offering.course_code },
      ]} />

      <LPageHeader
        eyebrow={previewMode ? 'Course preview' : 'Learning path'}
        title={offering.course_title}
        description={
          [offering.session, getSemesterLabel(offering.semester), offering.instructor_name]
            .filter(Boolean)
            .join(' · ') + (offering.description ? ` — ${offering.description}` : '')
        }
        action={
          isExaminer ? (
            <div className="flex gap-2">
              <Link href={`/learning/offerings/${id}/students`}>
                <LButton variant="secondary"><Users className="w-4 h-4" /> Students</LButton>
              </Link>
              <Link href={`/learning/offerings/${id}/manage`}>
                <LButton><Settings className="w-4 h-4" /> Edit course</LButton>
              </Link>
            </div>
          ) : undefined
        }
      />

      {previewMode && (
        <EnrollBanner offering={offering} onEnrolled={loadOffering} />
      )}

      {!isExaminer && offering.is_enrolled && (
        <>
        {officialResult && (
          <LCard className="mb-4 !p-5 border-brand-200/60 bg-brand-50/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 mb-3">Official result · this course</p>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs text-slate-500">Score</p>
                <p className="text-2xl font-bold text-slate-900 tabular-nums">{officialResult.score}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Grade</p>
                <div className="mt-1"><GradeChip grade={officialResult.grade} size="md" /></div>
              </div>
              {(() => {
                const c = resolveResultCourse(officialResult)
                return c.creditUnits != null ? (
                  <div>
                    <p className="text-xs text-slate-500">Credit units</p>
                    <p className="text-lg font-semibold text-slate-800 tabular-nums">{c.creditUnits}</p>
                  </div>
                ) : null
              })()}
              <p className="text-xs text-slate-500 ml-auto">{offering.session} · {getSemesterLabel(offering.semester)}</p>
            </div>
          </LCard>
        )}
        <LCard className="mb-6 !p-5">
          <div className="flex items-center gap-5">
            <LProgressRing percent={pct} />
            <div>
              <p className="text-sm font-semibold text-slate-800">Your journey</p>
              <p className="text-xs text-slate-500 mt-1">
                {pathProgress.completed} of {pathProgress.total} steps complete · complete each step to unlock the next
              </p>
              <div className="flex gap-2 mt-3">
                <LBadge variant="info">{offering.course_code}</LBadge>
                {pct >= 100 && <LBadge variant="success">Complete</LBadge>}
              </div>
            </div>
          </div>
        </LCard>
        </>
      )}

      {steps.length === 0 ? (
        <LEmpty
          icon={BookOpen}
          title="Path being built"
          description="Your instructor is setting up modules and steps. Check back soon."
        />
      ) : previewMode ? (
        <LCard className="space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Syllabus preview</p>
          {offering.modules?.map((mod, mi) => (
            <div key={mod.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Module {mi + 1}: {mod.title}
              </p>
              <ul className="mt-2 space-y-1">
                {[...(mod.lessons ?? [])].sort((a, b) => a.order - b.order).map((les, li) => (
                  <li key={les.id} className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-white border border-slate-200 text-[10px] font-bold flex items-center justify-center text-slate-400">
                      {li + 1}
                    </span>
                    {les.title}
                    <span className="capitalize text-slate-400">· {les.content_type}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-center text-slate-400 pt-2">
            Enroll above to start the learning path
          </p>
        </LCard>
      ) : (
        <LearningPath steps={steps} offeringId={id} isInstructor={isExaminer} />
      )}
    </div>
  )
}
