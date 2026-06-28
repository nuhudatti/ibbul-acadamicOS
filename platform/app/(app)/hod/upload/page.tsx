'use client'

/**

 * Upload Results — same validate → submit flow as the main Result Checker HOD Upload tab.

 * POST /api/academics/hod/upload/validate|preview|submit/

 */

import { useState, useRef } from 'react'

import {

  Upload, CheckCircle, XCircle, FileText, RefreshCw,

  ShieldCheck, AlertTriangle, Download,

} from 'lucide-react'

import { toast } from 'sonner'

import Link from 'next/link'

import { academicsAPI } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { cn } from '@/lib/utils'

import { useAuthStore } from '@/lib/store'
import { SuperAdminOversightGuard } from '@/components/results-oversight/super-admin-redirect'
import { ManualResultEntry } from '@/components/results/manual-result-entry'

const UPLOAD_ROLES = ['HOD', 'DEPARTMENT_ADMIN', 'FACULTY_ADMIN']

type UploadTab = 'bulk' | 'manual'



interface ValidationRow {

  row_number: number

  matric_no?: string

  course_code?: string

  score?: string

  errors?: string[]

  warnings?: string[]

  valid?: boolean

}



interface ValidationReport {

  valid: boolean

  total_rows: number

  valid_rows: number

  error_rows: number

  errors: Array<{ row: number; field: string; message: string }>

  validation_report?: ValidationRow[]

  file_checksum?: string

  detected_session?: string

  detected_semester?: string

  session_mismatch?: boolean

  semester_mismatch?: boolean

}



function mapValidateResponse(data: Record<string, unknown>): ValidationReport {

  const report = (data.validation_report as ValidationRow[]) ?? []

  const total = (data.total_rows as number) ?? report.length

  const validRows = (data.valid_rows as number) ?? report.filter((r) => r.valid).length

  const errorRows = (data.invalid_rows as number) ?? report.filter((r) => !r.valid).length

  const errors = report

    .filter((r) => r.errors?.length)

    .flatMap((r) =>

      (r.errors ?? []).map((msg) => ({

        row: r.row_number,

        field: 'row',

        message: msg,

      }))

    )

  const apiValid = data.valid as boolean | undefined

  return {

    valid: apiValid ?? (errorRows === 0 && validRows > 0),

    total_rows: total,

    valid_rows: validRows,

    error_rows: errorRows,

    errors,

    validation_report: report,

    file_checksum: data.file_checksum as string | undefined,

    detected_session: data.detected_session as string | undefined,

    detected_semester: data.detected_semester as string | undefined,

    session_mismatch: data.session_mismatch as boolean | undefined,

    semester_mismatch: data.semester_mismatch as boolean | undefined,

  }

}



export default function UploadResultsPage() {

  const { user } = useAuthStore()

  const canUpload = user ? UPLOAD_ROLES.includes(user.role) : false

  const [activeTab, setActiveTab] = useState<UploadTab>('bulk')



  const [file, setFile] = useState<File | null>(null)

  const [session, setSession] = useState('2023/2024')

  const [semester, setSemester] = useState<'FIRST' | 'SECOND'>('FIRST')

  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null)

  const [isValidating, setIsValidating] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const [success, setSuccess] = useState<string | null>(null)

  const [showConfirm, setShowConfirm] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)



  const resetForm = () => {

    setFile(null)

    setValidationReport(null)

    setError(null)

    setSuccess(null)

    if (fileInputRef.current) fileInputRef.current.value = ''

  }



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {

    setFile(e.target.files?.[0] ?? null)

    setValidationReport(null)

    setError(null)

    setSuccess(null)

  }



  const handleDrop = (e: React.DragEvent) => {

    e.preventDefault()

    const f = e.dataTransfer.files?.[0]

    if (f && /\.(csv|xlsx|xls)$/i.test(f.name)) {

      setFile(f)

      setValidationReport(null)

      setError(null)

      setSuccess(null)

    } else {

      toast.error('Only .csv, .xlsx, .xls files are supported')

    }

  }



  const buildFormData = () => {

    const fd = new FormData()

    if (file) fd.append('file', file)

    fd.append('session', session.trim())

    fd.append('semester', semester)

    return fd

  }



  const handleValidate = async () => {

    if (!file) { setError('Please select a file.'); return }

    if (!session.trim()) { setError('Session is required.'); return }

    setIsValidating(true)

    setError(null)

    setSuccess(null)

    try {

      const resp = await academicsAPI.validateUpload(buildFormData())

      const report = mapValidateResponse(resp.data)

      setValidationReport(report)

      if (report.session_mismatch || report.semester_mismatch) {

        const detected = [report.detected_session, report.detected_semester].filter(Boolean).join(' · ')

        setError(

          `Session/semester mismatch: your file header says ${detected || 'a different session'}, but the form has ${session.trim()} · ${semester}. Results will be saved under the form values (${session.trim()} · ${semester}). To match the file header instead, update the form before submitting.`

        )

      } else if (report.valid_rows === 0) {

        setError(`No valid rows found. ${report.error_rows} row(s) have errors — fix the file or download the error list.`)

      } else if (report.error_rows > 0) {

        setSuccess(`${report.valid_rows} valid row(s) ready to submit. ${report.error_rows} row(s) will be skipped.`)

      } else {

        setSuccess(`Validation passed — ${report.valid_rows} row(s) ready to submit.`)

      }

    } catch (err: unknown) {
      setError(extractApiError(err, 'Validation failed — check your file format and try again.'))
      setValidationReport(null)

    } finally {

      setIsValidating(false)

    }

  }



  const handleSubmit = () => {

    if (!validationReport || validationReport.valid_rows === 0) {

      setError('Validate the file first — at least one valid row is required.')

      return

    }

    setShowConfirm(true)

  }



  const confirmSubmit = async () => {

    if (!file) return

    setShowConfirm(false)

    setIsSubmitting(true)

    setError(null)

    setSuccess(null)

    try {

      const resp = await academicsAPI.submitUpload(buildFormData())

      const data = resp.data as { created_count?: number; success_count?: number; message?: string }

      const count = data.created_count ?? data.success_count ?? validationReport?.valid_rows ?? 0

      setSuccess(`Upload successful — ${count} result(s) created. Invalid rows were skipped.`)

      resetForm()

      toast.success(`${count} result(s) uploaded`)

    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; validation_report?: ValidationRow[] } } }
      const msg = extractApiError(err, 'Upload failed')
      setError(msg)

      if (e?.response?.data?.validation_report) {

        setValidationReport(mapValidateResponse({

          validation_report: e.response.data.validation_report,

          total_rows: e.response.data.validation_report.length,

          valid_rows: e.response.data.validation_report.filter((r) => r.valid).length,

          invalid_rows: e.response.data.validation_report.filter((r) => !r.valid).length,

        }))

      }

      toast.error(msg)

    } finally {

      setIsSubmitting(false)

    }

  }



  const downloadErrorCSV = () => {

    if (!validationReport?.errors.length) return

    const rows = [

      ['Row', 'Field', 'Error Message'],

      ...validationReport.errors.map((e) => [String(e.row), e.field, e.message]),

    ]

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })

    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')

    a.href = url

    a.download = `validation_errors_${Date.now()}.csv`

    a.click()

    URL.revokeObjectURL(url)

  }



  return (
    <SuperAdminOversightGuard>
    <div className="space-y-6 max-w-4xl">

      <div className="flex items-start justify-between flex-wrap gap-3">

        <div>

          <h1 className="text-xl font-bold text-slate-900">Add Results</h1>

          <p className="text-sm text-slate-500 mt-0.5">

            Upload a spreadsheet in bulk, or enter a student&apos;s full semester manually (courses + summary). Approve pending items under All Results.

          </p>

        </div>

        <div className="flex items-center gap-3 flex-wrap">

          <Link href="/admin/upload-batches"

            className="text-sm text-slate-500 hover:text-slate-800">

            Upload History

          </Link>

          <Link href="/hod/results?pending=1"

            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 font-medium">

            Pending in All Results →

          </Link>

        </div>

      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('bulk')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'bulk'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          Bulk file upload
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeTab === 'manual'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          )}
        >
          Manual entry
        </button>
      </div>

      {activeTab === 'manual' ? (
        <ManualResultEntry />
      ) : (
      <>



      <div className={cn(

        'rounded-2xl px-4 py-3 flex items-center gap-3 text-sm',

        canUpload ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-200'

      )}>

        <ShieldCheck className={cn('w-4 h-4 flex-shrink-0', canUpload ? 'text-emerald-600' : 'text-red-500')} />

        {canUpload ? (

          <span className="text-emerald-700">

            Logged in as <strong>{user?.role}</strong>. Validate your file first — only valid rows are saved. View past uploads under Upload History.

          </span>

        ) : (

          <span className="text-red-700">Your role cannot upload results.</span>

        )}

      </div>



      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">

        <div

          onDragOver={(e) => e.preventDefault()}

          onDrop={handleDrop}

          onClick={() => fileInputRef.current?.click()}

          className={cn(

            'border-2 border-dashed rounded-2xl px-6 py-8 text-center cursor-pointer transition-colors',

            file ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'

          )}

        >

          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"

            onChange={handleFileChange} className="hidden" />

          {file ? (

            <div className="flex flex-col items-center gap-2">

              <FileText className="w-9 h-9 text-brand-500" />

              <div className="font-semibold text-slate-800">{file.name}</div>

              <div className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</div>

            </div>

          ) : (

            <div className="flex flex-col items-center gap-2">

              <Upload className="w-9 h-9 text-slate-300" />

              <p className="text-sm font-semibold text-slate-600">Drop CSV/Excel here or click to browse</p>

            </div>

          )}

        </div>



        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <div className="space-y-1.5">

            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Session</label>

            <input type="text" value={session} onChange={(e) => setSession(e.target.value)}

              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400" />

          </div>

          <div className="space-y-1.5">

            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Semester</label>

            <select value={semester} onChange={(e) => setSemester(e.target.value as 'FIRST' | 'SECOND')}

              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-400">

              <option value="FIRST">First Semester</option>

              <option value="SECOND">Second Semester</option>

            </select>

          </div>

        </div>



        <div className="flex flex-wrap gap-3">

          <button onClick={handleValidate} disabled={!file || isValidating || !canUpload}

            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">

            {isValidating ? <><RefreshCw className="w-4 h-4 animate-spin" /> Validating…</> : 'Validate File'}

          </button>

          <button onClick={handleSubmit} disabled={!validationReport || validationReport.valid_rows === 0 || isSubmitting || !canUpload}

            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">

            {isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Submitting…</> : <><CheckCircle className="w-4 h-4" /> Submit Valid Rows</>}

          </button>

          <button onClick={resetForm}

            className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">

            Reset

          </button>

        </div>



        {error && (

          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700 flex items-start gap-2">

            <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}

          </div>

        )}

        {success && (

          <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-sm text-emerald-700 flex items-start gap-2">

            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{success}

            <Link href="/hod/results?pending=1" className="ml-auto text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap">

              View pending results →

            </Link>

          </div>

        )}

      </div>



      {validationReport && (

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">

          <h3 className="text-sm font-semibold text-slate-800">Validation Report</h3>

          <div className="grid grid-cols-3 gap-3">

            <div className="rounded-xl bg-slate-50 p-3 text-center">

              <div className="text-xl font-bold text-slate-800">{validationReport.total_rows}</div>

              <div className="text-xs text-slate-400">Total Rows</div>

            </div>

            <div className="rounded-xl bg-emerald-50 p-3 text-center">

              <div className="text-xl font-bold text-emerald-700">{validationReport.valid_rows}</div>

              <div className="text-xs text-emerald-500">Valid</div>

            </div>

            <div className="rounded-xl bg-red-50 p-3 text-center">

              <div className="text-xl font-bold text-red-600">{validationReport.error_rows}</div>

              <div className="text-xs text-red-400">Errors</div>

            </div>

          </div>



          {validationReport.error_rows > 0 && (

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2">

              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">

                <AlertTriangle className="w-4 h-4" /> {validationReport.error_rows} row(s) will be skipped on submit

              </div>

              <button onClick={downloadErrorCSV}

                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700">

                <Download className="w-4 h-4" /> Download Error List

              </button>

            </div>

          )}



          {validationReport.validation_report && validationReport.validation_report.length > 0 && (

            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">

              <table className="w-full text-xs">

                <thead className="sticky top-0 bg-slate-50">

                  <tr>

                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Row</th>

                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Matric</th>

                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Course</th>

                    <th className="px-3 py-2 text-left font-semibold text-slate-500">Status</th>

                  </tr>

                </thead>

                <tbody className="divide-y divide-slate-50">

                  {validationReport.validation_report.slice(0, 20).map((r) => (

                    <tr key={r.row_number} className={r.valid ? '' : 'bg-red-50/50'}>

                      <td className="px-3 py-2">{r.row_number}</td>

                      <td className="px-3 py-2 font-mono">{r.matric_no ?? '—'}</td>

                      <td className="px-3 py-2 font-mono">{r.course_code ?? '—'}</td>

                      <td className="px-3 py-2">

                        {r.valid

                          ? <span className="text-emerald-600 font-medium">OK</span>

                          : <span className="text-red-600">{(r.errors ?? []).join('; ')}</span>}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </div>

      )}



      <div className="rounded-2xl bg-blue-50 border border-blue-100 p-5 text-xs text-blue-700 space-y-1">

        <p className="font-semibold text-blue-900 text-sm">Supported formats</p>

        <p><strong>University Excel</strong> (official IBBUL sheet): S/N, MATRIC.NO, NAME, then one column per course with cells like &quot;63 B&quot;.</p>

        <p><strong>CSV</strong>: student_id / matric_no, course_code, score, session, semester.</p>

        <p>Workflow: <strong>Validate</strong> → review errors → <strong>Submit Valid Rows</strong>. Students and courses must already exist in the system.</p>

      </div>



      {showConfirm && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">

          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">

            <h3 className="text-base font-bold text-slate-900">Confirm Submit</h3>

            <p className="text-sm text-slate-600">

              Submit <strong>{validationReport?.valid_rows ?? 0}</strong> valid row(s) from{' '}

              <strong>{file?.name}</strong>? Rows with errors will be skipped.

            </p>

            <div className="flex gap-2 justify-end">

              <button onClick={() => setShowConfirm(false)}

                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600">Cancel</button>

              <button onClick={confirmSubmit} disabled={isSubmitting}

                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50">

                {isSubmitting ? 'Submitting…' : 'Submit'}

              </button>

            </div>

          </div>

        </div>

      )}

      </>
      )}

    </div>
    </SuperAdminOversightGuard>
  )

}

