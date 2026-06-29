'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Building2, Layers, FileStack, Users, Clock, RefreshCw,
  ChevronLeft, ShieldCheck, BarChart3, GraduationCap, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { OversightBreadcrumb } from '@/components/results-oversight/oversight-breadcrumb'
import { OversightCard, OversightSkeleton, StatusPill } from '@/components/results-oversight/oversight-cards'
import { BatchStudentResults } from '@/components/results-oversight/batch-student-results'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDateTime, getGradeColor } from '@/lib/utils'
import { safeReplace } from '@/lib/safe-string'
import {
  loadFacultyOverview,
  loadDepartmentOverview,
  loadDepartmentBatches,
  loadBatchDetail,
  loadBatchAudit,
  computeGradeSummary,
  approvalStatusLabel,
  approvalStatusTone,
  type FacultyMetrics,
  type DepartmentMetrics,
  type UploadBatchRow,
  type BatchDetail,
  type AuditRow,
} from '@/lib/oversight'

type Level = 'faculties' | 'departments' | 'batches' | 'detail'

export default function ResultsOversightContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  const facultyId = searchParams.get('faculty') ? Number(searchParams.get('faculty')) : null
  const departmentId = searchParams.get('department') ? Number(searchParams.get('department')) : null
  const batchId = searchParams.get('batch') ? Number(searchParams.get('batch')) : null

  const level: Level = batchId
    ? 'detail'
    : departmentId
      ? 'batches'
      : facultyId
        ? 'departments'
        : 'faculties'

  const [loading, setLoading] = useState(true)
  const [faculties, setFaculties] = useState<FacultyMetrics[]>([])
  const [facultyName, setFacultyName] = useState<string>('')
  const [departments, setDepartments] = useState<DepartmentMetrics[]>([])
  const [departmentName, setDepartmentName] = useState<string>('')
  const [batches, setBatches] = useState<UploadBatchRow[]>([])
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null)
  const [auditRows, setAuditRows] = useState<AuditRow[]>([])

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, router])

  const navigate = useCallback(
    (params: { faculty?: number | null; department?: number | null; batch?: number | null }) => {
      const q = new URLSearchParams()
      if (params.faculty) q.set('faculty', String(params.faculty))
      if (params.department) q.set('department', String(params.department))
      if (params.batch) q.set('batch', String(params.batch))
      const qs = q.toString()
      router.push(qs ? `/admin/results-oversight?${qs}` : '/admin/results-oversight')
    },
    [router]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (level === 'faculties') {
        setFaculties(await loadFacultyOverview())
      } else if (level === 'departments' && facultyId) {
        const data = await loadDepartmentOverview(facultyId)
        setFacultyName(data.faculty?.name ?? 'Faculty')
        setDepartments(data.departments)
      } else if (level === 'batches' && departmentId) {
        const data = await loadDepartmentOverview(facultyId!)
        const dept = data.departments.find((d) => d.id === departmentId)
        setFacultyName(data.faculty?.name ?? 'Faculty')
        setDepartmentName(dept?.name ?? 'Department')
        setBatches(await loadDepartmentBatches(departmentId))
      } else if (level === 'detail' && batchId) {
        const detail = await loadBatchDetail(batchId)
        setBatchDetail(detail)
        setFacultyName(detail.faculty_name ?? 'Faculty')
        setDepartmentName(detail.department_name ?? 'Department')
        setAuditRows(await loadBatchAudit(detail.filename))
      }
    } catch {
      toast.error('Failed to load oversight data')
    } finally {
      setLoading(false)
    }
  }, [level, facultyId, departmentId, batchId])

  useEffect(() => { load() }, [load])

  const breadcrumbs = useMemo(() => {
    const items: { label: string; href?: string }[] = [
      { label: 'Results Oversight', href: '/admin/results-oversight' },
    ]
    if (facultyId) {
      items.push({
        label: facultyName || 'Faculty',
        href: `/admin/results-oversight?faculty=${facultyId}`,
      })
    }
    if (departmentId) {
      items.push({
        label: departmentName || 'Department',
        href: `/admin/results-oversight?faculty=${facultyId}&department=${departmentId}`,
      })
    }
    if (batchId && batchDetail) {
      items.push({ label: batchDetail.filename })
    }
    return items
  }, [facultyId, departmentId, batchId, facultyName, departmentName, batchDetail])

  const platformStats = useMemo(() => {
    if (level !== 'faculties' || !faculties.length) return null
    return {
      faculties: faculties.length,
      departments: faculties.reduce((s, f) => s + f.departmentCount, 0),
      students: faculties.reduce((s, f) => s + f.studentCount, 0),
      pending: faculties.reduce((s, f) => s + f.pendingApprovals, 0),
      published: faculties.reduce((s, f) => s + f.publishedResults, 0),
    }
  }, [level, faculties])

  const gradeSummary = batchDetail ? computeGradeSummary(batchDetail.results ?? []) : null

  if (user?.role !== 'SUPER_ADMIN') return null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <OversightBreadcrumb items={breadcrumbs} />
        <div className="mt-4 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-1">
              Academic Results Oversight
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {level === 'faculties' && 'Faculty Overview'}
              {level === 'departments' && facultyName}
              {level === 'batches' && departmentName}
              {level === 'detail' && (batchDetail?.filename ?? 'Batch Details')}
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              {level === 'faculties'
                ? 'Monitor result uploads and publication status across all faculties. Read-only oversight — operational processing remains with HODs.'
                : level === 'detail'
                  ? 'Read-only batch inspection with student results, grade summary, and audit trail.'
                  : 'Drill down to inspect departments and upload batches. No upload or approval actions at this level.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {level !== 'faculties' && (
              <button
                onClick={() => {
                  if (level === 'detail') navigate({ faculty: facultyId, department: departmentId })
                  else if (level === 'batches') navigate({ faculty: facultyId })
                  else navigate({})
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {platformStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Faculties', value: platformStats.faculties, icon: Building2 },
            { label: 'Departments', value: platformStats.departments, icon: Layers },
            { label: 'Students', value: platformStats.students, icon: Users },
            { label: 'Pending Batches', value: platformStats.pending, icon: Clock, warn: true },
            { label: 'Published Records', value: platformStats.published, icon: FileStack },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
                <s.icon className={cn('w-4 h-4', s.warn ? 'text-amber-500' : 'text-slate-500')} />
              </div>
              <div>
                <div className={cn('text-xl font-bold tabular-nums', s.warn && s.value > 0 && 'text-amber-600')}>
                  {s.value}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {level === 'faculties' && (
        loading ? (
          <OversightSkeleton count={8} />
        ) : faculties.length === 0 ? (
          <EmptyState icon={Building2} title="No faculties found" description="Academic structure has not been configured yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {faculties.map((f) => (
              <OversightCard
                key={f.id}
                title={f.name}
                subtitle={f.code}
                icon={Building2}
                accent="from-brand-600 to-brand-800"
                metrics={[
                  { label: 'Departments', value: f.departmentCount },
                  { label: 'Students', value: f.studentCount },
                  { label: 'Batches', value: f.batchCount },
                  { label: 'Pending', value: f.pendingApprovals, highlight: f.pendingApprovals > 0 },
                ]}
                footer={
                  [
                    f.publishedResults > 0 ? `${f.publishedResults} published records` : null,
                    f.lastActivity ? `Last activity ${formatDateTime(f.lastActivity)}` : 'No uploads yet',
                  ].filter(Boolean).join(' · ')
                }
                onClick={() => navigate({ faculty: f.id })}
              />
            ))}
          </div>
        )
      )}

      {level === 'departments' && (
        loading ? (
          <OversightSkeleton count={6} />
        ) : departments.length === 0 ? (
          <EmptyState icon={Layers} title="No departments" description="This faculty has no active departments." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((d) => (
              <OversightCard
                key={d.id}
                title={d.name}
                subtitle={d.code}
                icon={Layers}
                accent="from-brand-600 to-brand-800"
                metrics={[
                  { label: 'Students', value: d.studentCount },
                  { label: 'Courses', value: d.courseCount },
                  { label: 'Batches', value: d.batchCount },
                  { label: 'Pending', value: d.pendingApprovals, highlight: d.pendingApprovals > 0 },
                ]}
                footer={d.lastActivity ? `Last upload ${formatDateTime(d.lastActivity)}` : 'No uploads yet'}
                onClick={() => navigate({ faculty: facultyId!, department: d.id })}
              />
            ))}
          </div>
        )
      )}

      {level === 'batches' && (
        loading ? (
          <OversightSkeleton count={4} />
        ) : batches.length === 0 ? (
          <EmptyState
            icon={FileStack}
            title="No result batches"
            description="This department has no uploaded result sheets yet. HODs upload via their department workflow."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => navigate({ faculty: facultyId!, department: departmentId!, batch: b.id })}
                className="group text-left rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-brand-500 flex-shrink-0" />
                      <h3 className="font-semibold text-slate-900 truncate">{b.filename}</h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {b.session} · {b.semester === 'FIRST' ? 'First' : 'Second'} Semester
                    </p>
                  </div>
                  <StatusPill label={approvalStatusLabel(b)} tone={approvalStatusTone(b)} />
                </div>
                <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Uploaded by</div>
                    <div className="font-medium text-slate-700 mt-0.5">{b.uploaded_by_display ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Upload date</div>
                    <div className="font-medium text-slate-700 mt-0.5">{formatDateTime(b.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Students</div>
                    <div className="font-bold text-slate-800 mt-0.5 tabular-nums">{b.success_count}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Processing</div>
                    <div className="font-medium text-slate-700 mt-0.5">{b.status}</div>
                  </div>
                </div>
                <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <ShieldCheck className="w-3 h-3" /> Audit available
                  </span>
                  <span className="text-xs font-semibold text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    View batch →
                  </span>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {level === 'detail' && (
        loading ? (
          <div className="space-y-4">
            <div className="skeleton h-32 rounded-2xl" />
            <div className="skeleton h-64 rounded-2xl" />
          </div>
        ) : !batchDetail ? (
          <EmptyState icon={FileStack} title="Batch not found" description="This upload batch may have been removed." />
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">{batchDetail.filename}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {batchDetail.department_name} · {batchDetail.session} · {batchDetail.semester}
                  </p>
                </div>
                <StatusPill label={approvalStatusLabel(batchDetail)} tone={approvalStatusTone(batchDetail)} />
              </div>
              <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {[
                  { label: 'Uploaded by', value: batchDetail.uploaded_by_display },
                  { label: 'Upload date', value: formatDateTime(batchDetail.created_at) },
                  { label: 'Approved by', value: batchDetail.approved_by_display ?? '—' },
                  { label: 'Approved at', value: batchDetail.approved_at ? formatDateTime(batchDetail.approved_at) : '—' },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{row.label}</div>
                    <div className="font-medium text-slate-800 mt-0.5">{row.value ?? '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {gradeSummary && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-brand-500" />
                  <h3 className="font-semibold text-slate-900">Grade Summary</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase">Records</div>
                    <div className="text-2xl font-bold text-slate-900">{gradeSummary.totalRecords}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase">Students</div>
                    <div className="text-2xl font-bold text-slate-900">{gradeSummary.uniqueStudents}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase">Avg Score</div>
                    <div className="text-2xl font-bold text-slate-900">{gradeSummary.averageScore ?? '—'}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase">Errors</div>
                    <div className="text-2xl font-bold text-slate-900">{batchDetail.error_count}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gradeSummary.gradeDistribution.map(([grade, count]) => (
                    <span
                      key={grade}
                      className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium', getGradeColor(grade))}
                    >
                      {grade} <span className="opacity-70">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-500" />
                <h3 className="font-semibold text-slate-900">Audit Trail</h3>
              </div>
              {auditRows.length === 0 ? (
                <div className="px-6 py-8 text-sm text-slate-500 text-center">
                  No audit entries linked to this batch filename.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {auditRows.map((a) => (
                    <div key={a.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
                      <div>
                        <div className="font-medium text-slate-800">{safeReplace(a.action, /_/g, ' ', 'Action')}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{a.identifier}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-slate-500">{formatDateTime(a.created_at)}</div>
                        {a.user_email && <div className="text-xs text-slate-400">{a.user_email}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-brand-500" />
                  <h3 className="font-semibold text-slate-900">
                    Student Results <span className="text-slate-400 font-normal">(read-only)</span>
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  {computeGradeSummary(batchDetail.results ?? []).uniqueStudents} student
                  {computeGradeSummary(batchDetail.results ?? []).uniqueStudents !== 1 ? 's' : ''} · click a row to expand
                </span>
              </div>
              <div className="overflow-x-auto">
                <BatchStudentResults
                  results={batchDetail.results ?? []}
                  session={batchDetail.session}
                  semester={batchDetail.semester}
                />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
