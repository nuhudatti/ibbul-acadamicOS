'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FileText, BookOpen, ArrowRight, Upload, CheckSquare,
  Users, Building2, BarChart3, ShieldCheck, Layers, UserCheck,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { academicsAPI, coreAPI } from '@/lib/api'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { PlatformLogo } from '@/components/branding/platform-logo'
import { usePlatformBrand } from '@/hooks/use-platform-brand'
import { cn, getRoleLabel } from '@/lib/utils'
import type { UserRole } from '@/lib/types'

interface ModuleCardProps {
  title: string
  subtitle: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accent: 'green' | 'gold'
  stat?: string
}

function ModuleCard({ title, subtitle, description, href, icon: Icon, accent, stat }: ModuleCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-white p-6 sm:p-7',
        'shadow-card hover:shadow-card-hover transition-all duration-200',
        'hover:-translate-y-0.5 touch-manipulation overflow-hidden',
        accent === 'green' ? 'border-brand-200/50 hover:border-brand-400' : 'border-gold-200/50 hover:border-gold-400'
      )}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brand-50/80 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between gap-4 mb-5 relative">
        <div
          className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center ring-1',
            accent === 'green'
              ? 'bg-brand-50 text-brand-700 ring-brand-100'
              : 'bg-gold-50 text-gold-700 ring-gold-100'
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
        {stat && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-600 text-white">
            {stat}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">{subtitle}</p>
      <h2 className="font-display text-xl sm:text-2xl text-slate-900 tracking-tight">{title}</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed flex-1">{description}</p>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 mt-5 group-hover:gap-2 transition-all">
        Open module <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  )
}

interface QuickLink {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles?: UserRole[]
}

const QUICK_LINKS: QuickLink[] = [
  { label: 'Add Results', href: '/hod/upload', icon: Upload, roles: ['HOD', 'DEPARTMENT_ADMIN'] },
  { label: 'Pending review', href: '/hod/results?pending=1', icon: CheckSquare, roles: ['HOD', 'DEPARTMENT_ADMIN'] },
  { label: 'People & Invites', href: '/hod/department', icon: Users, roles: ['HOD', 'DEPARTMENT_ADMIN'] },
  { label: 'Assign Lecturers', href: '/admin/assignments', icon: UserCheck, roles: ['HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN'] },
  { label: 'Courses Catalogue', href: '/admin/academic-structure', icon: Layers, roles: ['HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN', 'SUPER_ADMIN'] },
  { label: 'Reports', href: '/admin/analytics', icon: BarChart3, roles: ['HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN', 'SUPER_ADMIN'] },
  { label: 'Activity Log', href: '/admin/audit', icon: ShieldCheck, roles: ['HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN', 'SUPER_ADMIN'] },
  { label: 'Governance', href: '/admin/governance', icon: Building2, roles: ['SUPER_ADMIN'] },
]

export function CommandDashboard() {
  const { user } = useAuthStore()
  const { platformName, tagline, dashboardBanner, footerText } = usePlatformBrand()
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [hodStats, setHodStats] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [hour, setHour] = useState(new Date().getHours())

  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [coreResp, hodResp] = await Promise.allSettled([
          coreAPI.getSummary(),
          academicsAPI.hodGetStats(),
        ])
        if (coreResp.status === 'fulfilled') setStats(coreResp.value.data)
        if (hodResp.status === 'fulfilled') setHodStats(hodResp.value.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (!user) return null

  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const role = user.role as UserRole
  const isHod = role === 'HOD' || role === 'DEPARTMENT_ADMIN'
  const pending = hodStats?.pending ?? hodStats?.hod_review ?? hodStats?.pending_approvals ?? 0
  const published = hodStats?.approved ?? hodStats?.locked_published ?? 0

  const scopeLabel =
    role === 'SUPER_ADMIN' ? 'Institution-wide' :
    role === 'FACULTY_ADMIN' ? user.faculty_name ?? 'Faculty scope' :
    isHod ? user.department_name ?? 'Department scope' :
    role === 'EXAMINER' ? 'Assigned courses' :
    'Personal workspace'

  const quickLinks = QUICK_LINKS.filter((l) => !l.roles || l.roles.includes(role))

  const resultsHref =
    role === 'STUDENT' ? '/results' :
    role === 'EXAMINER' ? '/lecturer/results' :
    role === 'SUPER_ADMIN' ? '/admin/results-oversight' :
    '/hod/results'

  const learningHref = '/learning'

  return (
    <div className="space-y-8 animate-fade-in">
      <section className="relative overflow-hidden rounded-2xl text-white shadow-card border border-slate-200/60 bg-brand-800">
        {dashboardBanner ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${dashboardBanner})` }}
            />
            <div className="absolute inset-0 bg-[#062b1a]/82" />
          </>
        ) : (
          <div className="absolute inset-0 bg-brand-800" />
        )}

        <div className="relative px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <PlatformLogo size="lg" variant="on-dark" />
              <div className="min-w-0">
                <p className="text-xs text-white/60 uppercase tracking-[0.14em]">{greeting}</p>
                <h1 className="font-display text-2xl sm:text-3xl tracking-tight mt-1 truncate">
                  {user.first_name ? `${user.first_name}'s Command Centre` : 'Command Centre'}
                </h1>
                <p className="text-sm text-white/75 mt-2">
                  {getRoleLabel(role)} · {scopeLabel}
                </p>
                <p className="text-[11px] text-white/45 mt-2 hidden sm:block">{tagline}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:min-w-[220px]">
              <div className="rounded-xl bg-white/10 px-4 py-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Pending</div>
                <div className="text-2xl font-bold text-white tabular-nums">
                  {loading ? '—' : pending}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3 border border-white/10">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Published</div>
                <div className="text-2xl font-bold text-white tabular-nums">{loading ? '—' : published}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl text-slate-900">Your modules</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Results and Learning — core services of {platformName}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <ModuleCard
            title="Results"
            subtitle="Academic records"
            description="Upload, review, approve, and publish student results. Manual entry or bulk file — official IBBUL format."
            href={resultsHref}
            icon={FileText}
            accent="green"
            stat={pending > 0 ? `${pending} pending` : undefined}
          />
          <ModuleCard
            title="Learning"
            subtitle="Virtual learning"
            description="Course offerings, structured lessons, quizzes, and assignments for your department."
            href={learningHref}
            icon={BookOpen}
            accent="gold"
          />
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            {(isHod || role === 'FACULTY_ADMIN' || role === 'SUPER_ADMIN') && (
              <>
                <StatCard label="Pending review" value={pending} icon={CheckSquare} variant="accent" />
                <StatCard label="Published" value={published} icon={FileText} variant="default" />
              </>
            )}
            <StatCard label="Students" value={stats?.students ?? stats?.student_count ?? '—'} icon={Users} />
            <StatCard label="Courses" value={stats?.courses ?? stats?.course_count ?? '—'} icon={Building2} />
          </>
        )}
      </section>

      {quickLinks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-[0.14em] mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:px-4 text-sm font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-900 transition-colors touch-manipulation"
              >
                <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center flex-shrink-0">
                  <link.icon className="w-4 h-4" />
                </span>
                <span className="truncate">{link.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="pt-4 border-t border-slate-200/80">
        <p className="text-[11px] text-slate-400 text-center sm:text-left leading-relaxed">{footerText}</p>
      </footer>
    </div>
  )
}
