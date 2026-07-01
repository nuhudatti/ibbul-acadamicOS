'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronUp, ClipboardList, FileText, Loader2, Save, Download, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { cachedGet, invalidateCacheKey } from '@/lib/fetch-cache'
import { getLearningApiError } from '@/lib/learning-utils'
import { gradeColor, type GradebookResponse } from '@/lib/learning-grading'
import { LCard, LButton, LProgressRing, LSkeleton } from './learning-ui'
import { cn, formatDateTime } from '@/lib/utils'
import type { Submission } from '@/lib/types'

interface StudentRow {
  user_id: number
  student_id: string
  full_name: string
  email: string
  progress_percent: number
  lessons_completed: number
  total_lessons: number
}

interface AssignmentMeta {
  id: number
  title: string
  max_score: number
  moduleTitle: string
  enable_ai_grading?: boolean
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function LecturerGradingWorkspace({
  offeringId,
  students,
}: {
  offeringId: number
  students: StudentRow[]
}) {
  const [coreLoading, setCoreLoading] = useState(true)
  const [assignments, setAssignments] = useState<AssignmentMeta[]>([])
  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null)
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState<
    Record<number, Submission[]>
  >({})
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [summary, setSummary] = useState<{
    total_students: number
    submitted_assignments: number
    missing_assignments: number
    average_quiz_score: number | null
    average_assignment_score: number | null
    similarity_flagged: number
    ai_awaiting_approval: number
  } | null>(null)
  const [bulkAiLoading, setBulkAiLoading] = useState<number | null>(null)
  const [bulkAiProgress, setBulkAiProgress] = useState('')

  const mapApiAssignments = useCallback((
    raw: Array<{
      id: number
      title: string
      max_score: number
      module_title?: string
      enable_ai_grading?: boolean
    }>,
  ): AssignmentMeta[] =>
    raw.map((a) => ({
      id: a.id,
      title: a.title,
      max_score: a.max_score || 100,
      moduleTitle: a.module_title ?? '',
      enable_ai_grading: a.enable_ai_grading,
    })), [])

  const assignmentsFromOffering = useCallback((offering: {
    modules?: Array<{
      title: string
      lessons?: Array<{
        content_type: string
        assignment?: {
          id: number
          title: string
          max_score?: number
          enable_ai_grading?: boolean
        }
      }>
    }>
  }): AssignmentMeta[] => {
    const items: AssignmentMeta[] = []
    for (const mod of offering.modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
        if (lesson.content_type === 'assignment' && lesson.assignment) {
          items.push({
            id: lesson.assignment.id,
            title: lesson.assignment.title,
            max_score: lesson.assignment.max_score || 100,
            moduleTitle: mod.title,
            enable_ai_grading: lesson.assignment.enable_ai_grading,
          })
        }
      }
    }
    return items
  }, [])

  const applyWorkspacePayload = useCallback((
    data: Awaited<ReturnType<typeof learningAPI.getGradingWorkspace>>['data'],
  ) => {
    setGradebook(data.gradebook)
    setSummary(data.summary)
    if (data.assignments?.length) {
      setAssignments(mapApiAssignments(data.assignments))
    } else if (data.offering) {
      setAssignments(assignmentsFromOffering(data.offering))
    }
    const map: Record<number, Submission[]> = {}
    for (const [aid, subs] of Object.entries(data.submissions_by_assignment ?? {})) {
      map[Number(aid)] = subs as Submission[]
    }
    setSubmissionsByAssignment(map)
  }, [mapApiAssignments, assignmentsFromOffering])

  const loadLegacy = useCallback(async () => {
    const [gbResp, sumResp] = await Promise.all([
      learningAPI.getGradebook(offeringId),
      learningAPI.getGradingSummary(offeringId),
    ])
    setGradebook(gbResp.data)
    setSummary(sumResp.data)

    const offResp = await learningAPI.getOfferingDetail(offeringId)
    const items = assignmentsFromOffering(offResp.data)
    setAssignments(items)

    const subsMap: Record<number, Submission[]> = {}
    await Promise.all(
      items.map(async (a) => {
        try {
          const r = await learningAPI.getSubmissions(a.id)
          subsMap[a.id] = r.data
        } catch {
          subsMap[a.id] = []
        }
      }),
    )
    setSubmissionsByAssignment(subsMap)
  }, [offeringId, assignmentsFromOffering])

  const load = useCallback(async (opts?: { quiet?: boolean; invalidateCache?: boolean }) => {
    if (!opts?.quiet) setCoreLoading(true)
    try {
      if (opts?.invalidateCache) {
        invalidateCacheKey(`grading-workspace:${offeringId}`)
      }
      const resp = await cachedGet(
        `grading-workspace:${offeringId}`,
        () => learningAPI.getGradingWorkspace(offeringId).then((r) => r.data),
        15_000,
      )
      applyWorkspacePayload(resp)
    } catch (workspaceErr) {
      try {
        await loadLegacy()
      } catch {
        if (!opts?.quiet) {
          toast.error(getLearningApiError(workspaceErr, 'Failed to load grading data'))
        }
      }
    } finally {
      if (!opts?.quiet) setCoreLoading(false)
    }
  }, [offeringId, applyWorkspacePayload, loadLegacy])

  useEffect(() => { load() }, [load])

  const patchAfterGrade = useCallback((
    assignmentId: number,
    studentUserId: number,
    score: number,
    feedback: string,
  ) => {
    setSubmissionsByAssignment((prev) => {
      const list = prev[assignmentId] ?? []
      return {
        ...prev,
        [assignmentId]: list.map((s) =>
          s.student_user_id === studentUserId
            ? { ...s, score: String(score), feedback, graded_at: new Date().toISOString() }
            : s,
        ),
      }
    })
    if (summary && summary.ai_awaiting_approval > 0) {
      setSummary({ ...summary, ai_awaiting_approval: Math.max(0, summary.ai_awaiting_approval - 1) })
    }
  }, [summary])

  const exportSheet = async () => {
    setExporting(true)
    setExportStatus('Preparing export…')
    try {
      try {
        const start = await learningAPI.startExportGradeSheet(offeringId)
        const jobId = start.data.job_id
        for (let i = 0; i < 120; i++) {
          await sleep(1500)
          const poll = await learningAPI.pollExportGradeSheetJob(offeringId, jobId)
          if (poll.data.status === 'running' || poll.data.status === 'queued') {
            setExportStatus('Preparing export…')
            continue
          }
          if (poll.data.status === 'failed') {
            throw new Error(poll.data.error || 'Export failed')
          }
          if (poll.data.status === 'complete' && poll.data.download?.data_base64) {
            const raw = atob(poll.data.download.data_base64)
            const bytes = new Uint8Array(raw.length)
            for (let j = 0; j < raw.length; j++) bytes[j] = raw.charCodeAt(j)
            const blob = new Blob([bytes], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = poll.data.download.filename || `grade_sheet_offering_${offeringId}.xlsx`
            a.click()
            URL.revokeObjectURL(url)
            setExportStatus('')
            toast.success('Grade sheet downloaded')
            return
          }
        }
        throw new Error('Export timed out')
      } catch {
        const blobResp = await learningAPI.exportGradeSheet(offeringId)
        const blob = blobResp.data as Blob
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `grade_sheet_offering_${offeringId}.xlsx`
        a.click()
        URL.revokeObjectURL(url)
        setExportStatus('')
        toast.success('Grade sheet downloaded')
      }
    } catch (err) {
      setExportStatus('')
      toast.error(getLearningApiError(err, 'Could not export grade sheet'))
    } finally {
      setExporting(false)
    }
  }

  const runBulkAi = async (assignmentId: number) => {
    setBulkAiLoading(assignmentId)
    setBulkAiProgress('Starting…')
    try {
      const resp = await learningAPI.aiSuggestGradeBulk(assignmentId)
      if (resp.data.background && resp.data.job_id) {
        const jobId = resp.data.job_id
        const total = resp.data.total_pending ?? 0
        for (let i = 0; i < 600; i++) {
          await sleep(2000)
          const poll = await learningAPI.pollAiBulkJob(assignmentId, jobId)
          const done = poll.data.processed ?? 0
          const tot = poll.data.total || total
          setBulkAiProgress(`Grading ${done} / ${tot}…`)
          if (poll.data.status === 'complete') {
            toast.success(`AI processed ${poll.data.processed ?? done} submission(s) — review and approve grades`)
            load({ quiet: true, invalidateCache: true })
            break
          }
          if (poll.data.status === 'failed') {
            throw new Error(poll.data.error || 'Bulk AI failed')
          }
        }
      } else {
        toast.success(`AI processed ${resp.data.processed ?? 0} submission(s) — review and approve grades`)
        load({ quiet: true, invalidateCache: true })
      }
    } catch (err) {
      toast.error(getLearningApiError(err, 'Bulk AI grading failed'))
    } finally {
      setBulkAiLoading(null)
      setBulkAiProgress('')
    }
  }

  const pendingByStudent = useMemo(() => {
    const map = new Map<number, number>()
    for (const student of students) {
      let pending = 0
      for (const a of assignments) {
        const subs = submissionsByAssignment[a.id] ?? []
        const sub = subs.find((s) => s.student_user_id === student.user_id)
        if (sub && sub.score == null) pending += 1
      }
      map.set(student.user_id, pending)
    }
    return map
  }, [students, assignments, submissionsByAssignment])

  if (students.length === 0) return null

  const gradeByMatric = new Map(
    (gradebook?.students ?? []).map((g) => [g.student_id, g])
  )

  return (
    <div className="space-y-4">
      {coreLoading && !summary ? (
        <LCard className="!p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <LSkeleton key={i} className="h-16" />)}
          </div>
        </LCard>
      ) : summary ? (
        <LCard className="!p-5 bg-gradient-to-br from-brand-50/50 to-white border-brand-100">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 mb-3">Course summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryStat label="Total students" value={String(summary.total_students)} />
            <SummaryStat label="Submitted" value={String(summary.submitted_assignments)} />
            <SummaryStat label="Missing" value={String(summary.missing_assignments)} />
            <SummaryStat label="Avg quiz" value={summary.average_quiz_score != null ? `${summary.average_quiz_score}%` : '—'} />
            <SummaryStat label="Avg assignment" value={summary.average_assignment_score != null ? `${summary.average_assignment_score}%` : '—'} />
            <SummaryStat label="Similarity flags" value={String(summary.similarity_flagged)} warn={summary.similarity_flagged > 0} />
          </div>
          {summary.ai_awaiting_approval > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
              AI-graded essays awaiting your approval: <strong>{summary.ai_awaiting_approval}</strong>
            </p>
          )}
        </LCard>
      ) : null}

      {(assignments.length > 0 || coreLoading) && (
        <LCard className="!p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-brand-600" /> AI grading (bulk)
          </p>
          {bulkAiProgress && (
            <p className="text-xs text-brand-700 mb-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {bulkAiProgress}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {assignments.filter((a) => a.enable_ai_grading).map((a) => (
              <LButton
                key={a.id}
                size="sm"
                variant="secondary"
                disabled={bulkAiLoading === a.id}
                onClick={() => runBulkAi(a.id)}
              >
                {bulkAiLoading === a.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                AI suggest all — {a.title}
              </LButton>
            ))}
            {!coreLoading && assignments.every((a) => !a.enable_ai_grading) && (
              <p className="text-xs text-slate-500">Enable AI grading in the assignment builder to use bulk suggestions.</p>
            )}
          </div>
        </LCard>
      )}

      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <h2 className="font-semibold text-slate-900">Grade & review submissions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tap a student to expand — view assignments, submissions, and save grades inline.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <LButton variant="secondary" size="sm" onClick={exportSheet} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export grade sheet
          </LButton>
          {exportStatus && <span className="text-[10px] text-slate-500">{exportStatus}</span>}
          <span className="text-xs font-medium text-slate-400">
            {students.length} enrolled
          </span>
        </div>
      </div>

      {students.map((student) => {
        const open = expandedId === student.user_id
        const grades = gradeByMatric.get(student.student_id)
        const pending = pendingByStudent.get(student.user_id) ?? 0

        return (
          <LCard key={student.user_id} className="!p-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(open ? null : student.user_id)}
              className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-50/80 transition-colors"
            >
              <LProgressRing percent={student.progress_percent} size={44} stroke={3} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{student.full_name}</p>
                <p className="text-xs text-slate-400 font-mono">{student.student_id}</p>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                {grades?.letter_grade ? (
                  <span className={cn('text-sm font-bold', gradeColor(grades.letter_grade))}>
                    {grades.final_score}% · {grades.letter_grade}
                  </span>
                ) : coreLoading ? (
                  <LSkeleton className="h-4 w-20" />
                ) : (
                  <span className="text-xs text-slate-400">No grades yet</span>
                )}
                {pending > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {pending} to grade
                  </span>
                )}
              </div>
              {open ? (
                <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
              )}
            </button>

            {open && (
              <div className="border-t border-slate-100 bg-slate-50/40 px-4 pb-4 pt-3 space-y-4 animate-in slide-in-from-top-1 duration-200">
                {coreLoading && !grades ? (
                  <div className="space-y-2">
                    <LSkeleton className="h-20" />
                    <LSkeleton className="h-32" />
                  </div>
                ) : (
                  <>
                    {grades && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                          <p className="text-[10px] uppercase text-slate-400 font-semibold">Quiz</p>
                          <p className="text-lg font-bold text-slate-800 mt-0.5">{grades.quiz_average ?? '—'}%</p>
                        </div>
                        <div className="rounded-xl bg-white border border-slate-100 p-3 text-center">
                          <p className="text-[10px] uppercase text-slate-400 font-semibold">Assignments</p>
                          <p className="text-lg font-bold text-slate-800 mt-0.5">{grades.assignment_average ?? '—'}%</p>
                        </div>
                        <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-center">
                          <p className="text-[10px] uppercase text-brand-700 font-semibold">Final</p>
                          <p className={cn('text-lg font-bold mt-0.5', gradeColor(grades.letter_grade))}>
                            {grades.final_score ?? '—'}%
                            {grades.letter_grade && <span className="text-sm ml-1">({grades.letter_grade})</span>}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Assignments
                      </p>
                      {assignments.length === 0 ? (
                        <p className="text-sm text-slate-500 py-2">No assignments in this course yet.</p>
                      ) : (
                        assignments.map((assignment) => (
                          <AssignmentGradeRow
                            key={assignment.id}
                            assignment={assignment}
                            studentUserId={student.user_id}
                            submission={(submissionsByAssignment[assignment.id] ?? []).find(
                              (s) => s.student_user_id === student.user_id
                            )}
                            onGraded={(score, feedback) =>
                              patchAfterGrade(assignment.id, student.user_id, score, feedback)
                            }
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </LCard>
        )
      })}
    </div>
  )
}

function AssignmentGradeRow({
  assignment,
  studentUserId,
  submission,
  onGraded,
}: {
  assignment: AssignmentMeta
  studentUserId: number
  submission?: Submission
  onGraded: (score: number, feedback: string) => void
}) {
  const [score, setScore] = useState(submission?.score ?? '')
  const [feedback, setFeedback] = useState(submission?.feedback ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const s = submission?.score ?? submission?.ai_suggested_score
    setScore(s != null ? String(s) : '')
    setFeedback(submission?.feedback ?? submission?.ai_feedback ?? '')
  }, [submission])

  const save = async () => {
    if (!submission) return
    const num = parseFloat(String(score))
    if (Number.isNaN(num) || num < 0 || num > assignment.max_score) {
      toast.error(`Enter a score between 0 and ${assignment.max_score}`)
      return
    }
    setSaving(true)
    try {
      await learningAPI.gradeSubmission(assignment.id, {
        student_id: studentUserId,
        score: num,
        feedback,
      })
      toast.success('Grade saved')
      onGraded(num, feedback)
    } catch (err) {
      toast.error(getLearningApiError(err, 'Failed to save grade'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">{assignment.title}</p>
          <p className="text-[11px] text-slate-400">{assignment.moduleTitle} · Max {assignment.max_score}</p>
        </div>
        {submission ? (
          submission.score != null ? (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              Graded · {submission.score}/{assignment.max_score}
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">
              Needs grading
            </span>
          )
        ) : (
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-500">
            Not submitted
          </span>
        )}
      </div>

      {submission ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Submission
              {submission.submitted_at && (
                <span className="normal-case font-normal ml-auto text-slate-400">
                  {formatDateTime(submission.submitted_at)}
                  {submission.is_late && ' · Late'}
                </span>
              )}
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {submission.content || '(No written response — check attached file if any)'}
            </p>
            {submission.similarity_report?.flagged && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 mt-2">
                Similarity warning: {(Number(submission.similarity_score) * 100).toFixed(0)}% match with another submission
              </p>
            )}
            {submission.ai_graded && submission.ai_suggested_score != null && (
              <div className="text-xs text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-2 py-1.5 mt-2 space-y-1">
                <p>
                  AI suggested: <strong>{submission.ai_suggested_score}/{assignment.max_score}</strong>
                  {submission.ai_confidence_score != null && (
                    <span className="ml-2 text-brand-600">Confidence: {(Number(submission.ai_confidence_score) * 100).toFixed(0)}%</span>
                  )}
                </p>
                {submission.ai_feedback && <p>{submission.ai_feedback.slice(0, 200)}</p>}
                {(submission.ai_strengths?.length ?? 0) > 0 && (
                  <p><span className="font-semibold">Strengths:</span> {submission.ai_strengths!.join('; ')}</p>
                )}
                {(submission.ai_weaknesses?.length ?? 0) > 0 && (
                  <p><span className="font-semibold">Improve:</span> {submission.ai_weaknesses!.join('; ')}</p>
                )}
              </div>
            )}
            {submission.file_key && (
              <p className="text-xs text-brand-700 mt-2 font-mono truncate">{submission.file_key}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 shrink-0">Score</label>
              <input
                type="number"
                min={0}
                max={assignment.max_score}
                step="0.5"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-24 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
              />
              <span className="text-xs text-slate-400">/ {assignment.max_score}</span>
            </div>
            <input
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback (optional)"
              className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
            />
            <LButton size="sm" onClick={save} disabled={saving} className="shrink-0">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Approve / save grade
            </LButton>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Waiting for this student to submit.
        </p>
      )}
    </div>
  )
}

function SummaryStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
      <p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${warn ? 'text-amber-800' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
