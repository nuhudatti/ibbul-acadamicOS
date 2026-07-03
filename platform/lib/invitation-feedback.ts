/**
 * Accurate invitation toasts and API error messages for live/production.
 */
import { toast } from 'sonner'
import type { StaffInvitationRecord } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'

export { extractApiError }

const EMAIL_FAIL_MSG = 'Email could not be sent. Please try again later.'

function formatEmailFailure(detail?: string | null): string {
  const d = detail?.trim()
  if (!d) return EMAIL_FAIL_MSG
  if (d === EMAIL_FAIL_MSG || d.startsWith(EMAIL_FAIL_MSG)) return d
  return `${EMAIL_FAIL_MSG} (${d})`
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
  const url = inv.invite_url

  if (inv.delivery_status === 'SENT') {
    const copied = await copyInviteLink(url)
    if (copied) {
      toast.success('Verification email sent — secure link copied to clipboard')
    } else {
      toast.success(opts?.serverMessage ?? 'Verification email sent')
    }
    return
  }

  if (inv.delivery_status === 'FAILED') {
    const copied = await copyInviteLink(url)
    const base = formatEmailFailure(inv.delivery_error)

    if (copied) {
      toast.error(`${base} Invite link copied — share manually or resend.`, { duration: 9000 })
    } else {
      toast.error(base, { duration: 9000 })
    }
    return
  }

  if (inv.delivery_status === 'QUEUED') {
    toast.warning('Invitation saved — email delivery still pending. Refresh Invitations shortly.', { duration: 7000 })
    return
  }

  toast.warning(opts?.serverMessage ?? 'Invitation saved — check delivery status in Invitations.')
}
