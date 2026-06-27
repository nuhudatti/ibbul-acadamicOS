// ─── User & Auth ─────────────────────────────────────────────────────────────

export type UserRole =
  | 'SUPER_ADMIN'
  | 'FACULTY_ADMIN'
  | 'DEPARTMENT_ADMIN'
  | 'HOD'
  | 'EXAMINER'
  | 'STUDENT'

export type ModuleAccess = 'results' | 'learning' | 'admin'

export interface User {
  id: number
  student_id: string | null
  first_name: string
  last_name: string
  full_name: string
  email: string | null
  role: UserRole
  department: string
  department_id: number | null
  department_name: string | null
  faculty_id: number | null
  faculty_name: string | null
  level: string
  phone_number: string
  profile_picture_key: string
  module_access: ModuleAccess[]
  email_verified: boolean
  is_first_login: boolean
  is_active: boolean
  is_staff: boolean
  date_joined: string | null
  last_login: string | null
  last_password_change: string | null
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface LoginResponse {
  user: User
  tokens: AuthTokens
  message: string
}

export interface JWTPayload {
  user_id: number
  role: UserRole
  full_name: string
  email: string
  student_id?: string
  module_access: ModuleAccess[]
  department: string
  department_id?: number
  department_name?: string
  faculty_id?: number
  faculty_name?: string
  level: string
  is_first_login: boolean
  exp: number
  iat: number
}

// ─── Academic Core ────────────────────────────────────────────────────────────

export interface Faculty {
  id: number
  code: string
  name: string
  is_active: boolean
}

export interface Department {
  id: number
  code: string
  name: string
  faculty: number
  is_active: boolean
}

export interface Course {
  id: number
  code: string
  title: string
  credit_units: number
  semester: 'FIRST' | 'SECOND'
  level: '100' | '200' | '300' | '400'
  is_active: boolean
  department: number | null
}

// ─── Results ─────────────────────────────────────────────────────────────────

export type ResultStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'FACULTY_REVIEW'
  | 'HOD_REVIEW'
  | 'APPROVED'
  | 'LOCKED_PUBLISHED'
  | 'REJECTED'
  | 'RETURNED'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface Result {
  id: number
  student: number
  // Serializer-computed display fields (present in API responses)
  student_id_display: string | null
  student_name: string | null
  student_info?: {
    id: number
    student_id?: string
    first_name?: string
    last_name?: string
    email?: string
    role?: string
  } | null
  course: number
  course_code: string | null
  course_title: string | null
  credit_units: number | null
  course_info?: {
    id?: number
    code?: string
    title?: string
    credit_units?: number
  } | null
  score: string
  grade: Grade
  grade_point: string | null
  remark: string
  status: ResultStatus
  session: string
  semester: 'FIRST' | 'SECOND'
  uploaded_by: number | null
  approved_by: number | null
  approved_at: string | null
  upload_batch: number | null
  batch_display: string | null
  rejection_reason: string | null
  department: number | null
  department_name: string | null
  is_editable: boolean
  created_at: string
  updated_at: string
}

export interface SemesterSummary {
  id: number
  session: string
  semester: 'FIRST' | 'SECOND'
  le: string
  nss: string
  rcu: string
  ecu: string
  cp: string
  gpa: string
  trcu: string
  tecu: string
  tcp: string
  pcgpa: string
  cgpa: string
  outstanding_courses: string
  remarks: string
  standing: string
  approved: boolean
}

export interface GPA {
  id: number
  session: string
  semester: string
  gpa: string
  cgpa: string
  total_credits: number
}

// ─── Learning ─────────────────────────────────────────────────────────────────

export interface LMSOffering {
  id: number
  course_code: string
  course_title: string
  course_level: string
  course_credit_units: number
  department_name: string | null
  session: string
  semester: 'FIRST' | 'SECOND'
  description: string
  thumbnail_key: string
  instructor_name: string | null
  is_published: boolean
  enrollment_open: boolean
  requires_enrollment_pin?: boolean
  enrollment_pin?: string
  module_count: number
  lesson_count: number
  enrolled_count: number
  is_enrolled: boolean
  progress_percent: number
  created_at: string
  updated_at: string
}

export interface LMSOfferingDetail extends LMSOffering {
  modules: Module[]
}

export interface Module {
  id: number
  title: string
  description: string
  order: number
  is_published: boolean
  lesson_count: number
  completed_count: number
  lessons: Lesson[]
}

export type ContentType = 'video' | 'pdf' | 'html' | 'quiz' | 'assignment' | 'link'

export interface Lesson {
  id: number
  title: string
  content_type: ContentType
  content_body: string
  file_key: string
  external_url: string
  duration_minutes: number | null
  order: number
  is_published: boolean
  is_preview: boolean
  quiz?: QuizStudent | QuizInstructor
  assignment?: Assignment
  progress?: { completed: boolean; completed_at: string | null }
}

export interface QuizStudent {
  id: number
  title: string
  instructions: string
  passing_score: number
  time_limit_minutes: number | null
  max_attempts: number
  due_at: string | null
  question_count: number
  questions: QuizQuestionStudent[]
}

export interface QuizInstructor extends Omit<QuizStudent, 'questions'> {
  questions: QuizQuestionInstructor[]
}

export interface QuizQuestionStudent {
  id: number
  question_text: string
  options: string[]
  points: number
  order: number
}

/** Instructor view includes correct answer */
export interface QuizQuestionInstructor extends QuizQuestionStudent {
  correct_index: number
  explanation?: string
}

export interface QuizAttempt {
  id: number
  quiz: number
  quiz_title: string
  attempt_number: number
  status: 'in_progress' | 'submitted' | 'timed_out'
  started_at: string
  submitted_at: string | null
  expires_at: string | null
  answers: Record<string, number>
  score: string | null
  passed: boolean | null
  focus_loss_count: number
  time_limit_minutes: number | null
}

export interface Assignment {
  id: number
  title: string
  description: string
  instructions_key: string
  max_score: number
  due_at: string | null
  allow_late_submission: boolean
}

export interface Submission {
  id: number
  assignment: number
  assignment_title: string
  student_user_id?: number
  student_matric?: string
  student_name?: string
  content: string
  file_key: string
  submitted_at: string
  is_late: boolean
  score: string | null
  graded_at: string | null
  graded_by: number | null
  graded_by_name: string | null
  feedback: string
  focus_loss_count: number
}

export interface Enrollment {
  id: number
  offering: number
  offering_summary: LMSOffering
  enrolled_at: string
  is_active: boolean
  completed_at: string | null
  progress_percent: number
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface StudentDashboardStats {
  // Results
  results_published: number
  current_gpa: string
  current_cgpa: string
  current_session: string
  current_semester: string
  // Learning
  enrolled_courses: number
  total_lessons: number
  completed_lessons: number
  overall_progress: number
  pending_quizzes: number
  pending_assignments: number
}

export interface HODDashboardStats {
  pending_approvals: number
  total_students: number
  total_courses: number
  results_this_session: number
}

export interface ExaminerDashboardStats {
  assigned_courses: number
  total_offerings: number
  published_offerings: number
  total_enrolled: number
  pending_submissions: number
}

// ─── API Response wrappers ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface APIError {
  detail?: string
  error?: string
  [key: string]: unknown
}
