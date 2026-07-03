'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, Filter, MailX } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { hodDepartmentAPI, type BulkInviteBatchResult } from '@/lib/api'
import { cn } from '@/lib/utils'

const CSV_TEMPLATE = `first_name,last_name,email,student_id
Amina,Ibrahim,amina.ibrahim@student.ibbul.edu.ng,U22/FNS/CSC/0001
Yusuf,Musa,yusuf.musa@student.ibbul.edu.ng,U22/FNS/CSC/0002`

const BATCH_SIZE = 10

type ParsedRow = {
  row: number
  first_name: string
  last_name: string
  email: string
  student_id: string
  raw_student_id: string
}

type ResultFilter = 'all' | 'sent' | 'email_failed' | 'not_invited'

interface AggregatedResult {
  message: string
  email_sent_count: number
  email_failed_count: number
  error_count: number
  total_rows: number
  email_sent: BulkInviteBatchResult['email_sent']
  email_failed: BulkInviteBatchResult['email_failed']
  errors: BulkInviteBatchResult['errors']
}

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

function colFromRow(row: Record<string, string>, ...names: string[]) {
  for (const n of names) {
    for (const [key, val] of Object.entries(row)) {
      if (key && key.trim().toLowerCase().replace(/\s+/g, '_') === n.toLower()) {
        if (val != null && String(val).trim()) return String(val).trim()
      }
    }
  }
  return ''
}

function parseCsvText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  const splitLine = (line: string) => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
        continue
      }
      if (ch === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    out.push(cur.trim())
    return out
  }

  const headers = splitLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const rows: ParsedRow[] = []

  for (let idx = 1; idx < lines.length; idx++) {
    const cells = splitLine(lines[idx])
    const record: Record<string, string> = {}
    headers.forEach((h, i) => { record[h] = cells[i] ?? '' })

    const raw = colFromRow(record, 'student_id', 'matric', 'matric_number', 'reg_number')
    rows.push({
      row: idx + 1,
      first_name: colFromRow(record, 'first_name', 'firstname', 'first'),
      last_name: colFromRow(record, 'last_name', 'lastname', 'last', 'surname'),
      email: colFromRow(record, 'email', 'email_address'),
      student_id: raw,
      raw_student_id: raw,
    })
  }
  return rows
}

function mergeBatchResults(acc: AggregatedResult, batch: BulkInviteBatchResult): AggregatedResult {
  return {
    message: batch.message,
    email_sent_count: acc.email_sent_count + batch.email_sent_count,
    email_failed_count: acc.email_failed_count + batch.email_failed_count,
    error_count: acc.error_count + batch.error_count,
    total_rows: acc.total_rows,
    email_sent: [...acc.email_sent, ...batch.email_sent],
    email_failed: [...acc.email_failed, ...batch.email_failed],
    errors: [...acc.errors, ...batch.errors],
  }
}

export function HodBulkStudentUpload({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<AggregatedResult | null>(null)
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

    let rows: ParsedRow[]
    try {
      const text = await file.text()
      rows = parseCsvText(text)
    } catch {
      toast.error('Could not read CSV file')
      return
    }

    if (rows.length === 0) {
      toast.error('CSV has no data rows')
      return
    }

    setUploading(true)
    setResult(null)
    setResultFilter('all')

    let aggregated: AggregatedResult = {
      message: '',
      email_sent_count: 0,
      email_failed_count: 0,
      error_count: 0,
      total_rows: rows.length,
      email_sent: [],
      email_failed: [],
      errors: [],
    }

    const batchTotal = Math.ceil(rows.length / BATCH_SIZE)

    try {
      for (let b = 0; b < batchTotal; b++) {
        const chunk = rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE)
        setProgress(`Processing rows ${b * BATCH_SIZE + 1}–${Math.min((b + 1) * BATCH_SIZE, rows.length)} of ${rows.length}…`)

        const resp = await hodDepartmentAPI.bulkInviteRows({
          rows: chunk,
          batch: b + 1,
          batch_total: batchTotal,
          total_rows: rows.length,
        })
        aggregated = mergeBatchResults(aggregated, resp.data)
      }

      setResult(aggregated)
      setProgress('')

      const { email_sent_count, email_failed_count, error_count } = aggregated
      if (email_sent_count > 0 && (email_failed_count > 0 || error_count > 0)) {
        toast.warning(
          `${email_sent_count} verification email(s) sent, ${email_failed_count} email failed, ${error_count} not invited`,
          { duration: 9000 },
        )
        onDone()
      } else if (email_sent_count > 0) {
        toast.success(`${email_sent_count} verification email(s) sent`, { duration: 6000 })
        onDone()
      } else if (email_failed_count > 0) {
        toast.error('No emails were sent. Invites were saved — download failed rows and use pending links or resend.')
        setResultFilter('email_failed')
        if (email_failed_count > 0) onDone()
      } else {
        toast.error('No students were invited — check the error list below')
        setResultFilter('not_invited')
      }
    } catch (err) {
      setProgress('')
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as { error?: string; message?: string }
        toast.error(data.error ?? data.message ?? 'Upload failed')
      } else {
        toast.error('Upload failed — check your connection and try again')
      }
      if (aggregated.email_sent_count + aggregated.email_failed_count + aggregated.error_count > 0) {
        setResult(aggregated)
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
            Upload your full CSV — processed in small batches so nothing times out. Success only when SendGrid accepts the email.
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
        <p className="text-slate-500">Extra spaces in matric are auto-fixed. Email success requires SendGrid HTTP 202 — failed emails are listed separately with invite links.</p>
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
        onClick={() => !uploading && inputRef.current?.click()}
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
            <span className="text-sm font-medium">{progress || 'Starting…'}</span>
            <span className="text-xs text-emerald-600">Do not close this page until finished</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Any number of rows — progress shown while sending</p>
          </>
        )}
      </div>

      {result && (
        <div className="space-y-3 text-sm border-t border-emerald-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4" /> {result.email_sent_count} emails sent
              </span>
              {result.email_failed_count > 0 && (
                <span className="flex items-center gap-1 text-amber-700 font-medium">
                  <MailX className="w-4 h-4" /> {result.email_failed_count} email failed (link saved)
                </span>
              )}
              {result.error_count > 0 && (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <AlertCircle className="w-4 h-4" /> {result.error_count} not invited
                </span>
              )}
              <span className="text-slate-500 text-xs">{result.total_rows} rows in file</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.email_sent_count > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv(
                    'student_invites_emails_sent.csv',
                    ['row', 'first_name', 'last_name', 'email', 'student_id', 'invite_url'],
                    result.email_sent.map((r) => [
                      String(r.row), r.first_name, r.last_name, r.email, r.student_id, r.invite_url,
                    ]),
                  )}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                >
                  <Download className="w-3 h-3" /> Sent ({result.email_sent_count})
                </button>
              )}
              {result.email_failed_count > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv(
                    'student_invites_email_failed.csv',
                    ['row', 'first_name', 'last_name', 'email', 'student_id', 'invite_url', 'reason', 'delivery_error'],
                    result.email_failed.map((r) => [
                      String(r.row), r.first_name, r.last_name, r.email, r.student_id, r.invite_url,
                      r.error ?? 'Email could not be sent. Please try again later.',
                      r.delivery_error ?? '',
                    ]),
                  )}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                >
                  <Download className="w-3 h-3" /> Email failed ({result.email_failed_count})
                </button>
              )}
              {result.error_count > 0 && (
                <button
                  type="button"
                  onClick={() => downloadCsv(
                    'student_invites_not_invited.csv',
                    ['row', 'first_name', 'last_name', 'email', 'matric_entered', 'reason'],
                    result.errors.map((r) => [
                      String(r.row), r.first_name ?? '', r.last_name ?? '', r.email ?? '',
                      r.raw_student_id ?? r.student_id ?? '', r.error,
                    ]),
                  )}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Download className="w-3 h-3" /> Not invited ({result.error_count})
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit flex-wrap">
            {([
              { id: 'all' as const, label: 'All' },
              { id: 'sent' as const, label: `Emails sent (${result.email_sent_count})` },
              { id: 'email_failed' as const, label: `Email failed (${result.email_failed_count})` },
              { id: 'not_invited' as const, label: `Not invited (${result.error_count})` },
            ]).filter((t) => {
              if (t.id === 'email_failed') return result.email_failed_count > 0
              if (t.id === 'not_invited') return result.error_count > 0
              if (t.id === 'sent') return result.email_sent_count > 0
              return true
            }).map(({ id, label }) => (
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

          <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 bg-white p-2">
            {(resultFilter === 'all' || resultFilter === 'sent') && result.email_sent.map((r) => (
              <div key={`ok-${r.row}`} className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Row {r.row} · {r.first_name} {r.last_name}</span>
                <span className="text-emerald-700 font-mono ml-2">{r.student_id}</span>
                <span className="ml-2 text-emerald-600">· Verification email sent</span>
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'email_failed') && result.email_failed.map((r) => (
              <div key={`ef-${r.row}`} className="text-xs text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Row {r.row} · {r.first_name} {r.last_name}</span>
                <span className="font-mono ml-1">{r.student_id}</span>
                <div className="mt-0.5 font-medium">Email could not be sent. Please try again later.</div>
                {r.delivery_error && <div className="text-[10px] text-amber-700 mt-0.5">{r.delivery_error}</div>}
                <div className="text-[10px] text-amber-800 truncate mt-0.5">Link: {r.invite_url}</div>
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'not_invited') && result.errors.map((e) => (
              <div key={`err-${e.row}`} className="text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">
                <span className="font-semibold">Row {e.row}</span>
                {(e.first_name || e.last_name) && <span className="ml-1">{e.first_name} {e.last_name}</span>}
                {e.student_id && <span className="font-mono ml-1">{e.student_id}</span>}
                <div className="mt-0.5 font-medium">{e.error}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
