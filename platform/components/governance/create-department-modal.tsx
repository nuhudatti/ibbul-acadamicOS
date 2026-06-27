'use client'



import { useEffect, useState } from 'react'

import { X, Loader2, Layers } from 'lucide-react'

import { toast } from 'sonner'

import axios from 'axios'

import { coreAPI } from '@/lib/api'

import { suggestAcademicCode } from '@/lib/academic-code'

import { cn } from '@/lib/utils'



export interface CreatedDepartment {

  id: number

  name: string

  code: string

}



interface CreateDepartmentModalProps {

  open: boolean

  onClose: () => void

  onSuccess: (department: CreatedDepartment) => void

  facultyId: number

  facultyName: string

}



export function CreateDepartmentModal({

  open,

  onClose,

  onSuccess,

  facultyId,

  facultyName,

}: CreateDepartmentModalProps) {

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

    if (!name.trim() || !code.trim()) return



    setSubmitting(true)

    try {

      const resp = await coreAPI.createDepartment({

        name: name.trim(),

        code: code.trim().toUpperCase(),

        faculty: facultyId,

      })

      const dept: CreatedDepartment = {

        id: resp.data.id,

        name: resp.data.name ?? name.trim(),

        code: resp.data.code ?? code.trim().toUpperCase(),

      }

      toast.success(`Department "${dept.name}" created`)

      onSuccess(dept)

      onClose()

    } catch (err) {

      const data = axios.isAxiosError(err) ? err.response?.data : null

      const msg =

        data?.code?.[0] ??

        data?.non_field_errors?.[0] ??

        data?.detail ??

        data?.error ??

        'Failed to create department'

      toast.error(typeof msg === 'string' ? msg : 'Failed to create department')

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

              <Layers className="w-5 h-5 text-brand-700" />

            </div>

            <div>

              <h2 className="font-bold text-slate-900">Add Department</h2>

              <p className="text-xs text-slate-500">{facultyName}</p>

            </div>

          </div>

          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">

            <X className="w-4 h-4" />

          </button>

        </div>



        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">

          <p className="text-xs text-slate-500 bg-brand-50 border border-brand-100 rounded-xl px-3 py-2">

            After creating the department, you will be prompted to invite a Head of Department (HOD).

          </p>

          <div>

            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Department name</label>

            <input

              value={name}

              onChange={(e) => setName(e.target.value)}

              placeholder="e.g. Computer Science"

              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"

              autoFocus

            />

          </div>

          <div>

            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Department code</label>

            <input

              value={code}

              onChange={(e) => {

                setCodeTouched(true)

                setCode(e.target.value.toUpperCase())

              }}

              placeholder="e.g. CSC"

              maxLength={20}

              className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"

            />

          </div>

          <div className="flex gap-2 pt-1">

            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">

              Cancel

            </button>

            <button

              type="submit"

              disabled={submitting}

              className={cn(

                'flex-1 h-10 rounded-xl text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800',

                'disabled:opacity-60 flex items-center justify-center gap-2'

              )}

            >

              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create department'}

            </button>

          </div>

        </form>

      </div>

    </div>

  )

}


