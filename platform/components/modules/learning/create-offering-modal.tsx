'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { academicsAPI, coreAPI, learningAPI } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { cn, getSemesterLabel } from '@/lib/utils'

function defaultSessionLabel(): string {
  const y = new Date().getFullYear()
  return `${y}/${y + 1}`
}

function parseCourseList(data: unknown): AssignedCourse[] {
  if (Array.isArray(data)) return data as AssignedCourse[]
  if (data && typeof data === 'object') {
    const record = data as { results?: AssignedCourse[] }
    if (Array.isArray(record.results)) return record.results
  }
  return []
}

interface AssignedCourse {
  id: number
  code: string
  title: string
  level?: string
  semester?: string
}

interface CreateOfferingModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (offeringId?: number) => void
}

export function CreateOfferingModal({ open, onClose, onSuccess }: CreateOfferingModalProps) {
  const [courses, setCourses] = useState<AssignedCourse[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)
  const [courseId, setCourseId] = useState<number | ''>('')
  const [session, setSession] = useState('')
  const [semester, setSemester] = useState<'FIRST' | 'SECOND'>('FIRST')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setCourseId('')
    setDescription('')
    const load = async () => {
      setLoadingCourses(true)
      try {
        const [coursesResult, sessionResult] = await Promise.allSettled([
          academicsAPI.getMyAssignedCourses(),
          coreAPI.getCurrentSession(),
        ])

        let loaded: AssignedCourse[] = []
        if (coursesResult.status === 'fulfilled') {
          loaded = parseCourseList(coursesResult.value.data)
        } else {
          // Fallback: core course list is already scoped to examiner assignments
          try {
            const fallback = await coreAPI.getCourses()
            loaded = parseCourseList(fallback.data)
          } catch {
            toast.error(extractApiError(coursesResult.reason, 'Could not load your assigned courses'))
          }
        }
        setCourses(loaded)

        if (sessionResult.status === 'fulfilled') {
          const data = sessionResult.value.data as { name?: string; session?: string }
          setSession(data?.name ?? data?.session ?? defaultSessionLabel())
        } else {
          setSession(defaultSessionLabel())
        }
      } catch {
        toast.error('Could not load course offering form')
      } finally {
        setLoadingCourses(false)
      }
    }
    load()
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!courseId) {
      toast.error('Select a course from your assignments')
      return
    }
    setSubmitting(true)
    try {
      const resp = await learningAPI.createOffering({
        course: Number(courseId),
        session,
        semester,
        description,
        is_published: false,
      })
      const pin = resp.data.enrollment_pin
      toast.success(
        pin
          ? `Offering created — enrollment PIN: ${pin} (share with students)`
          : 'Offering created — add modules and lessons'
      )
      onSuccess(resp.data.id)
      onClose()
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const data = err.response?.data
        // DRF unique_together sends non_field_errors; field errors are arrays
        const msg =
          data?.detail ??
          data?.non_field_errors?.[0] ??
          Object.values(data ?? {}).flat().filter(Boolean).join(' · ') ??
          'Failed to create offering'
        // Make the unique_together message friendlier
        const friendly = typeof msg === 'string' && msg.includes('unique set')
          ? 'This course already has an offering for that session and semester. Use a different session, semester, or course.'
          : msg
        toast.error(friendly, { duration: 6000 })
      } else {
        toast.error('Failed to create offering')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-700 to-brand-800" />
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-brand-700" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Create Course Offering</h2>
              <p className="text-xs text-slate-500">From your assigned Academic Core courses</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {loadingCourses ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>
          ) : courses.length === 0 ? (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
              No assigned courses yet. Ask your HOD to assign courses under Administration → Assignments.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Course</label>
                <select
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                  required
                >
                  <option value="">Select assigned course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Session</label>
                  <input
                    value={session}
                    onChange={(e) => setSession(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Semester</label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value as 'FIRST' | 'SECOND')}
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="FIRST">{getSemesterLabel('FIRST')}</option>
                    <option value="SECOND">{getSemesterLabel('SECOND')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Course overview for students…"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || courses.length === 0}
              className={cn(
                'flex-1 h-10 rounded-xl text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800',
                'disabled:opacity-60 flex items-center justify-center gap-2'
              )}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create offering'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
