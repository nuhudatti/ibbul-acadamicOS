'use client'

import { useState } from 'react'
import {
  Copy, Check, RefreshCw, Ban, Mail, Clock, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { invitationAPI, type StaffInvitationRecord } from '@/lib/api'
import { extractApiError, toastInvitationOutcome } from '@/lib/invitation-feedback'
import { cn } from '@/lib/utils'

interface InvitationsPanelProps {
  invitations: StaffInvitationRecord[]
  loading: boolean
  onRefresh: () => void
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  SENT: 'bg-blue-50 text-blue-700 border-blue-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
  REVOKED: 'bg-red-50 text-red-600 border-red-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
}

const DELIVERY_STYLE: Record<string, string> = {
  QUEUED: 'text-slate-500',
  SENT: 'text-emerald-600',
  FAILED: 'text-red-600',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Invitation link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
      title={url}
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

export function InvitationsPanel({ invitations, loading, onRefresh }: InvitationsPanelProps) {
  const [busyId, setBusyId] = useState<number | null>(null)

  const pending = invitations.filter((i) =>
    !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(i.status) && !i.is_expired
  )

  const handleResend = async (id: number) => {
    setBusyId(id)
    try {
      const resp = await invitationAPI.resend(id)
      await toastInvitationOutcome(resp.data.invitation, {
        action: 'resent',
        serverMessage: resp.data.message,
      })
      onRefresh()
    } catch (err) {
      toast.error(extractApiError(err, 'Resend failed'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRevoke = async (id: number) => {
    if (!confirm('Revoke this invitation? The link will stop working.')) return
    setBusyId(id)
    try {
      await invitationAPI.revoke(id)
      toast.success('Invitation revoked')
      onRefresh()
    } catch (err) {
      toast.error(extractApiError(err, 'Revoke failed'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    )
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-5 py-8 text-center">
        <Mail className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-600">No pending invitations</p>
        <p className="text-xs text-slate-400 mt-1">Invite a Dean, HOD, or Lecturer to get started.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">
          Pending invitations ({pending.length})
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <div className="divide-y divide-slate-100">
        {pending.map((inv) => {
          const canAct = !['ACCEPTED', 'REVOKED', 'EXPIRED'].includes(inv.status) && !inv.is_expired
          const isBusy = busyId === inv.id
          return (
            <div key={inv.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">
                    {inv.first_name} {inv.last_name}
                  </div>
                  <div className="text-xs text-slate-500">{inv.email}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {inv.role_label}
                    {(inv.faculty_name || inv.department_name) && (
                      <> · {[inv.faculty_name, inv.department_name].filter(Boolean).join(' · ')}</>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={cn(
                    'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border',
                    STATUS_STYLE[inv.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'
                  )}>
                    {inv.is_expired ? 'Expired' : inv.status}
                  </span>
                  <span className={cn(
                    'text-[10px] font-semibold uppercase flex items-center gap-1',
                    DELIVERY_STYLE[inv.delivery_status] ?? 'text-slate-500'
                  )}>
                    <Mail className="w-3 h-3" />
                    {inv.delivery_status === 'SENT' ? 'Delivered' : inv.delivery_status}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Expires {formatDate(inv.expires_at)}
                </span>
                <span>Sent {inv.send_count}× · Last {formatDate(inv.last_sent_at)}</span>
              </div>

              {inv.delivery_error && (
                <div className="flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {inv.delivery_error}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {inv.invite_url && (
                  <CopyLinkButton url={inv.invite_url} />
                )}
                {canAct && (
                  <>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleResend(inv.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-brand-200 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    >
                      <RefreshCw className={cn('w-3 h-3', isBusy && 'animate-spin')} />
                      Resend
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRevoke(inv.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban className="w-3 h-3" />
                      Revoke
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
