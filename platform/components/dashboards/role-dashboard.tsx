'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  FileText, BookOpen, ShieldCheck, Users, BarChart3, Upload,
  CheckSquare, UserCheck, Building2, GraduationCap, ArrowRight,
  Layers,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { academicsAPI, coreAPI } from '@/lib/api'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import type { UserRole } from '@/lib/types'

interface DashLink {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  accent: string
  roles?: UserRole[]
}

const STAFF_LINKS: DashLink[] = [
  {
    title: 'Faculty Governance Center',
    description: 'Your faculty command center — structure, staff, analytics, audit.',
    href: '/faculty',
    icon: Building2,
    accent: 'from-indigo-600 to-blue-800',
    roles: ['FACULTY_ADMIN'],
  },
  {
    title: 'Governance Center',
    description: 'Institutional control — structure, leadership, audit, analytics.',
    href: '/admin/governance',
    icon: Building2,
    accent: 'from-slate-700 to-slate-900',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Results Oversight',
    description: 'Monitor uploads and publication across all faculties — read-only.',
    href: '/admin/results-oversight',
    icon: FileText,
    accent: 'from-brand-600 to-indigo-700',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Academic Structure',
    description: 'Drill-down faculties, departments, and courses.',
    href: '/admin/academic-structure',
    icon: Layers,
    accent: 'from-violet-600 to-purple-700',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Leadership & Roles',
    description: 'View deans, HODs, and lecturers platform-wide.',
    href: '/admin/users',
    icon: Users,
    accent: 'from-cyan-600 to-blue-700',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Pending Results',
    description: 'Approve or reject submitted results under All Results.',
    href: '/hod/results?pending=1',
    icon: CheckSquare,
    accent: 'from-amber-500 to-orange-600',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'All Results',
    description: 'View and manage student results within your scope.',
    href: '/hod/results',
    icon: FileText,
    accent: 'from-blue-600 to-indigo-700',
    roles: ['DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN'],
  },
  {
    title: 'Add Results',
    description: 'Bulk upload or manual semester entry for your department.',
    href: '/hod/upload',
    icon: Upload,
    accent: 'from-emerald-600 to-teal-700',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'Course Assignments',
    description: 'Assign lecturers to courses — single source of truth.',
    href: '/admin/assignments',
    icon: UserCheck,
    accent: 'from-violet-600 to-purple-700',
    roles: ['DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN'],
  },
  {
    title: 'Academic Structure',
    description: 'Faculties, departments, and courses catalogue.',
    href: '/admin/academic-structure',
    icon: Layers,
    accent: 'from-slate-600 to-slate-800',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'Users',
    description: 'Manage lecturers and staff in your scope.',
    href: '/admin/users',
    icon: Users,
    accent: 'from-cyan-600 to-blue-700',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'Analytics',
    description: 'Scope-aware activity and result statistics.',
    href: '/admin/analytics',
    icon: BarChart3,
    accent: 'from-pink-600 to-rose-700',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'Audit Logs',
    description: 'Immutable audit trail for platform actions.',
    href: '/admin/audit',
    icon: ShieldCheck,
    accent: 'from-red-600 to-rose-800',
    roles: ['DEPARTMENT_ADMIN', 'HOD'],
  },
  {
    title: 'Institutional Analytics',
    description: 'Platform-wide academic and results metrics.',
    href: '/admin/analytics',
    icon: BarChart3,
    accent: 'from-pink-600 to-rose-700',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Audit Logs',
    description: 'Platform-wide immutable audit trail.',
    href: '/admin/audit',
    icon: ShieldCheck,
    accent: 'from-red-600 to-rose-800',
    roles: ['SUPER_ADMIN'],
  },
  {
    title: 'Assigned Course Results',
    description: 'View results for courses assigned to you (read-only).',
    href: '/lecturer/results',
    icon: GraduationCap,
    accent: 'from-teal-600 to-emerald-700',
    roles: ['EXAMINER'],
  },
  {
    title: 'Virtual Learning',
    description: 'Full teaching environment — courses, lessons, quizzes.',
    href: '/learning',
    icon: BookOpen,
    accent: 'from-purple-600 to-violet-700',
    roles: ['EXAMINER', 'DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN', 'SUPER_ADMIN'],
  },
]

export function RoleDashboard() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<Record<string, number> | null>(null)
  const [hodStats, setHodStats] = useState<Record<string, number> | null>(null)
  const [loading, setLoading] = useState(true)

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

  const role = user.role as UserRole
  const scopeLabel =
    role === 'SUPER_ADMIN' ? 'Platform-wide' :
    role === 'FACULTY_ADMIN' ? `Faculty: ${user.faculty_name ?? 'Assigned'}` :
    role === 'DEPARTMENT_ADMIN' || role === 'HOD' ? `Department: ${user.department_name ?? 'Assigned'}` :
    role === 'EXAMINER' ? 'Assigned courses only' :
    'Personal records'

  const links = STAFF_LINKS.filter((l) => !l.roles || l.roles.includes(role))

  return (
    <div className="space-y-8">
      <div className="rounded-2xl gradient-navy p-6 text-white">
        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Scope</p>
        <h1 className="text-2xl font-bold">{user.first_name ? `${user.first_name}'s Workspace` : 'Staff Dashboard'}</h1>
        <p className="text-sm text-slate-300 mt-1">{user.role.replace(/_/g, ' ')} · {scopeLabel}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            {(role === 'SUPER_ADMIN' || role === 'DEPARTMENT_ADMIN' || role === 'HOD' || role === 'FACULTY_ADMIN') && (
              <>
                <StatCard
                  label={role === 'SUPER_ADMIN' ? 'Pending Oversight' : 'Pending Review'}
                  value={hodStats?.pending ?? hodStats?.hod_review ?? hodStats?.pending_approvals ?? 0}
                  icon={CheckSquare}
                  iconBg="bg-amber-50"
                  iconColor="text-amber-600"
                />
                <StatCard
                  label={role === 'SUPER_ADMIN' ? 'Published Records' : 'Published'}
                  value={hodStats?.approved ?? hodStats?.locked_published ?? 0}
                  icon={FileText}
                  iconBg="bg-emerald-50"
                  iconColor="text-emerald-600"
                />
              </>
            )}
            <StatCard label="Students" value={stats?.students ?? stats?.student_count ?? '—'} icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard label="Courses" value={stats?.courses ?? stats?.course_count ?? '—'} icon={Building2} iconBg="bg-violet-50" iconColor="text-violet-600" />
          </>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Your tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${link.accent} flex items-center justify-center mb-3`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-slate-800 group-hover:text-brand-700">{link.title}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{link.description}</p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 mt-3">
                Open <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
