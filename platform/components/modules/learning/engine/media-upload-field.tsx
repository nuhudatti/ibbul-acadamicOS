'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { uploadLessonMediaFile } from '@/lib/cloudinary-upload'
import { getLearningApiError } from '@/lib/learning-utils'
import { LButton } from '../learning-ui'

export function MediaUploadField({
  lessonId,
  accept,
  label,
  onUploaded,
}: {
  lessonId: number
  accept: string
  label: string
  onUploaded: (fileKey: string, contentType: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      const resp = await uploadLessonMediaFile(lessonId, file)
      toast.success('File uploaded')
      onUploaded(resp.data.file_key || file.name, resp.data.content_type)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : getLearningApiError(err, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
      <LButton
        type="button"
        variant="secondary"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {label}
      </LButton>
    </div>
  )
}
