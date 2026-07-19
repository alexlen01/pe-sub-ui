const NEEDS_REVIEW_STATUSES = new Set(['Needs Review', 'Pending Review', 'Review'])

export function isDashboardNeedsReviewStatus(status: string): boolean {
  return NEEDS_REVIEW_STATUSES.has(status)
}
