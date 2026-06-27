'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, Download,
  Search, User, BookOpen, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { academicsAPI } from '@/lib/api'
import { cn, getStatusColor, resolveResultCourse } from '@/lib/utils'
import { SUMMARY_FIELD_LABELS, normalizeSemesterSummary } from '@/lib/summary'
import { GradeChip } from '@/components/ui/grade-chip'
import type { Result } from '@/lib/types'

const COURSE_FORMAT = 'Select from catalogue — grade and score required'
const SUMMARY_FORMAT = 'LE, NSS, RCU, ECU, CP, GPA, TRCU, TECU, TCP, PCGPA, CGPA, Outstanding courses, Remarks'

interface CourseRow {
  id: string
  course_code: string
  course_title: string
  credit_unit: string
  grade: string
  score: string
  remark: string
  existingResultId?: number
  readOnly?: boolean
}

interface CatalogueCourse {
  id: number
  code: string
  title: string
  credit_units: number
}

interface EntryError {
  line_no?: number
  course_code?: string
  score?: string
  error_message: string
}

interface StudentOption {
  student_id: string
  first_name?: string
  last_name?: string
  is_active?: boolean
}

function newRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function emptyCourseRow(): CourseRow {
  return { id: newRowId(), course_code: '', course_title: '', credit_unit: '', grade: '', score: '', remark: '' }
}

function courseRowToLine(r: CourseRow): string {
  const parts = [
    r.course_code.trim().toUpperCase(),
    r.credit_unit.trim(),
    r.grade.trim().toUpperCase(),
    r.score.trim(),
    r.remark.trim(),
  ]
  return parts.filter((p, i) => p || i < 4).join(', ')
}

function parseCourseLine(line: string): Omit<CourseRow, 'id' | 'existingResultId' | 'readOnly'> {
  const parts = line.split(',').map((p) => p.trim())
  return {
    course_code: (parts[0] ?? '').replace(/\s/g, '').toUpperCase(),
    course_title: '',
    credit_unit: parts[1] ?? '',
    grade: (parts[2] ?? '').toUpperCase(),
    score: parts[3] ?? '',
    remark: parts[4] ?? '',
  }
}

function normalizeCourseCode(code: string) {
  return code.replace(/\s/g, '').toUpperCase()
}

const emptySummary = (): Record<string, string> => ({
  le: '', nss: '', rcu: '', ecu: '', cp: '', gpa: '',
  trcu: '', tecu: '', tcp: '', pcgpa: '', cgpa: '',
  outstanding_courses: '', remarks: '',
})

export function ManualResultEntry() {
  const [studentId, setStudentId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [studentVerified, setStudentVerified] = useState(false)
  const [studentPending, setStudentPending] = useState(false)
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [searchingStudents, setSearchingStudents] = useState(false)
  const [catalogue, setCatalogue] = useState<CatalogueCourse[]>([])
  const [loadingCatalogue, setLoadingCatalogue] = useState(true)
  const [courseQuery, setCourseQuery] = useState<Record<string, string>>({})
  const [session, setSession] = useState('2023/2024')
  const [semester, setSemester] = useState<'FIRST' | 'SECOND'>('FIRST')
  const [courses, setCourses] = useState<CourseRow[]>([emptyCourseRow()])
  const [courseText, setCourseText] = useState('')
  const [useTextMode, setUseTextMode] = useState(false)
  const [summary, setSummary] = useState<Record<string, string>>(emptySummary())
  const [summaryPaste, setSummaryPaste] = useState('')
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [lastErrors, setLastErrors] = useState<EntryError[]>([])
  const [existingLoaded, setExistingLoaded] = useState(false)

  useEffect(() => {
    academicsAPI.getCourses({ page_size: '500' })
      .then((resp) => {
        const list = (resp.data.results ?? resp.data ?? []) as CatalogueCourse[]
        setCatalogue(list.filter((c) => c.code))
      })
      .catch(() => setCatalogue([]))
      .finally(() => setLoadingCatalogue(false))
  }, [])

  useEffect(() => {
    if (studentQuery.trim().length < 2) {
      setStudentOptions([])
      return
    }
    const t = setTimeout(async () => {
      setSearchingStudents(true)
      try {
        const resp = await academicsAPI.searchStudents({ search: studentQuery, limit: '8' })
        const list = (resp.data.students ?? resp.data.results ?? []) as StudentOption[]
        setStudentOptions(list.filter((s) => s.student_id))
      } catch {
        setStudentOptions([])
      } finally {
        setSearchingStudents(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [studentQuery])

  useEffect(() => {
    const sid = studentId.trim().toUpperCase()
    if (sid.length < 4) {
      setStudentVerified(false)
      setStudentPending(false)
      return
    }
    const t = setTimeout(async () => {
      try {
        const resp = await academicsAPI.searchStudents({ search: sid, limit: '20' })
        const list = (resp.data.students ?? resp.data.results ?? []) as StudentOption[]
        const match = list.find((s) => s.student_id?.toUpperCase() === sid)
        if (match) {
          setStudentVerified(true)
          setStudentPending(match.is_active === false)
        } else if (!studentQuery || studentQuery.toUpperCase() === sid) {
          setStudentVerified(false)
          setStudentPending(false)
        }
      } catch {
        /* keep prior verification state */
      }
    }, 450)
    return () => clearTimeout(t)
  }, [studentId, studentQuery])

  const findCatalogueCourse = useCallback((code: string) => {
    const norm = normalizeCourseCode(code)
    if (!norm) return undefined
    return catalogue.find((c) => normalizeCourseCode(c.code) === norm)
  }, [catalogue])

  const applyCatalogueToRow = (rowId: string, cat: CatalogueCourse) => {
    setCourses((prev) =>
      prev.map((r) =>
        r.id === rowId && !r.readOnly
          ? {
              ...r,
              course_code: normalizeCourseCode(cat.code),
              course_title: cat.title,
              credit_unit: String(cat.credit_units),
            }
          : r
      )
    )
    setCourseQuery((prev) => ({ ...prev, [rowId]: `${cat.code} — ${cat.title}` }))
  }

  const loadExisting = useCallback(async () => {
    const sid = studentId.trim().toUpperCase()
    if (!sid) {
      toast.error('Enter a student matric number first')
      return
    }
    setLoadingExisting(true)
    setLastErrors([])
    try {
      const [resultsResp, summaryResp] = await Promise.all([
        academicsAPI.hodGetResults({
          student_id: sid,
          session,
          semester,
          page_size: '100',
        }),
        academicsAPI.getResultSummary({ student_id: sid, session, semester }),
      ])

      const list = (resultsResp.data.results ?? []) as Result[]
      const existingRows: CourseRow[] = list.map((r) => {
        const resolved = resolveResultCourse(r)
        return {
          id: newRowId(),
          course_code: resolved.code,
          course_title: resolved.title,
          credit_unit: String(resolved.creditUnits ?? ''),
          grade: r.grade ?? '',
          score: String(r.score ?? ''),
          remark: r.remark ?? '',
          existingResultId: r.id,
          readOnly: true,
        }
      })

      setCourses(existingRows.length > 0 ? existingRows : [emptyCourseRow()])
      setCourseText(existingRows.map(courseRowToLine).join('\n'))
      setStudentVerified(true)

      const norm = normalizeSemesterSummary(summaryResp.data?.summary ?? summaryResp.data)
      if (norm && (norm.rcu || norm.gpa || norm.cgpa)) {
        setSummary({
          le: norm.le, nss: norm.nss, rcu: norm.rcu, ecu: norm.ecu, cp: norm.cp,
          gpa: norm.gpa, trcu: norm.trcu, tecu: norm.tecu, tcp: norm.tcp,
          pcgpa: norm.pcgpa, cgpa: norm.cgpa,
          outstanding_courses: norm.outstanding_courses, remarks: norm.remarks,
        })
        setSummaryPaste([
          norm.le, norm.nss, norm.rcu, norm.ecu, norm.cp, norm.gpa,
          norm.trcu, norm.tecu, norm.tcp, norm.pcgpa, norm.cgpa,
          norm.outstanding_courses, norm.remarks,
        ].join(', '))
      }

      setExistingLoaded(true)
      toast.success(
        existingRows.length
          ? `Loaded ${existingRows.length} course(s) for ${sid}`
          : `No courses yet for ${sid} — add new rows below`
      )
    } catch {
      toast.error('Could not load student results')
    } finally {
      setLoadingExisting(false)
    }
  }, [studentId, session, semester])

  const addCourseRow = () => {
    setCourses((prev) => [...prev, emptyCourseRow()])
  }

  const updateCourse = (id: string, field: keyof CourseRow, value: string) => {
    setCourses((prev) =>
      prev.map((r) => (r.id === id && !r.readOnly ? { ...r, [field]: value } : r))
    )
  }

  const removeCourse = async (row: CourseRow) => {
    if (row.existingResultId) {
      if (!confirm(`Remove ${row.course_code} from this student's results?`)) return
      try {
        await academicsAPI.deleteResult(row.existingResultId)
        toast.success(`${row.course_code} removed`)
        setCourses((prev) => prev.filter((r) => r.id !== row.id))
      } catch {
        toast.error('Could not delete this course result')
      }
      return
    }
    setCourses((prev) => (prev.length <= 1 ? [emptyCourseRow()] : prev.filter((r) => r.id !== row.id)))
  }

  const applyCourseText = () => {
    const lines = courseText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    const parsed = lines.map((line) => {
      const row = { id: newRowId(), ...parseCourseLine(line) }
      const cat = findCatalogueCourse(row.course_code)
      if (cat) {
        row.course_title = cat.title
        row.credit_unit = String(cat.credit_units)
      }
      return row
    })
    const existing = courses.filter((c) => c.readOnly)
    setCourses([...existing, ...parsed])
    setUseTextMode(false)
    toast.success(`${parsed.length} course line(s) added`)
  }

  const applySummaryPaste = () => {
    const parts = summaryPaste.split(',').map((p) => p.trim())
    if (parts.length < 13) {
      toast.error(`Paste all 13 summary values: ${SUMMARY_FORMAT}`)
      return
    }
    setSummary({
      le: parts[0], nss: parts[1], rcu: parts[2], ecu: parts[3], cp: parts[4],
      gpa: parts[5], trcu: parts[6], tecu: parts[7], tcp: parts[8],
      pcgpa: parts[9], cgpa: parts[10],
      outstanding_courses: parts[11], remarks: parts[12],
    })
    toast.success('Summary fields filled')
  }

  const getNewCourseLines = (): string[] => {
    if (useTextMode) {
      return courseText.split('\n').map((l) => l.trim()).filter(Boolean)
    }
    return courses
      .filter((r) => !r.readOnly && r.course_code.trim() && r.score.trim())
      .map((r) => {
        const cat = findCatalogueCourse(r.course_code)
        const cu = r.credit_unit.trim() || (cat ? String(cat.credit_units) : '')
        return courseRowToLine({ ...r, credit_unit: cu })
      })
  }

  const handleSubmit = async () => {
    const sid = studentId.trim().toUpperCase()
    if (!sid) {
      toast.error('Student matric number is required')
      return
    }
    if (!studentVerified) {
      toast.error('Enter a registered student matric number (invited students count — activation not required)')
      return
    }
    const newRows = courses.filter((r) => !r.readOnly && r.course_code.trim() && r.score.trim())
    for (const row of newRows) {
      if (!findCatalogueCourse(row.course_code)) {
        toast.error(`Course ${row.course_code} is not in your catalogue — add or borrow it in Courses first`)
        return
      }
    }
    const newLines = getNewCourseLines()
    const hasSummary = Object.values(summary).some((v) => v.trim())
    if (!newLines.length && !hasSummary) {
      toast.error('Add at least one new course row or fill the semester summary')
      return
    }

    setSubmitting(true)
    setLastErrors([])
    try {
      const resp = await academicsAPI.manualStudentEntry({
        student_id: sid,
        session: session.trim(),
        semester,
        course_lines: newLines.length ? newLines : undefined,
        summary: hasSummary ? summary : undefined,
      })
      const data = resp.data as {
        created_count?: number
        errors?: EntryError[]
        summary_saved?: boolean
        summary_error?: string
      }
      const created = data.created_count ?? 0
      const errs = data.errors ?? []

      if (created > 0) {
        toast.success(`${created} course result(s) saved for ${sid}`)
      }
      if (data.summary_saved) {
        toast.success('Semester summary saved')
      }
      if (data.summary_error) {
        toast.error(data.summary_error)
      }
      if (errs.length) {
        setLastErrors(errs)
        toast.error(`${errs.length} course line(s) failed — see report below`)
      } else if (created > 0 || data.summary_saved) {
        await loadExisting()
        setCourses((prev) => [...prev.filter((c) => c.readOnly), emptyCourseRow()])
        setCourseText('')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; errors?: EntryError[] } } }
      toast.error(e?.response?.data?.error ?? 'Save failed')
      if (e?.response?.data?.errors) setLastErrors(e.response.data.errors)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadErrorReport = () => {
    if (!lastErrors.length) return
    const rows = [
      ['Line', 'Course', 'Score', 'Error'],
      ...lastErrors.map((e) => [
        String(e.line_no ?? ''),
        e.course_code ?? '',
        e.score ?? '',
        e.error_message,
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `manual_entry_errors_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-2xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-950 space-y-2">
        <p className="font-semibold">Manual result entry — department catalogue</p>
        <p>
          Search and select a registered student (including invited students who have not activated yet).
          Results are saved immediately — they will see them when they activate their account.
          Each course must exist in your catalogue — nothing is auto-created.
        </p>
        {loadingCatalogue ? (
          <p className="text-xs text-brand-700 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading department courses…
          </p>
        ) : (
          <p className="text-xs text-brand-800">
            {catalogue.length} active course{catalogue.length !== 1 ? 's' : ''} in your department scope.
          </p>
        )}
      </div>

      {/* Student + session */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <User className="w-4 h-4" /> Student &amp; session
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-slate-500 uppercase">Matric / Student ID</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={studentQuery || studentId}
                onChange={(e) => {
                  setStudentQuery(e.target.value)
                  setStudentId(e.target.value.toUpperCase())
                  setStudentVerified(false)
                  setStudentPending(false)
                  setExistingLoaded(false)
                }}
                placeholder="U22/FNS/CSC/0001"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-400"
              />
            </div>
            {studentOptions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {studentOptions.map((s) => (
                  <li key={s.student_id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setStudentId(s.student_id)
                        setStudentQuery(s.student_id)
                        setStudentOptions([])
                        setStudentVerified(true)
                        setStudentPending(s.is_active === false)
                      }}
                    >
                      <span className="font-mono font-semibold">{s.student_id}</span>
                      {(s.first_name || s.last_name) && (
                        <span className="text-slate-500 ml-2">{s.first_name} {s.last_name}</span>
                      )}
                      {s.is_active === false && (
                        <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">Pending</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searchingStudents && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Searching…
              </span>
            )}
            {studentVerified && studentId && (
              <span className={cn(
                'text-xs font-medium',
                studentPending ? 'text-amber-700' : 'text-emerald-700'
              )}>
                {studentPending
                  ? 'Registered — pending activation. Results will be saved and visible when they activate.'
                  : 'Registered student verified'}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Session</label>
              <input
                value={session}
                onChange={(e) => setSession(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value as 'FIRST' | 'SECOND')}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="FIRST">First Semester</option>
                <option value="SECOND">Second Semester</option>
              </select>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={loadExisting}
          disabled={loadingExisting || !studentId.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loadingExisting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Load existing results for this student
        </button>
        {existingLoaded && (
          <p className="text-xs text-emerald-700">
            Loaded — remove a course with the trash icon, then add a new row and save.
          </p>
        )}
      </div>

      {/* Courses */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Course results
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setUseTextMode(false)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium',
                !useTextMode ? 'bg-brand-100 text-brand-800' : 'text-slate-500 hover:bg-slate-50'
              )}
            >
              Table
            </button>
            <button
              type="button"
              onClick={() => setUseTextMode(true)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium',
                useTextMode ? 'bg-brand-100 text-brand-800' : 'text-slate-500 hover:bg-slate-50'
              )}
            >
              Paste lines
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">
            Format: <span className="font-mono text-slate-700">{COURSE_FORMAT}</span>
          </p>

          {useTextMode ? (
            <textarea
              value={courseText}
              onChange={(e) => setCourseText(e.target.value)}
              rows={8}
              placeholder={'CSC301, 3, A, 75, Excellent\nCSC302, 3, B, 65, Very Good'}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-400"
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wide">
                    {['Course', 'Credit units', 'Grade', 'Score', 'Remark', ''].map((h) => (
                      <th key={h || 'x'} className="px-3 py-2.5 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map((row) => {
                    const query = courseQuery[row.id] ?? (row.course_code
                      ? `${row.course_code}${row.course_title ? ` — ${row.course_title}` : ''}`
                      : '')
                    const filteredCatalogue = catalogue.filter((c) => {
                      if (!query.trim()) return true
                      const q = query.toLowerCase()
                      return (
                        c.code.toLowerCase().includes(q) ||
                        c.title.toLowerCase().includes(q) ||
                        normalizeCourseCode(c.code).includes(normalizeCourseCode(query))
                      )
                    }).slice(0, 8)

                    return (
                    <tr key={row.id} className={row.readOnly ? 'bg-slate-50/70' : 'bg-white'}>
                      <td className="px-3 py-2.5 align-top min-w-[220px]">
                        {row.readOnly ? (
                          <div>
                            <div className="font-mono font-bold text-brand-800 text-xs">{row.course_code}</div>
                            <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{row.course_title || '—'}</div>
                          </div>
                        ) : (
                          <div className="relative space-y-1">
                            <input
                              value={query}
                              onChange={(e) => {
                                setCourseQuery((prev) => ({ ...prev, [row.id]: e.target.value }))
                                const match = findCatalogueCourse(e.target.value)
                                if (match) applyCatalogueToRow(row.id, match)
                                else updateCourse(row.id, 'course_code', normalizeCourseCode(e.target.value))
                              }}
                              placeholder="Search code or title…"
                              className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-400"
                            />
                            {query.trim() && filteredCatalogue.length > 0 && !findCatalogueCourse(row.course_code) && (
                              <ul className="absolute z-10 left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                                {filteredCatalogue.map((c) => (
                                  <li key={c.id}>
                                    <button
                                      type="button"
                                      className="w-full text-left px-2.5 py-2 hover:bg-brand-50 text-xs"
                                      onClick={() => applyCatalogueToRow(row.id, c)}
                                    >
                                      <span className="font-mono font-bold text-brand-800">{c.code}</span>
                                      <span className="text-slate-600 ml-2">{c.title}</span>
                                      <span className="text-slate-400 ml-2">{c.credit_units} CU</span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {row.course_title && (
                              <p className="text-[11px] text-slate-500 line-clamp-1">{row.course_title}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 tabular-nums">
                          {row.credit_unit || findCatalogueCourse(row.course_code)?.credit_units || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.readOnly ? (
                          <GradeChip grade={row.grade} size="sm" />
                        ) : (
                          <select
                            value={row.grade}
                            onChange={(e) => updateCourse(row.id, 'grade', e.target.value.toUpperCase())}
                            className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white min-w-[4rem]"
                          >
                            <option value="">—</option>
                            {['A', 'B', 'C', 'D', 'E', 'F'].map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.readOnly ? (
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{row.score}</span>
                        ) : (
                          <input
                            value={row.score}
                            onChange={(e) => updateCourse(row.id, 'score', e.target.value)}
                            className="w-20 h-8 px-2 rounded-lg border border-slate-200 text-xs font-semibold tabular-nums focus:outline-none focus:border-brand-400"
                            placeholder="0–100"
                            inputMode="decimal"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {row.readOnly ? (
                          <span className="text-xs text-slate-500">{row.remark || '—'}</span>
                        ) : (
                          <input
                            value={row.remark}
                            onChange={(e) => updateCourse(row.id, 'remark', e.target.value)}
                            className="w-full min-w-[90px] h-8 px-2 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-400"
                            placeholder="Optional"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex items-center gap-1">
                          {row.readOnly && row.existingResultId && (
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border font-medium',
                              getStatusColor('PENDING' as Result['status'])
                            )}>
                              saved
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCourse(row)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {!useTextMode && (
              <button
                type="button"
                onClick={addCourseRow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
              >
                <Plus className="w-4 h-4" /> Add course row
              </button>
            )}
            {useTextMode && (
              <button
                type="button"
                onClick={applyCourseText}
                className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
              >
                Parse lines into table
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Semester summary</h3>
        <p className="text-xs text-slate-500">
          {SUMMARY_FORMAT} — score range 0–100 for courses; summary values exactly as on the official sheet.
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            value={summaryPaste}
            onChange={(e) => setSummaryPaste(e.target.value)}
            placeholder="Paste comma-separated summary line…"
            className="flex-1 min-w-[200px] h-9 px-3 rounded-xl border border-slate-200 text-xs font-mono"
          />
          <button
            type="button"
            onClick={applySummaryPaste}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs hover:bg-slate-50"
          >
            Apply paste
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {SUMMARY_FIELD_LABELS.filter(({ key }) => key !== 'standing').map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-400 uppercase">{label}</label>
              <input
                value={summary[key] ?? ''}
                onChange={(e) => setSummary((s) => ({ ...s, [key]: e.target.value }))}
                className={cn(
                  'w-full h-9 px-2 rounded-lg border text-sm text-center focus:outline-none focus:border-brand-400',
                  key === 'gpa' || key === 'cgpa' ? 'border-brand-200 bg-brand-50/50' : 'border-slate-200'
                )}
              />
            </div>
          ))}
        </div>
        {summary.outstanding_courses && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">Outstanding: </span>
            {summary.outstanding_courses}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save new courses &amp; summary
        </button>
        <Link
          href="/hod/results"
          className="inline-flex items-center px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
        >
          View in All Results →
        </Link>
      </div>

      {lastErrors.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
            <AlertCircle className="w-4 h-4" />
            {lastErrors.length} course line(s) could not be saved
          </div>
          <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-auto">
            {lastErrors.map((e, i) => (
              <li key={i}>
                Line {e.line_no}: {e.course_code && `${e.course_code} — `}{e.error_message}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={downloadErrorReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          >
            <Download className="w-4 h-4" /> Download error report
          </button>
        </div>
      )}
    </div>
  )
}
