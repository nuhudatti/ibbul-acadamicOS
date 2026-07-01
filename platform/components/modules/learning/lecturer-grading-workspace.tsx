'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown, ChevronUp, ClipboardList, FileText, Loader2, Save, Download, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { getLearningApiError } from '@/lib/learning-utils'
import { gradeColor, type GradebookResponse } from '@/lib/learning-grading'
import { LCard, LButton, LProgressRing, LSkeleton } from './learning-ui'
import { cn, formatDateTime } from '@/lib/utils'
import type { LMSOfferingDetail, Submission } from '@/lib/types'

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

function collectAssignments(offering: LMSOfferingDetail): AssignmentMeta[] {
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
}

export function LecturerGradingWorkspace({
  offeringId,
  students,
}: {
  offeringId: number
  students: StudentRow[]
}) {
  const [loading, setLoading] = useState(true)
  const [offering, setOffering] = useState<LMSOfferingDetail | null>(null)
  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null)
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState<
    Record<number, Submission[]>
  >({})
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
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

  const exportSheet = async () => {
    setExporting(true)
    try {
      const resp = await learningAPI.exportGradeSheet(offeringId)
      const blob = new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `grade_sheet_offering_${offeringId}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Grade sheet downloaded')
    } catch {
      toast.error('Could not export grade sheet')
    } finally {
      setExporting(false)
    }
  }

  const assignments = useMemo(
    () => (offering ? collectAssignments(offering) : []),
    [offering]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [offResp, gbResp, sumResp] = await Promise.all([
        learningAPI.getOfferingDetail(offeringId),
        learningAPI.getGradebook(offeringId),
        learningAPI.getGradingSummary(offeringId),
      ])
      const detail = offResp.data as LMSOfferingDetail
      setOffering(detail)
      setGradebook(gbResp.data)
      setSummary(sumResp.data)

      const assignmentList = collectAssignments(detail)
      const subResults = await Promise.allSettled(
        assignmentList.map((a) => learningAPI.getSubmissions(a.id))
      )
      const map: Record<number, Submission[]> = {}
      assignmentList.forEach((a, i) => {
        const r = subResults[i]
        map[a.id] = r.status === 'fulfilled' ? r.value.data.submissions ?? [] : []
      })
      setSubmissionsByAssignment(map)
    } catch {
      toast.error('Failed to load grading data')
    } finally {
      setLoading(false)
    }
  }, [offeringId])

  useEffect(() => { load() }, [load])

  const runBulkAi = async (assignmentId: number) => {
    setBulkAiLoading(assignmentId)
    try {
      const resp = await learningAPI.aiSuggestGradeBulk(assignmentId)
      toast.success(`AI processed ${resp.data.processed} submission(s) — review and approve grades`)
      load()
    } catch (err) {
      toast.error(getLearningApiError(err, 'Bulk AI grading failed'))
    } finally {
      setBulkAiLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <LSkeleton key={i} className="h-16" />)}
      </div>
    )
  }

  if (students.length === 0) return null

  const gradeByMatric = new Map(
    (gradebook?.students ?? []).map((g) => [g.student_id, g])
  )

  return (
    <div className="space-y-4">
      {summary && (
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
      )}

      {assignments.length > 0 && (
        <LCard className="!p-4">
          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1">
            <Sparkles className="w-4 h-4 text-brand-600" /> AI grading (bulk)
          </p>
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
            {assignments.every((a) => !a.enable_ai_grading) && (
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
        <div className="flex items-center gap-2 shrink-0">
          <LButton variant="secondary" size="sm" onClick={exportSheet} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export grade sheet
          </LButton>
          <span className="text-xs font-medium text-slate-400">
            {students.length} enrolled
          </span>
        </div>
      </div>

      {students.map((student) => {
        const open = expandedId === student.user_id
        const grades = gradeByMatric.get(student.student_id)
        const pending = assignments.filter((a) => {
          const subs = submissionsByAssignment[a.id] ?? []
          const sub = subs.find((s) => s.student_user_id === student.user_id)
          return sub && sub.score == null
        }).length

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
                        onGraded={load}
                      />
                    ))
                  )}
                </div>
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
  onGraded: () => void
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
      onGraded()
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
