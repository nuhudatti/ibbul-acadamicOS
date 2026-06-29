'use client'

import type { Lesson } from '@/lib/types'
import { LiveReadingView } from './live-reading-view'
import { VideoEngineView } from './video-engine-view'
import { PdfEngineView } from './pdf-engine-view'
import { ExamQuizEngine } from './exam-quiz-engine'
import { SecureAssignmentEditor } from './secure-assignment-editor'
import { ExternalLink } from 'lucide-react'
import { resolveLessonExternalUrl } from '@/lib/learning-media'

export function LessonEngineView({
  lesson,
  isInstructor,
  onQuizPassed,
  onAssignmentSubmitted,
}: {
  lesson: Lesson
  isInstructor: boolean
  onQuizPassed?: () => void
  onAssignmentSubmitted?: () => void
}) {
  switch (lesson.content_type) {
    case 'quiz':
      return lesson.quiz ? (
        <ExamQuizEngine quiz={lesson.quiz} isInstructor={isInstructor} onPassed={onQuizPassed} />
      ) : null
    case 'assignment':
      return lesson.assignment ? (
        <SecureAssignmentEditor
          assignment={lesson.assignment}
          lessonId={lesson.id}
          onSubmitted={onAssignmentSubmitted}
        />
      ) : null
    case 'video':
      return <VideoEngineView lesson={lesson} />
    case 'pdf':
      return <PdfEngineView lesson={lesson} isInstructor={isInstructor} />
    case 'link': {
      const url = resolveLessonExternalUrl(lesson)
      return url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-6 rounded-2xl border border-brand-200 bg-brand-50 hover:bg-brand-100 transition-colors"
        >
          <ExternalLink className="w-5 h-5 text-brand-700" />
          <span className="font-medium text-brand-900 break-all">{url}</span>
        </a>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No external link configured for this step.
        </div>
      )
    }
    case 'html':
    default:
      return (
        <LiveReadingView
          lessonId={lesson.id}
          title={lesson.title}
          html={lesson.content_body || ''}
          isInstructor={isInstructor}
        />
      )
  }
}
