'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, Users, Layers, GraduationCap, Eye, Sparkles, RefreshCw, Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { LCard, LBadge, LStat, LSkeleton } from '@/components/modules/learning/learning-ui'
import { cn, getSemesterLabel } from '@/lib/utils'
import type { LMSOffering } from '@/lib/types'

export function HodLearningOversight() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [offerings, setOfferings] = useState<LMSOffering[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsResp, offResp] = await Promise.allSettled([
        learningAPI.getDashboardStats(),
        learningAPI.getOfferings(),
      ])
      if (statsResp.status === 'fulfilled') setStats(statsResp.value.data ?? {})
      if (offResp.status === 'fulfilled') {
        const data = offResp.value.data
        setOfferings(Array.isArray(data) ? data : data.results ?? [])
      }
    } catch {
      toast.error('Failed to load learning oversight data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return offerings.filter((o) => {
      if (filter === 'published' && !o.is_published) return false
      if (filter === 'draft' && o.is_published) return false
      if (!q) return true
      return (
        o.course_code.toLowerCase().includes(q)
        || o.course_title.toLowerCase().includes(q)
        || (o.instructor_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [offerings, search, filter])

  const byLecturer = useMemo(() => {
    const map = new Map<string, LMSOffering[]>()
    for (const o of filtered) {
      const key = o.instructor_name ?? 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <LSkeleton key={i} className="h-24" />)}
        </div>
        <LSkeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-brand-700/30 bg-brand-800 text-white shadow-card p-5 sm:p-6 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-brand-200 text-xs font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-gold-400" /> Department learning oversight
            </p>
            <h2 className="font-display text-xl text-white">{user?.department_name ?? 'Your department'}</h2>
            <p className="text-sm text-white/70 mt-1 max-w-xl">
              Monitor virtual learning offerings, lecturer activity, and student enrollment — read-only department view.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/15 text-sm text-white hover:bg-white/15"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <LStat label="Offerings" value={stats.offerings ?? offerings.length} icon={BookOpen} />
        <LStat label="Published" value={stats.published ?? offerings.filter((o) => o.is_published).length} icon={Layers} />
        <LStat label="Students" value={stats.students ?? '—'} icon={Users} />
        <LStat label="Enrollments" value={stats.enrollments ?? '—'} icon={GraduationCap} />
      </div>

      <LCard padding="md">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course or lecturer…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['all', 'published', 'draft'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors',
                  filter === f ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {byLecturer.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-10">No offerings match your filters.</p>
        ) : (
          <div className="space-y-6">
            {byLecturer.map(([lecturer, offs]) => (
              <div key={lecturer}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center text-xs font-bold">
                    {lecturer[0]?.toUpperCase() ?? '?'}
                  </div>
                  <h3 className="text-sm font-semibold text-slate-800">{lecturer}</h3>
                  <LBadge variant="neutral">{offs.length} course{offs.length !== 1 ? 's' : ''}</LBadge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {offs.map((o) => (
                    <Link
                      key={o.id}
                      href={`/learning/offerings/${o.id}`}
                      className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-200 hover:shadow-card transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono text-xs font-bold text-brand-800">{o.course_code}</div>
                          <div className="text-sm font-medium text-slate-800 mt-0.5 line-clamp-2">{o.course_title}</div>
                        </div>
                        <LBadge variant={o.is_published ? 'success' : 'warning'} dot>
                          {o.is_published ? 'Live' : 'Draft'}
                        </LBadge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-2">
                        {getSemesterLabel(o.semester)} · {o.session}
                      </p>
                      <span className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-brand-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="w-3.5 h-3.5" /> View offering
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </LCard>
    </div>
  )
}
