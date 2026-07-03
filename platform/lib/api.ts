/**
 * Axios API client with automatic JWT injection and token refresh.
 * Browser requests use the same-origin /api/backend proxy (production).
 */
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { isTokenExpired } from './utils'
import { resolveApiBase } from './api-config'
import { safeStr } from './safe-string'

function getApiPrefix(): string {
  return resolveApiBase().apiPrefix
}

/** Ensure path has leading + trailing slash for Django API routes. */
function apiPath(path: string | null | undefined): string {
  const raw = safeStr(path, '/')
  const qIndex = raw.search(/[?#]/)
  const pathname = qIndex === -1 ? raw : raw.slice(0, qIndex)
  const suffix = qIndex === -1 ? '' : raw.slice(qIndex)
  const withLeading = pathname.startsWith('/') ? pathname : `/${pathname}`
  const normalized = withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  return `${normalized}${suffix}`
}

/** Routes that must not send stale tokens or trigger refresh (login, setup, etc.). */
const PUBLIC_API_PATHS = [
  '/accounts/login/',
  '/accounts/token/refresh/',
  '/accounts/forgot-password/',
  '/accounts/reset-password/',
  '/accounts/invitations/verify/',
  '/accounts/invitations/accept/',
  '/core/setup/status/',
  '/core/platform-branding/public/',
]

function isPublicApiRequest(url?: string): boolean {
  if (!url) return false
  const pathOnly = url.split('?')[0].split('#')[0]
  const normalized = pathOnly.endsWith('/') ? pathOnly : `${pathOnly}/`
  return PUBLIC_API_PATHS.some(
    (p) => normalized === p || normalized.endsWith(p) || normalized.includes(p),
  )
}

/** Multipart POST through the same /api/backend client as login. */
function multipartPost(path: string, formData: FormData, timeout = 120_000) {
  return api.post(path, formData, {
    timeout,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })
}

// ─── Token storage helpers (browser-only) ─────────────────────────────────────

const TOKEN_KEY = 'ibbul_access'
const REFRESH_KEY = 'ibbul_refresh'

export const tokenStorage = {
  getAccess: (): string | null =>
    typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  getRefresh: (): string | null =>
    typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null,
  setTokens: (access: string, refresh: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, access)
      localStorage.setItem(REFRESH_KEY, refresh)
      // Bridge keys for the Vite Result Checker (reads 'access_token'/'refresh_token').
      // Because both apps are proxied through the same origin (port 3000),
      // they share localStorage — the Vite app picks these up automatically.
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)
    }
  },
  clearTokens: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
  },
}

/** Axios may leave JSON bodies as strings when the proxy omits Content-Type. */
export function normalizeResponseData<T = unknown>(data: T): T {
  let current: unknown = data
  for (let attempt = 0; attempt < 2; attempt++) {
    if (typeof current !== 'string') break
    const trimmed = current.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) break
    try {
      current = JSON.parse(trimmed) as unknown
    } catch {
      break
    }
  }
  return current as T
}

function shouldNormalizeResponseType(responseType?: string): boolean {
  return responseType !== 'blob' && responseType !== 'arraybuffer' && responseType !== 'stream'
}

// ─── Axios instance ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  headers: { 'Content-Type': 'application/json' },
  timeout: 60_000,
})

// Resolve base URL per request so production browser always uses /api/backend proxy.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!config.baseURL && !config.url?.startsWith('http')) {
    config.baseURL = getApiPrefix()
  }
  if (config.url && !config.url.startsWith('http')) {
    config.url = apiPath(config.url)
  }
  if (config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  return config
})

// ─── Request interceptor — inject Bearer token ─────────────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  // Never attach or refresh tokens on public auth routes (fixes login with stale localStorage).
  if (isPublicApiRequest(config.url)) {
    if (config.headers) {
      delete config.headers.Authorization
    }
    return config
  }

  let access = tokenStorage.getAccess()
  const refresh = tokenStorage.getRefresh()

  // Refresh access token if expired and refresh token exists
  if (access && isTokenExpired(access) && refresh && !isTokenExpired(refresh)) {
    try {
      const response = await axios.post(`${getApiPrefix()}${apiPath('/accounts/token/refresh')}`, {
        refresh,
      })
      const refreshData = normalizeResponseData(response.data) as { access?: string; refresh?: string }
      access = refreshData.access ?? null
      const newRefresh = refreshData.refresh ?? refresh
      if (access) tokenStorage.setTokens(access, newRefresh)
    } catch (refreshErr) {
      tokenStorage.clearTokens()
      return Promise.reject(refreshErr)
    }
  }

  if (access) {
    config.headers.Authorization = `Bearer ${access}`
  }
  return config
})

// ─── Response interceptor — parse string JSON + handle 401 ───────────────────

api.interceptors.response.use(
  (response) => {
    if (shouldNormalizeResponseType(response.config.responseType)) {
      response.data = normalizeResponseData(response.data)
    }
    return response
  },
  async error => {
    if (error.response?.data && shouldNormalizeResponseType(error.config?.responseType)) {
      error.response.data = normalizeResponseData(error.response.data)
    }

    const original = error.config
    if (
      error.response?.status === 401
      && original
      && !original._retry
      && !isPublicApiRequest(original.url)
    ) {
      original._retry = true
      const refresh = tokenStorage.getRefresh()
      if (refresh && !isTokenExpired(refresh)) {
        try {
          const response = await axios.post(`${getApiPrefix()}${apiPath('/accounts/token/refresh')}`, { refresh })
          const refreshData = normalizeResponseData(response.data) as { access?: string; refresh?: string }
          const newAccess = refreshData.access
          const newRefresh = refreshData.refresh ?? refresh
          if (!newAccess) throw new Error('Refresh response missing access token')
          tokenStorage.setTokens(newAccess, newRefresh)
          original.headers.Authorization = `Bearer ${newAccess}`
          return api(original)
        } catch {
          tokenStorage.clearTokens()
          if (typeof window !== 'undefined') window.location.href = '/login'
        }
      } else {
        tokenStorage.clearTokens()
        if (typeof window !== 'undefined') window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth endpoints ─────────────────────────────────────────────────────────────

export const authAPI = {
  login: (credentials: { username: string; password: string }) =>
    api.post('/accounts/login/', credentials, { timeout: 120_000 }),

  refreshToken: (refresh: string) =>
    api.post('/accounts/token/refresh/', { refresh }),

  getProfile: () => api.get('/accounts/profile/'),

  changePassword: (data: { current_password: string; new_password: string; new_password_confirm: string }) =>
    api.post('/accounts/settings/change-password/', data),

  firstLoginChangePassword: (data: { current_password: string; new_password: string; new_password_confirm: string }) =>
    api.post('/accounts/first-login/change-password/', data),

  forgotPassword: (data: { reg_number_or_email: string }) =>
    api.post('/accounts/forgot-password/', data),

  forgotPasswordConfirm: (data: { uidb64: string; token: string; new_password: string; new_password_confirm: string }) =>
    api.post('/accounts/forgot-password/confirm/', data),

  updateEmail: (data: { email: string }) =>
    api.patch('/accounts/settings/update-email/', data),
}

// ─── Academic Core — single source of truth ────────────────────────────────────
// Both Results and Learning modules MUST use coreAPI for structure/identity data.
// They must NOT call their own structure endpoints.

export const coreAPI = {
  // Structure
  getFaculties: (params?: Record<string, string>) =>
    api.get('/core/faculties/', { params }),

  createFaculty: (data: { name: string; code: string; is_active?: boolean }) =>
    api.post('/core/faculties/', data),

  getDepartments: (params?: Record<string, string>) =>
    api.get('/core/departments/', { params }),

  createDepartment: (data: { name: string; code: string; faculty: number; is_active?: boolean }) =>
    api.post('/core/departments/', data),

  getCourses: (params?: Record<string, string>) =>
    api.get('/core/courses/', { params }),

  bulkCreateCourses: (data: {
    department_id?: number
    courses: Array<{
      code: string
      title: string
      level: string
      semester: string
      credit_units?: number
      examiner_id?: number | null
    }>
  }) => api.post('/core/courses/bulk/', data),

  deleteCourse: (courseId: number) => api.delete(`/core/courses/${courseId}/`),

  getAcademicTree: () => api.get('/core/tree/'),

  // Sessions
  getSessions: () => api.get('/core/sessions/'),
  getCurrentSession: () => api.get('/core/sessions/current/'),
  createSession: (data: { name: string; is_current?: boolean; start_date?: string; end_date?: string }) =>
    api.post('/core/sessions/', data),
  updateSession: (id: number, data: Partial<{ name: string; is_current: boolean; start_date: string; end_date: string }>) =>
    api.patch(`/core/sessions/${id}/`, data),

  // Student course registrations
  getRegistrations: (params?: Record<string, string>) =>
    api.get('/core/registrations/', { params }),
  getMyRegistrations: () => api.get('/core/my-registrations/'),
  createRegistration: (data: { student: number; course: number; session: number; semester: string; status?: string }) =>
    api.post('/core/registrations/', data),

  // Scoped user lists
  getStudents: (params?: Record<string, string>) =>
    api.get('/core/students/', { params }),
  getStaff: () => api.get('/core/staff/'),

  // Summary / context
  getSummary: () => api.get('/core/summary/'),

  /** Public branding for login, emails, and auth pages (no auth required). */
  getPlatformBrandingPublic: () => api.get('/core/platform-branding/public/'),

  /** Super Admin: persist logo, background, and colours to the server. */
  updatePlatformBranding: (data: Record<string, unknown>) =>
    api.patch('/core/platform-branding/', data),

  /** Upload branding asset to Cloudinary → returns { url, publicId } */
  uploadPlatformBrandingAsset: (file: File, type: 'logo' | 'background' | 'banner') => {
    const form = new FormData()
    form.append('file', file)
    form.append('type', type)
    return api.post('/core/platform-branding/upload/', form, { timeout: 120_000 })
  },

  /** Enterprise setup wizard (first run only) */
  getSetupStatus: () => api.get('/core/setup/status/'),
  completeSetup: (data: Record<string, unknown>) =>
    api.post('/core/setup/complete/', data),
}

// ─── Results Module endpoints ────────────────────────────────────────────────────

export const academicsAPI = {
  getCourses: (params?: Record<string, string>) =>
    api.get('/academics/courses/', { params }),

  getMyAssignedCourses: () =>
    api.get('/academics/courses/my_assigned/'),

  getResults: (params?: Record<string, string>) =>
    api.get('/academics/results/', { params }),

  getMyResults: () =>
    api.get('/academics/results/my_results/'),

  getResultSummary: (params: { student_id?: string; session?: string; semester?: string }) =>
    api.get('/academics/results/summary/', { params }),

  getMyGPA: () => api.get('/academics/gpa/my_gpa/'),

  // HOD endpoints
  hodGetResults: (params?: Record<string, string>) =>
    api.get('/academics/hod/results/', { params }),

  hodApproveResult: (id: number) =>
    api.post(`/academics/hod/results/${id}/approve/`),

  hodRejectResult: (id: number, reason: string) =>
    api.post(`/academics/hod/results/${id}/reject/`, { reason, rejection_reason: reason }),

  hodBulkApprove: (ids: number[]) =>
    api.post('/academics/hod/results/bulk_approve/', { result_ids: ids }),

  hodBulkReject: (ids: number[], reason: string) =>
    api.post('/academics/hod/results/bulk_reject/', { result_ids: ids, reason, rejection_reason: reason }),

  hodBulkUnapprove: (ids: number[]) =>
    api.post('/academics/hod/results/bulk_unapprove/', { result_ids: ids }),

  hodBulkDelete: (ids: number[]) =>
    api.post('/academics/hod/results/bulk_delete/', { result_ids: ids }),

  hodUnapproveResult: (id: number) =>
    api.post(`/academics/hod/results/${id}/unapprove/`),

  deleteResult: (id: number) =>
    api.delete(`/academics/hod/results/${id}/`),

  hodGetStats: () =>
    api.get('/academics/hod/results/summary_stats/'),

  // Upload — same flow as the working Result Checker app (/api/admin/upload-results/)
  uploadResultsCreate: (formData: FormData) =>
    multipartPost('/admin/upload-results/', formData),

  getUploadBatchStatus: (batchId: number) =>
    api.get(`/admin/upload-results/${batchId}/`),

  retryUploadBatch: (batchId: number) =>
    api.post(`/admin/upload-results/${batchId}/retry/`),

  // HOD validate/preview/submit (optional pre-check flow)
  validateUpload: (formData: FormData) =>
    multipartPost('/academics/hod/upload/validate/', formData, 180_000),

  previewUpload: (formData: FormData) =>
    multipartPost('/academics/hod/upload/preview/', formData, 180_000),

  submitUpload: (formData: FormData) =>
    multipartPost('/academics/hod/upload/submit/', formData, 300_000),

  manualEntry: (payload: {
    student_id?: string
    course_code?: string
    score?: number
    session?: string
    semester?: string
    results?: Array<{
      student_id: string
      course_code: string
      score: number
      session: string
      semester: string
    }>
  }) => api.post('/academics/results/manual_entry/', payload),

  /** Full student semester manual entry (IBBUL format — course lines + summary) */
  manualStudentEntry: (payload: {
    student_id: string
    session: string
    semester: 'FIRST' | 'SECOND'
    course_entries?: string
    course_lines?: string[]
    summary?: string | Record<string, string>
  }) => api.post('/academics/hod/manual-entry/', payload),

  searchStudents: (params?: Record<string, string>) =>
    api.get('/academics/students/', { params }),

  getUploadBatches: (params?: Record<string, string>) =>
    api.get('/academics/upload-batches/', { params }),

  getUploadBatchDetail: (id: number) =>
    api.get(`/academics/upload-batches/${id}/`),

  downloadUploadBatchErrorReport: (id: number) =>
    api.get(`/academics/upload-batches/${id}/error-report/`, { responseType: 'blob' }),

  approveBatch: (id: number) =>
    api.post(`/academics/upload-batches/${id}/approve/`),

  rejectBatch: (id: number, reason: string) =>
    api.post(`/academics/upload-batches/${id}/reject/`, { reason }),

  getExaminers: (params?: Record<string, string>) =>
    api.get('/academics/hod/users/', { params }),

  assignCourses: (userId: number, courseIds: number[]) =>
    api.post(`/academics/hod/users/${userId}/assign_courses/`, { course_ids: courseIds }),

  getResultsByCourse: (courseId: number) =>
    api.get('/academics/results/by_course/', { params: { course_id: String(courseId) } }),
}

// ─── Audit endpoints ────────────────────────────────────────────────────────────

export const auditAPI = {
  list: (params?: Record<string, string>) =>
    api.get('/accounts/audit/', { params }),
}

// ─── Staff invitations & governance (Super Admin) ───────────────────────────────

export interface StaffInvitationRecord {
  id: number
  email: string | null
  student_id: string | null
  first_name: string
  last_name: string
  role: string
  role_label: string
  faculty_id: number | null
  faculty_name: string | null
  department_id: number | null
  department_name: string | null
  status: string
  delivery_status: string
  delivery_error: string | null
  send_count: number
  invite_url: string | null
  token_preview: string | null
  created_at: string | null
  sent_at: string | null
  last_sent_at: string | null
  accepted_at: string | null
  expires_at: string | null
  is_expired: boolean
  user_id: number | null
  invited_by_email: string | null
}

export const invitationAPI = {
  list: (params?: Record<string, string>) =>
    api.get<{ results: StaffInvitationRecord[]; count: number }>('/accounts/invitations/', { params }),

  create: (data: {
    email: string
    first_name: string
    last_name: string
    role: string
    faculty_id?: number | null
    department_id?: number | null
    student_id?: string | null
  }) =>
    api.post<{
      message: string
      email_sent?: boolean
      delivery_status?: string
      delivery_error?: string | null
      invitation: StaffInvitationRecord
    }>('/accounts/invitations/', data, { timeout: 90_000 }),

  resend: (id: number) =>
    api.post<{
      message: string
      email_sent?: boolean
      delivery_status?: string
      delivery_error?: string | null
      invitation: StaffInvitationRecord
    }>(`/accounts/invitations/${id}/resend/`, undefined, { timeout: 90_000 }),

  revoke: (id: number) =>
    api.post<{ message: string; invitation: StaffInvitationRecord }>(`/accounts/invitations/${id}/revoke/`),

  verify: (token: string) =>
    api.get('/accounts/invitations/verify/', { params: { token } }),

  accept: (data: { token: string; password: string; password_confirm: string }) =>
    api.post('/accounts/invitations/accept/', data),
}

export const governanceStaffAPI = {
  suspend: (userId: number) =>
    api.post<{ message: string }>(`/accounts/governance/staff/${userId}/suspend/`),

  reactivate: (userId: number) =>
    api.post<{ message: string }>(`/accounts/governance/staff/${userId}/reactivate/`),

  removeAssignment: (userId: number) =>
    api.post<{ message: string }>(`/accounts/governance/staff/${userId}/remove-assignment/`),
}

// ─── HOD Department Management ────────────────────────────────────────────────

export interface HodDepartmentOverview {
  department_id: number | null
  department_name: string | null
  faculty_id: number | null
  faculty_name: string | null
  counts: {
    lecturers: number
    students: number
    pending_invitations: number
    active_lecturers: number
  }
}

export interface HodLecturerRow {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  is_active: boolean
  last_login: string | null
  assigned_courses: { id: number; code: string; title: string }[]
  status: string
  pending: boolean
}

export interface HodStudentRow {
  id: number
  student_id: string
  email: string | null
  first_name: string
  last_name: string
  full_name: string
  department_name: string
  is_active: boolean
  last_login: string | null
  status: string
  pending_activation?: boolean
}

export interface BulkInviteBatchResult {
  message: string
  email_sent_count: number
  email_failed_count: number
  error_count: number
  network_error_count?: number
  already_invited_count?: number
  created_count: number
  total_rows: number
  batch?: number
  batch_total?: number
  email_sent: Array<{
    row: number
    first_name: string
    last_name: string
    student_id: string
    email: string
    invite_url: string
    delivery_status?: string
    delivery_error?: string | null
    email_sent?: boolean
    normalized_from?: string
  }>
  email_failed: Array<{
    row: number
    first_name: string
    last_name: string
    student_id: string
    email: string
    invite_url: string
    delivery_status?: string
    delivery_error?: string | null
    error?: string
    normalized_from?: string
  }>
  errors: Array<{
    row: number
    error: string
    category?: string
    first_name?: string
    last_name?: string
    email?: string
    student_id?: string
    raw_student_id?: string
  }>
  network_errors?: Array<{
    row: number
    error: string
    first_name?: string
    last_name?: string
    email?: string
    student_id?: string
    raw_student_id?: string
  }>
  created?: BulkInviteBatchResult['email_sent']
}

export const hodDepartmentAPI = {
  overview: () =>
    api.get<HodDepartmentOverview>('/academics/hod/department/overview/'),

  lecturers: (params?: Record<string, string>) =>
    api.get<{ results: HodLecturerRow[]; count: number }>('/academics/hod/department/lecturers/', { params }),

  students: (params?: Record<string, string>) =>
    api.get<{ results: HodStudentRow[]; count: number }>('/academics/hod/department/students/', { params }),

  listInvitations: (params?: Record<string, string>) =>
    api.get<{ results: StaffInvitationRecord[]; count: number }>('/academics/hod/department/invitations/', { params }),

  createInvitation: (data: {
    email: string
    first_name: string
    last_name: string
    role: 'EXAMINER' | 'STUDENT'
    student_id?: string
  }) =>
    api.post<{
      message: string
      email_sent?: boolean
      delivery_status?: string
      delivery_error?: string | null
      invitation: StaffInvitationRecord
    }>('/academics/hod/department/invitations/', data, { timeout: 90_000 }),

  resendInvitation: (id: number) =>
    api.post<{
      message: string
      email_sent?: boolean
      delivery_status?: string
      delivery_error?: string | null
      invitation: StaffInvitationRecord
    }>(`/academics/hod/department/invitations/${id}/resend/`, undefined, { timeout: 90_000 }),

  revokeInvitation: (id: number) =>
    api.post<{ message: string; invitation: StaffInvitationRecord }>(`/academics/hod/department/invitations/${id}/revoke/`),

  bulkInviteStudents: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return multipartPost('/academics/hod/department/students/bulk-invite/', form, 600_000)
  },

  bulkInviteRows: (data: {
    rows: Array<{
      row: number
      first_name: string
      last_name: string
      email: string
      student_id: string
      raw_student_id?: string
    }>
    batch?: number
    batch_total?: number
    total_rows?: number
  }) =>
    api.post<BulkInviteBatchResult>('/academics/hod/department/students/bulk-invite-rows/', data, {
      timeout: 180_000,
    }),

  exportPendingInvitations: (scope: 'pending' | 'all' = 'pending') =>
    api.get('/academics/hod/department/invitations/export/', {
      params: { scope },
      responseType: 'blob',
    }),

  deactivateStudent: (id: number) =>
    api.post<{ message: string; is_active: boolean }>(`/academics/hod/department/students/${id}/deactivate/`),

  reactivateStudent: (id: number) =>
    api.post<{ message: string; is_active: boolean }>(`/academics/hod/department/students/${id}/reactivate/`),

  deleteStudent: (id: number) =>
    api.delete<{ message: string }>(`/academics/hod/department/students/${id}/`),
}

// ─── Learning endpoints ─────────────────────────────────────────────────────────

export const learningAPI = {
  // Offerings
  getOfferings: (params?: Record<string, string>) =>
    api.get('/learning/offerings/', { params }),

  getCatalog: () =>
    api.get('/learning/offerings/catalog/'),

  getOfferingDetail: (id: number) =>
    api.get(`/learning/offerings/${id}/`),

  getMyOfferings: () =>
    api.get('/learning/offerings/my_offerings/'),

  getOfferingStudents: (id: number) =>
    api.get<{
      count: number
      course_code?: string
      students: Array<{
        user_id: number
        student_id: string
        full_name: string
        email: string
        progress_percent: number
        lessons_completed: number
        total_lessons: number
      }>
    }>(`/learning/offerings/${id}/students/`),

  createOffering: (data: Partial<{ course: number; session: string; semester: string; description: string; is_published: boolean }>) =>
    api.post('/learning/offerings/', data),

  updateOffering: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/offerings/${id}/`, data),

  // Dashboard stats
  getDashboardStats: () =>
    api.get('/learning/dashboard-stats/'),

  // Enrollments
  getMyEnrollments: () =>
    api.get('/learning/enrollments/my_enrollments/'),

  enroll: (offering_id: number, pin?: string) =>
    api.post('/learning/enrollments/enroll/', { offering_id, ...(pin ? { pin } : {}) }),

  unenroll: (offering_id: number) =>
    api.post('/learning/enrollments/unenroll/', { offering_id }),

  // Modules
  getModules: (offeringId: number) =>
    api.get('/learning/modules/', { params: { offering: offeringId } }),

  createModule: (data: { offering: number; title: string; description?: string; order?: number }) =>
    api.post('/learning/modules/', data),

  updateModule: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/modules/${id}/`, data),

  deleteModule: (id: number) =>
    api.delete(`/learning/modules/${id}/`),

  // Lessons
  getLessons: (moduleId: number) =>
    api.get('/learning/lessons/', { params: { module: moduleId } }),

  getLessonDetail: (id: number) =>
    api.get(`/learning/lessons/${id}/`),

  markLessonComplete: (id: number) =>
    api.post(`/learning/lessons/${id}/mark_complete/`),

  createLesson: (data: Record<string, unknown>) =>
    api.post('/learning/lessons/', data),

  updateLesson: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/lessons/${id}/`, data),

  deleteLesson: (id: number) =>
    api.delete(`/learning/lessons/${id}/`),

  // Quizzes
  getQuiz: (lessonId: number) =>
    api.get('/learning/quizzes/', { params: { lesson: lessonId } }),

  startQuiz: (quizId: number) =>
    api.post(`/learning/quizzes/${quizId}/start/`),

  submitQuiz: (quizId: number, data: {
    answers: Record<string, number | string>
    focus_loss_count: number
    violations?: Array<{ type: string; timestamp: string; metadata?: Record<string, unknown> }>
    timed_out?: boolean
    auto_submitted?: boolean
  }) =>
    api.post(`/learning/quizzes/${quizId}/submit/`, data),

  logQuizViolation: (quizId: number, data: { event_type: string; metadata?: Record<string, unknown> }) =>
    api.post(`/learning/quizzes/${quizId}/log_violation/`, data),

  getMyAttempts: (quizId: number) =>
    api.get(`/learning/quizzes/${quizId}/my_attempts/`),

  createQuiz: (data: Record<string, unknown>) =>
    api.post('/learning/quizzes/', data),

  updateQuiz: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/quizzes/${id}/`, data),

  createAssignment: (data: Record<string, unknown>) =>
    api.post('/learning/assignments/', data),

  updateAssignment: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/assignments/${id}/`, data),

  addQuestion: (quizId: number, data: Record<string, unknown>) =>
    api.post('/learning/questions/', { ...data, quiz: quizId }),

  updateQuestion: (id: number, data: Record<string, unknown>) =>
    api.patch(`/learning/questions/${id}/`, data),

  deleteQuestion: (id: number) =>
    api.delete(`/learning/questions/${id}/`),

  // Assignments
  getAssignment: (lessonId: number) =>
    api.get('/learning/assignments/', { params: { lesson: lessonId } }),

  submitAssignment: (assignmentId: number, data: { content?: string; file_key?: string; focus_loss_count?: number }) =>
    api.post(`/learning/assignments/${assignmentId}/submit/`, data),

  uploadAssignmentSubmission: (assignmentId: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return multipartPost(`/learning/assignments/${assignmentId}/upload-submission/`, fd, 120_000)
  },

  getMySubmission: (assignmentId: number) =>
    api.get(`/learning/assignments/${assignmentId}/my_submission/`),

  getSubmissions: (assignmentId: number) =>
    api.get(`/learning/assignments/${assignmentId}/submissions/`),

  gradeSubmission: (assignmentId: number, data: { student_id: number; score: number; feedback?: string }) =>
    api.post(`/learning/assignments/${assignmentId}/grade/`, data),

  // Learning Engine — proxy fallback when Cloudinary is unavailable (local dev)
  uploadLessonMediaProxy: (lessonId: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)
    const timeout = isVideo ? 600_000 : 180_000
    return multipartPost(`/learning/lessons/${lessonId}/upload-media/`, fd, timeout)
  },

  getLessonUploadSignature: (lessonId: number, filename: string) =>
    api.get<{
      cloud_name: string
      api_key: string
      timestamp: number
      signature: string
      folder: string
      resource_type: string
      upload_url?: string
    }>(`/learning/lessons/${lessonId}/upload-signature/`, { params: { filename } }),

  confirmLessonMedia: (
    lessonId: number,
    data: {
      secure_url: string
      public_id: string
      resource_type: string
      bytes?: number
      format?: string
      original_filename?: string
    },
  ) => api.post(`/learning/lessons/${lessonId}/confirm-media/`, data),

  getLessonMediaAccess: (lessonId: number) =>
    api.get<{
      has_media: boolean
      view_url?: string
      download_url?: string
      filename?: string
      external?: boolean
    }>(`/learning/lessons/${lessonId}/media/access/`),

  getLivePosition: (lessonId: number) =>
    api.get(`/learning/lessons/${lessonId}/live-position/`),

  setLivePosition: (lessonId: number, data: { scroll_percent: number; page?: number; active?: boolean }) =>
    api.post(`/learning/lessons/${lessonId}/live-position/`, data),

  getGradebook: (offeringId: number) =>
    api.get(`/learning/offerings/${offeringId}/gradebook/`),

  getGradingWorkspace: (offeringId: number) =>
    api.get<{
      summary: {
        total_students: number
        submitted_assignments: number
        missing_assignments: number
        average_quiz_score: number | null
        average_assignment_score: number | null
        similarity_flagged: number
        ai_awaiting_approval: number
      }
      gradebook: import('@/lib/learning-grading').GradebookResponse
      assignments: Array<{
        id: number
        title: string
        max_score: number
        module_title: string
        enable_ai_grading?: boolean
      }>
      submissions_by_assignment: Record<string, import('@/lib/types').Submission[]>
      offering?: import('@/lib/types').LMSOfferingDetail
    }>(`/learning/offerings/${offeringId}/grading-workspace/`),

  exportGradeSheet: (offeringId: number) =>
    api.get(`/learning/offerings/${offeringId}/grade-sheet/`, { responseType: 'blob' }),

  startExportGradeSheet: (offeringId: number) =>
    api.post<{ job_id: string; status: string }>(`/learning/offerings/${offeringId}/grade-sheet/start/`),

  pollExportGradeSheetJob: (offeringId: number, jobId: string) =>
    api.get<{
      job_id: string
      status: string
      processed: number
      total: number
      error?: string
      download?: { data_base64: string; filename?: string }
    }>(`/learning/offerings/${offeringId}/grade-sheet/job/${jobId}/`),

  aiSuggestGrade: (assignmentId: number, studentId: number) =>
    api.post(`/learning/assignments/${assignmentId}/ai-suggest-grade/`, { student_id: studentId }),

  aiSuggestGradeBulk: (assignmentId: number) =>
    api.post<{
      job_id?: string
      status?: string
      processed?: number
      total_pending?: number
      background?: boolean
    }>(`/learning/assignments/${assignmentId}/ai-suggest-grade-bulk/?sync=1`),

  pollAiBulkJob: (assignmentId: number, jobId: string) =>
    api.get<{
      job_id: string
      status: string
      processed: number
      total: number
      error?: string
      total_pending?: number
    }>(`/learning/assignments/${assignmentId}/bulk-ai-job/${jobId}/`),

  getGradingSummary: (offeringId: number) =>
    api.get<{
      total_students: number
      submitted_assignments: number
      missing_assignments: number
      average_quiz_score: number | null
      average_assignment_score: number | null
      similarity_flagged: number
      ai_awaiting_approval: number
    }>(`/learning/offerings/${offeringId}/grading-summary/`),
}

export default api
