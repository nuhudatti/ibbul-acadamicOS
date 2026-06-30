'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Users, FileText, ChevronRight, TrendingUp } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { learningAPI, academicsAPI } from '@/lib/api'
import { StatCard, StatCardSkeleton } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import type { LMSOffering } from '@/lib/types'

export function ExaminerDashboard() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [offerings, setOfferings] = useState<LMSOffering[]>([])
  const [learningStats, setLearningStats] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const [offerResp, statsResp] = await Promise.allSettled([
          learningAPI.getMyOfferings(),
          learningAPI.getDashboardStats(),
        ])
        if (offerResp.status === 'fulfilled') setOfferings(offerResp.value.data ?? [])
        if (statsResp.status === 'fulfilled') setLearningStats(statsResp.value.data)
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="space-y-7">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-teal-700 to-teal-900 p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }}
        />
        <div className="relative">
          <div className="text-xs text-teal-300 uppercase tracking-widest font-medium mb-1">Instructor Portal</div>
          <h1 className="text-2xl font-bold">
            {user?.first_name ? `${user.first_name} ${user.last_name}` : 'Lecturer'}
          </h1>
          <p className="text-teal-300 text-sm mt-1">
            {user?.department_name ?? user?.department ?? ''}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="My Courses" value={learningStats.total_offerings ?? offerings.length}
              sub="LMS offerings" icon={BookOpen} iconBg="bg-teal-50" iconColor="text-teal-600" />
            <StatCard label="Published" value={learningStats.published_offerings ?? offerings.filter(o => o.is_published).length}
              sub="Visible to students" icon={TrendingUp} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <StatCard label="Enrolled Students" value={learningStats.total_enrolled ?? 0}
              sub="Across all courses" icon={Users} iconBg="bg-blue-50" iconColor="text-blue-600" />
            <StatCard label="Pending Submissions" value={learningStats.pending_submissions ?? 0}
              sub="Assignments to grade" icon={FileText} iconBg="bg-amber-50" iconColor="text-amber-600" />
          </>
        )}
      </div>

      {/* Course offerings */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-800">My Course Offerings</h2>
          </div>
          <Link href="/learning/my-offerings" className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-0.5">
            Manage <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {loading ? (
          <div className="p-5 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-40 rounded" />
                  <div className="skeleton h-2.5 w-24 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : offerings.length === 0 ? (
          <div className="py-12 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No course offerings yet</p>
            <Link href="/learning/my-offerings" className="text-xs text-teal-600 font-medium mt-2 inline-block">
              Create your first offering →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {offerings.slice(0, 6).map((o) => (
              <Link
                key={o.id}
                href={`/learning/offerings/${o.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 group-hover:text-teal-700">
                    {o.course_code} — {o.course_title}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {o.session} · {o.semester === 'FIRST' ? '1st' : '2nd'} Semester · {o.enrolled_count} enrolled
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {o.is_published
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">Published</span>
                    : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">Draft</span>
                  }
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
