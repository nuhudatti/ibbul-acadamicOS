'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, Filter } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { hodDepartmentAPI } from '@/lib/api'
import { cn } from '@/lib/utils'

const CSV_TEMPLATE = `first_name,last_name,email,student_id
Amina,Ibrahim,amina.ibrahim@student.ibbul.edu.ng,U22/FNS/CSC/0001
Yusuf,Musa,yusuf.musa@student.ibbul.edu.ng,U22/FNS/CSC/0002`

interface BulkCreatedRow {
  row: number
  first_name: string
  last_name: string
  student_id: string
  email: string
  invite_url: string
  delivery_status?: string
  normalized_from?: string
}

interface BulkErrorRow {
  row: number
  error: string
  first_name?: string
  last_name?: string
  email?: string
  student_id?: string
  raw_student_id?: string
}

interface BulkResult {
  message: string
  created_count: number
  error_count: number
  total_rows: number
  created: BulkCreatedRow[]
  errors: BulkErrorRow[]
}

type ResultFilter = 'all' | 'sent' | 'failed'

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers.join(','), ...rows.map((r) => r.map((c) => escapeCsv(String(c ?? ''))).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCreatedCsv(created: BulkCreatedRow[]) {
  downloadCsv(
    'student_invites_sent.csv',
    ['row', 'first_name', 'last_name', 'email', 'student_id', 'invite_url', 'delivery_status', 'normalized_from'],
    created.map((r) => [
      String(r.row),
      r.first_name,
      r.last_name,
      r.email,
      r.student_id,
      r.invite_url,
      r.delivery_status ?? '',
      r.normalized_from ?? '',
    ]),
  )
}

function downloadErrorsCsv(errors: BulkErrorRow[]) {
  downloadCsv(
    'student_invites_not_sent.csv',
    ['row', 'first_name', 'last_name', 'email', 'matric_entered', 'matric_normalized', 'reason'],
    errors.map((r) => [
      String(r.row),
      r.first_name ?? '',
      r.last_name ?? '',
      r.email ?? '',
      r.raw_student_id ?? r.student_id ?? '',
      r.student_id ?? '',
      r.error,
    ]),
  )
}

export function HodBulkStudentUpload({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [dragOver, setDragOver] = useState(false)
  const [exportingPending, setExportingPending] = useState(false)

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'student_invites_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPendingInvites = async () => {
    setExportingPending(true)
    try {
      const resp = await hodDepartmentAPI.exportPendingInvitations('pending')
      const blob = resp.data as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'student_invitations_pending.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Pending invitations downloaded')
    } catch {
      toast.error('Could not download pending invitations')
    } finally {
      setExportingPending(false)
    }
  }

  const uploadFile = async (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error('Please upload a CSV file')
      return
    }
    setUploading(true)
    setResult(null)
    setResultFilter('all')
    try {
      const resp = await hodDepartmentAPI.bulkInviteStudents(file)
      const data = resp.data
      setResult(data)
      if (data.created_count > 0 && data.error_count > 0) {
        toast.warning(data.message)
        onDone()
      } else if (data.created_count > 0) {
        toast.success(data.message)
        onDone()
      } else {
        toast.error(data.message || 'No invitations were created')
        setResultFilter('failed')
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as BulkResult & { message?: string; error?: string }
        if (data.created !== undefined) {
          setResult(data as BulkResult)
          toast.warning(data.message ?? 'Some rows failed')
          if (data.created_count > 0) onDone()
        } else {
          const detail = (data as { detail?: string }).detail
          toast.error(data.error ?? detail ?? 'Upload failed')
        }
      } else {
        toast.error('Upload failed — check your connection and try again')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Bulk invite students
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Upload any size CSV — each row is processed individually. Bad rows are skipped; good rows still get invited.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button
            type="button"
            onClick={exportPendingInvites}
            disabled={exportingPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50"
          >
            {exportingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            All pending links
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
        <p><span className="text-slate-400 font-mono">Format: </span>first_name, last_name, email, student_id</p>
        <p className="text-slate-500">Extra spaces in matric are auto-fixed (e.g. <span className="font-mono">U22 / FNS / CSC / 0001</span> → <span className="font-mono">U22/FNS/CSC/0001</span>).</p>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files[0]
          if (f) uploadFile(f)
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors',
          dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/30',
          uploading && 'pointer-events-none opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) uploadFile(f)
            e.target.value = ''
          }}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-emerald-700">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium">Processing rows — large files may take a few minutes…</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">No row limit — failed rows are listed separately at the end</p>
          </>
        )}
      </div>

      {result && (
        <div className="space-y-3 text-sm border-t border-emerald-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4" /> {result.created_count} sent
              </span>
              {result.error_count > 0 && (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <AlertCircle className="w-4 h-4" /> {result.error_count} not sent
                </span>
              )}
              <span className="text-slate-500 text-xs">{result.total_rows} rows in file</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.created_count > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCreatedCsv(result.created)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  <Download className="w-3 h-3" /> Download sent ({result.created_count})
                </button>
              )}
              {result.error_count > 0 && (
                <button
                  type="button"
                  onClick={() => downloadErrorsCsv(result.errors)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Download className="w-3 h-3" /> Download not sent ({result.error_count})
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit">
            {([
              { id: 'all' as const, label: 'All details' },
              { id: 'sent' as const, label: `Sent (${result.created_count})` },
              { id: 'failed' as const, label: `Not sent (${result.error_count})` },
            ]).filter((t) => t.id !== 'failed' || result.error_count > 0).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setResultFilter(id)}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all',
                  resultFilter === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500',
                )}
              >
                {id !== 'all' && <Filter className="w-3 h-3" />}
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 bg-white p-2">
            {(resultFilter === 'all' || resultFilter === 'sent') && result.created.map((r) => (
              <div key={`ok-${r.row}`} className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Row {r.row} · {r.first_name} {r.last_name}</span>
                <span className="text-emerald-700 font-mono ml-2">{r.student_id}</span>
                {r.normalized_from && (
                  <span className="text-emerald-600 ml-1">(fixed from &quot;{r.normalized_from}&quot;)</span>
                )}
                <div className="text-[10px] text-emerald-600 truncate mt-0.5">{r.invite_url}</div>
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'failed') && result.errors.map((e) => (
              <div key={`err-${e.row}`} className="text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Row {e.row}</span>
                {(e.first_name || e.last_name) && (
                  <span className="ml-1">{e.first_name} {e.last_name}</span>
                )}
                {e.student_id && <span className="font-mono ml-1">{e.student_id}</span>}
                {e.raw_student_id && e.raw_student_id !== e.student_id && (
                  <span className="text-red-500 ml-1">(entered: {e.raw_student_id})</span>
                )}
                <div className="mt-0.5 font-medium">{e.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
