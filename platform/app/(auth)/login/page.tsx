'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { authAPI, tokenStorage, coreAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { cn, isTokenExpired } from '@/lib/utils'
import { extractFormError } from '@/lib/api-errors'
import type { LoginResponse } from '@/lib/types'
import axios from 'axios'
import { AuthFrame } from '@/components/auth/auth-frame'

export default function LoginPage() {
  const router = useRouter()
  const { setUser, setTokens, isAuthenticated, _hasHydrated } = useAuthStore()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ username?: string; password?: string; general?: string }>({})

  useEffect(() => {
    coreAPI
      .getSetupStatus()
      .then((res) => {
        if (res.data.setup_required) router.replace('/setup')
      })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    if (!_hasHydrated) return
    const access = tokenStorage.getAccess()
    if (isAuthenticated && access && !isTokenExpired(access)) {
      router.replace('/dashboard')
    }
  }, [_hasHydrated, isAuthenticated, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedUsername) {
      setErrors({ username: 'Enter your matric or email' })
      return
    }
    if (!trimmedPassword) {
      setErrors({ password: 'Enter your password' })
      return
    }

    setLoading(true)
    try {
      const response = await authAPI.login({ username: trimmedUsername, password: trimmedPassword })
      const data = response.data as LoginResponse

      setUser(data.user)
      setTokens(data.tokens.access, data.tokens.refresh)

      const displayName = data.user.first_name || data.user.full_name || 'there'
      toast.success(`Welcome back, ${displayName}!`)

      if (data.user.is_first_login) {
        router.replace('/first-login')
        return
      }

      router.replace('/dashboard')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        setErrors({
          general: extractFormError(data, 'Invalid credentials. Please check your details.'),
        })
      } else {
        setErrors({ general: 'Connection error. Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthFrame>
      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.general && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200/80 bg-red-50/80 px-3 py-2.5 text-xs text-red-700">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
            <span>{errors.general}</span>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-1 block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Matric / Email
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setErrors((prev) => ({ ...prev, username: undefined, general: undefined }))
              }}
              placeholder="U22/FNS/CSC/0001"
              className={cn('auth-input', errors.username && 'auth-input-error')}
            />
            {errors.username && <p className="mt-1 text-[11px] text-red-600">{errors.username}</p>}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-medium text-navy-700/80 transition-colors hover:text-gold-700"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrors((prev) => ({ ...prev, password: undefined, general: undefined }))
                }}
                placeholder="••••••••"
                className={cn('auth-input pr-9', errors.password && 'auth-input-error')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-[11px] text-red-600">{errors.password}</p>}
          </div>
        </div>

        <button type="submit" disabled={loading} className="auth-submit">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>

        <p className="text-center text-[10px] text-slate-500/90">
          <ShieldCheck className="mr-0.5 inline-block h-3 w-3 align-[-2px] text-brand-700" />
          Secured ·{' '}
          <a href="mailto:ict@ibbul.edu.ng" className="text-navy-700 hover:underline">
            ICT Support
          </a>
        </p>
      </form>
    </AuthFrame>
  )
}
