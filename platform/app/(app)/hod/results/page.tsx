'use client'
/**
 * Results Management — HOD / Admin view.
 *
 * Matches the Django admin experience:
 *  - Grouped by Student × Session × Semester
 *  - Expandable rows → individual course results
 *  - Checkbox multi-select + bulk approve / reject
 *  - Per-result approve / reject inline
 *  - Filters: Session, Semester, Status, Search (student ID or name)
 *  - Live data from /api/academics/hod/results/
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  FileText, Search, RefreshCw, CheckCircle, XCircle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  AlertCircle, Eye, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { academicsAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, getGradeColor, formatDateTime } from '@/lib/utils'
import { SemesterSummaryPanel } from '@/components/academics/semester-summary-panel'
import { normalizeSemesterSummary } from '@/lib/summary'
import type { Result, SemesterSummary } from '@/lib/types'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { SuperAdminOversightGuard } from '@/components/results-oversight/super-admin-redirect'
import { TableScroll } from '@/components/ui/table-scroll'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentGroup {
  key: string         // studentDbId|session|semester
  studentDbId: number
  studentId: string   // e.g. U10/FAN/CSC/018
  studentName: string
  session: string
  semester: string
  results: Result[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupResults(list: Result[]): StudentGroup[] {
  const map = new Map<string, StudentGroup>()
  for (const r of list) {
    const sid  = r.student
    const name = r.student_name ?? (r.student_info
      ? `${r.student_info.first_name ?? ''} ${r.student_info.last_name ?? ''}`.trim()
      : '—')
    const studentIdDisplay = r.student_id_display
      ?? (r.student_info as Record<string, unknown> | undefined)?.student_id as string | undefined
      ?? String(sid)
    const key = `${sid}|${r.session}|${r.semester}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        studentDbId: sid as number,
        studentId: studentIdDisplay,
        studentName: name,
        session: r.session,
        semester: r.semester,
        results: [],
      })
    }
    map.get(key)!.results.push(r)
  }
  return Array.from(map.values()).sort((a, b) => {
    const s = b.session.localeCompare(a.session)
    if (s !== 0) return s
    if (a.semester !== b.semester) return a.semester === 'FIRST' ? -1 : 1
    return a.studentId.localeCompare(b.studentId)
  })
}

function groupSummaryStatus(results: Result[]): string {
  const statuses = results.map((r) => r.status)
  if (statuses.every((s) => s === 'LOCKED_PUBLISHED')) return 'LOCKED_PUBLISHED'
  if (statuses.every((s) => s === 'APPROVED'))         return 'APPROVED'
  if (statuses.some((s)  => s === 'HOD_REVIEW'))       return 'HOD_REVIEW'
  if (statuses.some((s)  => s === 'REJECTED'))         return 'REJECTED'
  if (statuses.some((s)  => s === 'SUBMITTED'))        return 'SUBMITTED'
  return 'DRAFT'
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'Draft',
  PENDING:          'Pending',
  SUBMITTED:        'Submitted',
  HOD_REVIEW:       'Pending Review',
  APPROVED:         'Approved',
  REJECTED:         'Rejected',
  LOCKED_PUBLISHED: 'Published',
}

const STATUS_CLASS: Record<string, string> = {
  DRAFT:            'bg-slate-100 text-slate-600 border-slate-200',
  PENDING:          'bg-amber-50 text-amber-700 border-amber-200',
  SUBMITTED:        'bg-brand-50 text-brand-800 border-brand-200',
  HOD_REVIEW:       'bg-amber-50 text-amber-700 border-amber-200',
  APPROVED:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED:         'bg-red-50 text-red-700 border-red-200',
  LOCKED_PUBLISHED: 'bg-brand-50 text-brand-800 border-brand-200',
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

// ─── Page ────────────────────────────────────────────────────────────────────

const API_FETCH_SIZE = 500 // load all course rows for grouping (department-scoped)
const GROUPS_PER_PAGE = 15 // paginate the student list, not individual courses

export default function ResultsManagementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const canManage = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD' || user?.role === 'SUPER_ADMIN'
  const [loading, setLoading]       = useState(true)
  const [allResults, setAllResults] = useState<Result[]>([])
  const [totalRaw, setTotalRaw]     = useState(0)
  const [groupPage, setGroupPage]   = useState(1)

  // Filters
  const [search,   setSearch]   = useState('')
  const [session,  setSession]  = useState('')
  const [semester, setSemester] = useState('')
  const [status,   setStatus]   = useState('')
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1')

  useEffect(() => {
    setPendingOnly(searchParams.get('pending') === '1')
    const urlStatus = searchParams.get('status')
    if (urlStatus) setStatus(urlStatus)
  }, [searchParams])

  // UI state
  const [expanded,       setExpanded]       = useState<Set<string>>(new Set())
  const [selectedIds,    setSelectedIds]    = useState<Set<number>>(new Set()) // result IDs
  const [bulkAction,     setBulkAction]     = useState('')
  const [rejectReason,   setRejectReason]   = useState('')
  const [showRejectFor,  setShowRejectFor]  = useState<number | null>(null)  // result id
  const [showGroupRejectFor, setShowGroupRejectFor] = useState<string | null>(null) // group key
  const [groupRejectReason, setGroupRejectReason]   = useState('')
  const [showDeleteFor, setShowDeleteFor] = useState<number | null>(null)
  const [acting, setActing]     = useState(false)
  const [groupSummaries, setGroupSummaries] = useState<Record<string, SemesterSummary | null>>({})
  const [summaryLoading, setSummaryLoading] = useState<Set<string>>(new Set())

  // Sessions we've seen (for filter dropdown)
  const [sessions, setSessions] = useState<string[]>([])
  const [totalUnfiltered, setTotalUnfiltered] = useState(0)

  const hasActiveFilters = Boolean(session || semester || status || search || pendingOnly)

  // ─── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    academicsAPI.hodGetStats()
      .then((resp) => {
        const list = (resp.data.available_sessions ?? []) as string[]
        if (list.length) setSessions(list)
        if (typeof resp.data.total_results === 'number') {
          setTotalUnfiltered(resp.data.total_results)
        }
      })
      .catch(() => { /* optional */ })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const baseParams: Record<string, string> = {
        page_size: String(API_FETCH_SIZE),
      }
      if (status)   baseParams.status   = status
      if (pendingOnly) baseParams.pending = '1'
      if (session)  baseParams.session  = session
      if (semester) baseParams.semester = semester
      if (search)   baseParams.search   = search

      const merged: Result[] = []
      let totalCount = 0
      let availableSessions: string[] | undefined
      let totalUnfilteredCount: number | undefined
      let apiPage = 1

      while (apiPage <= 20) {
        const resp = await academicsAPI.hodGetResults({ ...baseParams, page: String(apiPage) })
        const data = resp.data
        const list: Result[] = data.results ?? (Array.isArray(data) ? data : [])
        merged.push(...list)
        totalCount = data.count ?? merged.length
        if (Array.isArray(data.available_sessions) && data.available_sessions.length) {
          availableSessions = data.available_sessions as string[]
        }
        if (typeof data.total_unfiltered === 'number') {
          totalUnfilteredCount = data.total_unfiltered
        }
        if (merged.length >= totalCount || list.length === 0) break
        apiPage += 1
      }

      setAllResults(merged)
      setTotalRaw(totalCount)
      if (availableSessions?.length) setSessions(availableSessions)
      if (typeof totalUnfilteredCount === 'number') {
        setTotalUnfiltered(totalUnfilteredCount)
      } else if (sessions.length === 0 && merged.length > 0) {
        const unique = Array.from(new Set(merged.map((r) => r.session).filter(Boolean))).sort().reverse()
        setSessions(unique)
      }
      setGroupPage(1)
    } catch {
      toast.error('Failed to load results')
    } finally {
      setLoading(false)
    }
  }, [search, status, session, semester, pendingOnly, sessions.length])

  useEffect(() => { load() }, [load])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const groups = useMemo(() => groupResults(allResults), [allResults])
  const totalGroupPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE))
  const visibleGroups = useMemo(
    () => groups.slice((groupPage - 1) * GROUPS_PER_PAGE, groupPage * GROUPS_PER_PAGE),
    [groups, groupPage],
  )
  const groupRangeStart = groups.length === 0 ? 0 : (groupPage - 1) * GROUPS_PER_PAGE + 1
  const groupRangeEnd = Math.min(groupPage * GROUPS_PER_PAGE, groups.length)

  useEffect(() => {
    if (groupPage > totalGroupPages) setGroupPage(totalGroupPages)
  }, [groupPage, totalGroupPages])

  const loadGroupSummary = useCallback(async (group: StudentGroup) => {
    if (groupSummaries[group.key] !== undefined) return
    setSummaryLoading((prev) => new Set(prev).add(group.key))
    try {
      const resp = await academicsAPI.getResultSummary({
        student_id: group.studentId,
        session: group.session,
        semester: group.semester,
      })
      const normalized = normalizeSemesterSummary(resp.data?.summary ?? null)
      setGroupSummaries((prev) => ({ ...prev, [group.key]: normalized }))
    } catch {
      setGroupSummaries((prev) => ({ ...prev, [group.key]: null }))
    } finally {
      setSummaryLoading((prev) => {
        const next = new Set(prev)
        next.delete(group.key)
        return next
      })
    }
  }, [groupSummaries])

  const toggleExpand = (group: StudentGroup) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      const willExpand = !next.has(group.key)
      if (willExpand) {
        next.add(group.key)
        void loadGroupSummary(group)
      } else {
        next.delete(group.key)
      }
      return next
    })
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  const unapproveResult = async (id: number) => {
    setActing(true)
    try {
      await academicsAPI.hodUnapproveResult(id)
      toast.success('Result moved back to pending review')
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Could not unapprove')
    } finally { setActing(false) }
  }

  const approveResult = async (id: number) => {
    setActing(true)
    try {
      await academicsAPI.hodApproveResult(id)
      toast.success('Result approved — now visible to the student')
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to approve result')
    }
    finally { setActing(false) }
  }

  const rejectResult = async (id: number, reason: string) => {
    if (!reason.trim()) { toast.error('Rejection reason required'); return }
    setActing(true)
    try {
      await academicsAPI.hodRejectResult(id, reason)
      toast.success('Result rejected')
      setShowRejectFor(null)
      setRejectReason('')
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to reject result')
    }
    finally { setActing(false) }
  }

  const deleteResult = async (id: number) => {
    setActing(true)
    try {
      await academicsAPI.deleteResult(id)
      toast.success('Result deleted')
      setShowDeleteFor(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      load()
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string; error?: string } } }
      const msg = e?.response?.data?.detail ?? e?.response?.data?.error ?? 'Failed to delete result'
      toast.error(msg)
    }
    finally { setActing(false) }
  }

  const approveGroup = async (group: StudentGroup) => {
    const ids = group.results
      .filter((r) => ['SUBMITTED', 'HOD_REVIEW', 'DRAFT', 'PENDING'].includes(r.status))
      .map((r) => r.id)
    if (!ids.length) { toast.info('No actionable results in this group'); return }
    setActing(true)
    try {
      const resp = await academicsAPI.hodBulkApprove(ids)
      const count = resp.data?.approved_count ?? ids.length
      toast.success(`Approved ${count} result(s) for ${group.studentId} — students can now view them`)
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Failed to approve group')
    }
    finally { setActing(false) }
  }

  const rejectGroup = async (group: StudentGroup, reason: string) => {
    if (!reason.trim()) { toast.error('Rejection reason required'); return }
    const ids = group.results
      .filter((r) => r.status !== 'LOCKED_PUBLISHED')
      .map((r) => r.id)
    if (!ids.length) { toast.info('No actionable results'); return }
    setActing(true)
    try {
      await academicsAPI.hodBulkReject(ids, reason)
      toast.success(`Rejected ${ids.length} result(s)`)
      setShowGroupRejectFor(null)
      setGroupRejectReason('')
      load()
    } catch { toast.error('Failed to reject group') }
    finally { setActing(false) }
  }

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) {
      toast.error('Select results and an action first')
      return
    }
    const ids = [...selectedIds]
    if (bulkAction === 'approve') {
      setActing(true)
      try {
        const resp = await academicsAPI.hodBulkApprove(ids)
        const count = resp.data?.approved_count ?? ids.length
        toast.success(`Approved ${count} result(s) — published to students`)
        setSelectedIds(new Set())
        setBulkAction('')
        load()
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(msg ?? 'Bulk approve failed')
      }
      finally { setActing(false) }
    } else if (bulkAction === 'reject') {
      if (!rejectReason.trim()) {
        toast.error('Enter a rejection reason for bulk reject')
        return
      }
      setActing(true)
      try {
        await academicsAPI.hodBulkReject(ids, rejectReason)
        toast.success(`Rejected ${ids.length} result(s)`)
        setSelectedIds(new Set())
        setBulkAction('')
        setRejectReason('')
        load()
      } catch { toast.error('Bulk reject failed') }
      finally { setActing(false) }
    } else if (bulkAction === 'delete') {
      if (!confirm(`Delete ${ids.length} selected result(s)? They will be removed from all views.`)) return
      setActing(true)
      try {
        const resp = await academicsAPI.hodBulkDelete(ids)
        const count = resp.data?.deleted_count ?? 0
        const skipped = resp.data?.skipped_count ?? 0
        if (count > 0) toast.success(`Deleted ${count} result(s)`)
        if (skipped > 0) toast.warning(`${skipped} could not be deleted (already removed)`)
        if (count === 0 && skipped === 0) toast.error('No results were deleted')
        setSelectedIds(new Set())
        setBulkAction('')
        load()
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(msg ?? 'Bulk delete failed')
      }
      finally { setActing(false) }
    } else if (bulkAction === 'unapprove') {
      setActing(true)
      try {
        const resp = await academicsAPI.hodBulkUnapprove(ids)
        const count = resp.data?.unapproved_count ?? 0
        toast.success(`${count} result(s) moved back to pending review`)
        setSelectedIds(new Set())
        setBulkAction('')
        load()
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast.error(msg ?? 'Bulk unapprove failed')
      }
      finally { setActing(false) }
    }
  }

  const toggleGroupSelect = (group: StudentGroup) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const ids = group.results.map((r) => r.id)
      const allSelected = ids.every((id) => prev.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleResultSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const allIds = allResults.map((r) => r.id)
    if (allIds.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <SuperAdminOversightGuard>
    <PageShell className="space-y-5">
      <PageHeader
        eyebrow="Results"
        title="All Results"
        description={`${groups.length} student${groups.length !== 1 ? 's' : ''} · ${totalRaw} course record${totalRaw !== 1 ? 's' : ''}${hasActiveFilters && totalUnfiltered > totalRaw ? ` (${totalUnfiltered} total in department)` : ''}${!canManage ? ' · View only (approval is HOD responsibility)' : ''}`}
        action={
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-brand-50/50 hover:border-brand-200"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 text-xs">
        {[
          { label: 'View student summary', status: '' },
          ...(canManage ? [
            { label: 'Approve upload batches', href: '/admin/upload-batches' },
            { label: 'Upload results', href: '/hod/upload' },
          ] : []),
        ].map((l) => (
          l.href
            ? <a key={l.label} href={l.href}
                className="px-3 py-1.5 rounded-xl border border-brand-200 text-brand-600 hover:bg-brand-50 font-medium">
                {l.label}
              </a>
            : <span key={l.label}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 font-medium">
                {l.label}
              </span>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Session */}
          <div className="space-y-1 min-w-[150px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Session</label>
            <select
              value={session}
              onChange={(e) => { setSession(e.target.value); setGroupPage(1) }}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
            >
              <option value="">All sessions</option>
              {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Semester */}
          <div className="space-y-1 min-w-[140px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Semester</label>
            <select
              value={semester}
              onChange={(e) => { setSemester(e.target.value); setGroupPage(1) }}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
            >
              <option value="">All</option>
              <option value="FIRST">First</option>
              <option value="SECOND">Second</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1 min-w-[160px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setGroupPage(1) }}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="DRAFT">Draft</option>
              <option value="HOD_REVIEW">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="LOCKED_PUBLISHED">Published</option>
            </select>
          </div>

          {/* Search */}
          <div className="space-y-1 flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Student ID or name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setGroupPage(1) }}
                className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingOnly && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Showing pending only
            </span>
          )}
          {hasActiveFilters && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Filters active — results may be hidden
            </span>
          )}
          <button
            onClick={() => {
              setSession('')
              setSemester('')
              setStatus('')
              setSearch('')
              setPendingOnly(false)
              setGroupPage(1)
              router.replace('/hod/results')
            }}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-500 hover:bg-slate-50"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {canManage && allResults.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && allResults.every((r) => selectedIds.has(r.id))}
              onChange={selectAll}
              className="w-3.5 h-3.5 accent-brand-600"
            />
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : '0 selected'}
          </label>

          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="h-8 px-2 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:border-brand-400"
          >
            <option value="">Choose action…</option>
            <option value="approve">Approve selected</option>
            <option value="reject">Reject selected</option>
            <option value="unapprove">Unapprove (back to pending)</option>
            <option value="delete">Delete selected</option>
          </select>

          {bulkAction === 'reject' && (
            <input
              type="text"
              placeholder="Rejection reason…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="h-8 px-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:border-brand-400 flex-1 min-w-[160px]"
            />
          )}

          <button
            onClick={handleBulkAction}
            disabled={acting || selectedIds.size === 0 || !bulkAction}
            className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-40"
          >
            {acting ? 'Working…' : 'Go'}
          </button>

          <span className="text-xs text-slate-400 flex-1">
            Select course(s) below, pick action, then Go.
          </span>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No results match your filters"
          description={
            hasActiveFilters && totalUnfiltered > 0
              ? `Your department has ${totalUnfiltered} saved result(s). Clear filters — uploaded sheets often use session ${sessions[0] ?? 'from the file header'}, not the default 2023/2024. Search by the matric number on the spreadsheet (e.g. U10/FAN/CSC/018), not only newly invited students.`
              : 'Upload results via Add Results, or enter them manually. Students must be invited first.'
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <TableScroll minWidth="720px">
          {/* Column headers */}
          <div className="grid grid-cols-[auto_1fr_160px_80px_120px_120px_auto] items-center
                          bg-slate-50 border-b border-slate-100 px-4 py-2.5 gap-3">
            <div className="w-4" />
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Session / Semester</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center">Courses</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Summary</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</div>
          </div>

          <div className="divide-y divide-slate-100">
            {visibleGroups.map((group) => {
              const isExpanded    = expanded.has(group.key)
              const summaryStatus = groupSummaryStatus(group.results)
              const allGroupSelected = group.results.every((r) => selectedIds.has(r.id))
              const someGroupSelected = group.results.some((r) => selectedIds.has(r.id))
              const canApproveGroup   = group.results.some(
                (r) => ['SUBMITTED', 'HOD_REVIEW', 'DRAFT', 'PENDING'].includes(r.status)
              )

              return (
                <div key={group.key}>
                  {/* Group row */}
                  <div className={cn(
                    'grid grid-cols-[auto_1fr_160px_80px_120px_120px_auto] items-center px-4 py-3 gap-3',
                    'hover:bg-slate-50 transition-colors',
                    isExpanded && 'bg-brand-50/30'
                  )}>
                    {/* Checkbox */}
                    {canManage ? (
                      <input
                        type="checkbox"
                        checked={allGroupSelected}
                        ref={(el) => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected }}
                        onChange={() => toggleGroupSelect(group)}
                        className="w-3.5 h-3.5 accent-brand-600 cursor-pointer"
                      />
                    ) : <div className="w-3.5" />}

                    {/* Student info */}
                    <div>
                      <div className="font-mono text-xs font-bold text-slate-800">{group.studentId}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{group.studentName}</div>
                    </div>

                    {/* Session / Semester */}
                    <div className="text-xs text-slate-600">
                      <div className="font-semibold">{group.session}</div>
                      <div className="text-slate-400">{group.semester === 'FIRST' ? 'First' : 'Second'}</div>
                    </div>

                    {/* Course count */}
                    <div className="text-center">
                      <span className="text-sm font-bold text-slate-700">{group.results.length}</span>
                    </div>

                    {/* Summary status */}
                    <div><StatusBadge status={summaryStatus} /></div>

                    {/* Actions dropdown */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {canManage && canApproveGroup && (
                        <button
                          disabled={acting}
                          onClick={() => approveGroup(group)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle className="w-3 h-3" /> Approve
                        </button>
                      )}
                      {canManage && (
                        <button
                          onClick={() => setShowGroupRejectFor(showGroupRejectFor === group.key ? null : group.key)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50"
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      )}
                    </div>

                    {/* Expand toggle */}
                    <button
                      onClick={() => toggleExpand(group)}
                      className="flex items-center gap-1 text-xs text-brand-600 font-medium hover:underline whitespace-nowrap"
                    >
                      {isExpanded ? (
                        <><ChevronUp className="w-3.5 h-3.5" /> Hide</>
                      ) : (
                        <><ChevronDown className="w-3.5 h-3.5" /> View {group.results.length} courses</>
                      )}
                    </button>
                  </div>

                  {/* Group reject inline */}
                  {canManage && showGroupRejectFor === group.key && (
                    <div className="border-t border-slate-100 bg-red-50/60 px-6 py-3 flex flex-wrap gap-2 items-center">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <input
                        type="text"
                        placeholder="Rejection reason for all courses in this group…"
                        value={groupRejectReason}
                        onChange={(e) => setGroupRejectReason(e.target.value)}
                        className="flex-1 min-w-[200px] h-8 px-3 rounded-lg border border-red-200 text-xs focus:outline-none focus:border-red-400 bg-white"
                      />
                      <button
                        disabled={acting}
                        onClick={() => rejectGroup(group, groupRejectReason)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {acting ? 'Rejecting…' : 'Confirm Reject'}
                      </button>
                      <button
                        onClick={() => { setShowGroupRejectFor(null); setGroupRejectReason('') }}
                        className="text-xs text-slate-500 hover:text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Expanded: per-course rows */}
                  {isExpanded && (
                    <div className="border-t border-brand-100 bg-brand-50/20">
                      <div className="px-6 py-4 border-b border-slate-100">
                        {summaryLoading.has(group.key) ? (
                          <div className="skeleton h-24 w-full rounded-xl" />
                        ) : (
                          <SemesterSummaryPanel
                            summary={groupSummaries[group.key] ?? undefined}
                            session={group.session}
                            semester={group.semester}
                            title={`${group.studentId} — Semester Summary`}
                            compact
                          />
                        )}
                      </div>
                      {/* Sub-header */}
                      <div className="px-8 py-2 bg-slate-50/80">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Course results · {group.session} · {group.semester === 'FIRST' ? 'First' : 'Second'} Semester
                        </span>
                      </div>

                      <table className="w-full text-xs min-w-[700px]">
                        <thead>
                          <tr className="bg-slate-50/60 border-b border-slate-100">
                            <th className="w-8 px-4 py-2" />
                            {['Course', 'Score', 'Grade', 'Session', 'Semester', 'Batch', 'Status', 'Actions'].map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.results.map((r) => {
                            const courseInfo = r.course_info as { code?: string; title?: string } | undefined
                            const courseCode  = r.course_code ?? courseInfo?.code ?? `Course ${r.course}`
                            const courseTitle = r.course_title ?? courseInfo?.title ?? ''
                            const canAct = ['SUBMITTED', 'HOD_REVIEW', 'DRAFT', 'PENDING'].includes(r.status)
                            const canUnapprove = ['APPROVED', 'LOCKED_PUBLISHED', 'REJECTED'].includes(r.status)
                            const canDelete = true

                            return (
                              <tr key={r.id} className="hover:bg-white transition-colors">
                                <td className="px-4 py-2.5">
                                  {canManage ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedIds.has(r.id)}
                                      onChange={() => toggleResultSelect(r.id)}
                                      className="w-3.5 h-3.5 accent-brand-600 cursor-pointer"
                                    />
                                  ) : null}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="font-mono font-bold text-brand-700">{courseCode}</span>
                                  {courseTitle && <span className="text-slate-400 ml-1">— {courseTitle}</span>}
                                </td>
                                <td className="px-3 py-2.5 font-bold text-slate-800">{r.score}</td>
                                <td className="px-3 py-2.5">
                                  <span className={cn('grade-badge inline-flex text-[11px]', getGradeColor(r.grade))}>
                                    {r.grade}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.session}</td>
                                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                  {r.semester === 'FIRST' ? 'First Semester' : 'Second Semester'}
                                </td>
                                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                                  {r.batch_display ?? (r.upload_batch ? `Batch #${r.upload_batch}` : '—')}
                                </td>
                                <td className="px-3 py-2.5">
                                  <StatusBadge status={r.status} />
                                </td>
                                <td className="px-3 py-2.5">
                                  {canManage ? (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      {canAct && (
                                        <button
                                          disabled={acting}
                                          onClick={() => approveResult(r.id)}
                                          className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                          <CheckCircle className="w-2.5 h-2.5" /> Approve
                                        </button>
                                      )}
                                      {canAct && (
                                        <button
                                          onClick={() => setShowRejectFor(showRejectFor === r.id ? null : r.id)}
                                          className="flex items-center gap-0.5 px-2 py-1 rounded-lg border border-red-200 text-red-600 text-[11px] hover:bg-red-50"
                                        >
                                          <XCircle className="w-2.5 h-2.5" /> Reject
                                        </button>
                                      )}
                                      {canUnapprove && (
                                        <button
                                          disabled={acting}
                                          onClick={() => unapproveResult(r.id)}
                                          className="flex items-center gap-0.5 px-2 py-1 rounded-lg border border-amber-200 text-amber-700 text-[11px] hover:bg-amber-50"
                                        >
                                          Unapprove
                                        </button>
                                      )}
                                      <button
                                        disabled={acting}
                                        onClick={() => setShowDeleteFor(showDeleteFor === r.id ? null : r.id)}
                                        className="flex items-center gap-0.5 px-2 py-1 rounded-lg border border-slate-300 text-slate-600 text-[11px] hover:bg-slate-100"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" /> Delete
                                      </button>
                                    </div>
                                  ) : canAct ? (
                                    <span className="text-slate-400 text-[11px]">Pending review</span>
                                  ) : (
                                    <span className="text-slate-300 text-[11px]">View only</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}

                          {/* Inline delete confirm */}
                          {group.results.some((r) => showDeleteFor === r.id) && (
                            <tr>
                              <td colSpan={9} className="px-8 py-3 bg-slate-50/80">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                                  <span className="text-xs text-slate-600">Delete this result permanently?</span>
                                  <button
                                    disabled={acting}
                                    onClick={() => showDeleteFor && deleteResult(showDeleteFor)}
                                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {acting ? 'Deleting…' : 'Confirm Delete'}
                                  </button>
                                  <button onClick={() => setShowDeleteFor(null)}
                                    className="text-xs text-slate-400 hover:text-slate-600">
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Inline reject for individual result */}
                          {group.results.some((r) => showRejectFor === r.id) && (
                            <tr>
                              <td colSpan={9} className="px-8 py-3 bg-red-50/80">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                  <input
                                    type="text"
                                    placeholder="Rejection reason…"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="flex-1 min-w-[180px] h-7 px-3 rounded-lg border border-red-200 text-xs focus:outline-none bg-white"
                                    autoFocus
                                  />
                                  <button
                                    disabled={acting}
                                    onClick={() => showRejectFor && rejectResult(showRejectFor, rejectReason)}
                                    className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {acting ? 'Rejecting…' : 'Confirm'}
                                  </button>
                                  <button onClick={() => { setShowRejectFor(null); setRejectReason('') }}
                                    className="text-xs text-slate-400 hover:text-slate-600">
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </TableScroll>

          {/* Student-group pagination */}
          {totalGroupPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                Students {groupRangeStart}–{groupRangeEnd} of {groups.length}
                {' · '}{totalRaw} course record{totalRaw !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-1">
                <button onClick={() => setGroupPage((p) => Math.max(1, p - 1))} disabled={groupPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-500 self-center px-2">
                  Page {groupPage} of {totalGroupPages}
                </span>
                <button onClick={() => setGroupPage((p) => Math.min(totalGroupPages, p + 1))} disabled={groupPage === totalGroupPages}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
    </SuperAdminOversightGuard>
  )
}
