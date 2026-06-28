'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { authAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { extractFormError, formatApiErrorValue } from '@/lib/api-errors'
import axios from 'axios'

const RULES = [
  { label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { label: 'Contains a letter',     test: (v: string) => /[a-zA-Z]/.test(v) },
  { label: 'Contains a number',     test: (v: string) => /\d/.test(v) },
]

export default function FirstLoginPage() {
  const router = useRouter()
  const { user, setUser } = useAuthStore()

  const [form, setForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [show, setShow] = useState({ current: false, newPwd: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const strength = RULES.filter((r) => r.test(form.newPwd)).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    if (!form.current) { setErrors({ current: 'Enter your current (temporary) password' }); return }
    if (form.newPwd !== form.confirm) { setErrors({ confirm: 'Passwords do not match' }); return }
    if (strength < RULES.length) { setErrors({ newPwd: 'Password does not meet requirements' }); return }

    setLoading(true)
    try {
      await authAPI.firstLoginChangePassword({
        current_password: form.current,
        new_password: form.newPwd,
        new_password_confirm: form.confirm,
      })
      toast.success('Password changed successfully. Welcome!')
      if (user) setUser({ ...user, is_first_login: false })
      router.replace('/dashboard')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        if (data?.current_password) {
          setErrors({ current: formatApiErrorValue(data.current_password, 'Invalid current password') })
        } else if (data?.new_password) {
          setErrors({ newPwd: formatApiErrorValue(data.new_password, 'Invalid new password') })
        } else {
          setErrors({ general: extractFormError(data, 'Failed to change password') })
        }
      } else {
        setErrors({ general: 'Connection error. Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-slide-up">
      <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-modal overflow-hidden">
        <div className="gradient-navy px-8 pt-10 pb-7 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-400/30 backdrop-blur mb-4">
            <Lock className="w-7 h-7 text-gold-300" />
          </div>
          <h1 className="text-xl font-bold text-white">Set Your Password</h1>
          <p className="text-slate-400 text-sm mt-1.5">
            {user?.first_name ? `Hi ${user.first_name}, you` : 'You'} must change your temporary password before continuing
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pt-7 pb-8 space-y-4">
          {errors.general && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 animate-fade-in">
              {errors.general}
            </div>
          )}

          {(['current', 'newPwd', 'confirm'] as const).map((field) => (
            <div key={field} className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                {field === 'current' ? 'Current (temporary) password' : field === 'newPwd' ? 'New password' : 'Confirm new password'}
              </label>
              <div className="relative">
                <input
                  type={show[field] ? 'text' : 'password'}
                  value={form[field]}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, [field]: e.target.value }))
                    setErrors((p) => ({ ...p, [field]: undefined as unknown as string }))
                  }}
                  placeholder={field === 'current' ? 'Your temporary password' : field === 'newPwd' ? 'Choose a strong password' : 'Repeat new password'}
                  className={cn(
                    'w-full h-11 px-4 pr-11 rounded-xl border bg-slate-50 text-slate-900 placeholder:text-slate-400 text-sm outline-none transition-all',
                    'focus:bg-white focus:border-brand-500 focus:ring-3 focus:ring-brand-100',
                    errors[field]
                      ? 'border-red-400 bg-red-50 focus:border-red-400 focus:ring-red-100'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShow((p) => ({ ...p, [field]: !p[field] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {show[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors[field] && <p className="text-xs text-red-600">{errors[field]}</p>}
            </div>
          ))}

          {/* Password strength */}
          {form.newPwd && (
            <div className="space-y-2 animate-fade-in">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-all duration-300',
                      i < strength
                        ? strength === 3 ? 'bg-emerald-500' : strength === 2 ? 'bg-amber-400' : 'bg-red-400'
                        : 'bg-slate-200'
                    )}
                  />
                ))}
              </div>
              <ul className="space-y-0.5">
                {RULES.map((rule) => (
                  <li key={rule.label} className={cn(
                    'flex items-center gap-1.5 text-xs transition-colors',
                    rule.test(form.newPwd) ? 'text-emerald-600' : 'text-slate-400'
                  )}>
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      rule.test(form.newPwd) ? 'bg-emerald-500' : 'bg-slate-300'
                    )} />
                    {rule.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || strength < RULES.length}
            className={cn(
              'w-full h-11 mt-2 rounded-xl font-semibold text-sm text-white gradient-brand',
              'shadow-md hover:shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
            )}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Setting password…</>
            ) : (
              <><ShieldCheck className="w-4 h-4" /> Set password & continue</>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
