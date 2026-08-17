import type { Facility, LPRecord } from '../types'
import type { Submission } from '../services/api'

export type ReviewNotificationKind = 'approval' | 'changes-requested' | 'reclassified'

export interface ReviewNotification {
  id: string
  kind: ReviewNotificationKind
  title: string
  detail: string
  actionLabel: string
  facilityId: number
  facilityName: string
  submission?: Submission
}

/**
 * Builds the notification queue from durable workflow state. There is deliberately no
 * separate "unread" flag: a message remains pending until the user acts on the submission.
 */
export function buildReviewNotifications(
  submissions: Submission[],
  userUuName: string,
  canReviewShadowBb: boolean,
): ReviewNotification[] {
  const normalizedUser = userUuName.trim().toLowerCase()

  return submissions
    .flatMap((submission): ReviewNotification[] => {
      if (
        canReviewShadowBb
        && submission.status === 'Pending Review'
        && submission.submittedBy?.toLowerCase() !== normalizedUser
      ) {
        return [{
          id: `approval-${submission.id}`,
          kind: 'approval',
          title: `${submission.facilityName} is ready for approval`,
          detail: `Submitted by ${submission.submittedBy || 'an analyst'}. Review the Shadow BB and approve it or request changes.`,
          actionLabel: 'Review Shadow BB',
          facilityId: submission.facilityId,
          facilityName: submission.facilityName,
          submission,
        }]
      }

      if (
        !canReviewShadowBb
        && submission.status === 'Review'
        && !!submission.reviewNote?.trim()
        && submission.ownerUuName?.toLowerCase() === normalizedUser
      ) {
        return [{
          id: `changes-${submission.id}`,
          kind: 'changes-requested',
          title: `Changes requested for ${submission.facilityName}`,
          detail: submission.reviewNote.trim(),
          actionLabel: 'Review requested changes',
          facilityId: submission.facilityId,
          facilityName: submission.facilityName,
          submission,
        }]
      }

      return []
    })
    .sort((a, b) => Date.parse(b.submission?.updatedAt ?? '') - Date.parse(a.submission?.updatedAt ?? ''))
}

const RECLASSIFICATION_REVIEW_STATUSES = new Set(['Needs Review', 'Review', 'Pending Review'])

/** One message per reviewable facility prevents a large reclassification batch from flooding the UI. */
export function buildReclassificationNotifications(
  facilities: Facility[],
  recordsByFacility: Map<number, LPRecord[]>,
): ReviewNotification[] {
  return facilities
    .filter(facility => RECLASSIFICATION_REVIEW_STATUSES.has(facility.status))
    .flatMap((facility): ReviewNotification[] => {
      const reclassified = (recordsByFacility.get(facility.id) ?? []).filter(record => record.reclassified)
      if (reclassified.length === 0) return []
      const sample = reclassified.slice(0, 2).map(record => record.investorName).join(', ')
      const remainder = reclassified.length - 2
      return [{
        id: `reclassified-${facility.id}`,
        kind: 'reclassified',
        title: `${reclassified.length} reclassified LP${reclassified.length === 1 ? '' : 's'} in ${facility.name}`,
        detail: `${sample}${remainder > 0 ? ` and ${remainder} more` : ''} require review before the facility leaves the review workflow.`,
        actionLabel: 'Review reclassifications',
        facilityId: facility.id,
        facilityName: facility.name,
      }]
    })
}
