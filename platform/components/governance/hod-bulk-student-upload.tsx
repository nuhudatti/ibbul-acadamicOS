'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle, Filter, MailX, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { hodDepartmentAPI, type BulkInviteBatchResult } from '@/lib/api'
import { cn } from '@/lib/utils'

const CSV_TEMPLATE = `first_name,last_name,email,student_id
Amina,Ibrahim,amina.ibrahim@student.ibbul.edu.ng,U22/FNS/CSC/0001
Yusuf,Musa,yusuf.musa@student.ibbul.edu.ng,U22/FNS/CSC/0002`

const ROW_DELAY_MS = 200
const MAX_RETRIES = 3

type ParsedRow = {
  row: number
  first_name: string
  last_name: string
  email: string
  student_id: string
  raw_student_id: string
}

type ResultFilter = 'all' | 'sent' | 'email_failed' | 'not_invited' | 'already_invited' | 'network'

type NetworkErrorRow = {
  row: number
  error: string
  first_name?: string
  last_name?: string
  email?: string
  student_id?: string
  raw_student_id?: string
}

interface AggregatedResult {
  message: string
  email_sent_count: number
  email_failed_count: number
  error_count: number
  already_invited_count: number
  network_error_count: number
  total_rows: number
  email_sent: BulkInviteBatchResult['email_sent']
  email_failed: BulkInviteBatchResult['email_failed']
  errors: BulkInviteBatchResult['errors']
  network_errors: NetworkErrorRow[]
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
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
      if (key && key.trim().toLowerCase().replace(/\s+/g, '_') === n.toLowerCase()) {
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

function emptyAggregated(total: number): AggregatedResult {
  return {
    message: '',
    email_sent_count: 0,
    email_failed_count: 0,
    error_count: 0,
    already_invited_count: 0,
    network_error_count: 0,
    total_rows: total,
    email_sent: [],
    email_failed: [],
    errors: [],
    network_errors: [],
  }
}

function mergeBatchResults(acc: AggregatedResult, batch: BulkInviteBatchResult): AggregatedResult {
  const already = batch.errors.filter(
    (e) => e.category === 'already_invited' || e.category === 'already_exists',
  ).length
  const otherErrors = batch.errors.filter(
    (e) => e.category !== 'already_invited' && e.category !== 'already_exists',
  )
  return {
    message: batch.message,
    email_sent_count: acc.email_sent_count + batch.email_sent_count,
    email_failed_count: acc.email_failed_count + batch.email_failed_count,
    error_count: acc.error_count + otherErrors.length,
    already_invited_count: acc.already_invited_count + already,
    network_error_count: acc.network_error_count + (batch.network_error_count ?? 0),
    total_rows: acc.total_rows,
    email_sent: [...acc.email_sent, ...batch.email_sent],
    email_failed: [...acc.email_failed, ...batch.email_failed],
    errors: [...acc.errors, ...batch.errors],
    network_errors: [...acc.network_errors, ...(batch.network_errors ?? [])],
  }
}

function isRetryableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return true
  if (!err.response) return true
  const status = err.response.status
  return status === 502 || status === 503 || status === 504 || status >= 500
}

function networkErrorFromRow(row: ParsedRow, err: unknown): NetworkErrorRow {
  let msg = 'Connection timed out — row not processed. Retry this row.'
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') msg = 'Request timed out — retry this row.'
    else if (err.response?.data && typeof err.response.data === 'object') {
      const d = err.response.data as { error?: string; message?: string }
      msg = d.error ?? d.message ?? msg
    } else if (err.message) msg = err.message
  }
  return {
    row: row.row,
    error: msg,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    student_id: row.student_id,
    raw_student_id: row.raw_student_id,
  }
}

async function processOneRow(
  row: ParsedRow,
  totalRows: number,
  rowIndex: number,
): Promise<{ ok: true; data: BulkInviteBatchResult } | { ok: false; network: NetworkErrorRow }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await hodDepartmentAPI.bulkInviteRows({
        rows: [row],
        batch: rowIndex,
        batch_total: totalRows,
        total_rows: totalRows,
      })
      return { ok: true, data: resp.data }
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        await sleep(1000 * attempt)
        continue
      }
      return { ok: false, network: networkErrorFromRow(row, err) }
    }
  }
  return { ok: false, network: networkErrorFromRow(row, new Error('Max retries exceeded')) }
}

export function HodBulkStudentUpload({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [progressPct, setProgressPct] = useState(0)
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
      rows = parseCsvText(await file.text())
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
    setProgressPct(0)

    let aggregated = emptyAggregated(rows.length)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setProgress(`Row ${i + 1} of ${rows.length} — ${row.first_name} ${row.last_name} (${row.student_id || 'no matric'})`)
      setProgressPct(Math.round(((i + 1) / rows.length) * 100))

      const outcome = await processOneRow(row, rows.length, i + 1)
      if (outcome.ok) {
        aggregated = mergeBatchResults(aggregated, outcome.data)
      } else {
        aggregated.network_errors.push(outcome.network)
        aggregated.network_error_count += 1
      }

      if (i < rows.length - 1) await sleep(ROW_DELAY_MS)
    }

    setResult(aggregated)
    setProgress('')
    setProgressPct(100)
    setUploading(false)

    const {
      email_sent_count,
      email_failed_count,
      error_count,
      already_invited_count,
      network_error_count,
    } = aggregated

    const processed = email_sent_count + email_failed_count + error_count + already_invited_count + network_error_count
    const summary = [
      email_sent_count ? `${email_sent_count} emails sent` : '',
      email_failed_count ? `${email_failed_count} email failed (link saved)` : '',
      already_invited_count ? `${already_invited_count} already invited` : '',
      error_count ? `${error_count} not invited` : '',
      network_error_count ? `${network_error_count} not reached (retry)` : '',
    ].filter(Boolean).join(' · ')

    if (email_sent_count > 0) {
      toast.success(summary || 'Done', { duration: 10000 })
      onDone()
    } else if (processed > 0) {
      toast.warning(summary || 'Upload finished with issues — see report below', { duration: 10000 })
      if (email_failed_count > 0 || already_invited_count > 0) onDone()
    } else {
      toast.error(summary || 'Nothing was processed')
    }

    if (network_error_count > 0) setResultFilter('network')
    else if (error_count > 0 && email_sent_count === 0) setResultFilter('not_invited')
  }

  const alreadyInvitedErrors = result?.errors.filter(
    (e) => e.category === 'already_invited' || e.category === 'already_exists',
  ) ?? []
  const validationErrors = result?.errors.filter(
    (e) => e.category !== 'already_invited' && e.category !== 'already_exists',
  ) ?? []

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Bulk invite students
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            One student at a time — runs through your full list without timing out. Full report at the end.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
            <Download className="w-3.5 h-3.5" /> Template
          </button>
          <button type="button" onClick={exportPendingInvites} disabled={exportingPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-50">
            {exportingPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            All pending links
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs text-slate-600 space-y-1">
        <p><span className="text-slate-400 font-mono">Format: </span>first_name, last_name, email, student_id</p>
        <p className="text-slate-500">181 rows ≈ 15–20 minutes. Do not close the page. Already-invited students are skipped, not counted as failures.</p>
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
        <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) uploadFile(f)
          e.target.value = ''
        }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-emerald-700 w-full max-w-md mx-auto">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span className="text-sm font-medium text-center">{progress || 'Starting…'}</span>
            <div className="w-full h-2 rounded-full bg-emerald-100 overflow-hidden">
              <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs text-emerald-600">{progressPct}% — do not close this page</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Full report with download links when finished</p>
          </>
        )}
      </div>

      {result && (
        <div className="space-y-3 text-sm border-t border-emerald-100 pt-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Final report</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span className="text-emerald-700 font-semibold">✓ {result.email_sent_count} emails sent</span>
              {result.email_failed_count > 0 && <span className="text-amber-700 font-semibold">⚠ {result.email_failed_count} email failed (link saved)</span>}
              {result.already_invited_count > 0 && <span className="text-slate-600 font-semibold">↷ {result.already_invited_count} already invited</span>}
              {result.error_count > 0 && <span className="text-red-600 font-semibold">✗ {result.error_count} not invited</span>}
              {result.network_error_count > 0 && <span className="text-orange-700 font-semibold">⟳ {result.network_error_count} not reached — retry</span>}
              <span className="text-slate-400">of {result.total_rows} rows</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {result.email_sent_count > 0 && (
              <button type="button" onClick={() => downloadCsv('emails_sent.csv', ['row', 'name', 'email', 'matric', 'invite_url'], result.email_sent.map((r) => [String(r.row), `${r.first_name} ${r.last_name}`, r.email, r.student_id, r.invite_url]))} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">
                <Download className="w-3 h-3" /> Sent ({result.email_sent_count})
              </button>
            )}
            {result.email_failed_count > 0 && (
              <button type="button" onClick={() => downloadCsv('email_failed.csv', ['row', 'name', 'email', 'matric', 'invite_url', 'sendgrid_error'], result.email_failed.map((r) => [String(r.row), `${r.first_name} ${r.last_name}`, r.email, r.student_id, r.invite_url, r.delivery_error ?? '']))} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 text-xs font-semibold text-amber-800 hover:bg-amber-50">
                <Download className="w-3 h-3" /> Email failed ({result.email_failed_count})
              </button>
            )}
            {result.network_error_count > 0 && (
              <button type="button" onClick={() => downloadCsv('retry_these_rows.csv', ['row', 'first_name', 'last_name', 'email', 'student_id', 'reason'], result.network_errors.map((r) => [String(r.row), r.first_name ?? '', r.last_name ?? '', r.email ?? '', r.student_id ?? '', r.error]))} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-200 text-xs font-semibold text-orange-800 hover:bg-orange-50">
                <RefreshCw className="w-3 h-3" /> Retry ({result.network_error_count})
              </button>
            )}
            {validationErrors.length > 0 && (
              <button type="button" onClick={() => downloadCsv('not_invited.csv', ['row', 'name', 'email', 'matric', 'reason'], validationErrors.map((r) => [String(r.row), `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), r.email ?? '', r.student_id ?? '', r.error]))} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-700 hover:bg-red-50">
                <Download className="w-3 h-3" /> Not invited ({validationErrors.length})
              </button>
            )}
          </div>

          <div className="flex gap-1 p-1 rounded-xl bg-slate-100 w-fit flex-wrap">
            {([
              { id: 'all' as const, label: 'All' },
              { id: 'sent' as const, label: `Sent (${result.email_sent_count})` },
              { id: 'email_failed' as const, label: `Email failed (${result.email_failed_count})` },
              { id: 'already_invited' as const, label: `Already invited (${result.already_invited_count})` },
              { id: 'not_invited' as const, label: `Not invited (${result.error_count})` },
              { id: 'network' as const, label: `Retry (${result.network_error_count})` },
            ]).filter((t) => {
              if (t.id === 'sent') return result.email_sent_count > 0
              if (t.id === 'email_failed') return result.email_failed_count > 0
              if (t.id === 'already_invited') return result.already_invited_count > 0
              if (t.id === 'not_invited') return result.error_count > 0
              if (t.id === 'network') return result.network_error_count > 0
              return true
            }).map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setResultFilter(id)} className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all', resultFilter === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500')}>
                {id !== 'all' && <Filter className="w-3 h-3" />}
                {label}
              </button>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 bg-white p-2">
            {(resultFilter === 'all' || resultFilter === 'sent') && result.email_sent.map((r) => (
              <div key={`ok-${r.row}`} className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-2.5 py-1.5">
                Row {r.row} · {r.first_name} {r.last_name} · <span className="font-mono">{r.student_id}</span> · Verification email sent
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'email_failed') && result.email_failed.map((r) => (
              <div key={`ef-${r.row}`} className="text-xs text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5">
                Row {r.row} · {r.first_name} {r.last_name} · <span className="font-mono">{r.student_id}</span>
                <div className="font-medium mt-0.5">Email could not be sent. Please try again later.</div>
                {r.delivery_error && <div className="text-[10px] mt-0.5">{r.delivery_error}</div>}
                <div className="text-[10px] truncate mt-0.5">Link: {r.invite_url}</div>
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'already_invited') && alreadyInvitedErrors.map((e) => (
              <div key={`ai-${e.row}`} className="text-xs text-slate-700 bg-slate-100 rounded-lg px-2.5 py-1.5">
                Row {e.row} · {e.first_name} {e.last_name} · <span className="font-mono">{e.student_id}</span>
                <div className="mt-0.5">Already invited — use Invitations tab to resend link</div>
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'not_invited') && validationErrors.map((e) => (
              <div key={`err-${e.row}`} className="text-xs text-red-700 bg-red-50 rounded-lg px-2.5 py-1.5">
                Row {e.row} · {e.first_name} {e.last_name} · {e.error}
              </div>
            ))}
            {(resultFilter === 'all' || resultFilter === 'network') && result.network_errors.map((e) => (
              <div key={`net-${e.row}`} className="text-xs text-orange-800 bg-orange-50 rounded-lg px-2.5 py-1.5">
                Row {e.row} · {e.first_name} {e.last_name} · {e.error}
                <div className="text-[10px] mt-0.5">Download &quot;Retry&quot; CSV and upload only those rows again</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
