import { describe, expect, it } from 'vitest'
import type { Facility, LPRecord } from '../types'
import type { Submission } from '../services/api'
import { buildReclassificationNotifications, buildReviewNotifications } from '../utils/reviewNotifications'

const submission = (overrides: Partial<Submission>): Submission => ({
  id: 1, facilityId: 10, facilityName: 'Apollo XI', agentBank: 'Citi', periodMonth: '2026-07',
  status: 'Review', fileName: 'agent.xlsx', uploadedBy: null, notes: null, wizardStep: 5,
  shadowBbOverrides: null, version: 1, ownerUuName: 'analyst1', ownerName: 'Analyst One',
  submittedBy: null, reviewedBy: null, reviewNote: null,
  createdAt: '2026-07-01T10:00:00Z', updatedAt: '2026-07-01T10:00:00Z',
  ...overrides,
})

describe('review notifications', () => {
  it('shows managers only submissions awaiting an independent approval', () => {
    const messages = buildReviewNotifications([
      submission({ id: 1, status: 'Pending Review', submittedBy: 'analyst1' }),
      submission({ id: 2, status: 'Processed', submittedBy: 'analyst1' }),
      submission({ id: 3, status: 'Review', reviewNote: 'Fix the limit' }),
    ], 'manager1', true)
    expect(messages.map(message => message.id)).toEqual(['approval-1'])
  })

  it('does not ask a manager to independently review their own submission', () => {
    expect(buildReviewNotifications([
      submission({ status: 'Pending Review', submittedBy: 'manager1' }),
    ], 'MANAGER1', true)).toEqual([])
  })

  it('shows an analyst unresolved change requests only for submissions they own', () => {
    const messages = buildReviewNotifications([
      submission({ id: 1, ownerUuName: 'analyst1', reviewNote: 'Correct the concentration limit.' }),
      submission({ id: 2, ownerUuName: 'someone-else', reviewNote: 'Update classifications.' }),
    ], 'ANALYST1', false)
    expect(messages).toHaveLength(1)
    expect(messages[0].detail).toBe('Correct the concentration limit.')
  })

  it('groups reclassified LPs by facility only while that facility is under review', () => {
    const facility = (id: number, name: string, status: Facility['status']) => ({ id, name, status } as Facility)
    const lp = (name: string, rcl: boolean) => ({ name, rcl } as LPRecord)
    const messages = buildReclassificationNotifications([
      facility(10, 'Apollo XI', 'Needs Review'),
      facility(20, 'Closed Fund', 'Active'),
    ], new Map([
      [10, [lp('CalPERS', true), lp('CalSTRS', true), lp('Other', false)]],
      [20, [lp('Historical LP', true)]],
    ]))
    expect(messages).toHaveLength(1)
    expect(messages[0].title).toBe('2 reclassified LPs in Apollo XI')
    expect(messages[0].kind).toBe('reclassified')
  })

  it('returns no badge messages when nothing requires review', () => {
    expect(buildReviewNotifications([submission({ status: 'Processed' })], 'analyst1', false)).toEqual([])
  })
})
