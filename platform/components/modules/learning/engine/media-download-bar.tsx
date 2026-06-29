'use client'

import { Download, ExternalLink } from 'lucide-react'
import { safeStr } from '@/lib/safe-string'

const linkClass =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors'

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
  const view = safeStr(viewUrl).trim()
  if (!view) return null

  const download = safeStr(downloadUrl, view).trim() || view
  const name = safeStr(filename) || view.split('/').pop()?.split('?')[0] || 'download'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={download}
        download={name}
        target="_blank"
        rel="noopener noreferrer"
        className={`${linkClass} bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200`}
      >
        <Download className="w-3.5 h-3.5" />
        Download {label}
      </a>
      <a
        href={view}
        target="_blank"
        rel="noopener noreferrer"
        className={`${linkClass} text-slate-600 hover:bg-slate-50 hover:text-slate-800`}
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open in new tab
      </a>
    </div>
  )
}
