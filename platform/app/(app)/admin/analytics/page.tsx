'use client'

import { useEffect, useState } from 'react'
import { BarChart3, RefreshCw, FileText, Users, BookOpen, Upload, Building2 } from 'lucide-react'
import { academicsAPI, coreAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { loadGovernanceStats } from '@/lib/governance'
import { cn } from '@/lib/utils'

export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isDean = user?.role === 'FACULTY_ADMIN'
  const [loading, setLoading] = useState(true)
  const [core, setCore] = useState<Record<string, number>>({})
  const [hod, setHod] = useState<Record<string, number>>({})

  const load = async () => {
    setLoading(true)
    try {
      const [c, h] = await Promise.allSettled([
        isSuperAdmin ? loadGovernanceStats() : coreAPI.getSummary(),
        academicsAPI.hodGetStats(),
      ])
      if (c.status === 'fulfilled') {
        const data = c.value
        if (isSuperAdmin && 'faculties' in data) {
          setCore({
            faculties: data.faculties,
            departments: data.departments,
            courses: data.courses,
            students: data.students,
          })
        } else {
          const raw = (data as { data?: { counts?: Record<string, number> } }).data ?? data
          const counts = (raw as { counts?: Record<string, number> }).counts ?? raw as Record<string, number>
          setCore({
            faculties: counts.faculties ?? 0,
            departments: counts.departments ?? 0,
            courses: counts.courses ?? 0,
            students: counts.students ?? 0,
          })
        }
      }
      if (h.status === 'fulfilled') setHod(h.value.data ?? {})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [isSuperAdmin])

  return (
    <div className="space-y-6">
      {isSuperAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Governance Center', href: '/admin/governance' },
            { label: 'Institutional Analytics' },
          ]} />
        </div>
      )}

      {isDean && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Faculty Center', href: '/faculty' },
            { label: 'Faculty Analytics' },
          ]} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isSuperAdmin ? 'Institutional Analytics' : isDean ? 'Faculty Analytics' : 'Analytics'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isSuperAdmin
              ? 'Platform-wide academic structure and results performance'
              : isDean
                ? `Faculty-scoped metrics for ${user?.faculty_name ?? 'your faculty'}`
                : 'Scope-aware statistics from Academic Core and Results'}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {isSuperAdmin ? 'Institutional structure' : isDean ? 'Faculty structure' : 'Academic structure'}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />) : (
            <>
              <StatCard label="Students" value={core.students ?? 0} icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
              <StatCard label="Courses" value={core.courses ?? 0} icon={BookOpen} iconBg="bg-brand-50" iconColor="text-brand-700" />
              <StatCard label="Departments" value={core.departments ?? 0} icon={Building2} iconBg="bg-amber-50" iconColor="text-amber-600" />
              {!isDean && (
                <StatCard label="Faculties" value={core.faculties ?? 0} icon={BarChart3} iconBg="bg-slate-100" iconColor="text-slate-600" />
              )}
            </>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          {isSuperAdmin ? 'Results performance (platform)' : isDean ? 'Results (faculty)' : 'Results (your scope)'}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />) : (
            <>
              <StatCard label="Pending Oversight" value={hod.pending_approvals ?? hod.pending ?? hod.hod_review ?? 0} icon={Upload} iconBg="bg-amber-50" iconColor="text-amber-600" />
              <StatCard label="Published" value={hod.approved ?? hod.locked_published ?? 0} icon={FileText} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              <StatCard label="Rejected" value={hod.rejected ?? 0} icon={BarChart3} iconBg="bg-red-50" iconColor="text-red-600" />
              <StatCard label="Uploads This Month" value={hod.uploads_this_month ?? 0} icon={Upload} iconBg="bg-brand-50" iconColor="text-brand-600" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
