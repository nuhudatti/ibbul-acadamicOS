'use client'



import { useEffect, useState } from 'react'

import Link from 'next/link'

import { useParams, useRouter } from 'next/navigation'

import { Users, ArrowLeft } from 'lucide-react'

import { toast } from 'sonner'

import { useAuthStore } from '@/lib/store'

import { learningAPI } from '@/lib/api'

import {

  LPageHeader, LBreadcrumb, LEmpty, LSkeleton, LButton,

} from '@/components/modules/learning/learning-ui'

import { LecturerGradingWorkspace } from '@/components/modules/learning/lecturer-grading-workspace'



interface StudentRow {

  user_id: number

  student_id: string

  full_name: string

  email: string

  progress_percent: number

  lessons_completed: number

  total_lessons: number

}



export default function OfferingStudentsPage() {

  const params = useParams()

  const router = useRouter()

  const id = Number(params.id)

  const role = useAuthStore((s) => s.user?.role)

  const [loading, setLoading] = useState(true)

  const [students, setStudents] = useState<StudentRow[]>([])

  const [courseCode, setCourseCode] = useState('')



  useEffect(() => {

    const allowed = ['EXAMINER', 'DEPARTMENT_ADMIN', 'HOD', 'FACULTY_ADMIN', 'SUPER_ADMIN']

    if (role && !allowed.includes(role)) {

      router.replace(`/learning/offerings/${id}`)

      return

    }

    Promise.all([

      learningAPI.getOfferingStudents(id),

      learningAPI.getOfferingDetail(id),

    ])

      .then(([studResp, offResp]) => {

        setStudents(studResp.data.students ?? [])

        setCourseCode(offResp.data.course_code ?? '')

      })

      .catch(() => toast.error('Failed to load students'))

      .finally(() => setLoading(false))

  }, [id, role, router])



  return (

    <div className="max-w-5xl mx-auto space-y-5">

      <LBreadcrumb items={[

        { label: courseCode || 'Course', href: `/learning/offerings/${id}` },

        { label: 'Students & grades' },

      ]} />



      <LPageHeader

        eyebrow="Teaching"

        title="Students & grading"

        description="One row per student — expand to review submissions and save grades without leaving the page."

        action={

          role === 'EXAMINER' ? (

            <Link href={`/learning/offerings/${id}/manage`}>

              <LButton variant="secondary"><ArrowLeft className="w-4 h-4" /> Studio</LButton>

            </Link>

          ) : undefined

        }

      />



      {loading ? (

        <div className="space-y-3">

          {Array.from({ length: 3 }).map((_, i) => <LSkeleton key={i} className="h-20" />)}

        </div>

      ) : students.length === 0 ? (

        <LEmpty icon={Users} title="No students yet" description="Students appear here after enrolling in your published course." />

      ) : (

        <LecturerGradingWorkspace offeringId={id} students={students} />

      )}

    </div>

  )

}

