/**
 * Accurate invitation toasts and API error messages for live/production.
 */
import axios from 'axios'
import { toast } from 'sonner'
import type { StaffInvitationRecord } from '@/lib/api'

export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') {
      return 'Request timed out. The invitation may already exist — check the Invitations list before sending again.'
    }
    if (!err.response) {
      return 'Network error — check your connection and try again.'
    }
    const data = err.response.data
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>
      if (typeof record.error === 'string' && record.error.trim()) return record.error
      if (typeof record.detail === 'string' && record.detail.trim()) return record.detail
      if (typeof record.message === 'string' && record.message.trim()) return record.message
    }
    if (err.response.status === 403) return 'You do not have permission for this action.'
    if (err.response.status === 500) {
      return 'Server error — please try again. If it persists, contact ICT support.'
    }
  }
  return fallback
}

async function copyInviteLink(url: string | null | undefined): Promise<boolean> {
  if (!url) return false
  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    return false
  }
}

/** Show the correct toast after create/resend based on delivery_status from the API. */
export async function toastInvitationOutcome(
  inv: StaffInvitationRecord,
  opts?: { action?: 'created' | 'resent'; serverMessage?: string },
) {
  const action = opts?.action ?? 'created'
  const verb = action === 'resent' ? 'resent' : 'created'
  const url = inv.invite_url

  if (inv.delivery_status === 'SENT') {
    const copied = await copyInviteLink(url)
    if (copied) {
      toast.success('Invitation email sent — secure link copied to clipboard')
    } else {
      toast.success(
        opts?.serverMessage ?? 'Invitation email sent successfully',
      )
    }
    return
  }

  if (inv.delivery_status === 'FAILED') {
    const copied = await copyInviteLink(url)
    const detail = inv.delivery_error?.trim()
    const base = detail
      ? `Invitation ${verb} but email failed: ${detail}`
      : `Invitation ${verb} but email could not be sent. Use the secure link from Invitations.`

    if (copied) {
      toast.warning(`${base} Link copied to clipboard.`, { duration: 9000 })
    } else {
      toast.warning(base, { duration: 9000 })
    }
    return
  }

  toast.success(opts?.serverMessage ?? `Invitation ${verb} successfully`)
}
