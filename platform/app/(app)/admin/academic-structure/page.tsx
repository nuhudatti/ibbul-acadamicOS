'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Building2, Layers, BookOpen, Search, RefreshCw, ChevronLeft, UserPlus, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/store'
import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'
import { OversightCard, OversightSkeleton } from '@/components/results-oversight/oversight-cards'
import { EmptyState } from '@/components/ui/empty-state'
import { coreAPI } from '@/lib/api'
import {
  loadAcademicTree,
  facultyMetrics,
  departmentMetrics,
  type TreeFaculty,
  type TreeDepartment,
  type TreeCourse,
} from '@/lib/governance'
import { cn } from '@/lib/utils'
import { InviteLeaderModal, type InvitePreset } from '@/components/governance/invite-leader-modal'
import { CreateFacultyModal, type CreatedFaculty } from '@/components/governance/create-faculty-modal'
import { CreateDepartmentModal } from '@/components/governance/create-department-modal'
import { HodBulkCoursesPanel } from '@/components/governance/hod-bulk-courses'

type Level = 'faculties' | 'departments' | 'courses'

function StatusDot({ active }: { active?: boolean }) {
  const on = active !== false
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
      on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', on ? 'bg-emerald-500' : 'bg-slate-400')} />
      {on ? 'Active' : 'Inactive'}
    </span>
  )
}

function AcademicStructureContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  const facultyId = searchParams.get('faculty') ? Number(searchParams.get('faculty')) : null
  const departmentId = searchParams.get('department') ? Number(searchParams.get('department')) : null

  const level: Level = departmentId ? 'courses' : facultyId ? 'departments' : 'faculties'
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'
  const isDean = user?.role === 'FACULTY_ADMIN'
  const isHod = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD'

  const [loading, setLoading] = useState(true)
  const [tree, setTree] = useState<TreeFaculty[]>([])
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePreset, setInvitePreset] = useState<InvitePreset | null>(null)
  const [createFacultyOpen, setCreateFacultyOpen] = useState(false)
  const [createDeptOpen, setCreateDeptOpen] = useState(false)
  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTree(await loadAcademicTree())
    } catch {
      toast.error('Failed to load academic structure')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isDean && user?.faculty_id && !facultyId && !departmentId) {
      router.replace(`/admin/academic-structure?faculty=${user.faculty_id}`)
    }
  }, [isDean, user?.faculty_id, facultyId, departmentId, router])

  useEffect(() => {
    if (isHod && user?.department_id && user?.faculty_id && !departmentId) {
      router.replace(`/admin/academic-structure?faculty=${user.faculty_id}&department=${user.department_id}`)
    }
  }, [isHod, user?.department_id, user?.faculty_id, departmentId, router])

  const navigate = useCallback(
    (params: { faculty?: number | null; department?: number | null }) => {
      const q = new URLSearchParams()
      if (params.faculty) q.set('faculty', String(params.faculty))
      if (params.department) q.set('department', String(params.department))
      const qs = q.toString()
      router.push(qs ? `/admin/academic-structure?${qs}` : '/admin/academic-structure')
    },
    [router]
  )

  const selectedFaculty = useMemo(
    () => tree.find((f) => f.id === facultyId) ?? null,
    [tree, facultyId]
  )

  const selectedDepartment = useMemo(() => {
    const parent = selectedFaculty ?? (isDean ? tree.find((f) => f.id === user?.faculty_id) ?? null : null)
    return parent?.departments?.find((d) => d.id === departmentId) ?? null
  }, [selectedFaculty, isDean, tree, user?.faculty_id, departmentId])

  const q = search.toLowerCase()

  const filteredFaculties = useMemo(
    () => tree.filter((f) => f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q)),
    [tree, q]
  )

  const filteredDepartments = useMemo(() => {
    const parent = isDean ? (selectedFaculty ?? tree.find((f) => f.id === user?.faculty_id) ?? null) : selectedFaculty
    if (!parent) return []
    return (parent.departments ?? []).filter(
      (d) => d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q)
    )
  }, [selectedFaculty, isDean, tree, user?.faculty_id, q])

  const filteredCourses = useMemo(() => {
    if (!selectedDepartment) return []
    return (selectedDepartment.courses ?? []).filter(
      (c) => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    )
  }, [selectedDepartment, q])

  const handleDeleteCourse = async (course: TreeCourse) => {
    if (
      !confirm(
        `Permanently delete "${course.code} — ${course.title}"?\n\nThis removes the course and all linked results, lecturer assignments, and LMS offerings. This cannot be undone.`
      )
    ) {
      return
    }
    setDeletingCourseId(course.id)
    try {
      const resp = await coreAPI.deleteCourse(course.id)
      const data = resp.data as {
        message?: string
        deleted_results?: number
        deleted_offerings?: number
      }
      toast.success(
        data.message ??
          `Course deleted${data.deleted_results ? ` (${data.deleted_results} result(s) removed)` : ''}`
      )
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Could not delete course')
    } finally {
      setDeletingCourseId(null)
    }
  }

  const deanFaculty = isDean ? (selectedFaculty ?? tree.find((f) => f.id === user?.faculty_id) ?? null) : null
  const activeFaculty = selectedFaculty ?? deanFaculty
  const effectiveLevel: Level = isDean && deanFaculty && level === 'faculties' ? 'departments' : level

  const breadcrumbs = useMemo(() => {
    const items: { label: string; href?: string }[] = [
      ...(isSuperAdmin
        ? [{ label: 'Governance Center', href: '/admin/governance' }]
        : isDean
          ? [{ label: 'Faculty Center', href: '/faculty' }]
          : []),
      { label: 'Academic Structure', href: isDean && user?.faculty_id ? `/admin/academic-structure?faculty=${user.faculty_id}` : '/admin/academic-structure' },
    ]
    if (activeFaculty) {
      items.push({
        label: activeFaculty.name,
        href: `/admin/academic-structure?faculty=${activeFaculty.id}`,
      })
    }
    if (selectedDepartment) {
      items.push({ label: selectedDepartment.name })
    }
    return items
  }, [isSuperAdmin, isDean, user?.faculty_id, activeFaculty, selectedDepartment])

  const scopeLabel = isSuperAdmin
    ? 'Platform-wide catalogue'
    : isDean && user?.faculty_name
      ? `Faculty: ${user.faculty_name}`
      : user?.faculty_name
        ? `Faculty: ${user.faculty_name}`
        : user?.department_name
          ? `Department: ${user.department_name}`
          : 'Scoped view'

  const openInviteDean = (faculty: TreeFaculty) => {
    setInvitePreset({
      role: 'FACULTY_ADMIN',
      facultyId: faculty.id,
      facultyName: faculty.name,
    })
    setInviteOpen(true)
  }

  const openInviteHod = (faculty: TreeFaculty, department: TreeDepartment) => {
    setInvitePreset({
      role: 'DEPARTMENT_ADMIN',
      facultyId: faculty.id,
      facultyName: faculty.name,
      departmentId: department.id,
      departmentName: department.name,
    })
    setInviteOpen(true)
  }

  const handleFacultyCreated = (faculty: CreatedFaculty) => {
    load()
    setInvitePreset({
      role: 'FACULTY_ADMIN',
      facultyId: faculty.id,
      facultyName: faculty.name,
    })
    setInviteOpen(true)
    toast.success('Next: invite a Dean to activate the faculty workspace')
  }

  const handleDeptCreated = (dept: { id: number; name: string; code: string }) => {
    load()
    if (isDean && activeFaculty) {
      setInvitePreset({
        role: 'DEPARTMENT_ADMIN',
        facultyId: activeFaculty.id,
        facultyName: activeFaculty.name,
        departmentId: dept.id,
        departmentName: dept.name,
      })
      setInviteOpen(true)
      toast.success('Next: invite the Head of Department for this department')
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <GovernanceBreadcrumb items={breadcrumbs} />
        <div className="mt-4 flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-1">
              {isSuperAdmin ? 'Institutional Catalogue' : isDean ? 'Faculty Catalogue' : isHod ? 'Courses Catalogue' : 'Academic Structure'}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isHod && effectiveLevel === 'courses' && (selectedDepartment?.name ?? 'Department courses')}
              {isHod && effectiveLevel !== 'courses' && (user?.department_name ?? 'Your department')}
              {!isHod && effectiveLevel === 'faculties' && 'Faculties'}
              {!isHod && effectiveLevel === 'departments' && (isDean ? (deanFaculty?.name ?? user?.faculty_name) : selectedFaculty?.name)}
              {!isHod && effectiveLevel === 'courses' && selectedDepartment?.name}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isHod
                ? `${scopeLabel} · add courses, view codes, and manage your department catalogue`
                : isDean
                  ? `${scopeLabel} · add departments, invite HODs, and manage faculty structure`
                  : isSuperAdmin
                    ? `${scopeLabel} · create faculties, add departments, manage all structure`
                    : `${scopeLabel} · read-only structure view`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin && effectiveLevel === 'faculties' && (
              <button
                type="button"
                onClick={() => setCreateFacultyOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-brand text-white text-sm font-semibold shadow-sm"
              >
                <Plus className="w-4 h-4" /> Create Faculty
              </button>
            )}
            {(isSuperAdmin || isDean) && effectiveLevel === 'departments' && activeFaculty && (
              <button
                type="button"
                onClick={() => setCreateDeptOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-700 text-white text-sm font-semibold shadow-sm hover:bg-brand-800"
              >
                <Plus className="w-4 h-4" /> Add Department
              </button>
            )}
            {effectiveLevel !== 'faculties' && !(isDean && effectiveLevel === 'departments') && (
              <button
                onClick={() => {
                  if (effectiveLevel === 'courses') navigate({ faculty: facultyId })
                  else if (isDean && user?.faculty_id) navigate({ faculty: user.faculty_id })
                  else navigate({})
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder={`Search ${effectiveLevel}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {loading ? (
        <OversightSkeleton count={6} />
      ) : (
        <>
          {effectiveLevel === 'faculties' && !isDean && (
            filteredFaculties.length === 0 ? (
              <EmptyState icon={Building2} title="No faculties" description="No faculties match your search or scope." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredFaculties.map((f) => {
                  const m = facultyMetrics(f)
                  return (
                    <div key={f.id} className="relative group/card">
                      <OversightCard
                        title={f.name}
                        subtitle={f.code}
                        icon={Building2}
                        accent="from-brand-600 to-brand-800"
                        metrics={[
                          { label: 'Departments', value: m.deptCount },
                          { label: 'Courses', value: m.courseCount },
                          { label: 'Status', value: f.is_active === false ? 'Off' : 'Active' },
                          { label: 'Explore', value: '→' },
                        ]}
                        onClick={() => navigate({ faculty: f.id })}
                      />
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openInviteDean(f) }}
                          className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-semibold text-brand-700 shadow-sm opacity-0 group-hover/card:opacity-100 hover:bg-brand-50 transition-opacity"
                        >
                          <UserPlus className="w-3 h-3" /> Invite Dean
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {effectiveLevel === 'departments' && activeFaculty && (
            filteredDepartments.length === 0 ? (
              <EmptyState icon={Layers} title="No departments" description="This faculty has no departments in your scope." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDepartments.map((d) => {
                  const m = departmentMetrics(d)
                  const parentFacultyId = activeFaculty.id
                  return (
                    <div key={d.id} className="relative group/card">
                      <OversightCard
                        title={d.name}
                        subtitle={d.code}
                        icon={Layers}
                        accent="from-brand-600 to-brand-800"
                        metrics={[
                          { label: 'Courses', value: m.courseCount },
                          { label: 'Status', value: d.is_active === false ? 'Off' : 'Active' },
                          { label: 'Faculty', value: activeFaculty.code },
                          { label: 'View', value: '→' },
                        ]}
                        onClick={() => navigate({ faculty: parentFacultyId, department: d.id })}
                      />
                      {(isSuperAdmin || isDean) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openInviteHod(activeFaculty, d) }}
                          className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-semibold text-brand-800 shadow-sm opacity-0 group-hover/card:opacity-100 hover:bg-brand-50 transition-opacity"
                        >
                          <UserPlus className="w-3 h-3" /> Invite HOD
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {effectiveLevel === 'courses' && selectedDepartment && (
            <div className="space-y-5">
              {(isHod || isSuperAdmin) && (
                <HodBulkCoursesPanel departmentId={selectedDepartment.id} onSaved={load} />
              )}
            {filteredCourses.length === 0 ? (
              <EmptyState icon={BookOpen} title="No courses" description="No courses in this department match your search." />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">
                    {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
                  </span>
                  <StatusDot active={selectedDepartment.is_active} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Code', 'Title', 'Level', 'Semester', 'Credits', 'Status', ...(isHod || isSuperAdmin ? [''] : [])].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredCourses.map((c: TreeCourse) => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-brand-700">{c.code}</td>
                          <td className="px-4 py-3 text-slate-700 max-w-[240px] truncate" title={c.title}>{c.title}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                              {c.level ?? '—'}L
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {c.semester === 'FIRST' ? '1st' : c.semester === 'SECOND' ? '2nd' : c.semester ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold">{c.credit_units ?? '—'}</td>
                          <td className="px-4 py-3"><StatusDot active={c.is_active} /></td>
                          {(isHod || isSuperAdmin) && (
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteCourse(c)}
                                disabled={deletingCourseId === c.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                title="Delete course permanently"
                              >
                                {deletingCourseId === c.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <span>Delete</span>
                                )}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            </div>
          )}
        </>
      )}

      <InviteLeaderModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onSuccess={() => toast.success('Invitation sent')}
        preset={invitePreset}
        inviterRole={isDean ? 'FACULTY_ADMIN' : 'SUPER_ADMIN'}
        lockedFacultyId={isDean ? (user?.faculty_id ?? activeFaculty?.id) : undefined}
        lockedFacultyName={isDean ? (user?.faculty_name ?? activeFaculty?.name) : undefined}
      />

      {isSuperAdmin && (
        <CreateFacultyModal
          open={createFacultyOpen}
          onClose={() => setCreateFacultyOpen(false)}
          onSuccess={handleFacultyCreated}
        />
      )}
      {(isSuperAdmin || isDean) && activeFaculty && (
        <CreateDepartmentModal
          open={createDeptOpen}
          onClose={() => setCreateDeptOpen(false)}
          onSuccess={handleDeptCreated}
          facultyId={activeFaculty.id}
          facultyName={activeFaculty.name}
        />
      )}
    </div>
  )
}

export default function AcademicStructurePage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
      <AcademicStructureContent />
    </Suspense>
  )
}
