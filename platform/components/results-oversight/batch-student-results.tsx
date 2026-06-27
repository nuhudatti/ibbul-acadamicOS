'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react'
import { academicsAPI } from '@/lib/api'
import { SemesterSummaryPanel } from '@/components/academics/semester-summary-panel'
import { normalizeSemesterSummary } from '@/lib/summary'
import { cn, getGradeColor } from '@/lib/utils'
import type { SemesterSummary } from '@/lib/types'
import type { BatchResultRow } from '@/lib/oversight'

interface StudentGroup {
  key: string
  studentDbId: number
  studentId: string
  studentName: string
  results: BatchResultRow[]
}

function groupBatchResultsByStudent(results: BatchResultRow[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>()
  for (const r of results) {
    const sid = r.student
    const studentId = r.student_info?.student_id ?? String(sid)
    const studentName = [r.student_info?.first_name, r.student_info?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || '—'
    const key = String(sid)
    if (!map.has(key)) {
      map.set(key, { key, studentDbId: sid, studentId, studentName, results: [] })
    }
    map.get(key)!.results.push(r)
  }
  return Array.from(map.values()).sort((a, b) => a.studentId.localeCompare(b.studentId))
}

function groupStatus(results: BatchResultRow[]): string {
  const statuses = results.map((r) => r.status)
  if (statuses.every((s) => s === 'LOCKED_PUBLISHED')) return 'LOCKED_PUBLISHED'
  if (statuses.every((s) => s === 'APPROVED')) return 'APPROVED'
  if (statuses.some((s) => s === 'HOD_REVIEW')) return 'HOD_REVIEW'
  if (statuses.some((s) => s === 'REJECTED')) return 'REJECTED'
  if (statuses.some((s) => s === 'SUBMITTED')) return 'SUBMITTED'
  return 'DRAFT'
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  HOD_REVIEW: 'Pending Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  LOCKED_PUBLISHED: 'Published',
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 border-blue-200',
  HOD_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  LOCKED_PUBLISHED: 'bg-gold-50 text-gold-800 border-gold-200',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border',
      STATUS_CLASS[status] ?? STATUS_CLASS.DRAFT
    )}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

interface BatchStudentResultsProps {
  results: BatchResultRow[]
  session: string
  semester: string
}

export function BatchStudentResults({ results, session, semester }: BatchStudentResultsProps) {
  const groups = useMemo(() => groupBatchResultsByStudent(results), [results])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [summaries, setSummaries] = useState<Record<string, SemesterSummary | null>>({})
  const [summaryLoading, setSummaryLoading] = useState<Set<string>>(new Set())

  const loadSummary = useCallback(async (group: StudentGroup) => {
    if (summaries[group.key] !== undefined) return
    setSummaryLoading((prev) => new Set(prev).add(group.key))
    try {
      const resp = await academicsAPI.getResultSummary({
        student_id: group.studentId,
        session,
        semester,
      })
      setSummaries((prev) => ({
        ...prev,
        [group.key]: normalizeSemesterSummary(resp.data?.summary ?? null),
      }))
    } catch {
      setSummaries((prev) => ({ ...prev, [group.key]: null }))
    } finally {
      setSummaryLoading((prev) => {
        const next = new Set(prev)
        next.delete(group.key)
        return next
      })
    }
  }, [summaries, session, semester])

  const toggle = (group: StudentGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      const willExpand = !next.has(group.key)
      if (willExpand) {
        next.add(group.key)
        void loadSummary(group)
      } else {
        next.delete(group.key)
      }
      return next
    })
  }

  if (!groups.length) {
    return (
      <div className="px-6 py-10 text-center text-sm text-slate-500">
        No student results in this batch.
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_120px_80px_100px_auto] items-center gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 min-w-[560px]">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Courses</div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Avg</div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-24" />
      </div>

      {groups.map((group) => {
        const isOpen = expanded.has(group.key)
        const status = groupStatus(group.results)
        const scores = group.results
          .map((r) => (typeof r.score === 'number' ? r.score : parseFloat(String(r.score ?? ''))))
          .filter((n) => !isNaN(n))
        const avg = scores.length
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
          : null

        return (
          <div key={group.key}>
            <button
              type="button"
              onClick={() => toggle(group)}
              className={cn(
                'w-full grid grid-cols-[1fr_120px_80px_100px_auto] items-center gap-3 px-6 py-4 text-left',
                'hover:bg-slate-50 transition-colors min-w-[560px]',
                isOpen && 'bg-brand-50/30'
              )}
            >
              <div>
                <div className="font-mono text-sm font-bold text-slate-900">{group.studentId}</div>
                <div className="text-xs text-slate-500 mt-0.5">{group.studentName}</div>
              </div>
              <div className="text-center">
                <span className="text-sm font-bold text-slate-800">{group.results.length}</span>
              </div>
              <div className="text-center text-sm font-bold text-slate-700 tabular-nums">
                {avg ?? '—'}
              </div>
              <div>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center justify-end gap-1 text-xs font-medium text-brand-600 w-24">
                {isOpen ? (
                  <><ChevronUp className="w-4 h-4" /> Hide</>
                ) : (
                  <><ChevronDown className="w-4 h-4" /> View</>
                )}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-brand-100 bg-slate-50/40 px-6 py-5 space-y-5">
                {/* Semester summary */}
                {summaryLoading.has(group.key) ? (
                  <div className="skeleton h-28 w-full rounded-2xl" />
                ) : (
                  <SemesterSummaryPanel
                    summary={summaries[group.key] ?? undefined}
                    session={session}
                    semester={semester}
                    title={`${group.studentId} — Semester Summary`}
                    compact
                  />
                )}

                {/* Course results */}
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/80">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Course results · {session} · {semester === 'FIRST' ? 'First' : 'Second'} Semester
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          {['Course', 'Title', 'Score', 'Grade', 'Status'].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {group.results
                          .sort((a, b) => (a.course_info?.code ?? '').localeCompare(b.course_info?.code ?? ''))
                          .map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50/80">
                              <td className="px-4 py-2.5 font-mono text-xs font-bold text-brand-700">
                                {r.course_info?.code ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[200px] truncate">
                                {r.course_info?.title ?? '—'}
                              </td>
                              <td className="px-4 py-2.5 font-bold tabular-nums">{r.score ?? '—'}</td>
                              <td className="px-4 py-2.5">
                                <span className={cn('grade-badge inline-flex text-xs', getGradeColor(r.grade))}>
                                  {r.grade}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-slate-500">{r.status}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
