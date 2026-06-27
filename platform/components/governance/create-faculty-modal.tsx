'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Building2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { coreAPI } from '@/lib/api'
import { suggestAcademicCode } from '@/lib/academic-code'
import { cn } from '@/lib/utils'

export interface CreatedFaculty {
  id: number
  code: string
  name: string
}

interface CreateFacultyModalProps {
  open: boolean
  onClose: () => void
  onSuccess: (faculty: CreatedFaculty) => void
}

export function CreateFacultyModal({ open, onClose, onSuccess }: CreateFacultyModalProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setCode('')
    setCodeTouched(false)
  }, [open])

  useEffect(() => {
    if (!codeTouched && name.trim()) {
      setCode(suggestAcademicCode(name))
    }
  }, [name, codeTouched])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !code.trim()) {
      toast.error('Faculty name and code are required')
      return
    }

    setSubmitting(true)
    try {
      const resp = await coreAPI.createFaculty({
        name: name.trim(),
        code: code.trim().toUpperCase(),
      })
      const faculty = resp.data as CreatedFaculty
      toast.success(`Faculty "${faculty.name}" created`)
      onSuccess(faculty)
      onClose()
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.code?.[0] ?? err.response?.data?.name?.[0] ?? err.response?.data?.detail ?? err.response?.data?.error ?? 'Failed to create faculty')
        : 'Failed to create faculty'
      toast.error(typeof msg === 'string' ? msg : 'Failed to create faculty')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-brand-600 to-brand-800" />
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Create Faculty</h2>
              <p className="text-xs text-slate-500">Adds a new scoped faculty workspace</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Faculty name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Faculty of Engineering"
              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Faculty code
            </label>
            <div className="relative">
              <input
                value={code}
                onChange={(e) => {
                  setCodeTouched(true)
                  setCode(e.target.value.toUpperCase())
                }}
                placeholder="e.g. ENG"
                maxLength={20}
                className="w-full h-10 px-3 pr-10 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {!codeTouched && code && (
                <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-400" title="Auto-suggested" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Short unique code — used across dashboards and structure views.
            </p>
          </div>

          <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-xs text-brand-800 leading-relaxed">
            After creating the faculty, <strong>invite a Dean</strong> from Academic Structure or Leadership & Roles.
            The Dean will get a <strong>Faculty Governance Center</strong> scoped only to this faculty.
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'flex-1 h-10 rounded-xl text-sm font-semibold text-white gradient-brand shadow-sm',
                'disabled:opacity-60 flex items-center justify-center gap-2'
              )}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create faculty'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
