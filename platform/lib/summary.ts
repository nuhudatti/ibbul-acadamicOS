import type { SemesterSummary } from './types'
import { formatGPA } from './utils'

/** Normalise summary from my_results or /results/summary/ API shapes. */
export function normalizeSemesterSummary(
  input: Partial<SemesterSummary> | Record<string, unknown> | null | undefined
): SemesterSummary | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  return {
    id: Number(s.id ?? 0),
    session: String(s.session ?? ''),
    semester: (s.semester as SemesterSummary['semester']) ?? 'FIRST',
    le: String(s.le ?? ''),
    nss: String(s.nss ?? ''),
    rcu: String(s.rcu ?? s.registered_credit_units ?? ''),
    ecu: String(s.ecu ?? s.earned_credit_units ?? ''),
    cp: String(s.cp ?? s.credit_points ?? ''),
    gpa: String(s.gpa ?? ''),
    trcu: String(s.trcu ?? s.total_registered_credit_units ?? ''),
    tecu: String(s.tecu ?? s.total_earned_credit_units ?? ''),
    tcp: String(s.tcp ?? s.total_credit_points ?? ''),
    pcgpa: String(s.pcgpa ?? s.previous_cgpa ?? ''),
    cgpa: String(s.cgpa ?? ''),
    outstanding_courses: String(s.outstanding_courses ?? ''),
    remarks: String(s.remarks ?? s.academic_standing ?? ''),
    standing: String(s.standing ?? s.academic_standing ?? ''),
    approved: Boolean(s.approved),
  }
}

export function summaryHasData(summary: SemesterSummary | null | undefined): boolean {
  if (!summary) return false
  const fields = [
    summary.le, summary.nss, summary.rcu, summary.ecu, summary.cp,
    summary.gpa, summary.trcu, summary.tecu, summary.tcp, summary.pcgpa,
    summary.cgpa, summary.outstanding_courses, summary.remarks, summary.standing,
  ]
  return fields.some((v) => v != null && String(v).trim() !== '')
}

export const SUMMARY_FIELD_LABELS: { key: keyof SemesterSummary; label: string; gpa?: boolean }[] = [
  { key: 'le', label: 'LE' },
  { key: 'nss', label: 'NSS' },
  { key: 'rcu', label: 'RCU' },
  { key: 'ecu', label: 'ECU' },
  { key: 'cp', label: 'CP' },
  { key: 'gpa', label: 'GPA', gpa: true },
  { key: 'trcu', label: 'TRCU' },
  { key: 'tecu', label: 'TECU' },
  { key: 'tcp', label: 'TCP' },
  { key: 'pcgpa', label: 'PCGPA', gpa: true },
  { key: 'cgpa', label: 'CGPA', gpa: true },
  { key: 'standing', label: 'Standing' },
  { key: 'remarks', label: 'Remarks' },
]

export function formatSummaryValue(
  key: keyof SemesterSummary,
  value: string,
  gpa?: boolean
): string {
  if (!value || value.trim() === '') return '—'
  if (gpa || key === 'gpa' || key === 'cgpa' || key === 'pcgpa') {
    const formatted = formatGPA(value)
    return formatted || value
  }
  return value
}
