/**
 * Accurate invitation toasts and API error messages for live/production.
 */
import { toast } from 'sonner'
import type { StaffInvitationRecord } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'

export { extractApiError }

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

  if (inv.delivery_status === 'QUEUED') {
    const copied = await copyInviteLink(url)
    const msg = copied
      ? 'Invitation saved — email is sending. Secure link copied to clipboard.'
      : 'Invitation saved — email is sending. Refresh Invitations in a few seconds for delivery status.'
    toast.success(msg, { duration: 7000 })
    return
  }

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
