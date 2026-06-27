'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Building2, Layers, ShieldCheck, BarChart3, Users, FileText,
  ArrowRight, RefreshCw, GraduationCap, Plus,
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { OversightCard, OversightSkeleton } from '@/components/results-oversight/oversight-cards'
import { loadAcademicTree, loadGovernanceStats, facultyMetrics, type GovernanceStats } from '@/lib/governance'
import { CreateFacultyModal, type CreatedFaculty } from '@/components/governance/create-faculty-modal'
import { InviteLeaderModal, type InvitePreset } from '@/components/governance/invite-leader-modal'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const GOVERNANCE_LINKS = [
  {
    title: 'Academic Structure',
    description: 'Explore faculties, departments, and course catalogue.',
    href: '/admin/academic-structure',
    icon: Layers,
    accent: 'from-brand-700 to-brand-900',
  },
  {
    title: 'Results Oversight',
    description: 'Monitor uploads and publication across the institution.',
    href: '/admin/results-oversight',
    icon: FileText,
    accent: 'from-brand-600 to-brand-800',
  },
  {
    title: 'Leadership & Roles',
    description: 'View deans, HODs, and lecturers platform-wide.',
    href: '/admin/users',
    icon: Users,
    accent: 'from-brand-600 to-brand-900',
  },
  {
    title: 'Institutional Analytics',
    description: 'Platform-wide academic and results metrics.',
    href: '/admin/analytics',
    icon: BarChart3,
    accent: 'from-gold-500 to-gold-700',
  },
  {
    title: 'Audit Logs',
    description: 'Immutable governance and activity audit trail.',
    href: '/admin/audit',
    icon: ShieldCheck,
    accent: 'from-brand-800 to-brand-950',
  },
]

export default function GovernanceCenterPage() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<GovernanceStats | null>(null)
  const [faculties, setFaculties] = useState<Awaited<ReturnType<typeof loadAcademicTree>>>([])
  const [createFacultyOpen, setCreateFacultyOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePreset, setInvitePreset] = useState<InvitePreset | null>(null)

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard')
    }
  }, [user, router])

  const load = async () => {
    setLoading(true)
    try {
      const [s, tree] = await Promise.all([loadGovernanceStats(), loadAcademicTree()])
      setStats(s)
      setFaculties(tree)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleFacultyCreated = (faculty: CreatedFaculty) => {
    load()
    setInvitePreset({
      role: 'FACULTY_ADMIN',
      facultyId: faculty.id,
      facultyName: faculty.name,
    })
    setInviteOpen(true)
    toast.success('Faculty created — invite a Dean to activate their workspace')
  }

  if (user?.role !== 'SUPER_ADMIN') return null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <GovernanceBreadcrumb items={[{ label: 'Governance Center' }]} />
        <div className="mt-4 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-1">
              Academic Governance Center
            </p>
            <h1 className="font-display text-2xl text-slate-900 tracking-tight">Institutional Control</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Govern university structure, monitor performance, and audit activity — without entering operational HOD workflows.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateFacultyOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-brand text-white text-sm font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4" /> Create Faculty
            </button>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Faculties', value: stats.faculties, icon: Building2 },
            { label: 'Departments', value: stats.departments, icon: Layers },
            { label: 'Courses', value: stats.courses, icon: GraduationCap },
            { label: 'Students', value: stats.students, icon: Users },
            { label: 'Session', value: stats.currentSession ?? '—', icon: FileText, text: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center">
                <s.icon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="min-w-0">
                <div className={cn('font-bold text-slate-900 truncate', s.text ? 'text-sm' : 'text-xl tabular-nums')}>
                  {s.value}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Governance tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GOVERNANCE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', link.accent)}>
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Faculty overview</h2>
          <Link href="/admin/academic-structure" className="text-xs font-medium text-brand-600 hover:underline">
            View full structure →
          </Link>
        </div>
        {loading ? (
          <OversightSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {faculties.map((f) => {
              const m = facultyMetrics(f)
              return (
                <OversightCard
                  key={f.id}
                  title={f.name}
                  subtitle={f.code}
                  icon={Building2}
                  accent="from-brand-600 to-brand-800"
                  metrics={[
                    { label: 'Departments', value: m.deptCount },
                    { label: 'Courses', value: m.courseCount },
                    { label: 'Status', value: f.is_active === false ? 'Inactive' : 'Active' },
                    { label: 'Govern', value: 'View' },
                  ]}
                  onClick={() => router.push(`/admin/academic-structure?faculty=${f.id}`)}
                />
              )
            })}
          </div>
        )}
      </div>

      <CreateFacultyModal
        open={createFacultyOpen}
        onClose={() => setCreateFacultyOpen(false)}
        onSuccess={handleFacultyCreated}
      />
      <InviteLeaderModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={load}
        preset={invitePreset}
      />
    </div>
  )
}
