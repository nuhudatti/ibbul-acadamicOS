'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ChevronLeft, Lock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { learningAPI } from '@/lib/api'
import { buildLearningPath, getNextLesson, getStepByLessonId } from '@/lib/learning-utils'
import { LessonEngineView } from '@/components/modules/learning/engine/lesson-engine-view'
import { StepCompleteCelebration } from '@/components/modules/learning/engine/step-complete-celebration'
import { LearningJourneyRail } from '@/components/modules/learning/learning-journey-rail'
import { LBreadcrumb, LCard, LButton, LBadge, LSkeleton } from '@/components/modules/learning/learning-ui'
import { formatContentTypeLabel } from '@/lib/safe-string'
import type { LMSOfferingDetail, Lesson } from '@/lib/types'

export default function LessonPlayerPage() {
  const params = useParams()
  const offeringId = Number(params.id)
  const lessonId = Number(params.lessonId)
  const { user } = useAuthStore()
  const isStudent = user?.role === 'STUDENT'
  const isExaminer = user?.role === 'EXAMINER'

  const [loading, setLoading] = useState(true)
  const [offering, setOffering] = useState<LMSOfferingDetail | null>(null)
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [marking, setMarking] = useState(false)
  const [celebration, setCelebration] = useState<{ message?: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [offResp, lesResp] = await Promise.all([
        learningAPI.getOfferingDetail(offeringId),
        learningAPI.getLessonDetail(lessonId),
      ])
      setOffering(offResp.data)
      setLesson(lesResp.data)
    } catch {
      toast.error('Failed to load lesson')
    } finally {
      setLoading(false)
    }
  }, [offeringId, lessonId])

  useEffect(() => { load() }, [load])

  const steps = useMemo(
    () => buildLearningPath(offering?.modules, { isInstructor: isExaminer }),
    [offering?.modules, isExaminer]
  )
  const currentStep = useMemo(() => getStepByLessonId(steps, lessonId), [steps, lessonId])
  const isLocked = isStudent && currentStep?.status === 'locked'
  const nextLesson = useMemo(() => getNextLesson(offering?.modules, lessonId), [offering, lessonId])

  const showCelebration = (message?: string) => {
    setCelebration({ message })
    load()
  }

  const markComplete = async () => {
    if (!lesson || !isStudent) return
    setMarking(true)
    try {
      await learningAPI.markLessonComplete(lesson.id)
      showCelebration('You finished this step — nice and steady. The next one is waiting for you.')
    } catch {
      toast.error('Could not save progress')
    } finally {
      setMarking(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <LSkeleton className="h-16 w-full" />
        <LSkeleton className="h-[480px] w-full" />
      </div>
    )
  }

  if (!lesson || !offering) return null

  const completed = lesson.progress?.completed || currentStep?.status === 'completed'
  const isQuiz = lesson.content_type === 'quiz'
  const isAssignment = lesson.content_type === 'assignment'
  const showCompleteBtn = isStudent && !completed && !isQuiz && !isAssignment && !celebration

  if (isLocked) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <LBreadcrumb items={[
          { label: offering.course_code, href: `/learning/offerings/${offeringId}` },
          { label: lesson.title },
        ]} />
        <LCard className="mt-8 !py-14">
          <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800">This step is locked</h2>
          <p className="text-sm text-slate-500 mt-2">{currentStep?.lockReason}</p>
          <Link href={`/learning/offerings/${offeringId}`} className="inline-block mt-6">
            <LButton variant="secondary">Back to learning path</LButton>
          </Link>
        </LCard>
      </div>
    )
  }

  if (celebration) {
    return (
      <div className="max-w-2xl mx-auto">
        <LBreadcrumb items={[
          { label: offering.course_code, href: `/learning/offerings/${offeringId}` },
          { label: lesson.title },
        ]} />
        <div className="mt-6">
          <StepCompleteCelebration
            stepTitle={lesson.title}
            stepType={lesson.content_type}
            nextLesson={nextLesson}
            offeringId={offeringId}
            message={celebration.message}
            onDismiss={() => setCelebration(null)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <LBreadcrumb items={[
        { label: offering.course_code, href: `/learning/offerings/${offeringId}` },
        { label: lesson.title },
      ]} />

      {isStudent && steps.length > 0 && (
        <LearningJourneyRail
          steps={steps}
          offeringId={offeringId}
          activeLessonId={lessonId}
          compact
        />
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <LBadge variant="info" className="mb-2 capitalize">{formatContentTypeLabel(lesson.content_type)}</LBadge>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{lesson.title}</h1>
        </div>
        {completed && (
          <LBadge variant="success" dot>Completed</LBadge>
        )}
      </div>

      <LCard padding="lg" className="!p-0 overflow-hidden !shadow-md">
        <div className="p-6 sm:p-8">
          <LessonEngineView
            lesson={lesson}
            isInstructor={isExaminer}
            onQuizPassed={() => showCelebration('Excellent — you passed the exam. The next step is unlocked.')}
            onAssignmentSubmitted={() => showCelebration('Assignment submitted successfully. You can move on when ready.')}
          />
        </div>
        {showCompleteBtn && (
          <div className="px-6 sm:px-8 pb-6 border-t border-slate-100 pt-6">
            <p className="text-xs text-slate-500 mb-3 text-center">
              Finished reading or watching? Mark this step complete to unlock the next one.
            </p>
            <LButton onClick={markComplete} disabled={marking} className="w-full" size="lg">
              {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              I&apos;m done — complete this step
            </LButton>
          </div>
        )}
      </LCard>

      <div className="flex items-center justify-start pt-2">
        <Link href={`/learning/offerings/${offeringId}`}>
          <LButton variant="ghost" size="sm"><ChevronLeft className="w-4 h-4" /> Back to path</LButton>
        </Link>
      </div>
    </div>
  )
}
