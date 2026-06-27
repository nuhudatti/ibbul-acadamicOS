'use client'

import { ExternalLink, FileText, Play } from 'lucide-react'
import type { Lesson } from '@/lib/types'
import { getVideoEmbedUrl, isYouTubeOrVimeo, sanitizeHtml } from '@/lib/learning-utils'

export function LessonContent({ lesson }: { lesson: Lesson }) {
  const url = lesson.external_url?.trim() || lesson.file_key?.trim() || ''

  if (lesson.content_type === 'video' && url) {
    if (isYouTubeOrVimeo(url)) {
      const embed = getVideoEmbedUrl(url)
      if (embed) {
        return (
          <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-200">
            <iframe
              src={embed}
              title={lesson.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
      }
    }
    return (
      <div className="aspect-video rounded-xl overflow-hidden bg-black border border-slate-200">
        <video src={url} controls className="w-full h-full" playsInline>
          Your browser does not support video.
        </video>
      </div>
    )
  }

  if (lesson.content_type === 'pdf' && url) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500" /> PDF Document
          </span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline flex items-center gap-1">
            Open in new tab <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <iframe src={url} title={lesson.title} className="w-full h-[70vh] min-h-[400px]" />
      </div>
    )
  }

  if (lesson.content_type === 'link' && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-5 rounded-xl border border-brand-200 bg-brand-50 hover:bg-brand-100 transition-colors"
      >
        <ExternalLink className="w-5 h-5 text-brand-600" />
        <span className="font-medium text-brand-800">{url}</span>
      </a>
    )
  }

  if (lesson.content_type === 'html' || lesson.content_body) {
    return (
      <div
        className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white p-6"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(lesson.content_body || '') }}
      />
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
      <Play className="w-8 h-8 mx-auto mb-2 text-slate-300" />
      <p className="text-sm">No content attached to this lesson yet.</p>
    </div>
  )
}
