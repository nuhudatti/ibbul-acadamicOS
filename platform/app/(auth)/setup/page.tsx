'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck, Building2, Mail, Lock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { coreAPI } from '@/lib/api'
import { AuthFrame } from '@/components/auth/auth-frame'
import { cn } from '@/lib/utils'

export default function SetupPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    institution_name: 'Ibrahim Badamasi Babangida University, Lapai',
    platform_name: 'IBBUL Academic OS',
    tagline: 'Learning for Service',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    confirm: '',
  })

  useEffect(() => {
    coreAPI
      .getSetupStatus()
      .then((res) => {
        if (!res.data.setup_required) {
          router.replace('/login')
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      await coreAPI.completeSetup({
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        institution_name: form.institution_name.trim(),
        platform_name: form.platform_name.trim(),
        tagline: form.tagline.trim(),
      })
      toast.success('Setup complete — sign in with your email. Use Forgot password anytime.')
      router.replace('/login')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        toast.error(err.response?.data?.error ?? 'Setup failed')
      } else {
        toast.error('Setup failed')
      }
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <AuthFrame title="Checking system…" backHref={undefined}>
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      </AuthFrame>
    )
  }

  return (
    <AuthFrame
      title="Enterprise installation"
      subtitle="One-time setup — creates your Super Admin account"
      backHref={undefined}
      wide
    >
      <div className="mb-6 flex items-center justify-center gap-2">
        {[1, 2].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={cn(
              'h-2 rounded-full transition-all',
              step === s ? 'w-8 bg-brand-600' : 'w-2 bg-slate-200'
            )}
            aria-label={`Step ${s}`}
          />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {step === 1 && (
          <>
            <div className="flex items-center gap-2 text-brand-700 mb-2">
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Institution</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">University name</label>
                <input
                  className="auth-input"
                  value={form.institution_name}
                  onChange={(e) => setForm((p) => ({ ...p, institution_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Platform name</label>
                <input
                  className="auth-input"
                  value={form.platform_name}
                  onChange={(e) => setForm((p) => ({ ...p, platform_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tagline</label>
                <input
                  className="auth-input"
                  value={form.tagline}
                  onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="auth-submit w-full mt-4"
            >
              Continue
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center gap-2 text-brand-700 mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Super Admin account</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-3">
              Use your official ICT email. Password reset works via Forgot password on the login page.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">First name</label>
                <input
                  required
                  className="auth-input"
                  value={form.first_name}
                  onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Last name</label>
                <input
                  required
                  className="auth-input"
                  value={form.last_name}
                  onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  className="auth-input pl-10"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="ict@ibbul.edu.ng"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  required
                  type="password"
                  minLength={8}
                  className="auth-input pl-10"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirm password</label>
              <input
                required
                type="password"
                className="auth-input"
                value={form.confirm}
                onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setStep(1)} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">
                Back
              </button>
              <button type="submit" disabled={loading} className="auth-submit flex-1">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Installing…</> : <>Complete setup <CheckCircle2 className="w-4 h-4 inline ml-1" /></>}
              </button>
            </div>
          </>
        )}
      </form>
    </AuthFrame>
  )
}
