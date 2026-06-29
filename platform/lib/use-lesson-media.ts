'use client'

import { useEffect, useState } from 'react'
import { learningAPI } from '@/lib/api'
import { buildBackendMediaUrl, type LessonMediaUrls } from '@/lib/learning-media'
import { safeStr, safeTrim } from '@/lib/safe-string'

export function useLessonMediaAccess(lessonId: number) {
  const [media, setMedia] = useState<LessonMediaUrls | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(lessonId) || lessonId <= 0) {
      setMedia(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(false)

    learningAPI
      .getLessonMediaAccess(lessonId)
      .then((res) => {
        if (cancelled) return
        const data = res?.data
        if (!data?.has_media) {
          setMedia(null)
          return
        }

        const viewPath = safeTrim(data.view_url)
        const downloadPath = safeTrim(data.download_url)
        const filename = safeStr(data.filename, 'download')

        if (!viewPath || !downloadPath) {
          setMedia(null)
          return
        }

        if (data.external) {
          setMedia({
            viewUrl: viewPath,
            downloadUrl: downloadPath,
            filename,
            external: true,
          })
          return
        }

        const viewUrl = buildBackendMediaUrl(viewPath)
        const downloadUrl = buildBackendMediaUrl(downloadPath)
        if (!viewUrl || !downloadUrl) {
          setMedia(null)
          return
        }

        setMedia({ viewUrl, downloadUrl, filename, external: false })
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setMedia(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lessonId])

  return { media, loading, error }
}
