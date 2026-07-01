'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { learningAPI } from '@/lib/api'

export type SecureViolation = {
  type: string
  timestamp: string
  metadata?: Record<string, unknown>
}

interface UseSecureAssessmentOptions {
  enabled: boolean
  quizId?: number
  maxViolations?: number
  onAutoSubmit?: () => void
}

export function useSecureAssessment({
  enabled,
  quizId,
  maxViolations = 3,
  onAutoSubmit,
}: UseSecureAssessmentOptions) {
  const [violations, setViolations] = useState<SecureViolation[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const autoSubmitRef = useRef(onAutoSubmit)
  autoSubmitRef.current = onAutoSubmit
  const loggingRef = useRef(false)

  const logViolation = useCallback(
    async (eventType: string, metadata?: Record<string, unknown>) => {
      if (!enabled) return
      const entry: SecureViolation = {
        type: eventType,
        timestamp: new Date().toISOString(),
        metadata,
      }
      setViolations((prev) => {
        const next = [...prev, entry]
        if (next.length >= maxViolations) {
          toast.error('Maximum security violations reached — submitting automatically')
          setTimeout(() => autoSubmitRef.current?.(), 300)
        } else if (next.length === 1) {
          toast.warning('Stay on this page during the assessment. Tab switches are logged.')
        } else {
          toast.warning(`Security warning ${next.length}/${maxViolations}`)
        }
        return next
      })

      if (quizId && !loggingRef.current) {
        loggingRef.current = true
        try {
          const resp = await learningAPI.logQuizViolation(quizId, {
            event_type: eventType,
            metadata: metadata ?? {},
          })
          if (resp.data?.auto_submit) {
            setTimeout(() => autoSubmitRef.current?.(), 300)
          }
        } catch {
          // violations still sent on submit
        } finally {
          loggingRef.current = false
        }
      }
    },
    [enabled, quizId, maxViolations]
  )

  const enterFullscreen = useCallback(async () => {
    if (!enabled || typeof document === 'undefined') return
    try {
      const el = document.documentElement
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen) {
        await (el as HTMLElement & { webkitRequestFullscreen: () => Promise<void> }).webkitRequestFullscreen()
      }
      setIsFullscreen(true)
    } catch {
      toast.info('Fullscreen recommended for secure mode. Continue carefully.')
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        logViolation('tab_hidden')
      }
    }
    const onBlur = () => logViolation('window_blur')
    const onFullscreenChange = () => {
      const active = !!document.fullscreenElement
      setIsFullscreen(active)
      if (!active) logViolation('fullscreen_exit')
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [enabled, logViolation])

  return {
    violations,
    violationCount: violations.length,
    isFullscreen,
    enterFullscreen,
    logViolation,
  }
}
