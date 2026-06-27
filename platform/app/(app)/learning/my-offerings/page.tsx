'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Plus, Settings, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { learningAPI } from '@/lib/api'
import { CreateOfferingModal } from '@/components/modules/learning/create-offering-modal'
import {
  LPageHeader, LCard, LBadge, LButton, LEmpty, LSkeleton,
} from '@/components/modules/learning/learning-ui'
import { getSemesterLabel } from '@/lib/utils'
import type { LMSOffering } from '@/lib/types'

export default function MyOfferingsPage() {
  const role = useAuthStore((s) => s.user?.role)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offerings, setOfferings] = useState<LMSOffering[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const load = (silent = false) => {
    if (!silent) setLoading(true)
    learningAPI.getMyOfferings()
      .then((r) => setOfferings(Array.isArray(r.data) ? r.data : []))
      .catch(() => toast.error('Failed to load courses'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (role && role !== 'EXAMINER') {
      router.replace('/learning')
      return
    }
    if (role === 'EXAMINER') load()
  }, [role, router])

  if (role !== 'EXAMINER') return null

  return (
    <div className="space-y-6">
      <LPageHeader
        eyebrow="Virtual Learning"
        title="My offerings"
        description="Each offering is a guided learning path. Build steps in order — students unlock them one at a time."
        action={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl gradient-brand text-white text-sm font-semibold w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> New course
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <LSkeleton key={i} className="h-44" />)}
        </div>
      ) : offerings.length === 0 ? (
        <LEmpty
          icon={BookOpen}
          title="Create your first course"
          description="Pick an assigned Academic Core course and build a structured path with lessons, quizzes, and assignments."
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl gradient-brand text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> Create offering
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {offerings.map((o) => (
            <LCard key={o.id}>
              <div className="flex items-center justify-between mb-2">
                <LBadge variant="info">{o.course_code}</LBadge>
                <LBadge variant={o.is_published ? 'live' : 'warning'} dot>
                  {o.is_published ? 'Live' : 'Draft'}
                </LBadge>
              </div>
              <h3 className="font-semibold text-slate-900">{o.course_title}</h3>
              <p className="text-xs text-slate-400 mt-1">{o.session} · {getSemesterLabel(o.semester)}</p>
              <p className="text-xs text-slate-500 mt-3">
                {o.enrolled_count} students · {o.module_count} modules · {o.lesson_count} steps
              </p>
              <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                <Link href={`/learning/offerings/${o.id}/manage`} className="flex-1 min-w-0">
                  <LButton className="w-full"><Settings className="w-3.5 h-3.5" /> Build path</LButton>
                </Link>
                <Link href={`/learning/offerings/${o.id}/students`} className="flex-shrink-0">
                  <LButton variant="secondary"><Users className="w-3.5 h-3.5" /></LButton>
                </Link>
              </div>
            </LCard>
          ))}
        </div>
      )}

      <CreateOfferingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(id) => {
          if (id) router.push(`/learning/offerings/${id}/manage`)
          else load(true)
        }}
      />
    </div>
  )
}
