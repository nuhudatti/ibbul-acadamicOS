'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen, Plus, Settings, Users, Sparkles, GraduationCap,
  ChevronRight, Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import { academicsAPI, learningAPI } from '@/lib/api'
import { CreateOfferingModal } from '@/components/modules/learning/create-offering-modal'
import {
  LCard, LButton, LBadge, LStat, LEmpty, LSkeleton,
} from '@/components/modules/learning/learning-ui'
import { getSemesterLabel } from '@/lib/utils'
import type { LMSOffering } from '@/lib/types'

interface AssignedCourse {
  id: number
  code: string
  title: string
}

export function ExaminerTeachingHub() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [offerings, setOfferings] = useState<LMSOffering[]>([])
  const [assigned, setAssigned] = useState<AssignedCourse[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [statsResp, offResp, coursesResp] = await Promise.allSettled([
        learningAPI.getDashboardStats(),
        learningAPI.getMyOfferings(),
        academicsAPI.getMyAssignedCourses(),
      ])
      if (statsResp.status === 'fulfilled') setStats(statsResp.value.data ?? {})
      if (offResp.status === 'fulfilled') {
        setOfferings(Array.isArray(offResp.value.data) ? offResp.value.data : [])
      }
      if (coursesResp.status === 'fulfilled') {
        const d = coursesResp.value.data
        setAssigned(Array.isArray(d) ? d : d.results ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <LCard className="!p-5 sm:!p-6 !bg-brand-800 !border-brand-700/40 text-white shadow-card overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-brand-200 text-xs font-semibold uppercase tracking-widest mb-1">Virtual Learning · Teaching studio</p>
            <h2 className="font-display text-xl sm:text-2xl text-white leading-tight">Build a learning path in minutes</h2>
            <p className="text-white/75 text-sm mt-2 max-w-lg leading-relaxed">
              Add modules → add steps (lesson, quiz, assignment) → publish. Students progress one step at a time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-white text-brand-800 text-sm font-semibold shadow-md hover:bg-brand-50 transition-colors w-full sm:w-auto flex-shrink-0"
          >
            <Plus className="w-4 h-4" /> New course offering
          </button>
        </div>
      </LCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <LSkeleton key={i} className="h-24" />)
        ) : (
          <>
            <LStat label="Courses" value={stats.total_offerings ?? offerings.length} icon={BookOpen} />
            <LStat label="Published" value={stats.published_offerings ?? 0} icon={Sparkles} />
            <LStat label="Students" value={stats.total_enrolled ?? 0} icon={Users} />
            <LStat label="To grade" value={stats.pending_submissions ?? 0} icon={GraduationCap} />
          </>
        )}
      </div>

      {!loading && offerings.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Create offering', desc: 'From your assigned course' },
            { step: '2', title: 'Build path', desc: 'Lessons, quizzes, assignments' },
            { step: '3', title: 'Publish', desc: 'Students enroll & progress' },
          ].map((s) => (
            <LCard key={s.step} className="!p-4 flex gap-3">
              <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-800 text-sm font-bold flex items-center justify-center flex-shrink-0">
                {s.step}
              </span>
              <div>
                <p className="font-semibold text-slate-800 text-sm">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{s.desc}</p>
              </div>
            </LCard>
          ))}
        </div>
      )}

      {!loading && offerings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent courses</p>
            <Link href="/learning/my-offerings" className="text-xs text-brand-700 font-medium hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {offerings.slice(0, 4).map((o) => (
              <LCard key={o.id} hover>
                <div className="flex items-center justify-between mb-2">
                  <LBadge variant="info">{o.course_code}</LBadge>
                  <LBadge variant={o.is_published ? 'live' : 'warning'} dot>{o.is_published ? 'Live' : 'Draft'}</LBadge>
                </div>
                <h4 className="font-semibold text-slate-900">{o.course_title}</h4>
                <p className="text-xs text-slate-400 mt-1">{o.session} · {getSemesterLabel(o.semester)}</p>
                <p className="text-xs text-slate-500 mt-2">{o.enrolled_count} students · {o.lesson_count} steps</p>
                <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Link href={`/learning/offerings/${o.id}/manage`} className="flex-1">
                    <LButton className="w-full" size="sm"><Settings className="w-3.5 h-3.5" /> Build</LButton>
                  </Link>
                  <Link href={`/learning/offerings/${o.id}`}>
                    <LButton variant="secondary" size="sm"><ChevronRight className="w-4 h-4" /></LButton>
                  </Link>
                </div>
              </LCard>
            ))}
          </div>
        </div>
      )}

      {!loading && assigned.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Assigned courses (Academic Core)
          </p>
          <div className="flex flex-wrap gap-2">
            {assigned.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-700">
                <span className="font-mono text-xs font-bold text-brand-700">{c.code}</span>
                {c.title}
              </span>
            ))}
          </div>
        </div>
      )}

      <CreateOfferingModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { load(true); setCreateOpen(false) }}
      />
    </div>
  )
}
