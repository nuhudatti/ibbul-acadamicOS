'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { invitationAPI } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AuthShell } from '@/components/auth/auth-shell'

interface VerifyData {
  email: string
  first_name: string
  last_name: string
  role: string
  role_label: string
  student_id: string | null
  faculty_name: string | null
  department_name: string | null
  status: string
  is_expired: boolean
  expires_at: string | null
  can_accept: boolean
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [verifyLoading, setVerifyLoading] = useState(true)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [invite, setInvite] = useState<VerifyData | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setVerifyError('No invitation token in the link. Check your email for the full URL.')
      setVerifyLoading(false)
      return
    }
    invitationAPI.verify(token)
      .then((resp) => setInvite(resp.data as VerifyData))
      .catch((err) => {
        const msg = axios.isAxiosError(err)
          ? (err.response?.data?.error ?? 'Invalid invitation link')
          : 'Could not verify invitation'
        setVerifyError(msg)
      })
      .finally(() => setVerifyLoading(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      await invitationAPI.accept({ token, password, password_confirm: confirm })
      setDone(true)
      toast.success('Account activated — you can sign in now')
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Activation failed') : 'Activation failed')
    } finally {
      setSubmitting(false)
    }
  }

  const scopeLine = [invite?.faculty_name, invite?.department_name].filter(Boolean).join(' · ')

  if (verifyLoading) {
    return (
      <AuthShell title="Verifying invitation" subtitle="Please wait…" backHref={undefined}>
        <div className="flex flex-col items-center py-6 gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-sm">Checking your secure invitation link…</p>
        </div>
      </AuthShell>
    )
  }

  if (verifyError) {
    return (
      <AuthShell title="Invalid invitation" subtitle="The link may be incomplete or expired">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-50 text-red-500 mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <p className="text-sm text-red-700 font-medium">{verifyError}</p>
          <Link href="/login" className="inline-block text-sm text-brand-700 font-medium hover:underline">
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (done && invite) {
    return (
      <AuthShell title="Account activated" subtitle="You can sign in with your new password">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <p className="text-sm text-slate-600">
            {invite.first_name}, your {invite.role_label} account is ready.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full h-10 rounded-xl gradient-brand text-white text-sm font-semibold"
          >
            Sign in now
          </button>
        </div>
      </AuthShell>
    )
  }

  if (invite && !invite.can_accept) {
    return (
      <AuthShell
        title="Invitation unavailable"
        subtitle="Contact your administrator for a new link"
        backHref="/login"
      >
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-sm text-slate-700 font-medium">
            {invite.is_expired
              ? 'This invitation has expired.'
              : invite.status === 'ACCEPTED'
                ? 'This invitation was already accepted.'
                : invite.status === 'REVOKED'
                  ? 'This invitation has been revoked.'
                  : 'This invitation cannot be accepted.'}
          </p>
        </div>
      </AuthShell>
    )
  }

  if (!invite) return null

  return (
    <AuthShell
      title="Activate your account"
      subtitle="Set a secure password for your official academic profile"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm">
          <p className="font-semibold text-brand-900">
            {invite.first_name} {invite.last_name}
          </p>
          <p className="text-brand-700 text-xs mt-0.5">{invite.email}</p>
          {invite.student_id && (
            <p className="text-emerald-700 text-xs font-mono font-bold mt-1">Matric: {invite.student_id}</p>
          )}
          <p className="text-brand-600 text-xs mt-1">
            {invite.role_label}{scopeLine ? ` · ${scopeLine}` : ''}
          </p>
        </div>

        <p className="text-xs text-slate-500 text-center leading-relaxed">
          {invite.role === 'STUDENT'
            ? 'After activation, sign in with your matric number and this password.'
            : 'This password secures your staff account on the academic platform.'}
        </p>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="password">New password</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
              className="w-full h-10 px-3.5 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full h-10 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            placeholder="Repeat password"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className={cn(
            'w-full h-10 rounded-xl font-semibold text-sm text-white gradient-brand',
            'flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm'
          )}
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating…</> : 'Activate account'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Loading…" subtitle="Preparing invitation page" backHref={undefined}>
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          </div>
        </AuthShell>
      }
    >
      <AcceptInvitationContent />
    </Suspense>
  )
}
