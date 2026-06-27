'use client'
import { useState } from 'react'
import { Eye, EyeOff, Loader2, User, Mail, Shield, Palette } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { authAPI } from '@/lib/api'
import { cn, getRoleLabel, getLevelLabel } from '@/lib/utils'
import { PlatformBrandingSettings } from '@/components/branding/platform-branding-settings'
import axios from 'axios'

type SettingsTab = 'profile' | 'password' | 'email' | 'branding'

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')

  const [pwForm, setPwForm] = useState({ current: '', newPwd: '', confirm: '' })
  const [pwShow, setPwShow] = useState({ current: false, newPwd: false, confirm: false })
  const [pwLoading, setPwLoading] = useState(false)
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})

  const [email, setEmail] = useState(user?.email ?? '')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwErrors({})
    if (pwForm.newPwd !== pwForm.confirm) {
      setPwErrors({ confirm: 'Passwords do not match' })
      return
    }
    setPwLoading(true)
    try {
      await authAPI.changePassword({
        current_password: pwForm.current,
        new_password: pwForm.newPwd,
        new_password_confirm: pwForm.confirm,
      })
      toast.success('Password changed successfully')
      setPwForm({ current: '', newPwd: '', confirm: '' })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        if (data?.current_password) setPwErrors({ current: data.current_password[0] })
        else if (data?.new_password) setPwErrors({ newPwd: data.new_password[0] })
        else setPwErrors({ general: data?.detail ?? 'Failed to change password' })
      } else {
        setPwErrors({ general: 'Connection error' })
      }
    } finally {
      setPwLoading(false)
    }
  }

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError('')
    setEmailLoading(true)
    try {
      const resp = await authAPI.updateEmail({ email })
      toast.success('Email updated')
      if (user) setUser({ ...user, email: resp.data.email ?? email })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        setEmailError(data?.email?.[0] ?? data?.detail ?? 'Failed to update email')
      } else {
        setEmailError('Connection error')
      }
    } finally {
      setEmailLoading(false)
    }
  }

  const TABS: { id: SettingsTab; label: string; icon: typeof User; show?: boolean }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'password', label: 'Security', icon: Shield },
    ...(user?.role === 'STUDENT' ? [{ id: 'email' as const, label: 'Email', icon: Mail }] : []),
    ...(isSuperAdmin ? [{ id: 'branding' as const, label: 'University Branding', icon: Palette }] : []),
  ]

  return (
    <div className={cn('space-y-6', activeTab === 'branding' ? 'max-w-3xl' : 'max-w-2xl')}>
      <div>
        <h1 className="font-display text-xl sm:text-2xl text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isSuperAdmin && activeTab === 'branding'
            ? 'Configure the official visual identity of IBBUL Academic OS'
            : 'Manage your account and security settings'}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.filter((t) => t.show !== false).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white text-brand-800 shadow-card ring-1 ring-brand-100'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'branding' && isSuperAdmin && <PlatformBrandingSettings />}

      {activeTab === 'profile' && user && (
        <div className="institutional-card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-800 pb-3 border-b border-slate-100">
            Account Information
          </h2>
          {[
            { label: 'Full Name',     value: user.full_name || `${user.first_name} ${user.last_name}` },
            { label: 'Student ID',    value: user.student_id ?? '—',     show: !!user.student_id },
            { label: 'Email',         value: user.email ?? '—' },
            { label: 'Role',          value: getRoleLabel(user.role) },
            { label: 'Department',    value: user.department_name ?? user.department ?? '—' },
            { label: 'Faculty',       value: user.faculty_name ?? '—',   show: !!user.faculty_name },
            { label: 'Level',         value: user.level ? getLevelLabel(user.level) : '—', show: user.role === 'STUDENT' },
            { label: 'Modules',       value: user.module_access.join(', ') || '—' },
            { label: 'Date Joined',   value: user.date_joined ? new Date(user.date_joined).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
            { label: 'Last Login',    value: user.last_login ? new Date(user.last_login).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
          ].filter((r) => r.show !== false).map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
              <span className="text-xs font-medium text-slate-500 w-28 flex-shrink-0">{row.label}</span>
              <span className="text-sm text-slate-800 text-right font-medium">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'password' && (
        <div className="institutional-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 pb-3 mb-5 border-b border-slate-100">
            Change Password
          </h2>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            {pwErrors.general && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {pwErrors.general}
              </div>
            )}
            {(['current', 'newPwd', 'confirm'] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  {field === 'current' ? 'Current password' : field === 'newPwd' ? 'New password' : 'Confirm new password'}
                </label>
                <div className="relative">
                  <input
                    type={pwShow[field] ? 'text' : 'password'}
                    value={pwForm[field]}
                    onChange={(e) => {
                      setPwForm((p) => ({ ...p, [field]: e.target.value }))
                      setPwErrors((p) => ({ ...p, [field]: '' }))
                    }}
                    className={cn(
                      'institutional-input pr-11',
                      pwErrors[field] ? 'border-red-400 bg-red-50' : ''
                    )}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setPwShow((p) => ({ ...p, [field]: !p[field] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {pwShow[field] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwErrors[field] && <p className="text-xs text-red-600">{pwErrors[field]}</p>}
              </div>
            ))}
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full h-10 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-all disabled:opacity-50"
            >
              {pwLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : 'Update Password'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'email' && user?.role === 'STUDENT' && (
        <div className="institutional-card p-6">
          <h2 className="text-sm font-semibold text-slate-800 pb-3 mb-5 border-b border-slate-100">
            Update Email Address
          </h2>
          <form onSubmit={handleEmailUpdate} className="space-y-4">
            {emailError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {emailError}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                placeholder="your@email.com"
                className="institutional-input"
              />
            </div>
            <button
              type="submit"
              disabled={emailLoading}
              className="w-full h-10 rounded-xl gradient-brand text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-all disabled:opacity-50"
            >
              {emailLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Email'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
