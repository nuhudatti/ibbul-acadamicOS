'use client'

import { Radio, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/lib/learning-utils'
import { useLiveSync } from './use-live-sync'
import { LButton } from '../learning-ui'

export function LiveReadingView({
  lessonId,
  title,
  html,
  isInstructor,
}: {
  lessonId: number
  title: string
  html: string
  isInstructor: boolean
}) {
  const { scrollRef, followLecturer, setFollowLecturer, live, onScroll, isInstructor: inst } = useLiveSync(
    lessonId,
    isInstructor
  )

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <p className="text-xs font-medium text-slate-500">Live reading mode</p>
        {!inst && (
          <LButton
            variant={followLecturer ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFollowLecturer(!followLecturer)}
          >
            <Eye className="w-3.5 h-3.5" />
            {followLecturer ? 'Following lecturer' : 'Follow lecturer'}
          </LButton>
        )}
        {inst && (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
            <Radio className="w-3 h-3 animate-pulse" /> Broadcasting position
          </span>
        )}
      </div>

      {!inst && followLecturer && live.active && (
        <div className="mb-3 text-xs text-brand-700 bg-brand-50 rounded-lg px-3 py-2 border border-brand-100">
          Lecturer is at ~{Math.round(live.scroll_percent)}% · scroll freely, then re-sync anytime
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cn(
          'relative max-h-[70vh] overflow-y-auto rounded-xl',
          'prose prose-slate prose-lg max-w-none',
          'bg-white px-8 py-10 border border-slate-100 shadow-inner',
          'scroll-smooth'
        )}
      >
        {!inst && followLecturer && live.active && (
          <div
            className="pointer-events-none absolute left-0 right-0 h-0.5 bg-brand-600 z-10 shadow-lg shadow-brand-600/50"
            style={{ top: `${live.scroll_percent}%` }}
          >
            <span className="absolute -top-3 left-4 text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
              Lecturer here
            </span>
          </div>
        )}
        <article dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || `<h1>${title}</h1><p>Content coming soon.</p>`) }} />
      </div>
    </div>
  )
}
