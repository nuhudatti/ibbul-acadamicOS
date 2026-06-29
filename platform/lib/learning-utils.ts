import type { ContentType, Lesson, Module } from '@/lib/types'

export type PathStepStatus = 'completed' | 'active' | 'locked'

export interface PathStep {
  id: string
  index: number
  moduleId: number
  moduleTitle: string
  moduleIndex: number
  lesson: Lesson
  status: PathStepStatus
  lockReason?: string
  typeLabel: string
  typeIcon: 'lesson' | 'quiz' | 'assignment'
}

const TYPE_META: Record<ContentType, { label: string; icon: PathStep['typeIcon'] }> = {
  video: { label: 'Lesson', icon: 'lesson' },
  pdf: { label: 'Reading', icon: 'lesson' },
  html: { label: 'Lesson', icon: 'lesson' },
  link: { label: 'Resource', icon: 'lesson' },
  quiz: { label: 'Quiz', icon: 'quiz' },
  assignment: { label: 'Assignment', icon: 'assignment' },
}

export function getSemesterShort(semester: string) {
  if (semester === 'FIRST') return '1st Sem'
  if (semester === 'SECOND') return '2nd Sem'
  return semester
}

export function flattenLessons(modules: Module[] | undefined): Lesson[] {
  if (!modules) return []
  const sorted = [...modules].sort((a, b) => a.order - b.order)
  return sorted.flatMap((m) =>
    [...(m.lessons ?? [])].sort((a, b) => a.order - b.order)
  )
}

export function isLessonComplete(
  lesson: Lesson,
  extras?: { hasSubmission?: boolean; quizPassed?: boolean }
): boolean {
  if (lesson.progress?.completed) return true
  if (lesson.content_type === 'assignment' && extras?.hasSubmission) return true
  if (lesson.content_type === 'quiz' && extras?.quizPassed) return true
  return false
}

export function buildLearningPath(
  modules: Module[] | undefined,
  options?: {
    isInstructor?: boolean
    submissionByLessonId?: Record<number, boolean>
    quizPassedByLessonId?: Record<number, boolean>
  }
): PathStep[] {
  const sortedModules = [...(modules ?? [])].sort((a, b) => a.order - b.order)
  const raw: Omit<PathStep, 'status' | 'lockReason'>[] = []

  sortedModules.forEach((mod, moduleIndex) => {
    const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.order - b.order)
    lessons.forEach((lesson) => {
      const contentType = (lesson.content_type ?? 'html') as ContentType
      const meta = TYPE_META[contentType] ?? TYPE_META.html
      raw.push({
        id: `lesson-${lesson.id}`,
        index: raw.length,
        moduleId: mod.id,
        moduleTitle: mod.title,
        moduleIndex,
        lesson,
        typeLabel: meta.label,
        typeIcon: meta.icon,
      })
    })
  })

  if (options?.isInstructor) {
    return raw.map((s) => ({ ...s, status: 'active' as const }))
  }

  let activeAssigned = false
  return raw.map((step, i) => {
    const complete = isLessonComplete(step.lesson, {
      hasSubmission: options?.submissionByLessonId?.[step.lesson.id],
      quizPassed: options?.quizPassedByLessonId?.[step.lesson.id],
    })

    if (complete) {
      return { ...step, status: 'completed' as const }
    }

    if (!activeAssigned) {
      activeAssigned = true
      return { ...step, status: 'active' as const }
    }

    const prev = raw[i - 1]
    return {
      ...step,
      status: 'locked' as const,
      lockReason: prev
        ? `Complete "${prev.lesson.title}" to unlock`
        : 'Complete previous steps first',
    }
  })
}

export function getActiveStep(steps: PathStep[]): PathStep | null {
  return steps.find((s) => s.status === 'active') ?? null
}

export function getStepByLessonId(steps: PathStep[], lessonId: number): PathStep | undefined {
  return steps.find((s) => s.lesson.id === lessonId)
}

export function allStepsComplete(steps: PathStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status === 'completed')
}

export function getNextLesson(
  modules: Module[] | undefined,
  currentLessonId: number
): Lesson | null {
  const all = flattenLessons(modules)
  const idx = all.findIndex((l) => l.id === currentLessonId)
  if (idx < 0 || idx >= all.length - 1) return null
  return all[idx + 1]
}

export function getPrevLesson(
  modules: Module[] | undefined,
  currentLessonId: number
): Lesson | null {
  const all = flattenLessons(modules)
  const idx = all.findIndex((l) => l.id === currentLessonId)
  if (idx <= 0) return null
  return all[idx - 1]
}

export function offeringProgress(modules: Module[] | undefined) {
  const lessons = flattenLessons(modules)
  const total = lessons.length
  const completed = lessons.filter((l) => l.progress?.completed).length
  return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 }
}

export function isYouTubeOrVimeo(url: string | null | undefined): boolean {
  const value = (url ?? '').trim()
  if (!value) return false
  return /youtube\.com|youtu\.be|vimeo\.com/i.test(value)
}

export function getVideoEmbedUrl(url: string | null | undefined): string | null {
  const value = (url ?? '').trim()
  if (!value) return null
  try {
    const u = new URL(value)
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {
    return null
  }
  return null
}

export const CONTENT_TYPE_OPTIONS = [
  { value: 'html', label: 'Text / Reading', desc: 'Rich text lesson content' },
  { value: 'video', label: 'Video', desc: 'YouTube, Vimeo, or video URL' },
  { value: 'link', label: 'External link', desc: 'Open a resource in new tab' },
  { value: 'pdf', label: 'PDF document', desc: 'Link to a PDF file' },
  { value: 'quiz', label: 'Quiz (CBT)', desc: 'Multiple choice with auto-grading' },
  { value: 'assignment', label: 'Assignment', desc: 'Written submission from students' },
] as const

/** Extract a readable message from a failed learning API call */
export function getLearningApiError(err: unknown, fallback = 'Request failed'): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data
    if (typeof data === 'string') return data
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>
      if (typeof obj.detail === 'string') return obj.detail
      const [key, val] = Object.entries(obj)[0] ?? []
      if (key && val) {
        const msg = Array.isArray(val) ? val[0] : val
        return typeof msg === 'string' ? `${key}: ${msg}` : fallback
      }
    }
  }
  return fallback
}

export function sanitizeHtml(html: string): string {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('script').forEach((s) => s.remove())
  return div.innerHTML
}