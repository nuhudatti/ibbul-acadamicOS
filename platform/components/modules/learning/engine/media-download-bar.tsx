'use client'

import { Download, ExternalLink } from 'lucide-react'
import { LButton } from '../learning-ui'

export function MediaDownloadBar({
  viewUrl,
  downloadUrl,
  filename,
  label,
}: {
  viewUrl: string
  downloadUrl?: string
  filename?: string
  label: string
}) {
  if (!viewUrl) return null

  const name = filename || viewUrl.split('/').pop()?.split('?')[0] || 'download'
  const download = downloadUrl || viewUrl

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={download} download={name} target="_blank" rel="noopener noreferrer">
        <LButton variant="secondary" size="sm" type="button">
          <Download className="w-3.5 h-3.5" />
          Download {label}
        </LButton>
      </a>
      <a href={viewUrl} target="_blank" rel="noopener noreferrer">
        <LButton variant="ghost" size="sm" type="button">
          <ExternalLink className="w-3.5 h-3.5" />
          Open in new tab
        </LButton>
      </a>
    </div>
  )
}
