import { coreAPI } from '@/lib/api'

/** Normalize DRF paginated or plain array responses. */
export function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'results' in data) {
    return (data as { results: T[] }).results ?? []
  }
  return []
}

export interface TreeCourse {
  id: number
  code: string
  title: string
  credit_units?: number
  level?: string
  semester?: string
  is_active?: boolean
}

export interface TreeDepartment {
  id: number
  code: string
  name: string
  is_active?: boolean
  courses: TreeCourse[]
}

export interface TreeFaculty {
  id: number
  code: string
  name: string
  is_active?: boolean
  departments: TreeDepartment[]
}

export interface GovernanceStats {
  faculties: number
  departments: number
  courses: number
  students: number
  currentSession: string | null
}

export async function loadAcademicTree(): Promise<TreeFaculty[]> {
  const resp = await coreAPI.getAcademicTree()
  return normalizeList<TreeFaculty>(resp.data)
}

export async function loadGovernanceStats(): Promise<GovernanceStats> {
  const resp = await coreAPI.getSummary()
  const data = resp.data ?? {}
  const counts = (data.counts ?? data) as Record<string, number>
  const session = data.current_session as { name?: string } | null | undefined
  return {
    faculties: counts.faculties ?? 0,
    departments: counts.departments ?? 0,
    courses: counts.courses ?? 0,
    students: counts.students ?? 0,
    currentSession: session?.name ?? null,
  }
}

export function facultyMetrics(faculty: TreeFaculty) {
  const deptCount = faculty.departments?.length ?? 0
  const courseCount = (faculty.departments ?? []).reduce(
    (sum, d) => sum + (d.courses?.length ?? 0),
    0
  )
  return { deptCount, courseCount }
}

export function departmentMetrics(dept: TreeDepartment) {
  return { courseCount: dept.courses?.length ?? 0 }
}
