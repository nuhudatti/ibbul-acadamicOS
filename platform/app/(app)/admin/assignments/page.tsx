'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserCheck, BookOpen, Search, RefreshCw, Save, Check, X,
  ChevronRight, Layers,
} from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { academicsAPI, coreAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader, PageShell } from '@/components/layout/page-header'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { cn } from '@/lib/utils'

interface AssignedCourse {
  id: number
  code: string
  title: string
}

interface Examiner {
  id: number
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  assigned_courses: AssignedCourse[]
}

interface CatalogueCourse {
  id: number
  code: string
  title: string
  department_name?: string
  level?: string
}

export default function AssignmentsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const isDean = user?.role === 'FACULTY_ADMIN'
  const isHod = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD'
  const canAssign =
    isHod || isDean || user?.role === 'SUPER_ADMIN'

  const [loading, setLoading] = useState(true)
  const [examiners, setExaminers] = useState<Examiner[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueCourse[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draftIds, setDraftIds] = useState<Set<number>>(new Set())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [usersResp, coursesResp] = await Promise.all([
        academicsAPI.getExaminers(),
        canAssign ? coreAPI.getCourses() : Promise.resolve(null),
      ])
      const data = usersResp.data
      const list: Examiner[] = data.results ?? (Array.isArray(data) ? data : [])
      setExaminers(list)
      if (data.error) toast.error(String(data.error))

      if (coursesResp) {
        const cdata = coursesResp.data
        setCatalogue(cdata.results ?? (Array.isArray(cdata) ? cdata : []))
      }
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id)
        setDraftIds(new Set(list[0].assigned_courses.map((c) => c.id)))
        setDirty(false)
      }
    } catch {
      toast.error('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [canAssign])

  const selected = examiners.find((e) => e.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    const ex = examiners.find((e) => e.id === selectedId)
    if (!ex) return
    setDraftIds(new Set(ex.assigned_courses.map((c) => c.id)))
    setDirty(false)
  }, [selectedId, examiners])

  const q = search.toLowerCase()
  const filteredLecturers = examiners.filter((e) => {
    const name = `${e.first_name} ${e.last_name}`.toLowerCase()
    return name.includes(q) || e.email.toLowerCase().includes(q)
  })

  const filteredCourses = useMemo(() => {
    const cq = search.toLowerCase()
    return catalogue.filter((c) =>
      !cq || c.code.toLowerCase().includes(cq) || c.title.toLowerCase().includes(cq)
    )
  }, [catalogue, search])

  const toggleCourse = (courseId: number) => {
    setDraftIds((prev) => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId)
      else next.add(courseId)
      return next
    })
    setDirty(true)
  }

  const selectAll = () => {
    setDraftIds(new Set(filteredCourses.map((c) => c.id)))
    setDirty(true)
  }

  const clearAll = () => {
    setDraftIds(new Set())
    setDirty(true)
  }

  const saveAssignments = async () => {
    if (!selectedId) return
    setSaving(true)
    try {
      const resp = await academicsAPI.assignCourses(selectedId, Array.from(draftIds))
      const added = resp.data?.added_codes ?? []
      toast.success(
        added.length
          ? `Assigned ${draftIds.size} course(s): ${added.join(', ')}`
          : `Saved ${draftIds.size} course assignment(s)`
      )
      setDirty(false)
      await load()
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? 'Failed to save assignments') : 'Failed to save assignments'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const totalAssignments = examiners.reduce((acc, e) => acc + e.assigned_courses.length, 0)

  return (
    <PageShell className="space-y-5">
      {(isDean || isHod) && (
        <PageHeader
          eyebrow="Administration"
          title="Assign Lecturers"
          description={`${examiners.length} lecturer${examiners.length !== 1 ? 's' : ''} · ${totalAssignments} assignment${totalAssignments !== 1 ? 's' : ''}${isHod ? ` · ${user?.department_name ?? 'your department'}` : ''}`}
          breadcrumb={
            <GovernanceBreadcrumb items={[
              ...(isHod ? [{ label: 'People & Invites', href: '/hod/department' }] : [{ label: 'Faculty Center', href: '/faculty' }]),
              { label: 'Assign Lecturers' },
            ]} />
          }
          action={
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-brand-50/50 hover:border-brand-200 w-full sm:w-auto justify-center"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          }
        />
      )}

      {!isDean && !isHod && (
        <PageHeader
          eyebrow="Administration"
          title="Course Assignments"
          description={`${examiners.length} lecturer${examiners.length !== 1 ? 's' : ''} · ${totalAssignments} assignment${totalAssignments !== 1 ? 's' : ''}`}
          action={
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-brand-50/50 w-full sm:w-auto justify-center"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          }
        />
      )}

      {canAssign && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-800">
          Select a lecturer, tick multiple courses, then save once. Assignments unlock Results access and Virtual Learning for that lecturer.
        </div>
      )}

      {loading ? (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 skeleton h-96 rounded-2xl" />
          <div className="lg:col-span-3 skeleton h-96 rounded-2xl" />
        </div>
      ) : examiners.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="No lecturers in your department"
          description="Invite lecturers from Department Management, then assign courses here."
          action={isHod ? (
            <button
              type="button"
              onClick={() => router.push('/hod/department')}
              className="text-sm font-semibold text-brand-700 hover:text-brand-800"
            >
              Go to Department Management →
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid lg:grid-cols-5 gap-4 lg:max-h-[min(560px,calc(100dvh-18rem))]">
          {/* Lecturer list */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search lecturers…"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredLecturers.map((e) => {
                const name = `${e.first_name} ${e.last_name}`.trim() || e.email
                const active = selectedId === e.id
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      active ? 'bg-brand-50 border-l-2 border-brand-600' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {e.first_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">{name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{e.email}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                        {e.assigned_courses.length}
                      </span>
                      <ChevronRight className={cn('w-4 h-4', active ? 'text-brand-700' : 'text-slate-300')} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Course multi-select */}
          <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs text-slate-400 uppercase tracking-wider">Assign courses to</div>
                    <div className="font-semibold text-slate-900">
                      {selected.first_name} {selected.last_name}
                    </div>
                  </div>
                  {canAssign && (
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={selectAll} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                        Select all
                      </button>
                      <span className="text-slate-300">·</span>
                      <button type="button" onClick={clearAll} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {catalogue.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No courses in your department. Add courses in Academic Structure first.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {filteredCourses.map((course) => {
                        const checked = draftIds.has(course.id)
                        return (
                          <label
                            key={course.id}
                            className={cn(
                              'flex items-start gap-3 rounded-xl border px-3 py-3 cursor-pointer transition-all',
                              checked
                                ? 'border-brand-400 bg-brand-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-brand-200',
                              !canAssign && 'pointer-events-none opacity-70'
                            )}
                          >
                            <div className={cn(
                              'w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 mt-0.5',
                              checked ? 'bg-brand-700 border-brand-600 text-white' : 'border-slate-300 bg-white'
                            )}>
                              {checked && <Check className="w-3 h-3" />}
                            </div>
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => toggleCourse(course.id)}
                              disabled={!canAssign}
                            />
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-bold text-brand-800">{course.code}</div>
                              <div className="text-xs text-slate-700 mt-0.5 line-clamp-2">{course.title}</div>
                              {course.level && (
                                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                  <Layers className="w-3 h-3" /> Level {course.level}
                                </div>
                              )}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                {canAssign && (
                  <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-600">
                      <strong>{draftIds.size}</strong> course{draftIds.size !== 1 ? 's' : ''} selected
                      {dirty && <span className="text-amber-600 ml-2">· unsaved</span>}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selected) return
                          setDraftIds(new Set(selected.assigned_courses.map((c) => c.id)))
                          setDirty(false)
                        }}
                        disabled={!dirty || saving}
                        className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-white disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" /> Reset
                      </button>
                      <button
                        type="button"
                        disabled={saving || !dirty}
                        onClick={saveAssignments}
                        className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving…' : `Save ${draftIds.size} course${draftIds.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                Select a lecturer to assign courses
              </div>
            )}
          </div>
        </div>
      )}

      {!canAssign && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" /> View-only — contact your HOD to manage assignments.
        </p>
      )}
    </PageShell>
  )
}
