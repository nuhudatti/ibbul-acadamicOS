'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, CheckCircle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { authAPI } from '@/lib/api'
import { cn } from '@/lib/utils'
import { extractFormError } from '@/lib/api-errors'
import { AuthShell } from '@/components/auth/auth-shell'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const uid = searchParams.get('uid') ?? ''
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const missingParams = !uid || !token

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await authAPI.forgotPasswordConfirm({
        uidb64: uid,
        token,
        new_password: password,
        new_password_confirm: confirm,
      })
      setDone(true)
      toast.success('Password updated — you can sign in now')
      setTimeout(() => router.push('/login'), 2200)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { errors?: Record<string, string[]>; error?: string }
        setError(
          extractFormError(
            data,
            'Could not reset password. The link may have expired — request a new one.',
          ),
        )
      } else {
        setError('Connection error. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (missingParams) {
    return (
      <AuthShell
        title="Invalid reset link"
        subtitle="Open the complete link from your email, or request a new reset."
        backHref="/forgot-password"
        backLabel="Request new reset link"
      >
        <p className="text-sm text-slate-600 text-center">
          The reset URL is missing required parameters. Check your inbox for the full message from the university.
        </p>
      </AuthShell>
    )
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Redirecting you to sign in…" backHref="/login">
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600">Your new password is active. You may close this tab and sign in.</p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Set new password"
      subtitle="Choose a strong password for your academic account"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">New password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              className={cn(
                'w-full h-10 px-3.5 pr-10 rounded-xl border bg-slate-50 text-sm outline-none',
                'focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
                error ? 'border-red-400' : 'border-slate-200'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">Confirm password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError('') }}
            className={cn(
              'w-full h-10 px-3.5 rounded-xl border bg-slate-50 text-sm outline-none',
              'focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
              error ? 'border-red-400' : 'border-slate-200'
            )}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Reset password" subtitle="Loading secure form…" backHref={undefined}>
          <div className="flex justify-center py-6">
            <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
          </div>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
