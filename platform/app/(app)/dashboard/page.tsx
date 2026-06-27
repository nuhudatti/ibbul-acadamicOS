'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { CommandDashboard } from '@/components/dashboards/command-dashboard'
import { FacultyGovernanceCenter } from '@/components/faculty/faculty-governance-center'
import { StudentDashboard } from '@/components/modules/results/student-dashboard'

function StudentModuleCard({
  title, subtitle, description, href, accent,
}: {
  title: string; subtitle: string; description: string; href: string; accent: string
}) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="group text-left w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all touch-manipulation"
    >
      <div className={`h-1 w-16 rounded-full mb-4 ${accent}`} />
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{subtitle}</p>
      <h2 className="text-lg font-bold text-slate-900 mt-1">{title}</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
      <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 mt-4">
        Open <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </button>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  if (!user) return null

  if (user.role === 'FACULTY_ADMIN') {
    return (
      <div className="space-y-8">
        <div className="rounded-3xl gradient-ibbul-hero text-white px-6 py-8 sm:px-8">
          <p className="text-xs text-white/60 uppercase tracking-wider">Faculty Governance</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">Dean&apos;s Command Centre</h1>
          <p className="text-sm text-white/70 mt-2">{user.faculty_name ?? 'Faculty scope'}</p>
        </div>
        <FacultyGovernanceCenter />
      </div>
    )
  }

  if (user.role === 'STUDENT') {
    return <StudentDashboard />
  }

  return <CommandDashboard />
}
