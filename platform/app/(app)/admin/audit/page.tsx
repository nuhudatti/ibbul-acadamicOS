'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Search, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { auditAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatDateTime } from '@/lib/utils'

interface AuditEntry {
  id: number
  action: string
  identifier: string
  user_email?: string
  created_at: string
  ip_address?: string
}

export default function AuditPage() {
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isDean = user?.role === 'FACULTY_ADMIN'
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const resp = await auditAPI.list({ page: String(page), page_size: '50', search })
      const data = resp.data
      setEntries(data.results ?? [])
      setTotal(data.count ?? 0)
    } catch {
      toast.error('Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page])

  return (
    <div className="space-y-5">
      {isSuperAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Governance Center', href: '/admin/governance' },
            { label: 'Audit Logs' },
          ]} />
        </div>
      )}
      {isDean && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Faculty Center', href: '/faculty' },
            { label: 'Audit Logs' },
          ]} />
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isSuperAdmin ? 'Platform Audit Logs' : isDean ? 'Faculty Audit Logs' : 'Audit Logs'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isDean ? `Faculty-scoped audit trail for ${user?.faculty_name ?? 'your faculty'}` : 'Scope-filtered immutable audit trail'} · {total} entries
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search action, identifier, email…"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
          />
        </div>
        <button onClick={() => { setPage(1); load() }} className="px-4 h-10 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Search</button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No audit entries" description="Actions like uploads, approvals, and assignments are logged here." />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Time', 'Action', 'Identifier', 'User', 'IP'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-700">{e.action}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-xs truncate">{e.identifier}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{e.user_email ?? 'System'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{e.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
