'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Mail, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { invitationAPI } from '@/lib/api'
import { loadAcademicTree, type TreeFaculty } from '@/lib/governance'
import { cn } from '@/lib/utils'

export type InvitePreset = {
  role: 'FACULTY_ADMIN' | 'DEPARTMENT_ADMIN' | 'EXAMINER'
  facultyId?: number | null
  facultyName?: string
  departmentId?: number | null
  departmentName?: string
}

interface InviteLeaderModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  preset?: InvitePreset | null
  /** When set, limits role options and locks faculty to dean scope */
  inviterRole?: 'SUPER_ADMIN' | 'FACULTY_ADMIN'
  lockedFacultyId?: number | null
  lockedFacultyName?: string
}

const ALL_ROLE_OPTIONS = [
  { value: 'FACULTY_ADMIN', label: 'Faculty Dean' },
  { value: 'DEPARTMENT_ADMIN', label: 'Head of Department (HOD)' },
  { value: 'EXAMINER', label: 'Lecturer' },
] as const

const DEAN_ROLE_OPTIONS = [
  { value: 'DEPARTMENT_ADMIN', label: 'Head of Department (HOD)' },
  { value: 'EXAMINER', label: 'Lecturer' },
] as const

export function InviteLeaderModal({
  open,
  onClose,
  onSuccess,
  preset,
  inviterRole = 'SUPER_ADMIN',
  lockedFacultyId,
  lockedFacultyName,
}: InviteLeaderModalProps) {
  const [tree, setTree] = useState<TreeFaculty[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<InvitePreset['role']>('DEPARTMENT_ADMIN')
  const [facultyId, setFacultyId] = useState<number | ''>('')
  const [departmentId, setDepartmentId] = useState<number | ''>('')

  const isDeanInviter = inviterRole === 'FACULTY_ADMIN'
  const roleOptions = isDeanInviter ? DEAN_ROLE_OPTIONS : ALL_ROLE_OPTIONS

  useEffect(() => {
    if (!open) return
    setEmail('')
    setFirstName('')
    setLastName('')
    setRole(preset?.role ?? (isDeanInviter ? 'DEPARTMENT_ADMIN' : 'DEPARTMENT_ADMIN'))
    setFacultyId(preset?.facultyId ?? lockedFacultyId ?? '')
    setDepartmentId(preset?.departmentId ?? '')
  }, [open, preset, isDeanInviter, lockedFacultyId])

  useEffect(() => {
    if (!open) return
    setLoadingTree(true)
    loadAcademicTree()
      .then((all) => {
        if (lockedFacultyId) {
          const mine = all.filter((f) => f.id === lockedFacultyId)
          setTree(mine.length ? mine : all)
        } else {
          setTree(all)
        }
      })
      .catch(() => toast.error('Failed to load faculties'))
      .finally(() => setLoadingTree(false))
  }, [open, lockedFacultyId])

  const departments = useMemo(() => {
    if (!facultyId) return []
    return tree.find((f) => f.id === facultyId)?.departments ?? []
  }, [tree, facultyId])

  const needsFaculty = role === 'FACULTY_ADMIN' && !isDeanInviter
  const needsDepartment = role === 'DEPARTMENT_ADMIN' || role === 'EXAMINER'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !firstName.trim() || !lastName.trim()) {
      toast.error('Email and full name are required')
      return
    }
    if (needsFaculty && !facultyId) {
      toast.error('Select a faculty for Dean invitation')
      return
    }
    if (needsDepartment && !departmentId) {
      toast.error('Select a department')
      return
    }

    setSubmitting(true)
    try {
      const resp = await invitationAPI.create({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role,
        faculty_id: isDeanInviter ? ((lockedFacultyId ?? facultyId) || null) : (facultyId || null),
        department_id: departmentId || null,
      })
      const inv = resp.data.invitation
      if (inv.invite_url) {
        try {
          await navigator.clipboard.writeText(inv.invite_url)
          toast.success('Invitation sent — link copied to clipboard')
        } catch {
          toast.success('Invitation created — copy the link from the invitations table')
        }
      } else {
        toast.success(resp.data.message)
      }
      onSuccess()
      onClose()
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.error ?? 'Failed to send invitation')
        : 'Failed to send invitation'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Invite staff leader</h2>
              <p className="text-xs text-slate-500">Email invitation with secure activation link</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {(preset?.facultyName || lockedFacultyName) && (
            <div className="rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800">
              Faculty scope: <strong>{preset?.facultyName ?? lockedFacultyName}</strong>
              {preset?.departmentName ? <> · Department: <strong>{preset.departmentName}</strong></> : null}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                placeholder="Amina"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                placeholder="Ibrahim"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Official email</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                placeholder="dean@ibbul.edu.ng"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Role</label>
            <select
              value={role}
              onChange={(e) => {
                const r = e.target.value as InvitePreset['role']
                setRole(r)
                if (r === 'FACULTY_ADMIN') setDepartmentId('')
              }}
              disabled={!!preset?.role}
              className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-60"
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {(needsFaculty || needsDepartment) && (
            <div className={cn('grid gap-3', needsFaculty && needsDepartment ? 'grid-cols-2' : 'grid-cols-1')}>
              {needsFaculty && (
                <div>
                  <label className="text-xs font-medium text-slate-600">Faculty</label>
                  <select
                    value={facultyId}
                    onChange={(e) => {
                      setFacultyId(e.target.value ? Number(e.target.value) : '')
                      setDepartmentId('')
                    }}
                    disabled={!!preset?.facultyId || !!lockedFacultyId || loadingTree}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-60"
                  >
                    <option value="">Select faculty…</option>
                    {tree.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {needsDepartment && (
                <div className={needsFaculty ? '' : 'col-span-1'}>
                  <label className="text-xs font-medium text-slate-600">Department</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : '')}
                    disabled={!!preset?.departmentId || loadingTree || ((needsFaculty || isDeanInviter) && !facultyId)}
                    className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white disabled:opacity-60"
                  >
                    <option value="">Select department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            A secure link is emailed to their inbox (valid 7 days). You can also copy the link from the invitations table if delivery fails.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-10 rounded-xl gradient-brand text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
