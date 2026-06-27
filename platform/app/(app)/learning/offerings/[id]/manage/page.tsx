'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Users, ArrowLeft, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { learningAPI } from '@/lib/api'
import { LearningBuilder } from '@/components/modules/learning/learning-builder'
import { LBreadcrumb, LSkeleton, LButton } from '@/components/modules/learning/learning-ui'
import { getSemesterLabel } from '@/lib/utils'
import type { LMSOfferingDetail } from '@/lib/types'

export default function ManageOfferingPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)
  const role = useAuthStore((s) => s.user?.role)
  const [loading, setLoading] = useState(true)
  const [offering, setOffering] = useState<LMSOfferingDetail | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    learningAPI.getOfferingDetail(id)
      .then((r) => setOffering(r.data))
      .catch(() => toast.error('Failed to load offering'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (role && role !== 'EXAMINER') {
      router.replace(`/learning/offerings/${id}`)
      return
    }
    if (role === 'EXAMINER') load()
  }, [id, role, router, load])

  if (role !== 'EXAMINER') return null

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <LBreadcrumb items={[
        { label: 'My courses', href: '/learning/my-offerings' },
        { label: offering?.course_code ?? '…', href: `/learning/offerings/${id}` },
        { label: 'Studio' },
      ]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl text-slate-900 tracking-tight">
            {offering?.course_title ?? 'Loading…'}
          </h1>
          {offering && (
            <p className="text-sm text-slate-500 mt-1">
              {offering.course_code} · {offering.session} · {getSemesterLabel(offering.semester)}
            </p>
          )}
        </div>
        {offering && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/learning/offerings/${id}`}>
              <LButton variant="secondary"><ArrowLeft className="w-4 h-4" /> Preview</LButton>
            </Link>
            <Link href={`/learning/offerings/${id}/students`}>
              <LButton variant="secondary"><Users className="w-4 h-4" /> Grade students</LButton>
            </Link>
          </div>
        )}
      </div>

      {loading || !offering ? (
        <div className="space-y-4">
          <LSkeleton className="h-32 w-full" />
          <LSkeleton className="h-48 w-full" />
          <LSkeleton className="h-48 w-full" />
        </div>
      ) : (
        <LearningBuilder offering={offering} onRefresh={load} />
      )}
    </div>
  )
}
