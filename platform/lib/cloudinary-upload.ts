import axios from 'axios'
import { learningAPI } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { safeStr } from '@/lib/safe-string'

interface CloudinarySignature {
  cloud_name: string
  api_key: string
  timestamp: number
  signature: string
  folder: string
  resource_type: string
  upload_url?: string
}

interface CloudinaryUploadResult {
  secure_url: string
  public_id: string
  resource_type: string
  bytes?: number
  format?: string
  error?: { message?: string }
}

/** Upload learning media directly to Cloudinary (signed), then confirm with Django. */
export async function uploadLessonMediaFile(lessonId: number, file: File) {
  try {
    const sigResp = await learningAPI.getLessonUploadSignature(lessonId, file.name)
    const sig = sigResp.data as CloudinarySignature

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', sig.api_key)
    form.append('timestamp', String(sig.timestamp))
    form.append('signature', sig.signature)
    form.append('folder', sig.folder)

    const uploadUrl =
      sig.upload_url ||
      `https://api.cloudinary.com/v1_1/${sig.cloud_name}/${sig.resource_type}/upload`

    const uploadResp = await fetch(uploadUrl, { method: 'POST', body: form })
    const result = (await uploadResp.json()) as CloudinaryUploadResult
    if (!uploadResp.ok) {
      throw new Error(safeStr(result?.error?.message, 'Cloudinary upload failed'))
    }

    return learningAPI.confirmLessonMedia(lessonId, {
      secure_url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      bytes: result.bytes,
      format: result.format,
      original_filename: file.name,
    })
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) {
      return learningAPI.uploadLessonMediaProxy(lessonId, file)
    }
    throw new Error(extractApiError(err, 'Upload failed'))
  }
}
