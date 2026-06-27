'use client'

import { useEffect, useState } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'
import { learningAPI } from '@/lib/api'
import { LCard, LSkeleton } from '../learning-ui'
import { gradeColor, QUIZ_WEIGHT, ASSIGNMENT_WEIGHT, type GradebookResponse } from '@/lib/learning-grading'
import { cn } from '@/lib/utils'

export function GradeBreakdown({ offeringId, studentOnly = false }: { offeringId: number; studentOnly?: boolean }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<GradebookResponse | null>(null)

  useEffect(() => {
    learningAPI.getGradebook(offeringId)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false))
  }, [offeringId])

  if (loading) return <LSkeleton className="h-48 w-full" />
  if (!data?.students?.length) return null

  const rows = studentOnly ? data.students.slice(0, 1) : data.students

  return (
    <LCard className="!p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-white">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-brand-700" />
          <h3 className="font-semibold text-slate-900">Academic grades</h3>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Quiz {QUIZ_WEIGHT}% · Assignment {ASSIGNMENT_WEIGHT}% · A (70+) B (60+) C (50+) D (45+) F (&lt;45)
        </p>
      </div>
      <div className="divide-y divide-slate-50">
        {rows.map((st) => (
          <div key={st.student_id} className="p-5">
            {!studentOnly && (
              <p className="font-medium text-slate-800 mb-3">{st.full_name} <span className="text-xs text-slate-400 font-mono">{st.student_id}</span></p>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Quiz avg</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{st.quiz_average ?? '—'}%</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-[10px] uppercase text-slate-400 font-semibold">Assignment avg</p>
                <p className="text-xl font-bold text-slate-800 mt-1">{st.assignment_average ?? '—'}%</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3 text-center">
                <p className="text-[10px] uppercase text-brand-700 font-semibold">Final</p>
                <p className={cn('text-2xl font-bold mt-1', gradeColor(st.letter_grade))}>
                  {st.final_score ?? '—'}%
                  {st.letter_grade && <span className="ml-1 text-lg">({st.letter_grade})</span>}
                </p>
              </div>
            </div>
            {st.modules?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider">By module</p>
                {st.modules.map((m) => (
                  <div key={m.module_id} className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-slate-50/80">
                    <span className="text-slate-700 truncate flex-1">{m.module_title}</span>
                    <span className={cn('font-bold ml-2', gradeColor(m.letter_grade))}>
                      {m.final_score != null ? `${m.final_score}% ${m.letter_grade}` : 'Pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </LCard>
  )
}
