'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, FileText, BookOpen, ShieldCheck, Settings, BarChart3, ChevronRight, Calendar } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { academicsAPI, learningAPI, coreAPI } from '@/lib/api'
import { cn } from '@/lib/utils'

interface CoreSummary {
  current_session: { name: string; is_current: boolean } | null
  counts: { faculties: number; departments: number; courses: number; students: number }
  scope: { role: string; department: string | null; faculty: string | null }
}

export function AdminDashboard() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [core, setCore] = useState<CoreSummary | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [hodStats, learnStats, coreSummary] = await Promise.allSettled([
          academicsAPI.hodGetStats(),
          learningAPI.getDashboardStats(),
          coreAPI.getSummary(),
        ])
        const s: Record<string, number> = {}
        if (hodStats.status === 'fulfilled') Object.assign(s, hodStats.value.data)
        if (learnStats.status === 'fulfilled') Object.assign(s, learnStats.value.data)
        if (coreSummary.status === 'fulfilled') {
          const c = coreSummary.value.data as CoreSummary
          setCore(c)
          s.total_students = c.counts.students
          s.total_courses = c.counts.courses
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

  const QUICK_LINKS = [
    { href: '/admin/users',     icon: Users,      label: 'User Management',  desc: 'Manage accounts, import users',   color: 'bg-brand-50 border-brand-200 text-brand-600' },
    { href: '/hod/results?pending=1', icon: FileText,   label: 'Pending Results', desc: 'Review in All Results',           color: 'bg-amber-50 border-amber-200 text-amber-600' },
    { href: '/learning',        icon: BookOpen,   label: 'LMS Overview',     desc: 'Learning module management',      color: 'bg-emerald-50 border-emerald-200 text-emerald-600' },
    { href: '/admin/audit',     icon: ShieldCheck,label: 'Audit Logs',       desc: 'Security & compliance logs',      color: 'bg-purple-50 border-purple-200 text-purple-600' },
    { href: '/admin/analytics', icon: BarChart3,  label: 'Analytics',        desc: 'Platform-wide insights',          color: 'bg-blue-50 border-blue-200 text-blue-600' },
    { href: '/settings',        icon: Settings,   label: 'Settings',         desc: 'System configuration',            color: 'bg-slate-50 border-slate-200 text-slate-600' },
  ]

  return (
    <div className="space-y-7">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-800 to-navy-900 p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-xs text-purple-300 uppercase tracking-widest font-medium mb-1">
              {user?.role === 'SUPER_ADMIN' ? 'Super Administrator' : 'Administrator'}
            </div>
            <h1 className="text-2xl font-bold">IBBUL Academic OS</h1>
            <p className="text-slate-400 text-sm mt-1">
              Full platform oversight and control
            </p>
          </div>
          {core?.current_session && (
            <div className="flex items-center gap-2 text-xs bg-white/10 rounded-xl px-3 py-2 backdrop-blur-sm border border-white/20 w-fit">
              <Calendar className="w-3.5 h-3.5 text-purple-300" />
              <span className="text-purple-100 font-medium">Session</span>
              <span className="text-white font-semibold">{core.current_session.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Registered Students" value={stats.total_students ?? 0}
              sub={`${core?.counts.departments ?? 0} departments`} icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard label="Active Courses" value={stats.total_courses ?? 0}
              sub="Academic Core" icon={BookOpen} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <StatCard label="Pending Approvals" value={stats.pending_count ?? 0}
              sub="Results to review" icon={FileText} iconBg="bg-amber-50" iconColor="text-amber-600" />
            <StatCard label="LMS Offerings" value={stats.total_offerings ?? 0}
              sub={`${stats.published_offerings ?? 0} published`} icon={BarChart3} iconBg="bg-brand-50" iconColor="text-brand-600" />
          </>
        )}
      </div>

      {/* Quick links grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Quick Access</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'group rounded-2xl border p-5 hover:shadow-card-hover transition-all',
                link.color
              )}
            >
              <link.icon className="w-5 h-5 mb-3" />
              <div className="text-sm font-semibold text-slate-800">{link.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{link.desc}</div>
              <div className="flex items-center gap-0.5 mt-4 text-xs font-medium text-slate-400 group-hover:text-slate-600">
                Open <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
