'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText, BookOpen, TrendingUp, Award, Clock,
  ChevronRight, GraduationCap, Target, ArrowRight
} from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { academicsAPI, learningAPI } from '@/lib/api'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn, formatGPA, truncate, resolveResultCourse } from '@/lib/utils'
import { SemesterSummaryPanel } from '@/components/academics/semester-summary-panel'
import { GradeChip } from '@/components/ui/grade-chip'
import { normalizeSemesterSummary } from '@/lib/summary'
import type { Result, SemesterSummary, Enrollment, LMSOffering } from '@/lib/types'

export function StudentDashboard() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<Result[]>([])
  const [summary, setSummary] = useState<SemesterSummary | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [learningStats, setLearningStats] = useState<{
    enrolled_courses: number
    completed_lessons: number
    total_lessons: number
    overall_progress: number
    pending_quizzes: number
    pending_assignments: number
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [resResp, learnResp, enrollResp] = await Promise.allSettled([
          academicsAPI.getMyResults(),
          learningAPI.getDashboardStats(),
          learningAPI.getMyEnrollments(),
        ])
        if (resResp.status === 'fulfilled') {
          const data = resResp.value.data
          const list: Result[] = data.results ?? []
          setResults(list)
          const summariesRaw: Record<string, SemesterSummary> = data.summaries ?? {}
          if (list.length > 0) {
            const latest = [...list].sort((a, b) => {
              const s = b.session.localeCompare(a.session)
              if (s !== 0) return s
              return a.semester === 'FIRST' ? 1 : -1
            })[0]
            const key = `${latest.session}_${latest.semester}`
            const normalized = normalizeSemesterSummary(summariesRaw[key])
            if (normalized) setSummary(normalized)
          } else {
            const firstKey = Object.keys(summariesRaw)[0]
            if (firstKey) {
              setSummary(normalizeSemesterSummary(summariesRaw[firstKey]))
            }
          }
        }
        if (learnResp.status === 'fulfilled') setLearningStats(learnResp.value.data)
        if (enrollResp.status === 'fulfilled') setEnrollments(enrollResp.value.data ?? [])
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const latestResults = results.slice(0, 5)
  const latestEnrollments = enrollments.slice(0, 4)
  const cgpa = summary?.cgpa ? formatGPA(summary.cgpa) : '—'
  const gpa  = summary?.gpa  ? formatGPA(summary.gpa)  : '—'

  return (
    <div className="space-y-7">
      {/* Welcome Banner */}
      <div className="rounded-2xl gradient-navy p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-bold">
                {user?.first_name?.[0]?.toUpperCase() ?? 'S'}
              </div>
              <div className="text-sm text-slate-300">
                {user?.first_name ? `${user.first_name} ${user.last_name}` : user?.full_name}
              </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back
            </h1>
            {user?.student_id && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2">
                <GraduationCap className="w-5 h-5 text-gold-400" />
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">Matric number</div>
                  <div className="text-lg font-mono font-bold text-white">{user.student_id}</div>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-3">
              {user?.department_name && (
                <div className="text-sm text-slate-300 bg-white/10 px-2.5 py-0.5 rounded-full">
                  {user.department_name}
                </div>
              )}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-center">
            <div className="bg-white/10 rounded-2xl px-5 py-3">
              <div className="text-2xl font-bold text-gold-300">{cgpa}</div>
              <div className="text-xs text-slate-400 mt-0.5">CGPA</div>
            </div>
            <div className="bg-white/10 rounded-2xl px-5 py-3">
              <div className="text-2xl font-bold text-white">{gpa}</div>
              <div className="text-xs text-slate-400 mt-0.5">GPA</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Published Results"
              value={results.length}
              sub="Approved & locked"
              icon={FileText}
              iconBg="bg-brand-50"
              iconColor="text-brand-600"
            />
            <StatCard
              label="CGPA"
              value={cgpa}
              sub={summary?.standing || 'Cumulative grade average'}
              icon={Award}
              iconBg="bg-gold-50"
              iconColor="text-gold-600"
            />
            <StatCard
              label="Enrolled Courses"
              value={learningStats?.enrolled_courses ?? enrollments.length}
              sub="Active LMS enrollments"
              icon={BookOpen}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatCard
              label="Learning Progress"
              value={learningStats ? `${learningStats.overall_progress}%` : '—'}
              sub={`${learningStats?.completed_lessons ?? 0} of ${learningStats?.total_lessons ?? 0} lessons`}
              icon={TrendingUp}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
          </>
        )}
      </div>

      {summary && (
        <SemesterSummaryPanel
          summary={summary}
          session={summary.session}
          semester={summary.semester}
          title="Latest Semester Summary"
          compact
        />
      )}

      {/* Two-column: Recent results + Enrolled courses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Results */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-800">Recent Results</h2>
            </div>
            <Link href="/results" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-32 rounded" />
                    <div className="skeleton h-2.5 w-20 rounded" />
                  </div>
                  <div className="skeleton h-6 w-14 rounded" />
                </div>
              ))}
            </div>
          ) : latestResults.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No results yet"
              description="Your approved results will appear here"
            />
          ) : (
            <div className="divide-y divide-slate-50">
              {latestResults.map((result) => {
                const course = resolveResultCourse(result)
                return (
                <div key={result.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <GradeChip grade={result.grade} size="sm" className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-xs font-bold font-mono text-brand-700 flex-shrink-0">
                        {course.code || '—'}
                      </span>
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {course.title || course.code || 'Course'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {result.session} · {result.semester === 'FIRST' ? '1st' : '2nd'} Semester
                      {course.creditUnits != null && (
                        <span className="ml-2">· {course.creditUnits} CU</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-slate-900 tabular-nums">{result.score}</div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wide">Score</div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Enrolled Courses */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-slate-800">Enrolled Courses</h2>
            </div>
            <Link href="/learning" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-0.5">
              View all <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-2 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : latestEnrollments.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses enrolled"
              description="Browse the course catalog to enroll"
              action={
                <Link href="/learning/catalog" className="text-xs text-emerald-600 font-medium hover:underline">
                  Browse catalog →
                </Link>
              }
            />
          ) : (
            <div className="divide-y divide-slate-50">
              {latestEnrollments.map((enr) => (
                <Link
                  key={enr.id}
                  href={`/learning/${enr.offering}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate group-hover:text-emerald-700">
                      {enr.offering_summary?.course_title ?? `Course ${enr.offering}`}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${enr.progress_percent}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0">{enr.progress_percent}%</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick access cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/results"
          className="group flex flex-col rounded-2xl border border-brand-200/60 bg-white p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-brand-600 rounded-t-2xl" />
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center mb-4 ring-1 ring-brand-100">
            <FileText className="w-5 h-5 text-brand-700" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Academic records</p>
          <h2 className="font-display text-xl text-slate-900 mt-1">My Results</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed flex-1">Semester results, GPA, CGPA, and official academic summary.</p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 mt-4 group-hover:gap-2 transition-all">
            Open <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
        <Link
          href="/learning"
          className="group flex flex-col rounded-2xl border border-gold-200/60 bg-white p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gold-500 rounded-t-2xl" />
          <div className="w-10 h-10 rounded-xl bg-gold-50 flex items-center justify-center mb-4 ring-1 ring-gold-100">
            <BookOpen className="w-5 h-5 text-gold-700" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Virtual learning</p>
          <h2 className="font-display text-xl text-slate-900 mt-1">Learning</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed flex-1">Enrolled courses, lessons, quizzes, and assignments.</p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700 mt-4 group-hover:gap-2 transition-all">
            Open <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </div>

      {/* Pending work row */}
      {learningStats && (learningStats.pending_quizzes > 0 || learningStats.pending_assignments > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {learningStats.pending_quizzes > 0 && (
            <Link href="/learning" className="group rounded-2xl border border-amber-200 bg-amber-50 p-5 hover:bg-amber-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Target className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-amber-800">
                    {learningStats.pending_quizzes} Quiz{learningStats.pending_quizzes > 1 ? 'zes' : ''} pending
                  </div>
                  <div className="text-xs text-amber-600">Complete before the deadline</div>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400 ml-auto group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          )}
          {learningStats.pending_assignments > 0 && (
            <Link href="/learning" className="group rounded-2xl border border-blue-200 bg-blue-50 p-5 hover:bg-blue-100 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-blue-800">
                    {learningStats.pending_assignments} Assignment{learningStats.pending_assignments > 1 ? 's' : ''} pending
                  </div>
                  <div className="text-xs text-blue-600">Submit before the due date</div>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-400 ml-auto group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
