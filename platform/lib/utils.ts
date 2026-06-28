import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Grade, Result, ResultStatus, UserRole } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateStr: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getGradeColor(grade: Grade | string): string {
  switch (grade) {
    case 'A': return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    case 'B': return 'text-blue-700 bg-blue-50 border-blue-200'
    case 'C': return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'D': return 'text-orange-700 bg-orange-50 border-orange-200'
    case 'E': return 'text-red-600 bg-red-50 border-red-200'
    case 'F': return 'text-red-800 bg-red-100 border-red-300'
    default:  return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}

export function getStatusColor(status: ResultStatus): string {
  switch (status) {
    case 'LOCKED_PUBLISHED': return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    case 'APPROVED':         return 'text-emerald-600 bg-emerald-50 border-emerald-100'
    case 'HOD_REVIEW':       return 'text-blue-700 bg-blue-50 border-blue-200'
    case 'FACULTY_REVIEW':   return 'text-blue-600 bg-blue-50 border-blue-100'
    case 'SUBMITTED':        return 'text-amber-700 bg-amber-50 border-amber-200'
    case 'DRAFT':            return 'text-slate-600 bg-slate-50 border-slate-200'
    case 'REJECTED':         return 'text-red-700 bg-red-50 border-red-200'
    case 'RETURNED':         return 'text-orange-700 bg-orange-50 border-orange-200'
    default:                 return 'text-slate-600 bg-slate-50 border-slate-200'
  }
}

export function getStatusLabel(status: ResultStatus): string {
  const labels: Record<ResultStatus, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    FACULTY_REVIEW: 'Faculty Review',
    HOD_REVIEW: 'HOD Review',
    APPROVED: 'Approved',
    LOCKED_PUBLISHED: 'Published',
    REJECTED: 'Rejected',
    RETURNED: 'Returned',
  }
  return labels[status] ?? status
}

export function getRoleLabel(role: UserRole | string | null | undefined): string {
  const labels: Record<UserRole, string> = {
    SUPER_ADMIN: 'Administrator',
    FACULTY_ADMIN: 'Dean',
    DEPARTMENT_ADMIN: 'HOD',
    HOD: 'HOD',
    EXAMINER: 'Lecturer',
    STUDENT: 'Student',
  }
  if (role == null) return 'User'
  if (typeof role === 'string' && role in labels) {
    return labels[role as UserRole]
  }
  if (typeof role === 'string') return role.replace(/_/g, ' ')
  if (typeof role === 'object' && role !== null && 'message' in role) {
    const msg = (role as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  }
  return String(role)
}

export function getRoleColor(role: UserRole): string {
  switch (role) {
    case 'SUPER_ADMIN':      return 'text-purple-700 bg-purple-50'
    case 'FACULTY_ADMIN':    return 'text-blue-700 bg-blue-50'
    case 'DEPARTMENT_ADMIN':
    case 'HOD':              return 'text-brand-800 bg-brand-50'
    case 'EXAMINER':         return 'text-teal-700 bg-teal-50'
    case 'STUDENT':          return 'text-slate-700 bg-slate-100'
    default:                 return 'text-slate-600 bg-slate-50'
  }
}

export function formatScore(score: string | number | null | undefined): string {
  if (score === null || score === undefined || score === '') return '—'
  const num = typeof score === 'string' ? parseFloat(score) : score
  if (isNaN(num)) return '—'
  return num % 1 === 0 ? num.toString() : num.toFixed(2)
}

export function formatGPA(gpa: string | number | null | undefined): string {
  if (gpa === null || gpa === undefined || gpa === '') return '—'
  const num = typeof gpa === 'string' ? parseFloat(gpa) : gpa
  if (isNaN(num)) return '—'
  return num.toFixed(2)
}

export function parseJWT(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJWT(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return Date.now() >= payload.exp * 1000
}

export function getSemesterLabel(semester: string): string {
  return semester === 'FIRST' ? '1st Semester' : semester === 'SECOND' ? '2nd Semester' : semester
}

export function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    '100': '100 Level',
    '200': '200 Level',
    '300': '300 Level',
    '400': '400 Level',
  }
  return labels[level] ?? `${level} Level`
}

export function pluralise(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : (plural ?? singular + 's')}`
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + '…'
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('')
}

export function resolveResultCourse(result: Result) {
  const code = result.course_code ?? result.course_info?.code ?? ''
  const title = result.course_title ?? result.course_info?.title ?? ''
  const creditUnits =
    result.credit_units ??
    result.course_units ??
    result.course_info?.credit_units ??
    null
  return { code, title, creditUnits }
}
