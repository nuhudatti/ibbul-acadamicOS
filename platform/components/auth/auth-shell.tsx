'use client'

import { AuthFrame } from '@/components/auth/auth-frame'

interface AuthShellProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  backHref?: string | undefined
  backLabel?: string
  wide?: boolean
}

/** Shared auth chrome — matches login (full backdrop + glass card). Hydration-safe. */
export function AuthShell({
  children,
  title,
  subtitle,
  backHref,
  backLabel = 'Back to sign in',
  wide,
}: AuthShellProps) {
  return (
    <AuthFrame title={title} subtitle={subtitle} backHref={backHref} backLabel={backLabel} wide={wide}>
      {children}
    </AuthFrame>
  )
}
