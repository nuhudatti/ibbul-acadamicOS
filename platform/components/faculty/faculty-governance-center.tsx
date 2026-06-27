'use client'



import { useEffect, useState } from 'react'

import Link from 'next/link'

import { useRouter } from 'next/navigation'

import {

  Building2, Layers, Users, BarChart3, ShieldCheck, UserCheck,

  FileText, Upload, BookOpen, ArrowRight, RefreshCw, GraduationCap,

  CheckSquare, Plus, UserPlus, Mail,

} from 'lucide-react'

import { toast } from 'sonner'

import { useAuthStore } from '@/lib/store'

import { invitationAPI, type StaffInvitationRecord } from '@/lib/api'

import { GovernanceBreadcrumb } from '@/components/governance/governance-breadcrumb'

import { OversightCard, OversightSkeleton } from '@/components/results-oversight/oversight-cards'

import { CreateDepartmentModal, type CreatedDepartment } from '@/components/governance/create-department-modal'

import { InviteLeaderModal, type InvitePreset } from '@/components/governance/invite-leader-modal'

import { InvitationsPanel } from '@/components/governance/invitations-panel'

import {

  loadFacultyGovernanceStats,

  loadFacultyTree,

  departmentMetrics,

  type FacultyGovernanceStats,

  type TreeFaculty,

} from '@/lib/faculty-governance'

import { cn } from '@/lib/utils'



const FACULTY_TOOLS = [

  { title: 'Academic Structure', description: 'Add departments and browse courses in your faculty.', href: '/admin/academic-structure', icon: Layers, accent: 'from-brand-600 to-brand-800' },

  { title: 'Faculty Staff', description: 'View HODs and lecturers — invite new leaders.', href: '/admin/users', icon: Users, accent: 'from-brand-700 to-brand-900' },

  { title: 'Course Assignments', description: 'Assign lecturers to courses within your faculty.', href: '/admin/assignments', icon: UserCheck, accent: 'from-brand-600 to-brand-900' },

  { title: 'All Results', description: 'Monitor student results across faculty departments.', href: '/hod/results', icon: FileText, accent: 'from-brand-600 to-brand-800' },

  { title: 'Upload Batches', description: 'Review result upload batches in your scope.', href: '/admin/upload-batches', icon: Upload, accent: 'from-gold-500 to-gold-700' },

  { title: 'Faculty Analytics', description: 'Performance metrics scoped to your faculty.', href: '/admin/analytics', icon: BarChart3, accent: 'from-brand-800 to-brand-950' },

  { title: 'Audit Logs', description: 'Faculty-scoped activity and governance trail.', href: '/admin/audit', icon: ShieldCheck, accent: 'from-brand-700 to-brand-900' },

  { title: 'Learning Offerings', description: 'Virtual learning courses across your faculty.', href: '/learning', icon: BookOpen, accent: 'from-brand-600 to-brand-800' },

]



export function FacultyGovernanceCenter() {

  const { user } = useAuthStore()

  const router = useRouter()

  const [loading, setLoading] = useState(true)

  const [invLoading, setInvLoading] = useState(true)

  const [stats, setStats] = useState<FacultyGovernanceStats | null>(null)

  const [faculty, setFaculty] = useState<TreeFaculty | null>(null)

  const [invitations, setInvitations] = useState<StaffInvitationRecord[]>([])

  const [addDeptOpen, setAddDeptOpen] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)

  const [invitePreset, setInvitePreset] = useState<InvitePreset | null>(null)

  const [activeTab, setActiveTab] = useState<'overview' | 'invitations'>('overview')



  const facultyId = user?.faculty_id ?? faculty?.id ?? null

  const facultyName = user?.faculty_name ?? faculty?.name ?? 'Your Faculty'

  const facultyCode = faculty?.code ?? ''

  const structureHref = facultyId

    ? `/admin/academic-structure?faculty=${facultyId}`

    : '/admin/academic-structure'



  const loadInvitations = async () => {

    setInvLoading(true)

    try {

      const resp = await invitationAPI.list()

      setInvitations(resp.data.results ?? [])

    } catch {

      toast.error('Failed to load invitations')

    } finally {

      setInvLoading(false)

    }

  }



  const load = async () => {

    setLoading(true)

    try {

      const [s, tree] = await Promise.all([

        loadFacultyGovernanceStats(),

        loadFacultyTree(facultyId),

      ])

      setStats(s)

      setFaculty(tree)

    } finally {

      setLoading(false)

    }

  }



  useEffect(() => {

    load()

    loadInvitations()

  // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [facultyId])



  const handleDeptCreated = (dept: CreatedDepartment) => {

    load()

    setInvitePreset({

      role: 'DEPARTMENT_ADMIN',

      facultyId: facultyId ?? undefined,

      facultyName,

      departmentId: dept.id,

      departmentName: dept.name,

    })

    setInviteOpen(true)

    toast.success('Next: invite the Head of Department for this department')

  }



  const openInviteHod = (departmentId: number, departmentName: string) => {

    setInvitePreset({

      role: 'DEPARTMENT_ADMIN',

      facultyId: facultyId ?? undefined,

      facultyName,

      departmentId,

      departmentName,

    })

    setInviteOpen(true)

  }



  const pendingInvites = invitations.filter((i) =>

    !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(i.status) && !i.is_expired

  ).length



  if (!facultyId && !loading) {

    return (

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center max-w-lg mx-auto">

        <Building2 className="w-10 h-10 text-amber-500 mx-auto mb-3" />

        <h2 className="font-semibold text-amber-900">Faculty not linked</h2>

        <p className="text-sm text-amber-800 mt-2">

          Your Dean account is not linked to a faculty yet. Ask Super Admin to send you a faculty-scoped invitation and accept it.

        </p>

      </div>

    )

  }



  return (

    <div className="space-y-6">

      {/* Hero */}

      <div className="rounded-2xl overflow-hidden border border-brand-700/20 shadow-sm">

        <div className="gradient-ibbul-hero px-6 py-6 text-white">

          <GovernanceBreadcrumb items={[{ label: 'Faculty Governance Center' }]} />

          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">

            <div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-200 mb-1">

                Dean Workspace · Faculty scope only

              </p>

              <h1 className="font-display text-2xl tracking-tight">{facultyName}</h1>

              <p className="text-sm text-brand-100/90 mt-1 max-w-2xl">

                Build your faculty structure, invite HODs and lecturers, and oversee results —

                scoped to <span className="font-semibold text-white">{facultyCode || facultyName}</span> only.

              </p>

              {stats?.currentSession && (

                <p className="text-xs text-brand-200/80 mt-2">Session · {stats.currentSession}</p>

              )}

            </div>

            <div className="flex flex-wrap gap-2">

              <button

                type="button"

                onClick={() => setAddDeptOpen(true)}

                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-500 text-brand-900 text-sm font-bold shadow-sm hover:bg-gold-400"

              >

                <Plus className="w-4 h-4" /> Add Department

              </button>

              <button

                type="button"

                onClick={() => { setInvitePreset(null); setInviteOpen(true) }}

                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-semibold hover:bg-white/25"

              >

                <UserPlus className="w-4 h-4" /> Invite staff

              </button>

              <button

                onClick={() => { load(); loadInvitations() }}

                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-sm text-white hover:bg-white/20"

              >

                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />

              </button>

            </div>

          </div>

        </div>

      </div>



      {/* Tabs */}

      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">

        {([

          { id: 'overview' as const, label: 'Overview' },

          { id: 'invitations' as const, label: `Invitations${pendingInvites ? ` (${pendingInvites})` : ''}` },

        ]).map((t) => (

          <button

            key={t.id}

            type="button"

            onClick={() => setActiveTab(t.id)}

            className={cn(

              'px-4 py-2 rounded-lg text-sm font-medium transition-all',

              activeTab === t.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'

            )}

          >

            {t.label}

          </button>

        ))}

      </div>



      {activeTab === 'overview' ? (

        <>

          {loading ? (

            <OversightSkeleton count={5} />

          ) : stats && (

            <>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

                {[

                  { label: 'Departments', value: stats.departments, icon: Layers },

                  { label: 'Courses', value: stats.courses, icon: GraduationCap },

                  { label: 'Students', value: stats.students, icon: Users },

                  { label: 'HODs', value: stats.hods, icon: Building2 },

                  { label: 'Lecturers', value: stats.lecturers, icon: UserCheck },

                ].map((s) => (

                  <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">

                    <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center">

                      <s.icon className="w-4 h-4 text-brand-700" />

                    </div>

                    <div className="min-w-0">

                      <div className="text-xl font-bold text-slate-900 tabular-nums">{s.value}</div>

                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{s.label}</div>

                    </div>

                  </div>

                ))}

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                {[

                  { label: 'Pending Results', value: stats.pendingResults, icon: CheckSquare, color: 'text-amber-600 bg-amber-50' },

                  { label: 'Published Results', value: stats.publishedResults, icon: FileText, color: 'text-emerald-600 bg-emerald-50' },

                  { label: 'Uploads This Month', value: stats.uploadsThisMonth, icon: Upload, color: 'text-blue-600 bg-blue-50' },

                ].map((s) => (

                  <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">

                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', s.color.split(' ')[1])}>

                      <s.icon className={cn('w-4 h-4', s.color.split(' ')[0])} />

                    </div>

                    <div>

                      <div className="text-xl font-bold text-slate-900 tabular-nums">{s.value}</div>

                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{s.label}</div>

                    </div>

                  </div>

                ))}

              </div>

            </>

          )}



          <div>

            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Faculty tools</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

              {FACULTY_TOOLS.map((link) => (

                <Link

                  key={link.href}

                  href={link.href === '/admin/academic-structure' ? structureHref : link.href}

                  className="group rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:border-brand-200 transition-all"

                >

                  <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', link.accent)}>

                    <link.icon className="w-5 h-5 text-white" />

                  </div>

                  <h3 className="font-semibold text-slate-800 group-hover:text-brand-800">{link.title}</h3>

                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{link.description}</p>

                  <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 mt-3">

                    Open <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />

                  </span>

                </Link>

              ))}

            </div>

          </div>



          <div>

            <div className="flex items-center justify-between mb-3">

              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Departments</h2>

              <Link href={structureHref} className="text-xs font-medium text-brand-700 hover:underline">

                Manage structure →

              </Link>

            </div>

            {loading ? (

              <OversightSkeleton count={3} />

            ) : !faculty?.departments?.length ? (

              <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 px-6 py-10 text-center">

                <Layers className="w-8 h-8 text-brand-400 mx-auto mb-3" />

                <p className="text-sm font-medium text-slate-700">No departments yet</p>

                <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm mx-auto">

                  Add your first department, then invite a HOD — same flow Super Admin uses for faculties.

                </p>

                <button

                  type="button"

                  onClick={() => setAddDeptOpen(true)}

                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-700 text-white text-sm font-semibold shadow-sm hover:bg-brand-800"

                >

                  <Plus className="w-4 h-4" /> Add Department

                </button>

              </div>

            ) : (

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                {faculty.departments.map((d) => {

                  const m = departmentMetrics(d)

                  return (

                    <div key={d.id} className="relative group/card">

                      <OversightCard

                        title={d.name}

                        subtitle={d.code}

                        icon={Layers}

                        accent="from-brand-600 to-brand-800"

                        metrics={[

                          { label: 'Courses', value: m.courseCount },

                          { label: 'Status', value: d.is_active === false ? 'Inactive' : 'Active' },

                          { label: 'Faculty', value: faculty.code },

                          { label: 'Open', value: '→' },

                        ]}

                        onClick={() => router.push(`${structureHref}&department=${d.id}`)}

                      />

                      <button

                        type="button"

                        onClick={(e) => { e.stopPropagation(); openInviteHod(d.id, d.name) }}

                        className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/95 border border-slate-200 text-[10px] font-semibold text-brand-800 shadow-sm opacity-0 group-hover/card:opacity-100 hover:bg-brand-50 transition-opacity"

                      >

                        <UserPlus className="w-3 h-3" /> Invite HOD

                      </button>

                    </div>

                  )

                })}

              </div>

            )}

          </div>

        </>

      ) : (

        <div className="space-y-4">

          <div className="flex items-center justify-between">

            <div>

              <h2 className="font-semibold text-slate-900 flex items-center gap-2">

                <Mail className="w-4 h-4 text-brand-600" /> Faculty invitations

              </h2>

              <p className="text-xs text-slate-500 mt-0.5">HOD and lecturer invites for your faculty only</p>

            </div>

            <button

              type="button"

              onClick={() => { setInvitePreset(null); setInviteOpen(true) }}

              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-brand text-white text-sm font-semibold"

            >

              <UserPlus className="w-4 h-4" /> New invitation

            </button>

          </div>

          <InvitationsPanel

            invitations={invitations}

            loading={invLoading}

            onRefresh={loadInvitations}

          />

        </div>

      )}



      {facultyId && (

        <CreateDepartmentModal

          open={addDeptOpen}

          onClose={() => setAddDeptOpen(false)}

          onSuccess={handleDeptCreated}

          facultyId={facultyId}

          facultyName={facultyName}

        />

      )}



      <InviteLeaderModal

        open={inviteOpen}

        onClose={() => setInviteOpen(false)}

        onSuccess={() => { loadInvitations(); load() }}

        preset={invitePreset}

        inviterRole="FACULTY_ADMIN"

        lockedFacultyId={facultyId}

        lockedFacultyName={facultyName}

      />

    </div>

  )

}


