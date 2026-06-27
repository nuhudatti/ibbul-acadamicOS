import { academicsAPI, coreAPI } from '@/lib/api'
import {
  loadAcademicTree,
  facultyMetrics,
  departmentMetrics,
  type TreeFaculty,
  type TreeDepartment,
} from '@/lib/governance'

export interface FacultyGovernanceStats {
  departments: number
  courses: number
  students: number
  staff: number
  hods: number
  lecturers: number
  currentSession: string | null
  pendingResults: number
  publishedResults: number
  uploadsThisMonth: number
}

export interface FacultyStaffCounts {
  total: number
  hods: number
  lecturers: number
}

export async function loadFacultyGovernanceStats(): Promise<FacultyGovernanceStats> {
  const [summaryResp, hodStatsResp, staffResp] = await Promise.allSettled([
    coreAPI.getSummary(),
    academicsAPI.hodGetStats(),
    coreAPI.getStaff(),
  ])

  const summary = summaryResp.status === 'fulfilled' ? summaryResp.value.data : {}
  const counts = (summary.counts ?? summary) as Record<string, number>
  const session = summary.current_session as { name?: string } | null | undefined

  const hod = hodStatsResp.status === 'fulfilled' ? hodStatsResp.value.data ?? {} : {}
  const staffList = staffResp.status === 'fulfilled'
    ? (Array.isArray(staffResp.value.data) ? staffResp.value.data : staffResp.value.data?.results ?? [])
    : []

  const hods = staffList.filter(
    (u: { role: string }) => u.role === 'DEPARTMENT_ADMIN' || u.role === 'HOD'
  ).length
  const lecturers = staffList.filter((u: { role: string }) => u.role === 'EXAMINER').length

  return {
    departments: counts.departments ?? 0,
    courses: counts.courses ?? 0,
    students: counts.students ?? 0,
    staff: staffList.length,
    hods,
    lecturers,
    currentSession: session?.name ?? null,
    pendingResults: hod.pending_approvals ?? hod.pending ?? hod.hod_review ?? 0,
    publishedResults: hod.approved ?? hod.locked_published ?? 0,
    uploadsThisMonth: hod.uploads_this_month ?? 0,
  }
}

export async function loadFacultyTree(facultyId?: number | null): Promise<TreeFaculty | null> {
  const tree = await loadAcademicTree()
  if (facultyId) {
    return tree.find((f) => f.id === facultyId) ?? null
  }
  return tree[0] ?? null
}

export { facultyMetrics, departmentMetrics, type TreeFaculty, type TreeDepartment }
