import { describe, expect, it } from 'vitest'
import { isDashboardNeedsReviewStatus } from '../utils/dashboardStatus'

describe('Dashboard Needs Review status filter', () => {
  it.each(['Needs Review', 'Pending Review', 'Review'])(
    'includes facilities with %s status',
    status => {
      expect(isDashboardNeedsReviewStatus(status)).toBe(true)
    },
  )

  it.each(['Active', 'In Progress', 'Not Started', 'Pending', 'Inactive'])(
    'excludes facilities with %s status',
    status => {
      expect(isDashboardNeedsReviewStatus(status)).toBe(false)
    },
  )
})
