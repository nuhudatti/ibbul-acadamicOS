'use client'

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { hodDepartmentAPI } from '@/lib/api'
import { cn } from '@/lib/utils'

const CSV_TEMPLATE = `first_name,last_name,email,student_id
Amina,Ibrahim,amina.ibrahim@student.ibbul.edu.ng,U22/FNS/CSC/0001
Yusuf,Musa,yusuf.musa@student.ibbul.edu.ng,U22/FNS/CSC/0002`

interface BulkResult {
  created_count: number
  error_count: number
  created: { row: number; student_id: string; email: string; invite_url: string }[]
  errors: { row: number; error: string; student_id?: string }[]
}

export function HodBulkStudentUpload({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<BulkResult | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'student_invites_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const uploadFile = async (file: File) => {
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error('Please upload a CSV file')
      return
    }
    setUploading(true)
    setResult(null)
    try {
      const resp = await hodDepartmentAPI.bulkInviteStudents(file)
      setResult(resp.data)
      toast.success(resp.data.message)
      onDone()
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data) {
        const data = err.response.data as BulkResult & { message?: string; error?: string }
        if (data.created_count !== undefined) {
          setResult(data)
          toast.warning(data.message ?? 'Some rows failed')
          if (data.created_count > 0) onDone()
        } else {
          const detail = (data as { detail?: string }).detail
          toast.error(data.error ?? detail ?? 'Upload failed')
        }
      } else {
        toast.error('Upload failed')
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
          <p className="text-xs text-slate-500 mt-1">Upload a CSV — each row sends a secure email invitation with matric login.</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <Download className="w-3.5 h-3.5" /> Download template
        </button>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs font-mono text-slate-600 overflow-x-auto">
        <span className="text-slate-400">Format: </span>
        first_name, last_name, email, student_id
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
          uploading && 'pointer-events-none opacity-60'
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
            <span className="text-sm font-medium">Sending invitations…</span>
          </div>
        ) : (
          <>
            <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Drop CSV here or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Matric must match your department code (e.g. U22/FNS/CSC/0001)</p>
          </>
        )}
      </div>

      {result && (
        <div className="space-y-2 text-sm">
          <div className="flex gap-4">
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> {result.created_count} sent
            </span>
            {result.error_count > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" /> {result.error_count} failed
              </span>
            )}
          </div>
          {result.errors.slice(0, 5).map((e) => (
            <div key={e.row} className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">
              Row {e.row}: {e.error} {e.student_id ? `(${e.student_id})` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
