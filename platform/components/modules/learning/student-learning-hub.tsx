'use client'



import { useMemo, useState } from 'react'

import Link from 'next/link'

import {

  BookOpen, ChevronRight, Compass, GraduationCap, Loader2,

  Search, Sparkles, UserPlus, CheckCircle2, Layers, Clock, Users, KeyRound,

} from 'lucide-react'

import { toast } from 'sonner'

import { learningAPI } from '@/lib/api'

import { getLearningApiError } from '@/lib/learning-utils'

import {

  LCard, LBadge, LButton, LEmpty, LSkeleton, LStat,

} from './learning-ui'

import { cn, getSemesterLabel } from '@/lib/utils'

import type { Enrollment, LMSOffering } from '@/lib/types'



type HubMode = 'home' | 'catalog'



export function StudentLearningHub({

  stats,

  enrollments,

  catalog,

  loading,

  onEnrolled,

  mode = 'home',

}: {

  stats: Record<string, number>

  enrollments: Enrollment[]

  catalog: LMSOffering[]

  loading: boolean

  onEnrolled: () => void

  mode?: HubMode

}) {

  const [search, setSearch] = useState('')

  const [enrollingId, setEnrollingId] = useState<number | null>(null)

  const [confirmId, setConfirmId] = useState<number | null>(null)



  const q = search.toLowerCase().trim()

  const isCatalog = mode === 'catalog'



  const filteredEnrollments = useMemo(

    () => enrollments.filter((e) =>

      !q ||

      e.offering_summary?.course_title?.toLowerCase().includes(q) ||

      e.offering_summary?.course_code?.toLowerCase().includes(q) ||

      e.offering_summary?.instructor_name?.toLowerCase().includes(q)

    ),

    [enrollments, q]

  )



  const availableCatalog = useMemo(

    () => catalog.filter((o) => !o.is_enrolled),

    [catalog]

  )



  const filteredCatalog = useMemo(

    () => availableCatalog.filter((o) =>

      !q ||

      o.course_title?.toLowerCase().includes(q) ||

      o.course_code?.toLowerCase().includes(q) ||

      o.instructor_name?.toLowerCase().includes(q) ||

      o.department_name?.toLowerCase().includes(q) ||

      o.session?.toLowerCase().includes(q) ||

      o.description?.toLowerCase().includes(q)

    ),

    [availableCatalog, q]

  )



  const enroll = async (offeringId: number, pin?: string) => {

    setEnrollingId(offeringId)

    try {

      await learningAPI.enroll(offeringId, pin)

      toast.success('You are enrolled — your learning path is ready')

      setConfirmId(null)

      onEnrolled()

    } catch (err) {

      toast.error(getLearningApiError(err, 'Enrollment failed'))

    } finally {

      setEnrollingId(null)

    }

  }



  return (

    <div className="space-y-6">

      {/* Stats — home shows enrolled focus; catalog shows discovery */}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {loading ? (

          Array.from({ length: 4 }).map((_, i) => <LSkeleton key={i} className="h-24" />)

        ) : isCatalog ? (

          <>

            <LStat label="Available" value={availableCatalog.length} icon={Compass} />

            <LStat label="Your courses" value={enrollments.length} icon={BookOpen} />

            <LStat label="All lecturers" value={catalog.length} icon={Users} />

            <LStat label="Quizzes due" value={stats.pending_quizzes ?? 0} icon={GraduationCap} />

          </>

        ) : (

          <>

            <LStat label="Enrolled" value={stats.enrolled_courses ?? enrollments.length} icon={BookOpen} />

            <LStat label="Progress" value={`${stats.overall_progress ?? 0}%`} icon={Sparkles} />

            <LStat label="In progress" value={enrollments.filter((e) => e.progress_percent < 100).length} icon={GraduationCap} />

            <LStat label="Completed" value={enrollments.filter((e) => e.progress_percent >= 100).length} icon={CheckCircle2} />

          </>

        )}

      </div>



      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        {!isCatalog && (

          <Link href="/learning/catalog">

            <LButton variant="secondary">

              <Compass className="w-4 h-4" /> Browse all courses

            </LButton>

          </Link>

        )}

        {isCatalog && enrollments.length > 0 && (

          <Link href="/learning">

            <LButton variant="secondary">

              <BookOpen className="w-4 h-4" /> Back to my courses

            </LButton>

          </Link>

        )}

        <div className={cn('relative w-full', isCatalog ? 'sm:max-w-md sm:ml-auto' : 'sm:max-w-xs sm:ml-auto')}>

          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />

          <input

            value={search}

            onChange={(e) => setSearch(e.target.value)}

            placeholder={isCatalog ? 'Search all published courses…' : 'Search your enrolled courses…'}

            className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200/80 text-sm bg-white/80 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"

          />

        </div>

      </div>



      {loading ? (

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {Array.from({ length: 4 }).map((_, i) => <LSkeleton key={i} className="h-48" />)}

        </div>

      ) : isCatalog ? (

        filteredCatalog.length === 0 ? (

          <LEmpty

            icon={Compass}

            title={availableCatalog.length === 0 && catalog.some((o) => o.is_enrolled)

              ? 'You are enrolled in all available courses'

              : q ? 'No courses match your search' : 'No published courses yet'}

            description={

              q

                ? 'Try another keyword — search includes title, code, lecturer, department, and description.'

                : 'Published offerings from all lecturers at your level will appear here.'

            }

            action={

              enrollments.length > 0 ? (

                <Link href="/learning">

                  <LButton variant="secondary">View my courses</LButton>

                </Link>

              ) : undefined

            }

          />

        ) : (

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {filteredCatalog.map((o) => (

              <DiscoverCourseCard

                key={o.id}

                offering={o}

                enrolling={enrollingId === o.id}

                confirming={confirmId === o.id}

                onConfirm={() => setConfirmId(o.id)}

                onCancel={() => setConfirmId(null)}

                onEnroll={(pin) => enroll(o.id, pin)}

              />

            ))}

          </div>

        )

      ) : filteredEnrollments.length === 0 ? (

        <LEmpty

          icon={BookOpen}

          title="No enrolled courses"

          description="Your learning home shows only courses you have joined. Browse the catalog to find and enroll."

          action={

            <Link href="/learning/catalog">

              <LButton><Compass className="w-4 h-4" /> Browse courses</LButton>

            </Link>

          }

        />

      ) : (

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {filteredEnrollments.map((enr) => (

            <EnrolledCourseCard key={enr.id} enrollment={enr} />

          ))}

        </div>

      )}

    </div>

  )

}



function EnrollPinFields({

  requiresPin,

  pin,

  onPinChange,

}: {

  requiresPin: boolean

  pin: string

  onPinChange: (v: string) => void

}) {

  if (!requiresPin) return null

  return (

    <div className="space-y-1.5">

      <label className="text-xs font-medium text-brand-900 flex items-center gap-1">

        <KeyRound className="w-3.5 h-3.5" /> Lecturer enrollment PIN

      </label>

      <input

        type="text"

        inputMode="numeric"

        maxLength={4}

        value={pin}

        onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 4))}

        placeholder="4-digit code"

        className="w-full h-10 px-3 rounded-lg border border-brand-200 text-sm font-mono tracking-widest text-center focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"

      />

      <p className="text-[11px] text-brand-700/80">Ask your lecturer for this code before enrolling.</p>

    </div>

  )

}



function EnrolledCourseCard({ enrollment }: { enrollment: Enrollment }) {

  const o = enrollment.offering_summary

  if (!o) return null

  const done = enrollment.progress_percent >= 100



  return (

    <Link href={`/learning/offerings/${enrollment.offering}`}>

      <LCard hover className="h-full group">

        <div className="flex items-start justify-between gap-2 mb-3">

          <LBadge variant="info">{o.course_code}</LBadge>

          {done ? (

            <LBadge variant="success"><CheckCircle2 className="w-3 h-3" /> Complete</LBadge>

          ) : (

            <LBadge variant="live" dot>In progress</LBadge>

          )}

        </div>

        <h3 className="font-semibold text-slate-900 leading-snug group-hover:text-brand-800 transition-colors">

          {o.course_title}

        </h3>

        <p className="text-xs text-slate-400 mt-1">

          {o.session} · {getSemesterLabel(o.semester)}

          {o.instructor_name && ` · ${o.instructor_name}`}

        </p>

        <div className="mt-4 h-2 bg-slate-100 rounded-full overflow-hidden">

          <div

            className={cn('h-full rounded-full transition-all duration-500', done ? 'bg-emerald-500' : 'bg-brand-600')}

            style={{ width: `${enrollment.progress_percent}%` }}

          />

        </div>

        <p className="text-xs text-slate-500 mt-2">{enrollment.progress_percent}% complete</p>

        <p className="text-xs text-brand-700 font-semibold mt-3 flex items-center gap-1">

          Continue learning path <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />

        </p>

      </LCard>

    </Link>

  )

}



function DiscoverCourseCard({

  offering: o,

  enrolling,

  confirming,

  onConfirm,

  onCancel,

  onEnroll,

}: {

  offering: LMSOffering

  enrolling: boolean

  confirming: boolean

  onConfirm: () => void

  onCancel: () => void

  onEnroll: (pin?: string) => void

}) {

  const [pin, setPin] = useState('')

  const requiresPin = o.requires_enrollment_pin ?? false



  return (

    <LCard className="flex flex-col h-full overflow-hidden !p-0">

      <div className="h-1.5 bg-gradient-to-r from-brand-600 via-gold-500 to-brand-700" />

      <div className="p-5 flex flex-col flex-1">

        <div className="flex items-start justify-between gap-2 mb-3">

          <LBadge variant="info">{o.course_code}</LBadge>

          <LBadge variant="success" dot>Open</LBadge>

        </div>



        <h3 className="font-semibold text-slate-900 leading-snug text-lg">{o.course_title}</h3>

        <p className="text-xs text-slate-500 mt-1">

          {o.department_name ?? 'University'} · Level {o.course_level} · {o.course_credit_units} units

        </p>

        <p className="text-xs text-slate-400 mt-0.5">

          {o.session} · {getSemesterLabel(o.semester)}

        </p>



        {o.instructor_name && (

          <p className="text-xs text-brand-700 font-medium mt-2">Lecturer: {o.instructor_name}</p>

        )}



        {requiresPin && (

          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2 inline-flex items-center gap-1 w-fit">

            <KeyRound className="w-3 h-3" /> PIN required to enroll

          </p>

        )}



        <p className="text-sm text-slate-600 mt-3 flex-1 line-clamp-2 leading-relaxed">

          {o.description || 'Structured path with lessons, quizzes, and assignments — complete each step to unlock the next.'}

        </p>



        <div className="flex flex-wrap gap-3 mt-4 text-[11px] text-slate-500">

          <span className="inline-flex items-center gap-1">

            <Layers className="w-3.5 h-3.5 text-brand-500" />

            {o.module_count} modules

          </span>

          <span className="inline-flex items-center gap-1">

            <BookOpen className="w-3.5 h-3.5 text-brand-500" />

            {o.lesson_count} steps

          </span>

          <span className="inline-flex items-center gap-1">

            <Users className="w-3.5 h-3.5 text-brand-500" />

            {o.enrolled_count} enrolled

          </span>

        </div>



        <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">

          {confirming ? (

            <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 space-y-3">

              <p className="text-xs text-brand-900 font-medium">

                Enroll in <strong>{o.course_code}</strong>? You will follow a sequential learning path.

              </p>

              <EnrollPinFields requiresPin={requiresPin} pin={pin} onPinChange={setPin} />

              <div className="flex gap-2">

                <LButton variant="secondary" size="sm" className="flex-1" onClick={onCancel} disabled={enrolling}>

                  Cancel

                </LButton>

                <LButton

                  size="sm"

                  className="flex-1"

                  onClick={() => onEnroll(requiresPin ? pin : undefined)}

                  disabled={enrolling || (requiresPin && pin.length !== 4)}

                >

                  {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}

                  Confirm enroll

                </LButton>

              </div>

            </div>

          ) : (

            <div className="flex gap-2">

              <Link href={`/learning/offerings/${o.id}`} className="flex-1">

                <LButton variant="secondary" className="w-full" size="sm">

                  Preview syllabus

                </LButton>

              </Link>

              <LButton

                className="flex-1"

                size="sm"

                onClick={onConfirm}

                disabled={!o.enrollment_open}

              >

                <UserPlus className="w-3.5 h-3.5" />

                Enroll

              </LButton>

            </div>

          )}

        </div>

      </div>

    </LCard>

  )

}



export function EnrollBanner({

  offering,

  onEnrolled,

}: {

  offering: LMSOffering

  onEnrolled: () => void

}) {

  const [enrolling, setEnrolling] = useState(false)

  const [confirmed, setConfirmed] = useState(false)

  const [pin, setPin] = useState('')

  const requiresPin = offering.requires_enrollment_pin ?? false



  if (offering.is_enrolled) return null



  const enroll = async () => {

    setEnrolling(true)

    try {

      await learningAPI.enroll(offering.id, requiresPin ? pin : undefined)

      toast.success('Enrolled — start your learning path below')

      onEnrolled()

    } catch (err) {

      toast.error(getLearningApiError(err, 'Enrollment failed'))

    } finally {

      setEnrolling(false)

      setConfirmed(false)

      setPin('')

    }

  }



  return (

    <LCard className="mb-6 !p-0 overflow-hidden border-brand-200">

      <div className="bg-gradient-to-r from-brand-700 to-brand-800 px-5 py-4 text-white">

        <p className="text-sm font-semibold">Ready to start learning?</p>

        <p className="text-xs text-brand-100 mt-1">

          Enroll to unlock the full path — {offering.module_count} modules, {offering.lesson_count} steps

          {requiresPin && ' · PIN required from your lecturer'}

        </p>

      </div>

      <div className="px-5 py-4 flex flex-col gap-4 bg-brand-50/50">

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">

          <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Self-paced</span>

          <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> Sequential unlock</span>

        </div>

        {!confirmed ? (

          <div className="flex justify-end">

            <LButton onClick={() => setConfirmed(true)} disabled={!offering.enrollment_open}>

              <UserPlus className="w-4 h-4" /> Enroll in this course

            </LButton>

          </div>

        ) : (

          <div className="space-y-3">

            <EnrollPinFields requiresPin={requiresPin} pin={pin} onPinChange={setPin} />

            <div className="flex gap-2 justify-end">

              <LButton variant="secondary" size="sm" onClick={() => setConfirmed(false)} disabled={enrolling}>

                Cancel

              </LButton>

              <LButton

                size="sm"

                onClick={enroll}

                disabled={enrolling || (requiresPin && pin.length !== 4)}

              >

                {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}

                Confirm enrollment

              </LButton>

            </div>

          </div>

        )}

      </div>

    </LCard>

  )

}

