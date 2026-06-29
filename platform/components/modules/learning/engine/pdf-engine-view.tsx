'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react'
import type { Lesson } from '@/lib/types'
import { useLessonMediaAccess } from '@/lib/use-lesson-media'
import { useLiveSync } from './use-live-sync'
import { MediaDownloadBar } from './media-download-bar'
import { LButton } from '../learning-ui'

export function PdfEngineView({
  lesson,
  isInstructor,
}: {
  lesson: Lesson
  isInstructor: boolean
}) {
  const { media, loading } = useLessonMediaAccess(lesson.id)
  const [page, setPage] = useState(1)
  const [embedError, setEmbedError] = useState(false)
  const { followLecturer, setFollowLecturer, live, isInstructor: inst, broadcastScroll } = useLiveSync(
    lesson.id,
    isInstructor
  )

  useEffect(() => {
    setEmbedError(false)
  }, [media?.viewUrl])

  useEffect(() => {
    if (inst) broadcastScroll(0, page)
  }, [page, inst, broadcastScroll])

  if (loading) {
    return (
      <div className="h-96 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center text-sm text-slate-500 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
        <p>Loading PDF…</p>
      </div>
    )
  }

  if (!media?.viewUrl) {
    return (
      <div className="h-96 rounded-2xl bg-slate-50 border border-dashed border-slate-200 flex flex-col items-center justify-center text-sm text-slate-500 gap-2">
        <FileText className="w-10 h-10 text-slate-300" />
        <p>No PDF attached yet</p>
        <p className="text-xs text-slate-400">Your lecturer can upload a PDF in the course studio</p>
      </div>
    )
  }

  const displayPage = !inst && followLecturer && live.active ? live.page : page
  const filename = media.filename
  const viewerUrl = `${media.viewUrl}#page=${displayPage}&view=FitH&toolbar=1`

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <FileText className="w-4 h-4 text-red-500" /> PDF document
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          {!inst && (
            <LButton variant={followLecturer ? 'primary' : 'secondary'} size="sm" onClick={() => setFollowLecturer(!followLecturer)}>
              {followLecturer ? 'Following lecturer' : 'Follow lecturer'}
            </LButton>
          )}
          <LButton variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="w-4 h-4" />
          </LButton>
          <span className="text-xs font-mono text-slate-500 min-w-[4rem] text-center">Page {displayPage}</span>
          <LButton variant="ghost" size="sm" onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </LButton>
        </div>
      </div>

      <MediaDownloadBar viewUrl={media.viewUrl} downloadUrl={media.downloadUrl} filename={filename} label="PDF" />

      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shadow-inner min-h-[480px]">
        {!embedError ? (
          <embed
            key={viewerUrl}
            src={viewerUrl}
            type="application/pdf"
            title={lesson.title}
            className="w-full h-[75vh] min-h-[480px] bg-white block"
          />
        ) : (
          <div className="h-[75vh] min-h-[480px] flex flex-col items-center justify-center gap-4 p-8 bg-white text-center">
            <FileText className="w-12 h-12 text-red-400" />
            <p className="text-sm font-medium text-slate-700">Inline preview unavailable in this browser</p>
            <p className="text-xs text-slate-500 max-w-sm">
              Use download or open in a new tab — your PDF is ready and saved on the server.
            </p>
            <MediaDownloadBar viewUrl={media.viewUrl} downloadUrl={media.downloadUrl} filename={filename} label="PDF" />
          </div>
        )}
      </div>

      {inst && (
        <p className="text-xs text-slate-500">
          Tip: use page controls while teaching — students following you will sync to your page.
        </p>
      )}
    </div>
  )
}
