'use client'

import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { Lesson } from '@/lib/types'
import { useLessonMediaAccess } from '@/lib/use-lesson-media'
import { getVideoEmbedUrl, isYouTubeOrVimeo } from '@/lib/learning-utils'

export function VideoEngineView({ lesson }: { lesson: Lesson }) {
  const { media, loading } = useLessonMediaAccess(lesson.id)
  const videoRef = useRef<HTMLVideoElement>(null)
  const storageKey = `lms_video_${lesson.id}`

  const url = media?.viewUrl || lesson.external_url?.trim() || ''

  useEffect(() => {
    const v = videoRef.current
    if (!v || isYouTubeOrVimeo(url)) return
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      v.currentTime = parseFloat(saved)
    }
    const save = () => localStorage.setItem(storageKey, String(v.currentTime))
    v.addEventListener('timeupdate', save)
    return () => v.removeEventListener('timeupdate', save)
  }, [url, storageKey])

  if (loading) {
    return (
      <div className="aspect-video rounded-2xl bg-slate-100 flex flex-col items-center justify-center text-sm text-slate-500 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        <p>Loading video…</p>
      </div>
    )
  }

  if (!url) {
    return (
      <div className="aspect-video rounded-2xl bg-slate-100 flex items-center justify-center text-sm text-slate-500">
        No video attached — upload a file or add a URL in the course studio
      </div>
    )
  }

  if (isYouTubeOrVimeo(url)) {
    const embed = getVideoEmbedUrl(url)
    if (embed) {
      return (
        <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-xl ring-1 ring-slate-200/80">
          <iframe src={embed} title={lesson.title} className="w-full h-full" allowFullScreen />
        </div>
      )
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-2xl overflow-hidden bg-black shadow-xl ring-1 ring-slate-200/80">
        <video
          ref={videoRef}
          src={url}
          controls
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className="w-full aspect-video"
          playsInline
          preload="metadata"
        />
        <p className="text-[11px] text-slate-400 bg-slate-900 px-4 py-2">
          Stream only — progress saved automatically
        </p>
      </div>
    </div>
  )
}
