'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, UserPlus, Users, GraduationCap, Mail, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import {
  hodDepartmentAPI,
  type HodDepartmentOverview,
  type HodLecturerRow,
  type HodStudentRow,
  type StaffInvitationRecord,
} from '@/lib/api'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { HodInviteUserModal } from '@/components/governance/hod-invite-user-modal'
import {
  HodDepartmentInvitations,
  HodDepartmentLecturers,
  HodDepartmentStudents,
} from '@/components/governance/hod-department-panels'
import { HodBulkStudentUpload } from '@/components/governance/hod-bulk-student-upload'
import { cn } from '@/lib/utils'

type Tab = 'lecturers' | 'students' | 'invitations'

export default function HodDepartmentPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('lecturers')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<HodDepartmentOverview | null>(null)
  const [lecturers, setLecturers] = useState<HodLecturerRow[]>([])
  const [students, setStudents] = useState<HodStudentRow[]>([])
  const [invitations, setInvitations] = useState<StaffInvitationRecord[]>([])
  const [lecturerSearch, setLecturerSearch] = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, lec, stu, inv] = await Promise.all([
        hodDepartmentAPI.overview(),
        hodDepartmentAPI.lecturers(),
        hodDepartmentAPI.students(),
        hodDepartmentAPI.listInvitations(),
      ])
      setOverview(ov.data)
      setLecturers(lec.data.results ?? [])
      setStudents(stu.data.results ?? [])
      setInvitations(inv.data.results ?? [])
    } catch {
      toast.error('Failed to load department data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const deptName = overview?.department_name ?? user?.department_name ?? 'Department'
  const counts = overview?.counts

  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'lecturers', label: 'Lecturers', icon: Users, count: counts?.lecturers },
    { id: 'students', label: 'Students', icon: GraduationCap, count: counts?.students },
    { id: 'invitations', label: 'Invitations', icon: Mail, count: counts?.pending_invitations },
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <GovernanceBreadcrumb items={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'People & Invites' },
        ]} />
        <div className="mt-4 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-brand-700 uppercase tracking-widest mb-1">HOD · People & Invites</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Building2 className="w-6 h-6 text-brand-700" />
              {deptName}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Invite lecturers and students · track onboarding · scoped to your department only
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-700 text-white text-sm font-semibold shadow-sm hover:bg-brand-800"
            >
              <UserPlus className="w-4 h-4" /> Invite user
            </button>
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>

        {!loading && counts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Lecturers', value: counts.lecturers, color: 'text-brand-800 bg-brand-50' },
              { label: 'Students', value: counts.students, color: 'text-emerald-700 bg-emerald-50' },
              { label: 'Pending invites', value: counts.pending_invitations, color: 'text-amber-700 bg-amber-50' },
              { label: 'Active lecturers', value: counts.active_lecturers, color: 'text-blue-700 bg-blue-50' },
            ].map((s) => (
              <div key={s.label} className={cn('rounded-xl px-4 py-3', s.color)}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium opacity-80">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
            {count !== undefined && count > 0 && (
              <span className="text-[10px] font-bold bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded-full">{count}</span>
            )}
          </button>
        ))}
      </div>

      <div>
        {tab === 'lecturers' && (
          <HodDepartmentLecturers
            lecturers={lecturers}
            loading={loading}
            search={lecturerSearch}
            onSearchChange={setLecturerSearch}
          />
        )}
        {tab === 'students' && (
          <div className="space-y-5">
            <HodBulkStudentUpload onDone={loadAll} />
            <HodDepartmentStudents
            students={students}
            loading={loading}
            search={studentSearch}
            onSearchChange={setStudentSearch}
            onRefresh={loadAll}
          />
          </div>
        )}
        {tab === 'invitations' && (
          <HodDepartmentInvitations
            invitations={invitations}
            loading={loading}
            onRefresh={loadAll}
            onInvite={() => setInviteOpen(true)}
          />
        )}
      </div>

      <HodInviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={loadAll}
      />
    </div>
  )
}
