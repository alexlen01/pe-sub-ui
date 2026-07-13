import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { api, type Submission } from '../../services/api'
import Button from './Button'

// Whether the current user may EDIT this submission: its owner, a Manager (override), or a legacy
// submission with no recorded owner. Mirrors SubmissionController.canModify — the server is
// authoritative; this only drives UI enablement. A non-owner analyst is read-only until they
// take the submission over.
export function useCanEditSubmission(submission: Submission | null | undefined): boolean {
  const { currentUser } = useApp()
  const { role } = useAuth()
  if (!submission) return true
  const owner = submission.ownerUuName
  return !owner || owner === currentUser.uuName || role === 'MANAGER'
}

/**
 * Concurrency guard banner. Shown only to a non-owner analyst viewing someone else's in-flight
 * submission: it explains the read-only state and offers an explicit **Take over**, which transfers
 * ownership (and notifies + locks out the previous owner) so two analysts never clobber the same work.
 */
export default function OwnershipBanner({ submission, onTakenOver }: {
  submission: Submission | null | undefined
  onTakenOver: () => void
}) {
  const { currentUser, toast } = useApp()
  const { role } = useAuth()

  if (!submission) return null
  const owner = submission.ownerUuName
  const isOwner = !owner || owner === currentUser.uuName
  // Owner edits freely; a Manager may override without taking over — neither needs the banner.
  if (isOwner || role === 'MANAGER') return null
  // Terminal submissions aren't editable by anyone, so takeover is moot.
  if (submission.status === 'Processed' || submission.status === 'Aborted') return null

  const takeOver = async () => {
    try {
      await api.submissions.takeOver(submission.id)
      toast('You have taken over this submission — you can now edit it.', 3200, 'success')
      onTakenOver()
    } catch (e) {
      toast(`Take over failed: ${String(e)}`)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      margin: '12px 24px 0', padding: '10px 16px', borderRadius: 8,
      background: '#fff8e6', border: '1px solid var(--amber)', fontSize: 12, color: 'var(--text)',
    }}>
      <span>
        This submission is owned by <strong>{submission.ownerName ?? owner}</strong>. You have
        read-only access — editing is disabled to avoid overwriting their work.
      </span>
      <div style={{ flex: 1 }} />
      <Button size="sm" onClick={takeOver}>Take over submission</Button>
    </div>
  )
}
