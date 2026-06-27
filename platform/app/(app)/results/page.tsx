'use client'
import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import { academicsAPI } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, getSemesterLabel, resolveResultCourse } from '@/lib/utils'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { SemesterSummaryPanel } from '@/components/academics/semester-summary-panel'
import { GradeChip } from '@/components/ui/grade-chip'
import { TableScroll } from '@/components/ui/table-scroll'
import type { Result, SemesterSummary } from '@/lib/types'

interface GroupedSemester {
  session: string
  semester: string
  results: Result[]
  summary?: SemesterSummary
}

export default function ResultsPage() {
  const [loading, setLoading] = useState(true)
  const [grouped, setGrouped] = useState<GroupedSemester[]>([])
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await academicsAPI.getMyResults()
        const data = resp.data
        const results: Result[] = data.results ?? []
        const summariesRaw: Record<string, SemesterSummary> = data.summaries ?? {}

        // Group by session + semester
        const map = new Map<string, GroupedSemester>()
        for (const r of results) {
          const key = `${r.session}__${r.semester}`
          if (!map.has(key)) {
            const summary = summariesRaw[`${r.session}_${r.semester}`]
              ?? summariesRaw[key]
            map.set(key, {
              session: r.session,
              semester: r.semester,
              results: [],
              summary,
            })
          }
          map.get(key)!.results.push(r)
        }

        const groups = Array.from(map.values()).sort((a, b) => {
          const sessionDiff = b.session.localeCompare(a.session)
          if (sessionDiff !== 0) return sessionDiff
          return a.semester === 'FIRST' ? -1 : 1
        })

        setGrouped(groups)
        if (groups.length > 0) setSelectedSemester(`${groups[0].session}__${groups[0].semester}`)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeSemester = grouped.find(
    (g) => `${g.session}__${g.semester}` === selectedSemester
  )

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="skeleton h-8 w-48 rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-9 w-32 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (grouped.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={FileText}
          title="No results available"
          description="Your approved results will appear here once your HOD approves and publishes them. Log in with the same student ID that appears in the uploaded result sheet."
        />
      </div>
    )
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Results"
        title="My Results"
        description={`${grouped.reduce((acc, g) => acc + g.results.length, 0)} course results across ${grouped.length} semester${grouped.length > 1 ? 's' : ''}`}
        action={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-brand-50/50 hover:border-brand-200 transition-all">
            <Download className="w-4 h-4" />
            Export
          </button>
        }
      />

      {/* Semester tabs */}
      <div className="flex flex-wrap gap-2">
        {grouped.map((g) => {
          const key = `${g.session}__${g.semester}`
          const isActive = selectedSemester === key
          return (
            <button
              key={key}
              onClick={() => setSelectedSemester(key)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'gradient-brand text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              {g.session} · {getSemesterLabel(g.semester)}
            </button>
          )
        })}
      </div>

      {activeSemester && (
        <div className="space-y-5 animate-fade-in">
          <SemesterSummaryPanel
            summary={activeSemester.summary}
            session={activeSemester.session}
            semester={activeSemester.semester}
            title="Academic Summary"
          />

          {/* Results table */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-slate-800">
                  {activeSemester.session} · {getSemesterLabel(activeSemester.semester)}
                </h2>
                <span className="text-xs text-slate-400">({activeSemester.results.length} courses)</span>
              </div>
            </div>
            <TableScroll minWidth="640px">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Course Code', 'Course Title', 'Credit Units', 'Score', 'Grade'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {activeSemester.results.map((r) => {
                    const course = resolveResultCourse(r)
                    return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="text-sm font-bold font-mono text-brand-800">
                          {course.code || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-slate-700 max-w-xs">
                        <span className="line-clamp-2">{course.title || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-center text-slate-600 tabular-nums">
                        {course.creditUnits ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm font-bold text-slate-900 text-center tabular-nums">
                        {r.score}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <GradeChip grade={r.grade} size="sm" />
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </div>
      )}
    </PageShell>
  )
}
