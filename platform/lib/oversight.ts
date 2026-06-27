import { academicsAPI, auditAPI, coreAPI } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Faculty {
  id: number
  code: string
  name: string
  department_count?: number
}

export interface Department {
  id: number
  code: string
  name: string
  faculty: number
  faculty_name?: string
  course_count?: number
}

export interface UploadBatchRow {
  id: number
  filename: string
  session: string
  semester: string
  status: string
  approval_status: string
  success_count: number
  error_count: number
  created_at: string
  completed_at: string | null
  uploaded_by_display: string | null
  department: number | null
  department_name: string | null
  faculty: number | null
  faculty_name: string | null
  approved_by_display: string | null
  approved_at: string | null
  rejection_reason: string | null
  is_pending_approval: boolean
}

export interface FacultyMetrics {
  id: number
  code: string
  name: string
  departmentCount: number
  studentCount: number
  batchCount: number
  pendingApprovals: number
  publishedResults: number
  lastActivity: string | null
}

export interface DepartmentMetrics {
  id: number
  code: string
  name: string
  facultyId: number
  studentCount: number
  courseCount: number
  batchCount: number
  pendingApprovals: number
  publishedCount: number
  lastActivity: string | null
}

export interface BatchResultRow {
  id: number
  student: number
  student_info?: { student_id?: string; first_name?: string; last_name?: string }
  course: number
  course_info?: { code?: string; title?: string; credit_units?: number }
  score: string | number | null
  grade: string
  status: string
  session: string
  semester: string
  department_name?: string
}

export interface BatchDetail extends UploadBatchRow {
  results: BatchResultRow[]
}

export interface AuditRow {
  id: number
  action: string
  identifier: string
  user_email?: string
  created_at: string
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchPaginated<T>(
  fetcher: (params: Record<string, string>) => Promise<{ data: { results?: T[]; count?: number } | T[] }>,
  extraParams: Record<string, string> = {}
): Promise<T[]> {
  const all: T[] = []
  let page = 1
  const pageSize = 200
  while (true) {
    const resp = await fetcher({ ...extraParams, page: String(page), page_size: String(pageSize) })
    const data = resp.data
    const rows: T[] = Array.isArray(data) ? data : (data.results ?? [])
    all.push(...rows)
    const count = Array.isArray(data) ? rows.length : (data.count ?? rows.length)
    if (all.length >= count || rows.length < pageSize) break
    page += 1
  }
  return all
}

async function fetchAllFaculties(): Promise<Faculty[]> {
  return fetchPaginated<Faculty>((p) => coreAPI.getFaculties(p) as never)
}

async function fetchAllDepartments(facultyId?: number): Promise<Department[]> {
  const params = facultyId ? { faculty_id: String(facultyId) } : {}
  return fetchPaginated<Department>(
    (p) => coreAPI.getDepartments({ ...params, ...p }) as never
  )
}

async function fetchAllBatches(): Promise<UploadBatchRow[]> {
  const all: UploadBatchRow[] = []
  let page = 1
  const pageSize = 200
  while (true) {
    const resp = await academicsAPI.getUploadBatches({
      page: String(page),
      page_size: String(pageSize),
    })
    const data = resp.data
    const rows: UploadBatchRow[] = data.results ?? (Array.isArray(data) ? data : [])
    all.push(...rows)
    const count = data.count ?? rows.length
    if (all.length >= count || rows.length < pageSize) break
    page += 1
  }
  return all
}

async function fetchStudentCountsByDepartment(
  departments: Department[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  await Promise.all(
    departments.map(async (dept) => {
      try {
        const resp = await coreAPI.getStudents({ department_id: String(dept.id) })
        const list = Array.isArray(resp.data) ? resp.data : resp.data?.results ?? []
        counts.set(dept.id, list.length)
      } catch {
        counts.set(dept.id, 0)
      }
    })
  )
  return counts
}

function isPendingBatch(b: UploadBatchRow): boolean {
  return (
    b.is_pending_approval ||
    b.approval_status === 'PENDING' ||
    b.approval_status === 'PENDING_APPROVAL'
  )
}

function isPublishedBatch(b: UploadBatchRow): boolean {
  return (
    b.approval_status === 'APPROVED' ||
    b.status === 'LOCKED_PUBLISHED' ||
    b.approval_status === 'LOCKED_PUBLISHED'
  )
}

function latestTimestamp(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter(Boolean) as string[]
  if (!valid.length) return null
  return valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

// ─── Aggregation ───────────────────────────────────────────────────────────────

export async function loadFacultyOverview(): Promise<FacultyMetrics[]> {
  const [faculties, departments, batches] = await Promise.all([
    fetchAllFaculties(),
    fetchAllDepartments(),
    fetchAllBatches(),
  ])
  const studentCounts = await fetchStudentCountsByDepartment(departments)

  const deptByFaculty = new Map<number, Department[]>()
  for (const d of departments) {
    const list = deptByFaculty.get(d.faculty) ?? []
    list.push(d)
    deptByFaculty.set(d.faculty, list)
  }

  return faculties.map((f) => {
    const facDepts = deptByFaculty.get(f.id) ?? []
    const facDeptIds = new Set(facDepts.map((d) => d.id))
    const facBatches = batches.filter(
      (b) => b.faculty === f.id || (b.department != null && facDeptIds.has(b.department))
    )

    const studentCount = facDepts.reduce(
      (sum, d) => sum + (studentCounts.get(d.id) ?? 0),
      0
    )

    return {
      id: f.id,
      code: f.code,
      name: f.name,
      departmentCount: f.department_count ?? facDepts.length,
      studentCount,
      batchCount: facBatches.length,
      pendingApprovals: facBatches.filter(isPendingBatch).length,
      publishedResults: facBatches
        .filter(isPublishedBatch)
        .reduce((sum, b) => sum + (b.success_count ?? 0), 0),
      lastActivity: latestTimestamp(facBatches.map((b) => b.created_at)),
    }
  })
}

export async function loadDepartmentOverview(
  facultyId: number
): Promise<{ faculty: Faculty | null; departments: DepartmentMetrics[] }> {
  const [faculties, departments, batches] = await Promise.all([
    fetchAllFaculties(),
    fetchAllDepartments(facultyId),
    fetchAllBatches(),
  ])

  const faculty = faculties.find((f) => f.id === facultyId) ?? null
  const studentCounts = await fetchStudentCountsByDepartment(departments)

  const deptMetrics: DepartmentMetrics[] = departments.map((d) => {
    const deptBatches = batches.filter((b) => b.department === d.id)
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      facultyId: d.faculty,
      studentCount: studentCounts.get(d.id) ?? 0,
      courseCount: d.course_count ?? 0,
      batchCount: deptBatches.length,
      pendingApprovals: deptBatches.filter(isPendingBatch).length,
      publishedCount: deptBatches
        .filter(isPublishedBatch)
        .reduce((sum, b) => sum + (b.success_count ?? 0), 0),
      lastActivity: latestTimestamp(deptBatches.map((b) => b.created_at)),
    }
  })

  return { faculty, departments: deptMetrics }
}

export async function loadDepartmentBatches(departmentId: number): Promise<UploadBatchRow[]> {
  const resp = await academicsAPI.getUploadBatches({
    department_id: String(departmentId),
    page_size: '200',
  })
  const data = resp.data
  return data.results ?? (Array.isArray(data) ? data : [])
}

export async function loadBatchDetail(batchId: number): Promise<BatchDetail> {
  const resp = await academicsAPI.getUploadBatchDetail(batchId)
  return resp.data as BatchDetail
}

export async function loadBatchAudit(filename: string): Promise<AuditRow[]> {
  try {
    const resp = await auditAPI.list({ search: filename, page_size: '20' })
    return resp.data?.results ?? []
  } catch {
    return []
  }
}

export function computeGradeSummary(results: BatchResultRow[]) {
  const grades: Record<string, number> = {}
  let totalScore = 0
  let scored = 0
  const students = new Set<number>()

  for (const r of results) {
    students.add(r.student)
    const g = r.grade || '—'
    grades[g] = (grades[g] ?? 0) + 1
    const n = typeof r.score === 'number' ? r.score : parseFloat(String(r.score ?? ''))
    if (!isNaN(n)) {
      totalScore += n
      scored += 1
    }
  }

  return {
    totalRecords: results.length,
    uniqueStudents: students.size,
    averageScore: scored ? Math.round((totalScore / scored) * 10) / 10 : null,
    gradeDistribution: Object.entries(grades).sort((a, b) => b[1] - a[1]),
  }
}

export function approvalStatusLabel(batch: UploadBatchRow): string {
  if (isPublishedBatch(batch)) return 'Published'
  if (batch.approval_status === 'REJECTED') return 'Rejected'
  if (isPendingBatch(batch)) return 'Pending Approval'
  if (batch.status === 'COMPLETED') return 'Completed'
  if (batch.status === 'FAILED') return 'Failed'
  return batch.approval_status || batch.status
}

export function approvalStatusTone(batch: UploadBatchRow): 'success' | 'warning' | 'danger' | 'neutral' {
  if (isPublishedBatch(batch)) return 'success'
  if (batch.approval_status === 'REJECTED' || batch.status === 'FAILED') return 'danger'
  if (isPendingBatch(batch)) return 'warning'
  return 'neutral'
}
