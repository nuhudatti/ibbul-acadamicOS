'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Users, Search, RefreshCw, Shield, GraduationCap, UserPlus,
  Ban, UserCheck, UserMinus, MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { academicsAPI, coreAPI, invitationAPI, governanceStaffAPI, type StaffInvitationRecord } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { InviteLeaderModal, type InvitePreset } from '@/components/governance/invite-leader-modal'
import { InvitationsPanel } from '@/components/governance/invitations-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { normalizeList } from '@/lib/governance'

interface StaffUser {
  id: number
  email: string | null
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  department_name?: string
  faculty_name?: string
  assigned_courses?: { id: number; code: string; title: string }[]
}

type RoleFilter = 'ALL' | 'FACULTY_ADMIN' | 'HOD' | 'DEPARTMENT_ADMIN' | 'EXAMINER'
type Tab = 'staff' | 'invitations'

const ROLE_LABELS: Record<string, string> = {
  FACULTY_ADMIN: 'Dean',
  HOD: 'HOD',
  DEPARTMENT_ADMIN: 'HOD',
  EXAMINER: 'Lecturer',
  SUPER_ADMIN: 'Super Admin',
}

const ROLE_CLASS: Record<string, string> = {
  FACULTY_ADMIN: 'bg-brand-50 text-brand-800 border-brand-200',
  HOD: 'bg-amber-50 text-amber-700 border-amber-200',
  DEPARTMENT_ADMIN: 'bg-amber-50 text-amber-700 border-amber-200',
  EXAMINER: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUPER_ADMIN: 'bg-slate-100 text-slate-700 border-slate-200',
}

const GOVERNABLE_ROLES = new Set(['FACULTY_ADMIN', 'DEPARTMENT_ADMIN', 'HOD', 'EXAMINER'])

export default function UsersPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isDean = user?.role === 'FACULTY_ADMIN'
  const isHod = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD'

  useEffect(() => {
    if (isHod) router.replace('/hod/department')
  }, [isHod, router])

  if (isHod) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center text-sm text-slate-500">Redirecting to Department Management…</div>
      </div>
    )
  }
  const [loading, setLoading] = useState(true)
  const [invLoading, setInvLoading] = useState(true)
  const [users, setUsers] = useState<StaffUser[]>([])
  const [invitations, setInvitations] = useState<StaffInvitationRecord[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')
  const [tab, setTab] = useState<Tab>('staff')
  const [scopeInfo, setScopeInfo] = useState<Record<string, unknown>>({})
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePreset, setInvitePreset] = useState<InvitePreset | null>(null)
  const [actionUserId, setActionUserId] = useState<number | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      if (isSuperAdmin) {
        const resp = await coreAPI.getStaff()
        setUsers(normalizeList<StaffUser>(resp.data))
        setScopeInfo({ note: 'Platform-wide leadership and staff directory' })
      } else if (isDean) {
        const resp = await coreAPI.getStaff()
        const staff = normalizeList<StaffUser>(resp.data).filter(
          (u) => u.role !== 'SUPER_ADMIN' && u.role !== 'FACULTY_ADMIN'
        )
        setUsers(staff)
        setScopeInfo({
          note: `Faculty staff in ${user?.faculty_name ?? 'your faculty'}`,
          faculty: user?.faculty_name,
        })
      } else {
        const resp = await academicsAPI.getExaminers({ search })
        setUsers(resp.data?.results ?? [])
        setScopeInfo(resp.data?.scope_info ?? {})
      }
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin, isDean, search, user?.faculty_name])

  const loadInvitations = useCallback(async () => {
    if (!isSuperAdmin && !isDean) return
    setInvLoading(true)
    try {
      const resp = await invitationAPI.list()
      setInvitations(resp.data.results ?? [])
    } catch {
      toast.error('Failed to load invitations')
    } finally {
      setInvLoading(false)
    }
  }, [isSuperAdmin, isDean])

  const load = useCallback(async () => {
    await Promise.all([loadStaff(), loadInvitations()])
  }, [loadStaff, loadInvitations])

  useEffect(() => { load() }, [load])

  const openInvite = (preset?: InvitePreset) => {
    setInvitePreset(preset ?? null)
    setInviteOpen(true)
  }

  const handleStaffAction = async (
    userId: number,
    action: 'suspend' | 'reactivate' | 'remove'
  ) => {
    const labels = { suspend: 'suspend', reactivate: 'reactivate', remove: 'remove assignment for' }
    if (!confirm(`${action === 'remove' ? 'Remove assignment for' : action.charAt(0).toUpperCase() + action.slice(1)} this user?`)) return

    setActionUserId(userId)
    setOpenMenuId(null)
    try {
      if (action === 'suspend') await governanceStaffAPI.suspend(userId)
      else if (action === 'reactivate') await governanceStaffAPI.reactivate(userId)
      else await governanceStaffAPI.removeAssignment(userId)
      toast.success(`User ${labels[action]} successfully`)
      await load()
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Action failed') : 'Action failed')
    } finally {
      setActionUserId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter((u) => {
      const name = `${u.first_name} ${u.last_name}`.toLowerCase()
      const matchSearch = !q || name.includes(q) || (u.email ?? '').toLowerCase().includes(q)
      const matchRole =
        roleFilter === 'ALL' ||
        u.role === roleFilter ||
        (roleFilter === 'HOD' && u.role === 'DEPARTMENT_ADMIN')
      return matchSearch && matchRole
    })
  }, [users, search, roleFilter])

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const u of users) {
      counts[u.role] = (counts[u.role] ?? 0) + 1
    }
    return counts
  }, [users])

  const pendingCount = invitations.filter((i) =>
    !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(i.status) && !i.is_expired
  ).length

  return (
    <div className="space-y-5">
      {isSuperAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Governance Center', href: '/admin/governance' },
            { label: 'Leadership & Roles' },
          ]} />
        </div>
      )}

      {isDean && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4">
          <GovernanceBreadcrumb items={[
            { label: 'Faculty Center', href: '/faculty' },
            { label: 'Faculty Staff' },
          ]} />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {isSuperAdmin ? 'Leadership & Roles' : isDean ? 'Faculty Staff' : 'Users'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {(scopeInfo.note as string) ?? 'Scope-filtered staff list'} · {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(isSuperAdmin || isDean) && (
            <button
              type="button"
              onClick={() => openInvite()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-brand text-white text-sm font-semibold shadow-sm"
            >
              <UserPlus className="w-4 h-4" /> Invite staff
            </button>
          )}
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw className={cn('w-3.5 h-3.5', (loading || invLoading) && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {isDean && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'HODs', role: 'HOD' as RoleFilter, count: (roleCounts.HOD ?? 0) + (roleCounts.DEPARTMENT_ADMIN ?? 0) },
            { label: 'Lecturers', role: 'EXAMINER' as RoleFilter, count: roleCounts.EXAMINER ?? 0 },
            { label: 'Total Staff', role: 'ALL' as RoleFilter, count: users.length },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setRoleFilter(s.role)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition-all',
                roleFilter === s.role
                  ? 'border-brand-300 bg-brand-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="text-2xl font-bold text-slate-900 tabular-nums">{s.count}</div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {(isSuperAdmin || isDean) && (
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
          {([
            { id: 'staff' as Tab, label: 'Active staff' },
            { id: 'invitations' as Tab, label: `Invitations${pendingCount ? ` (${pendingCount})` : ''}` },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isSuperAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Deans', role: 'FACULTY_ADMIN', icon: Shield },
            { label: 'HODs', role: 'HOD', icon: Users },
            { label: 'Lecturers', role: 'EXAMINER', icon: GraduationCap },
            { label: 'Total Staff', role: 'ALL', icon: Users },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setRoleFilter(s.role as RoleFilter)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left transition-all',
                roleFilter === s.role
                  ? 'border-brand-300 bg-brand-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="text-2xl font-bold text-slate-900 tabular-nums">
                {s.role === 'ALL' ? users.length : (roleCounts[s.role] ?? 0) + (s.role === 'HOD' ? (roleCounts.DEPARTMENT_ADMIN ?? 0) : 0)}
              </div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </button>
          ))}
        </div>
      )}

      {tab === 'invitations' && (isSuperAdmin || isDean) ? (
        <InvitationsPanel invitations={invitations} loading={invLoading} onRefresh={loadInvitations} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
              />
            </div>
            {isSuperAdmin && (
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="ALL">All roles</option>
                <option value="FACULTY_ADMIN">Deans</option>
                <option value="HOD">HODs</option>
                <option value="EXAMINER">Lecturers</option>
              </select>
            )}
            {isDean && (
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
              >
                <option value="ALL">All staff</option>
                <option value="HOD">HODs</option>
                <option value="EXAMINER">Lecturers</option>
              </select>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users found"
              description={isSuperAdmin ? 'No staff match your filters. Invite a Dean or HOD to get started.' : isDean ? 'No HODs or lecturers in your faculty yet.' : 'No lecturers in your scope.'}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
              {filtered.map((u) => (
                <div key={u.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {u.first_name?.[0] ?? 'U'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 truncate">{u.first_name} {u.last_name}</span>
                        <span className={cn(
                          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border',
                          ROLE_CLASS[u.role] ?? 'bg-slate-50 text-slate-600 border-slate-200'
                        )}>
                          {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 truncate">{u.email ?? '—'}</div>
                      {(isSuperAdmin || isDean) && (u.faculty_name || u.department_name) && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {[u.faculty_name, u.department_name].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isSuperAdmin && (
                      <div className="text-xs font-medium text-slate-600 text-right">
                        {u.assigned_courses?.length ?? 0} course{(u.assigned_courses?.length ?? 0) !== 1 ? 's' : ''}
                      </div>
                    )}
                    <div className={cn('text-[10px] font-semibold uppercase', u.is_active ? 'text-emerald-600' : 'text-red-500')}>
                      {u.is_active ? 'Active' : 'Suspended'}
                    </div>
                    {isSuperAdmin && GOVERNABLE_ROLES.has(u.role) && (
                      <div className="relative">
                        <button
                          type="button"
                          disabled={actionUserId === u.id}
                          onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                          className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenuId === u.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-sm">
                              {u.is_active ? (
                                <button
                                  type="button"
                                  onClick={() => handleStaffAction(u.id, 'suspend')}
                                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-amber-700 hover:bg-amber-50"
                                >
                                  <Ban className="w-3.5 h-3.5" /> Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleStaffAction(u.id, 'reactivate')}
                                  className="w-full px-3 py-2 text-left flex items-center gap-2 text-emerald-700 hover:bg-emerald-50"
                                >
                                  <UserCheck className="w-3.5 h-3.5" /> Reactivate
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStaffAction(u.id, 'remove')}
                                className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-600 hover:bg-red-50"
                              >
                                <UserMinus className="w-3.5 h-3.5" /> Remove assignment
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isSuperAdmin && (
        <p className="text-xs text-slate-400">
          Invite Deans and HODs from here or from Academic Structure. Suspended users cannot sign in; remove assignment clears their faculty/department role.
        </p>
      )}

      <InviteLeaderModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={load}
        preset={invitePreset}
        inviterRole={isDean ? 'FACULTY_ADMIN' : 'SUPER_ADMIN'}
        lockedFacultyId={isDean ? user?.faculty_id : undefined}
        lockedFacultyName={
          isDean ? (user?.faculty_name ?? undefined) : undefined
        }
      />
    </div>
  )
}
