'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Copy, Check, RefreshCw, Ban, Mail, Clock, AlertCircle, Users, GraduationCap, BookOpen, UserPlus,
  UserX, UserCheck, Trash2, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { hodDepartmentAPI, type StaffInvitationRecord } from '@/lib/api'
import { cn } from '@/lib/utils'

type FilterTab = 'pending' | 'accepted' | 'expired'

interface HodDepartmentInvitationsProps {
  invitations: StaffInvitationRecord[]
  loading: boolean
  onRefresh: () => void
  onInvite: () => void
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  SENT: 'bg-blue-50 text-blue-700 border-blue-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  REVOKED: 'bg-red-50 text-red-600 border-red-200',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

export function HodDepartmentInvitations({ invitations, loading, onRefresh, onInvite }: HodDepartmentInvitationsProps) {
  const [filter, setFilter] = useState<FilterTab>('pending')
  const [busyId, setBusyId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'pending') {
      return invitations.filter((i) => !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(i.status) && !i.is_expired)
    }
    if (filter === 'accepted') return invitations.filter((i) => i.status === 'ACCEPTED')
    return invitations.filter((i) => i.status === 'REVOKED' || i.status === 'EXPIRED' || i.is_expired)
  }, [invitations, filter])

  const handleResend = async (id: number) => {
    setBusyId(id)
    try {
      const resp = await hodDepartmentAPI.resendInvitation(id)
      if (resp.data.invitation.invite_url) {
        try {
          await navigator.clipboard.writeText(resp.data.invitation.invite_url)
          toast.success('Resent — link copied')
        } catch {
          toast.success('Invitation resent')
        }
      } else {
        toast.success('Invitation resent')
      }
      onRefresh()
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Resend failed') : 'Resend failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this invitation? The link will stop working.')) return
    setBusyId(id)
    try {
      await hodDepartmentAPI.revokeInvitation(id)
      toast.success('Invitation revoked')
      onRefresh()
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Revoke failed') : 'Revoke failed')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100">
          {([
            { id: 'pending' as const, label: 'Pending' },
            { id: 'accepted' as const, label: 'Accepted' },
            { id: 'expired' as const, label: 'Expired / Revoked' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                filter === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onInvite}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800"
        >
          <UserPlus className="w-4 h-4" /> Invite user
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-10 text-center">
          <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">No {filter} invitations</p>
          <button type="button" onClick={onInvite} className="mt-3 text-sm text-brand-700 font-semibold hover:text-brand-800">
            Send your first invitation
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((inv) => {
            const canAct = !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(inv.status) && !inv.is_expired
            const isBusy = busyId === inv.id
            const isStudent = inv.role === 'STUDENT'
            return (
              <div key={inv.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                      isStudent ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-700'
                    )}>
                      {isStudent ? <GraduationCap className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800">{inv.first_name} {inv.last_name}</div>
                      <div className="text-xs text-slate-500 truncate">{inv.email}</div>
                      {inv.student_id && (
                        <div className="text-xs font-mono text-emerald-700 mt-0.5">{inv.student_id}</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1">{inv.role_label}</div>
                    </div>
                  </div>
                  <span className={cn(
                    'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border',
                    STATUS_STYLE[inv.is_expired ? 'EXPIRED' : inv.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
                  )}>
                    {inv.is_expired ? 'Expired' : inv.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 mt-3">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Expires {formatDate(inv.expires_at)}</span>
                  {inv.accepted_at && <span>Accepted {formatDate(inv.accepted_at)}</span>}
                </div>

                {inv.delivery_error && (
                  <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5 mt-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {inv.delivery_error}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-3">
                  {inv.invite_url && <CopyLinkButton url={inv.invite_url} />}
                  {canAct && (
                    <>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResend(inv.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-brand-200 text-xs text-brand-800 hover:bg-brand-50 disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3 h-3', isBusy && 'animate-spin')} /> Resend
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRevoke(inv.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Ban className="w-3 h-3" /> Revoke
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function HodDepartmentLecturers({
  lecturers,
  loading,
  search,
  onSearchChange,
}: {
  lecturers: import('@/lib/api').HodLecturerRow[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
}) {
  if (loading) {
    return <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-2xl" />)}</div>
  }

  const filtered = lecturers.filter((l) => {
    const q = search.toLowerCase()
    if (!q) return true
    return l.full_name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search lecturers…"
        className="w-full max-w-sm h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
      />
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No lecturers in your department yet. Invite one to get started.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((l) => (
            <div key={l.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-800">{l.full_name}</div>
                  <div className="text-xs text-slate-500 truncate">{l.email}</div>
                </div>
                <span className={cn(
                  'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                  l.pending ? 'bg-amber-50 text-amber-700' : l.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                )}>
                  {l.pending ? 'Pending' : l.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {l.assigned_courses.length === 0
                  ? 'No courses assigned'
                  : `${l.assigned_courses.length} course${l.assigned_courses.length !== 1 ? 's' : ''}: ${l.assigned_courses.map((c) => c.code).join(', ')}`}
              </div>
              <Link
                href="/admin/assignments"
                className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-brand-700 hover:text-brand-800"
              >
                Assign courses →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function HodDepartmentStudents({
  students,
  loading,
  search,
  onSearchChange,
  onRefresh,
}: {
  students: import('@/lib/api').HodStudentRow[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  onRefresh?: () => void
}) {
  const [acting, setActing] = useState<number | null>(null)

  const runAction = async (
    student: import('@/lib/api').HodStudentRow,
    action: 'deactivate' | 'reactivate' | 'delete',
  ) => {
    const labels = {
      deactivate: `Deactivate ${student.student_id}? They cannot log in, but saved results stay on file.`,
      reactivate: `Reactivate ${student.student_id}? They will regain access to their results.`,
      delete: `Permanently remove ${student.student_id}? Only allowed when they have no results on file.`,
    }
    if (!confirm(labels[action])) return

    setActing(student.id)
    try {
      const resp =
        action === 'deactivate'
          ? await hodDepartmentAPI.deactivateStudent(student.id)
          : action === 'reactivate'
            ? await hodDepartmentAPI.reactivateStudent(student.id)
            : await hodDepartmentAPI.deleteStudent(student.id)
      toast.success(resp.data.message)
      onRefresh?.()
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error ?? 'Action failed'
        : 'Action failed'
      toast.error(msg)
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div>
  }

  const filtered = students.filter((s) => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      s.full_name.toLowerCase().includes(q)
      || (s.student_id ?? '').toLowerCase().includes(q)
      || (s.email ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by matric or name…"
        className="w-full max-w-sm h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
      />
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          No students in your department yet. Invite students to onboard them securely.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const pending = s.pending_activation ?? (!s.is_active && s.status === 'pending')
            const statusLabel = pending ? 'Pending activation' : s.is_active ? 'Active' : 'Deactivated'
            const statusClass = pending
              ? 'bg-amber-50 text-amber-700'
              : s.is_active
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            const busy = acting === s.id

            return (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-mono text-sm font-bold text-emerald-700">{s.student_id}</div>
              <div className="font-semibold text-slate-800 mt-1">{s.full_name}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.email ?? 'No email on file'}</div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-slate-400">{s.department_name}</span>
                <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full', statusClass)}>
                  {statusLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                {s.is_active ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(s, 'deactivate')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3" />}
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => runAction(s, 'reactivate')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                    Reactivate
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(s, 'delete')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Remove
                </button>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
