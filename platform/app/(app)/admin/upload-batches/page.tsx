'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Upload, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp,
  FileText, ChevronLeft, ChevronRight, Download, Loader2, AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { academicsAPI } from '@/lib/api'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import { SuperAdminOversightGuard } from '@/components/results-oversight/super-admin-redirect'

interface UploadBatch {
  id: number
  filename: string
  session: string
  semester: string
  status: string
  approval_status: string
  success_count: number
  error_count: number
  created_at: string
  completed_at: string | null
  uploaded_by_display: string | null
  department_name: string | null
  faculty_name: string | null
  approved_by_display: string | null
  approved_at: string | null
  rejection_reason: string | null
  is_pending_approval: boolean
}

interface BatchResultRow {
  id: number
  student_info?: { student_id?: string; first_name?: string; last_name?: string }
  course_info?: { code?: string; title?: string }
  score?: string | number | null
  grade?: string
  status?: string
  session?: string
  semester?: string
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Pending approval', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
    LOCKED_PUBLISHED: { label: 'Published', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  }
  const cfg = map[status] ?? { label: status, className: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border', cfg.className)}>
      {cfg.label}
    </span>
  )
}

function BatchStatusBadge({ status }: { status: string }) {
  const isDone = status === 'COMPLETED'
  const isProcessing = status === 'PROCESSING' || status === 'PENDING'
  const isFailed = status === 'FAILED'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
        isDone ? 'bg-emerald-50 text-emerald-700' :
        isFailed ? 'bg-red-50 text-red-700' :
        isProcessing ? 'bg-amber-50 text-amber-700' :
        'bg-slate-50 text-slate-600'
      )}
    >
      {isDone ? <CheckCircle className="w-3 h-3" /> : isFailed ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
      {status === 'COMPLETED' ? 'Processed' : status}
    </span>
  )
}

export default function UploadBatchesPage() {
  const [loading, setLoading] = useState(true)
  const [batches, setBatches] = useState<UploadBatch[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [session, setSession] = useState('')
  const [semester, setSemester] = useState('')
  const [approvalStatus, setApprovalStatus] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [batchResults, setBatchResults] = useState<BatchResultRow[]>([])
  const [reportLoading, setReportLoading] = useState<number | null>(null)
  const [acting, setActing] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectFor, setShowRejectFor] = useState<number | null>(null)

  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) }
      if (session) params.session = session
      if (semester) params.semester = semester
      if (approvalStatus) params.approval_status = approvalStatus
      const resp = await academicsAPI.getUploadBatches(params)
      const data = resp.data
      setBatches(data.results ?? (Array.isArray(data) ? data : []))
      setTotal(data.count ?? (Array.isArray(data) ? data.length : 0))
    } catch {
      toast.error('Failed to load upload history')
    } finally {
      setLoading(false)
    }
  }, [page, session, semester, approvalStatus])

  useEffect(() => { load() }, [load])

  const loadBatchDetail = async (batchId: number) => {
    setDetailLoading(true)
    setBatchResults([])
    try {
      const resp = await academicsAPI.getUploadBatchDetail(batchId)
      setBatchResults((resp.data.results ?? []) as BatchResultRow[])
    } catch {
      toast.error('Could not load batch details')
    } finally {
      setDetailLoading(false)
    }
  }

  const toggleExpand = (batch: UploadBatch) => {
    if (expandedId === batch.id) {
      setExpandedId(null)
      setBatchResults([])
      return
    }
    setExpandedId(batch.id)
    loadBatchDetail(batch.id)
  }

  const downloadErrorReport = async (batch: UploadBatch) => {
    setReportLoading(batch.id)
    try {
      const resp = await academicsAPI.downloadUploadBatchErrorReport(batch.id)
      const blob = resp.data instanceof Blob ? resp.data : new Blob([resp.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `batch_${batch.id}_errors.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Error report downloaded')
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: Blob | { error?: string } } }
      if (ax.response?.status === 404) {
        toast.error(
          batch.error_count > 0
            ? 'No error rows were recorded for this batch (older uploads). Re-upload or check failed rows in Add Results.'
            : 'This batch has no recorded errors.'
        )
      } else {
        toast.error('Could not download error report')
      }
    } finally {
      setReportLoading(null)
    }
  }

  const handleApprove = async (batch: UploadBatch) => {
    setActing(batch.id)
    try {
      await academicsAPI.approveBatch(batch.id)
      toast.success(`Batch approved — ${batch.success_count} result(s) updated`)
      load()
    } catch {
      toast.error('Failed to approve batch')
    } finally {
      setActing(null)
    }
  }

  const handleReject = async (batch: UploadBatch) => {
    if (!rejectReason.trim()) {
      toast.error('Please enter a rejection reason.')
      return
    }
    setActing(batch.id)
    try {
      await academicsAPI.rejectBatch(batch.id, rejectReason)
      toast.success(`Batch "${batch.filename}" rejected`)
      setShowRejectFor(null)
      setRejectReason('')
      load()
    } catch {
      toast.error('Failed to reject batch')
    } finally {
      setActing(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <SuperAdminOversightGuard>
      <div className="space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Upload History</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Past file uploads, success/error counts, and downloadable error reports
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/hod/upload"
              className="px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
            >
              Add Results
            </Link>
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
          <strong className="text-slate-800">Tip:</strong> Use{' '}
          <Link href="/hod/upload" className="text-brand-600 font-medium hover:underline">Add Results</Link>{' '}
          for new uploads (bulk file or manual rows). This page is your audit trail — expand a batch to see imported
          results or download why rows failed.
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
          <select
            value={session}
            onChange={(e) => { setSession(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">All Sessions</option>
            {Array.from(new Set(batches.map((b) => b.session).filter(Boolean))).sort().reverse().map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={semester}
            onChange={(e) => { setSemester(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">All Semesters</option>
            <option value="FIRST">First Semester</option>
            <option value="SECOND">Second Semester</option>
          </select>
          <select
            value={approvalStatus}
            onChange={(e) => { setApprovalStatus(e.target.value); setPage(1) }}
            className="h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">All approval statuses</option>
            <option value="PENDING">Pending approval</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={Upload}
            title="No uploads yet"
            description="When you upload results from a spreadsheet, each run appears here with success and error counts."
          />
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => {
              const expanded = expandedId === batch.id
              const showReject = showRejectFor === batch.id
              return (
                <div key={batch.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleExpand(batch)}
                  >
                    <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate max-w-[220px]">
                          {batch.filename || `Batch #${batch.id}`}
                        </span>
                        <BatchStatusBadge status={batch.status} />
                        <ApprovalBadge status={batch.approval_status} />
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {batch.session} · {batch.semester === 'FIRST' ? '1st Sem' : '2nd Sem'}
                        {batch.department_name && ` · ${batch.department_name}`}
                        {' · '}By {batch.uploaded_by_display ?? 'Unknown'}
                        {' · '}{formatDateTime(batch.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="text-center hidden sm:block">
                        <div className="font-bold text-emerald-600">{batch.success_count}</div>
                        <div className="text-xs text-slate-400">Imported</div>
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className={cn('font-bold', batch.error_count > 0 ? 'text-red-500' : 'text-slate-300')}>
                          {batch.error_count}
                        </div>
                        <div className="text-xs text-slate-400">Errors</div>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-100 px-5 py-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatBox label="Imported" value={batch.success_count} color="emerald" />
                        <StatBox label="Errors" value={batch.error_count} color={batch.error_count > 0 ? 'red' : undefined} />
                        <StatBox label="Session" value={batch.session} />
                        <StatBox label="Semester" value={batch.semester === 'FIRST' ? '1st' : '2nd'} />
                      </div>

                      {batch.error_count > 0 && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 text-sm text-amber-900">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            {batch.error_count} row(s) failed validation or import
                          </div>
                          <button
                            type="button"
                            disabled={reportLoading === batch.id}
                            onClick={() => downloadErrorReport(batch)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                          >
                            {reportLoading === batch.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            Download error report
                          </button>
                        </div>
                      )}

                      {batch.rejection_reason && (
                        <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                          <span className="font-semibold">Rejection reason: </span>
                          {batch.rejection_reason}
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Results in this batch
                        </h4>
                        {detailLoading ? (
                          <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                          </div>
                        ) : batchResults.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">No results linked to this batch yet.</p>
                        ) : (
                          <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 bg-slate-50">
                                <tr>
                                  {['Student', 'Course', 'Score', 'Status'].map((h) => (
                                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {batchResults.map((r) => (
                                  <tr key={r.id}>
                                    <td className="px-3 py-2">
                                      <div className="font-mono">{r.student_info?.student_id ?? '—'}</div>
                                      <div className="text-slate-400">
                                        {r.student_info?.first_name} {r.student_info?.last_name}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2">
                                      <div className="font-semibold">{r.course_info?.code}</div>
                                      <div className="text-slate-400 line-clamp-1">{r.course_info?.title}</div>
                                    </td>
                                    <td className="px-3 py-2 font-bold">{r.score ?? '—'} {r.grade && `(${r.grade})`}</td>
                                    <td className="px-3 py-2">
                                      {r.status && (
                                        <span className={cn('px-1.5 py-0.5 rounded-full border text-[10px]', getStatusColor(r.status as never))}>
                                          {getStatusLabel(r.status as never)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {batch.approval_status === 'PENDING' && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={acting === batch.id}
                            onClick={() => handleApprove(batch)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {acting === batch.id ? 'Approving…' : 'Approve batch'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRejectFor(showReject ? null : batch.id)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject batch
                          </button>
                          <Link
                            href="/hod/results?pending=1"
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
                          >
                            View pending results
                          </Link>
                        </div>
                      )}

                      {showReject && (
                        <div className="space-y-2">
                          <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Enter rejection reason…"
                            rows={2}
                            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-brand-400"
                          />
                          <button
                            type="button"
                            disabled={acting === batch.id}
                            onClick={() => handleReject(batch)}
                            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                          >
                            {acting === batch.id ? 'Rejecting…' : 'Confirm rejection'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SuperAdminOversightGuard>
  )
}

function StatBox({ label, value, color }: { label: string; value: string | number; color?: 'emerald' | 'red' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
      <div
        className={cn(
          'font-bold text-base',
          color === 'emerald' ? 'text-emerald-600' : color === 'red' ? 'text-red-500' : 'text-slate-800'
        )}
      >
        {value}
      </div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </div>
  )
}
