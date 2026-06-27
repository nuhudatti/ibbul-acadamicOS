/** Client-side grading display helpers (mirrors backend gradebook logic) */

export const QUIZ_WEIGHT = 40
export const ASSIGNMENT_WEIGHT = 60

export const GRADE_BANDS = [
  { min: 70, grade: 'A', label: 'Excellent' },
  { min: 60, grade: 'B', label: 'Good' },
  { min: 50, grade: 'C', label: 'Fair' },
  { min: 45, grade: 'D', label: 'Pass' },
  { min: 0, grade: 'F', label: 'Fail' },
] as const

export function letterGrade(score: number): string {
  for (const band of GRADE_BANDS) {
    if (score >= band.min) return band.grade
  }
  return 'F'
}

export function computeWeightedFinal(
  quizAvg: number | null | undefined,
  assignmentAvg: number | null | undefined
): number | null {
  const parts: { score: number; weight: number }[] = []
  if (quizAvg != null) parts.push({ score: quizAvg, weight: QUIZ_WEIGHT })
  if (assignmentAvg != null) parts.push({ score: assignmentAvg, weight: ASSIGNMENT_WEIGHT })
  if (!parts.length) return null
  const totalW = parts.reduce((s, p) => s + p.weight, 0)
  return Math.round((parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW) * 100) / 100
}

export interface ModuleGradeRow {
  module_id: number
  module_title: string
  quiz_average: number | null
  assignment_average: number | null
  final_score: number | null
  letter_grade: string | null
  steps_completed: number
  steps_total: number
}

export interface GradebookStudent {
  student_id: string
  full_name: string
  quiz_average: number | null
  assignment_average: number | null
  quiz_weight: number
  assignment_weight: number
  final_score: number | null
  letter_grade: string | null
  modules: ModuleGradeRow[]
}

export interface GradebookResponse {
  offering_id: number
  course_code: string
  weights: { quiz: number; assignment: number }
  grade_bands: { min: number; grade: string }[]
  students: GradebookStudent[]
}

export function gradeColor(letter: string | null): string {
  if (!letter) return 'text-slate-500'
  if (letter === 'A') return 'text-emerald-600'
  if (letter === 'B') return 'text-blue-600'
  if (letter === 'C') return 'text-amber-600'
  if (letter === 'D') return 'text-orange-600'
  return 'text-red-600'
}
