'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckSquare, FileText, Users, AlertCircle, ChevronRight, Clock, BarChart3, Upload } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { academicsAPI } from '@/lib/api'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { cn, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import type { Result } from '@/lib/types'
import { TableScroll } from '@/components/ui/table-scroll'

export function HODDashboard() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<{
    pending_count?: number
    approved_count?: number
    rejected_count?: number
    total_results?: number
    recent?: Result[]
  }>({})

  useEffect(() => {
    const load = async () => {
      try {
        const [statsResp, pendingResp] = await Promise.allSettled([
          academicsAPI.hodGetStats(),
          academicsAPI.hodGetResults({ status: 'HOD_REVIEW', page_size: '5' }),
        ])
        const s: typeof stats = {}
        if (statsResp.status === 'fulfilled') Object.assign(s, statsResp.value.data)
        if (pendingResp.status === 'fulfilled') {
          const d = pendingResp.value.data
          s.recent = d.results ?? d
          if (!s.pending_count) s.pending_count = d.count ?? (Array.isArray(d) ? d.length : 0)
        }
        setStats(s)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const roleLabel = user?.role === 'FACULTY_ADMIN' ? 'Dean' : 'HOD'
  const scopeLabel = user?.role === 'FACULTY_ADMIN'
    ? user.faculty_name ?? 'Faculty'
    : user?.department_name ?? user?.department ?? 'Department'

  return (
    <div className="space-y-7">
      {/* Banner */}
      <div className="rounded-2xl gradient-brand p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative">
          <div className="text-xs text-blue-200 uppercase tracking-widest font-medium mb-1">{roleLabel} Portal</div>
          <h1 className="text-2xl font-bold">{scopeLabel}</h1>
          <p className="text-blue-200 text-sm mt-1">Result approval and academic oversight</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Pending Approvals"
              value={stats.pending_count ?? 0}
              sub="Awaiting your review"
              icon={AlertCircle}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
            <StatCard
              label="Approved"
              value={stats.approved_count ?? 0}
              sub="This session"
              icon={CheckSquare}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatCard
              label="Total Results"
              value={stats.total_results ?? 0}
              sub="In your scope"
              icon={FileText}
              iconBg="bg-brand-50"
              iconColor="text-brand-600"
            />
            <StatCard
              label="Rejected"
              value={stats.rejected_count ?? 0}
              sub="Returned to examiner"
              icon={BarChart3}
              iconBg="bg-red-50"
              iconColor="text-red-500"
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            href: '/hod/results?pending=1',
            icon: CheckSquare,
            label: 'Pending Results',
            desc: 'Approve or reject in All Results',
            color: 'border-amber-200 bg-amber-50 hover:bg-amber-100',
            iconColor: 'text-amber-600',
            badge: stats.pending_count,
          },
          {
            href: '/hod/results',
            icon: FileText,
            label: 'All Results',
            desc: 'Browse department results',
            color: 'border-brand-200 bg-brand-50 hover:bg-brand-100',
            iconColor: 'text-brand-600',
          },
          {
            href: '/hod/upload',
            icon: Upload,
            label: 'Add Results',
            desc: 'Bulk file or manual entry',
            color: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
            iconColor: 'text-emerald-600',
          },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              'group rounded-2xl border p-5 transition-all hover:shadow-card',
              action.color
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <action.icon className={cn('w-5 h-5 mb-3', action.iconColor)} />
                <div className="text-sm font-semibold text-slate-800">{action.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{action.desc}</div>
              </div>
              {action.badge != null && action.badge > 0 && (
                <span className="flex-shrink-0 bg-amber-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {action.badge > 99 ? '99+' : action.badge}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 mt-4 text-xs font-medium text-slate-500 group-hover:text-slate-700">
              Open <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>

      {/* Recent submissions */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Recent Submissions</h2>
          </div>
          <Link href="/hod/results?pending=1" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
            View all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-3 flex-1 rounded" />
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : !stats.recent?.length ? (
          <div className="py-10 text-center text-sm text-slate-400">No recent submissions</div>
        ) : (
          <TableScroll minWidth="640px">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Student', 'Course', 'Score', 'Session', 'Status', 'Uploaded'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stats.recent!.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">
                      {r.student_id_display ?? `#${r.student}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.course_code ?? `#${r.course}`}
                    </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-800">{r.score}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.session}</td>
                  <td className="px-4 py-3">
                    <Badge variant={
                      r.status === 'APPROVED' || r.status === 'LOCKED_PUBLISHED' ? 'success' :
                      r.status === 'REJECTED' ? 'danger' :
                      r.status === 'HOD_REVIEW' ? 'warning' : 'neutral'
                    } className="text-[10px]">
                      {getStatusLabel(r.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {formatDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        )}
      </div>
    </div>
  )
}
