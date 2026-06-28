'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Mail, UserPlus, GraduationCap, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { hodDepartmentAPI } from '@/lib/api'
import { extractApiError, toastInvitationOutcome } from '@/lib/invitation-feedback'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'

type InviteTab = 'lecturer' | 'student'

interface HodInviteUserModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function HodInviteUserModal({ open, onClose, onSuccess }: HodInviteUserModalProps) {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<InviteTab>('lecturer')
  const [submitting, setSubmitting] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [matric, setMatric] = useState('')

  useEffect(() => {
    if (!open) return
    setTab('lecturer')
    setFirstName('')
    setLastName('')
    setEmail('')
    setMatric('')
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error('Full name and email are required')
      return
    }
    if (tab === 'student') {
      const m = matric.trim().toUpperCase()
      if (!/^U\d{2}\/[A-Z]{3}\/[A-Z]{3}\/\d{4}$/.test(m)) {
        toast.error('Enter a valid matric number (e.g. U22/FNS/CSC/0001)')
        return
      }
    }

    setSubmitting(true)
    try {
      const resp = await hodDepartmentAPI.createInvitation({
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        role: tab === 'lecturer' ? 'EXAMINER' : 'STUDENT',
        student_id: tab === 'student' ? matric.trim().toUpperCase() : undefined,
      })
      await toastInvitationOutcome(resp.data.invitation, { serverMessage: resp.data.message })
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to send invitation'))
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
              <UserPlus className="w-4 h-4 text-brand-700" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Invite to department</h2>
              <p className="text-xs text-slate-500">Secure email link · valid 7 days</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 mb-4">
            {([
              { id: 'lecturer' as const, label: 'Lecturer', icon: BookOpen },
              { id: 'student' as const, label: 'Student', icon: GraduationCap },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-semibold transition-all',
                  tab === id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-brand-50 border border-brand-100 px-3 py-2 text-xs text-brand-800 mb-4">
            Department: <strong>{user?.department_name ?? 'Your department'}</strong>
            {tab === 'student' && (
              <span className="block mt-1 text-brand-700">Matric number becomes their primary login ID.</span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
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
            <label className="text-xs font-medium text-slate-600">Email address</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                placeholder={tab === 'student' ? 'student@email.com' : 'lecturer@ibbul.edu.ng'}
              />
            </div>
          </div>

          {tab === 'student' && (
            <div>
              <label className="text-xs font-medium text-slate-600">Matric number</label>
              <input
                value={matric}
                onChange={(e) => setMatric(e.target.value.toUpperCase())}
                className="mt-1 w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-400"
                placeholder="U22/FNS/CSC/0001"
              />
              <p className="text-[11px] text-slate-400 mt-1">Permanent academic ID — used for login and results.</p>
            </div>
          )}

          {tab === 'lecturer' && (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              Role: <strong>Lecturer</strong> · Assign courses after they accept, from the Assignments page.
            </div>
          )}

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
              className="flex-1 h-10 rounded-xl bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
