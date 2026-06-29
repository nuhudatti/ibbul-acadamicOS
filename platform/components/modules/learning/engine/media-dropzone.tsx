'use client'

import { useRef, useState, useCallback } from 'react'
import { FileVideo, FileText, Upload, Loader2, X, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadLessonMediaFile } from '@/lib/cloudinary-upload'
import { getLearningApiError } from '@/lib/learning-utils'
import { cn } from '@/lib/utils'

type MediaKind = 'video' | 'pdf'

const KIND_META: Record<MediaKind, {
  icon: typeof FileVideo
  label: string
  hint: string
  accept: string
  extensions: string
}> = {
  video: {
    icon: FileVideo,
    label: 'Video lesson',
    hint: 'MP4, WebM, or MOV — students watch in the built-in player',
    accept: 'video/*,.mp4,.webm,.mov',
    extensions: 'MP4 · WebM · MOV',
  },
  pdf: {
    icon: FileText,
    label: 'PDF reading',
    hint: 'Upload a PDF — students follow along with live page sync',
    accept: '.pdf,application/pdf',
    extensions: 'PDF only',
  },
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Pick a file only — used when creating a new step before the lesson exists. */
export function MediaFilePicker({
  kind,
  file,
  onFile,
  className,
}: {
  kind: MediaKind
  file: File | null
  onFile: (file: File | null) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const meta = KIND_META[kind]
  const Icon = meta.icon

  const pick = useCallback((f: File | null) => {
    if (!f) {
      onFile(null)
      return
    }
    const lower = f.name.toLowerCase()
    if (kind === 'pdf' && !lower.endsWith('.pdf')) {
      toast.error('Please choose a PDF file')
      return
    }
    if (kind === 'video' && !/\.(mp4|webm|mov)$/.test(lower) && !f.type.startsWith('video/')) {
      toast.error('Please choose a video file (MP4, WebM, MOV)')
      return
    }
    onFile(f)
  }, [kind, onFile])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files?.[0] ?? null)
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={meta.accept}
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onClick={() => !file && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'relative rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden',
          file
            ? 'border-emerald-300 bg-emerald-50/60'
            : dragging
              ? 'border-brand-500 bg-brand-50 scale-[1.01]'
              : 'border-brand-200 bg-gradient-to-br from-brand-50/80 to-white hover:border-brand-400 hover:bg-brand-50/50 cursor-pointer'
        )}
      >
        <div className="px-5 py-6 flex flex-col items-center text-center gap-3">
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center',
            file ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700'
          )}>
            {file ? <CheckCircle2 className="w-7 h-7" /> : <Icon className="w-7 h-7" />}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">{meta.hint}</p>
          </div>

          {file ? (
            <div className="w-full max-w-sm rounded-xl bg-white border border-emerald-200 px-4 py-3 flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-[11px] text-slate-400">{formatBytes(file.size)} · {meta.extensions}</p>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onFile(null); if (inputRef.current) inputRef.current.value = '' }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                aria-label="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-medium text-brand-700 uppercase tracking-wider">
                Drop {kind === 'pdf' ? 'PDF' : 'video'} here or click to browse
              </p>
              <p className="text-[10px] text-slate-400">{meta.extensions}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Upload to an existing lesson — immediate upload on file select. */
export function MediaDropzone({
  lessonId,
  kind,
  onUploaded,
  className,
}: {
  lessonId: number
  kind: MediaKind
  onUploaded?: () => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const meta = KIND_META[kind]
  const Icon = meta.icon

  const upload = async (file: File) => {
    setUploading(true)
    try {
      await uploadLessonMediaFile(lessonId, file)
      setUploadedName(file.name)
      toast.success(`${kind === 'pdf' ? 'PDF' : 'Video'} uploaded successfully`)
      onUploaded?.()
    } catch (err) {
      toast.error(getLearningApiError(err, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  const onPick = (file: File | null) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    if (kind === 'pdf' && !lower.endsWith('.pdf')) {
      toast.error('Please choose a PDF file')
      return
    }
    upload(file)
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={meta.accept}
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          onPick(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !uploading && inputRef.current?.click()}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!uploading) onPick(e.dataTransfer.files?.[0] ?? null)
        }}
        className={cn(
          'rounded-2xl border-2 border-dashed transition-all cursor-pointer',
          uploading && 'opacity-70 pointer-events-none',
          uploadedName
            ? 'border-emerald-300 bg-emerald-50/50'
            : dragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-brand-200 bg-brand-50/30 hover:border-brand-400'
        )}
      >
        <div className="px-5 py-5 flex items-center gap-4">
          <div className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
            uploadedName ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700'
          )}>
            {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" />}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-slate-800">
              {uploading ? 'Uploading…' : uploadedName ? 'File on server' : `Replace ${kind === 'pdf' ? 'PDF' : 'video'}`}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {uploadedName ?? meta.hint}
            </p>
          </div>
          {!uploading && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-brand-700 flex-shrink-0">
              <Upload className="w-3.5 h-3.5" />
              {uploadedName ? 'Change' : 'Upload'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
