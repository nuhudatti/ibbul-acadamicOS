'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import {
  clearDepartmentBrand,
  getDepartmentBrand,
  readImageFileAsDataUrl,
  setDepartmentBrand,
} from '@/lib/department-branding'

interface DepartmentBrandLogoProps {
  size?: 'sm' | 'md' | 'lg'
  editable?: boolean
  className?: string
}

const SIZES = {
  sm: 'w-9 h-9',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
}

export function DepartmentBrandLogo({ size = 'md', editable = false, className }: DepartmentBrandLogoProps) {
  const { user } = useAuthStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [logo, setLogo] = useState<string | null>(null)

  const canEdit =
    editable &&
    user &&
    (user.role === 'HOD' || user.role === 'DEPARTMENT_ADMIN')

  useEffect(() => {
    if (!user?.id) return
    const brand = getDepartmentBrand(user.id)
    setLogo(brand?.logoDataUrl ?? null)
  }, [user?.id])

  const handleFile = async (file: File | undefined) => {
    if (!file || !user?.id) return
    try {
      const dataUrl = await readImageFileAsDataUrl(file)
      setDepartmentBrand(user.id, { logoDataUrl: dataUrl })
      setLogo(dataUrl)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  const handleRemove = () => {
    if (!user?.id) return
    clearDepartmentBrand(user.id)
    setLogo(null)
  }

  const box = (
    <div
      className={cn(
        SIZES[size],
        'rounded-xl overflow-hidden flex-shrink-0 border border-white/20 bg-white/10 flex items-center justify-center',
        canEdit && 'cursor-pointer hover:ring-2 hover:ring-ibbul-gold/60 transition-shadow',
        className
      )}
      onClick={canEdit ? () => inputRef.current?.click() : undefined}
      title={canEdit ? 'Upload department logo' : undefined}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="Department logo" className="w-full h-full object-contain bg-white" />
      ) : (
        <span className="text-[10px] font-bold text-ibbul-gold tracking-wide">IBBUL</span>
      )}
    </div>
  )

  if (!canEdit) return box

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      {box}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {logo && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            handleRemove()
          }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-red-600"
          aria-label="Remove logo"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {!logo && (
        <span className="text-[10px] text-white/60 flex items-center gap-0.5">
          <ImagePlus className="w-3 h-3" /> Add logo
        </span>
      )}
    </div>
  )
}

/** Dashboard card for HOD to manage department logo */
export function DepartmentBrandPanel() {
  const { user } = useAuthStore()
  if (!user || (user.role !== 'HOD' && user.role !== 'DEPARTMENT_ADMIN')) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <DepartmentBrandLogo size="lg" editable />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-slate-900">Department identity</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Upload your department or faculty crest. It appears on your dashboard and sidebar — stored locally on this device only.
        </p>
        <p className="text-[11px] text-slate-400 mt-2">
          Recommended: square PNG or SVG, max 500 KB. Official IBBUL green and gold work best.
        </p>
      </div>
    </div>
  )
}
