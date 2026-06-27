'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { academicsAPI } from '@/lib/api'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, getGradeColor } from '@/lib/utils'
import type { Result } from '@/lib/types'

interface Course {
  id: number
  code: string
  title: string
  credit_units?: number
}

export default function LecturerResultsPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)

  const loadCourses = async () => {
    setLoadingCourses(true)
    try {
      const resp = await academicsAPI.getMyAssignedCourses()
      const list = resp.data?.results ?? resp.data ?? []
      setCourses(Array.isArray(list) ? list : [])
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
    } catch {
      toast.error('Failed to load assigned courses')
    } finally {
      setLoadingCourses(false)
    }
  }

  useEffect(() => { loadCourses() }, [])

  useEffect(() => {
    if (!selectedId) { setResults([]); return }
    const load = async () => {
      setLoadingResults(true)
      try {
        const resp = await academicsAPI.getResultsByCourse(selectedId)
        setResults(resp.data?.results ?? [])
      } catch {
        toast.error('Failed to load results for this course')
        setResults([])
      } finally {
        setLoadingResults(false)
      }
    }
    load()
  }, [selectedId])

  const selectedCourse = courses.find((c) => c.id === selectedId)

  const exportCsv = () => {
    if (!results.length || !selectedCourse) return
    const header = ['student_id', 'course_code', 'score', 'grade', 'session', 'semester', 'status']
    const rows = results.map((r) => [
      r.student_id_display ?? '',
      selectedCourse.code,
      String(r.score ?? ''),
      r.grade ?? '',
      r.session,
      r.semester,
      r.status,
    ])
    const csv = [header, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedCourse.code}_results.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Assigned Course Results</h1>
          <p className="text-sm text-slate-500 mt-0.5">Read-only · Only courses assigned to you by your HOD</p>
        </div>
        <button onClick={loadCourses} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loadingCourses && 'animate-spin')} /> Refresh
        </button>
      </div>

      {loadingCourses ? (
        <div className="skeleton h-32 rounded-2xl" />
      ) : courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses assigned" description="Your HOD must assign courses to you before you can view results." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-1 space-y-2">
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'w-full text-left px-4 py-3 rounded-xl border transition-all',
                  selectedId === c.id
                    ? 'border-brand-300 bg-brand-50 text-brand-800'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <div className="font-mono font-bold text-sm">{c.code}</div>
                <div className="text-xs text-slate-500 truncate">{c.title}</div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">{selectedCourse?.code}</h2>
                <p className="text-xs text-slate-500">{results.length} student result{results.length !== 1 ? 's' : ''}</p>
              </div>
              {results.length > 0 && (
                <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              )}
            </div>
            {loadingResults ? (
              <div className="p-8 skeleton h-40" />
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No published results for this course yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {['Student ID', 'Name', 'Score', 'Grade', 'Session', 'Semester', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {results.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-bold">{r.student_id_display ?? '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{r.student_name ?? '—'}</td>
                        <td className="px-4 py-3 font-bold">{r.score}</td>
                        <td className="px-4 py-3"><span className={cn('grade-badge', getGradeColor(r.grade))}>{r.grade}</span></td>
                        <td className="px-4 py-3 text-slate-500">{r.session}</td>
                        <td className="px-4 py-3 text-slate-500">{r.semester}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
