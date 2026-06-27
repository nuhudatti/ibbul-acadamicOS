'use client'

import { useState } from 'react'
import { Loader2, Mail, CheckCircle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { authAPI } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AuthShell } from '@/components/auth/auth-shell'

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!identifier.trim()) {
      setError('Please enter your Student ID or staff email')
      return
    }
    setLoading(true)
    try {
      await authAPI.forgotPassword({ reg_number_or_email: identifier.trim() })
      setSent(true)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        setError(data?.detail ?? data?.error ?? 'Failed to send reset email')
      } else {
        setError('Connection error. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If an account exists, a secure reset link has been sent"
      >
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            We sent a message to the email on file for{' '}
            <strong className="text-slate-800 font-mono text-xs">{identifier}</strong>.
            Check your inbox and spam folder — the link expires in one hour.
          </p>
          <button
            type="button"
            onClick={() => { setSent(false); setIdentifier('') }}
            className="text-xs text-brand-700 font-medium hover:underline"
          >
            Try a different ID or email
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Students: matric number · Staff: university email"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700" htmlFor="forgot-id">
            Matric number or email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="forgot-id"
              type="text"
              autoFocus
              autoComplete="username"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setError('') }}
              placeholder="U22/FNS/CSC/0001 or name@ibbul.edu.ng"
              className={cn(
                'w-full h-10 pl-10 pr-3.5 rounded-xl border bg-slate-50 text-sm outline-none',
                'focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-100',
                error ? 'border-red-400 bg-red-50' : 'border-slate-200'
              )}
            />
          </div>
          <p className="text-[11px] text-slate-400 pt-0.5">
            Pending students must use the invitation email link to activate first.
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  )
}
