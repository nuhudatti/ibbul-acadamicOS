'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2, BookOpen, Save } from 'lucide-react'
import { toast } from 'sonner'
import { coreAPI } from '@/lib/api'
import { useAuthStore } from '@/lib/store'

type CourseRow = {
  code: string
  title: string
  level: string
  semester: string
  credit_units: number
  examiner_id: string
}

const EMPTY_ROW = (): CourseRow => ({
  code: '',
  title: '',
  level: '300',
  semester: 'FIRST',
  credit_units: 3,
  examiner_id: '',
})

export function HodBulkCoursesPanel({
  departmentId,
  onSaved,
}: {
  departmentId: number
  onSaved: () => void
}) {
  const { user } = useAuthStore()
  const isHod = user?.role === 'DEPARTMENT_ADMIN' || user?.role === 'HOD' || user?.role === 'SUPER_ADMIN'
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CourseRow[]>([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
  const [saving, setSaving] = useState(false)
  const [examiners, setExaminers] = useState<{ id: number; name: string }[]>([])

  useEffect(() => {
    if (!open || !isHod) return
    coreAPI.getStaff()
      .then((r) => {
        const list = (r.data ?? []) as { id: number; full_name?: string; first_name?: string; last_name?: string; role?: string }[]
        setExaminers(
          list
            .filter((u) => u.role === 'EXAMINER')
            .map((u) => ({
              id: u.id,
              name: u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || `Lecturer #${u.id}`,
            }))
        )
      })
      .catch(() => {})
  }, [open, isHod])

  if (!isHod) return null

  const updateRow = (i: number, patch: Partial<CourseRow>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  const addRow = () => setRows((prev) => [...prev, EMPTY_ROW()])

  const removeRow = (i: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  const submit = async () => {
    const payload = rows
      .filter((r) => r.code.trim() && r.title.trim())
      .map((r) => ({
        code: r.code.trim().toUpperCase(),
        title: r.title.trim(),
        level: r.level,
        semester: r.semester,
        credit_units: r.credit_units || 3,
        examiner_id: r.examiner_id ? Number(r.examiner_id) : undefined,
      }))

    if (!payload.length) {
      toast.error('Add at least one course with code and title')
      return
    }

    setSaving(true)
    try {
      const resp = await coreAPI.bulkCreateCourses({
        department_id: departmentId,
        courses: payload,
      })
      const created = resp.data?.created_count ?? 0
      const updated = resp.data?.updated_count ?? 0
      const borrowed = resp.data?.borrowed_count ?? 0
      const rowErrors = resp.data?.errors ?? []
      if (created > 0 || updated > 0 || borrowed > 0) {
        toast.success(
          `Saved — ${created} created, ${updated} updated${borrowed ? `, ${borrowed} borrowed` : ''}${rowErrors.length ? `, ${rowErrors.length} skipped` : ''}`
        )
        setRows([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()])
        setOpen(false)
        onSaved()
      } else if (rowErrors.length) {
        const first = rowErrors[0]?.errors
        const msg =
          (typeof first?.code === 'string' && first.code) ||
          (typeof first?.non_field_errors === 'string' && first.non_field_errors) ||
          'No courses were saved — check codes and titles'
        toast.error(msg)
      } else {
        toast.error('No courses were saved')
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { detail?: string; errors?: Array<{ errors?: Record<string, string> }> } } })?.response?.data
      const rowErr = data?.errors?.[0]?.errors
      const msg =
        (typeof rowErr?.code === 'string' && rowErr.code) ||
        data?.detail ||
        'Failed to save courses'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/80 to-white overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-brand-100">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Department courses</p>
            <p className="text-xs text-slate-500">Add multiple courses with titles — owned or borrowed from other departments</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" />
          {open ? 'Close' : 'Add multiple courses'}
        </button>
      </div>

      {open && (
        <div className="p-5 space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  {['Course title', 'Code', 'Level', 'Semester', 'Units', 'Lecturer (optional)', ''].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-2 py-2">
                      <input
                        value={row.title}
                        onChange={(e) => updateRow(i, { title: e.target.value })}
                        placeholder="e.g. Data Structures"
                        className="w-full h-9 px-2 rounded-lg border border-slate-200 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.code}
                        onChange={(e) => updateRow(i, { code: e.target.value.toUpperCase() })}
                        placeholder="CSC301"
                        className="w-24 h-9 px-2 rounded-lg border border-slate-200 text-sm font-mono"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.level}
                        onChange={(e) => updateRow(i, { level: e.target.value })}
                        className="h-9 px-2 rounded-lg border border-slate-200 text-sm"
                      >
                        {['100', '200', '300', '400'].map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.semester}
                        onChange={(e) => updateRow(i, { semester: e.target.value })}
                        className="h-9 px-2 rounded-lg border border-slate-200 text-sm"
                      >
                        <option value="FIRST">First</option>
                        <option value="SECOND">Second</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={1}
                        max={6}
                        value={row.credit_units}
                        onChange={(e) => updateRow(i, { credit_units: Number(e.target.value) })}
                        className="w-16 h-9 px-2 rounded-lg border border-slate-200 text-sm"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.examiner_id}
                        onChange={(e) => updateRow(i, { examiner_id: e.target.value })}
                        className="h-9 px-2 rounded-lg border border-slate-200 text-sm min-w-[140px]"
                      >
                        <option value="">— None —</option>
                        {examiners.map((ex) => (
                          <option key={ex.id} value={ex.id}>{ex.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeRow(i)} className="p-1.5 text-slate-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addRow} className="text-sm text-brand-600 font-medium hover:underline">
              + Add another row
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save all courses
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
