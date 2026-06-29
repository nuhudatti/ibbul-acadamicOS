'use client'

import { useEffect, useState } from 'react'
import { learningAPI } from '@/lib/api'
import { buildBackendMediaUrl, type LessonMediaUrls } from '@/lib/learning-media'

export function useLessonMediaAccess(lessonId: number) {
  const [media, setMedia] = useState<LessonMediaUrls | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    learningAPI
      .getLessonMediaAccess(lessonId)
      .then((res) => {
        if (cancelled) return
        const data = res.data
        if (!data.has_media || !data.view_url || !data.download_url) {
          setMedia(null)
          return
        }
        if (data.external) {
          setMedia({
            viewUrl: data.view_url,
            downloadUrl: data.download_url,
            filename: data.filename || 'download',
            external: true,
          })
          return
        }
        setMedia({
          viewUrl: buildBackendMediaUrl(data.view_url),
          downloadUrl: buildBackendMediaUrl(data.download_url),
          filename: data.filename || 'download',
          external: false,
        })
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
