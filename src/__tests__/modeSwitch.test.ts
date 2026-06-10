import { describe, it, expect } from 'vitest'

// ── Mode-toggle contract ───────────────────────────────────────────────────────
// These tests verify the CLAUDE.md rules without needing a DOM/jsdom setup.

import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'

describe('resetAppState contract', () => {
  it('DEFAULT_FACILITY_PARAMS.concLimitM is a positive number', () => {
    expect(typeof DEFAULT_FACILITY_PARAMS.concLimitM).toBe('number')
    expect(DEFAULT_FACILITY_PARAMS.concLimitM).toBeGreaterThan(0)
  })
})

// ── FacilityRow type shape ────────────────────────────────────────────────────

import type { FacilityRow } from '../services/facilityService'

describe('FacilityRow extended type', () => {
  it('id and latestSubmissionId are optional', () => {
    const row: FacilityRow = {
      name: 'Test Fund', agentBank: 'Bank NA', status: 'Certified', lps: 100,
      facilitySize: '$1B', ubsParticipation: '$100M', ubsParticipationRate: '10%',
      creditAgreementRef: 'CA-001', agentBB: '$80M', ubsBB: '$78M',
      delta: '-$2M', ear: '88%', lastRun: '2d ago',
      step: null, submittedBy: null,
    }
    expect(row.id).toBeUndefined()
    expect(row.latestSubmissionId).toBeUndefined()
  })

  it('id and latestSubmissionId are accepted when provided', () => {
    const row: FacilityRow = {
      name: 'Test Fund', agentBank: 'Bank NA', status: 'Certified', lps: 100,
      facilitySize: '$1B', ubsParticipation: '$100M', ubsParticipationRate: '10%',
      creditAgreementRef: 'CA-001', agentBB: '$80M', ubsBB: '$78M',
      delta: '-$2M', ear: '88%', lastRun: '2d ago',
      step: null, submittedBy: null,
      id: 42, lastRunAt: '2026-05-26T00:00:00', latestSubmissionId: 7,
    }
    expect(row.id).toBe(42)
    expect(row.latestSubmissionId).toBe(7)
  })
})

// ── LPRecord = LP alignment ───────────────────────────────────────────────────

import type { LPRecord } from '../services/lpService'
import type { LP } from '../types'

describe('LPRecord type alignment with LP', () => {
  it('LPRecord has pension and pensionFunded as strings (no cast needed)', () => {
    const lp: LPRecord = {
      rank: 1, name: 'Test LP', parent: '', spv: false, hq: false,
      type: 'Institutional', region: 'North America', ig: false,
      cls: 'Rated', clsTag: 'tag-rated', sp: '', mdy: '', fitch: '',
      aum: '', nav: '', pension: '$10M', pensionFunded: '80%',
      capCommit: '', pctCapCommit: '', calledCap: '',
      uc: '', pctUncalled: '', pctCalled: '',
      agentConc: '', ubsConc: '', rate: '', agentRate: '',
      abb: '', ubb: '', uec: '', delta: '',
      inc: true, rcl: false, tf: false, notes: '',
    }
    expect(lp.pension).toBe('$10M')
    expect(lp.pensionFunded).toBe('80%')
  })

  it('LPRecord is assignable to LP without cast', () => {
    const getName = (lp: LP): string => lp.name
    const record: LPRecord = {
      rank: 1, name: 'Typed Fund', parent: '', spv: false, hq: false,
      type: 'Institutional', region: 'North America', ig: false,
      cls: 'Rated', clsTag: 'tag-rated', sp: '', mdy: '', fitch: '',
      aum: '', nav: '', pension: '', pensionFunded: '',
      capCommit: '', pctCapCommit: '', calledCap: '',
      uc: '', pctUncalled: '', pctCalled: '',
      agentConc: '', ubsConc: '', rate: '', agentRate: '',
      abb: '', ubb: '', uec: '', delta: '',
      inc: true, rcl: false, tf: false, notes: '',
    }
    expect(getName(record)).toBe('Typed Fund')
  })
})

// ── Prototype overlay data ────────────────────────────────────────────────────

import {
  PROTOTYPE_STATUS_OVERRIDES,
  PROTOTYPE_SUBMITTED_BY_OVERRIDES,
  PROTOTYPE_PINNED_RUN_DATES,
  PROTOTYPE_CYCLE_BDAYS,
  PROTOTYPE_OWNERS,
} from '../data/facilityData'

describe('Prototype overlay data lives in facilityData (not inline in service)', () => {
  it('STATUS_OVERRIDES contains expected facilities', () => {
    expect(PROTOTYPE_STATUS_OVERRIDES['Apollo Natural Resources III']).toBe('Needs Review')
    expect(PROTOTYPE_STATUS_OVERRIDES['Advent Global IX']).toBe('In Progress')
  })

  it('SUBMITTED_BY_OVERRIDES maps facilities to user names', () => {
    const values = Object.values(PROTOTYPE_SUBMITTED_BY_OVERRIDES)
    for (const v of values) expect(typeof v).toBe('string')
  })

  it('PINNED_RUN_DATES values are Date instances', () => {
    for (const d of Object.values(PROTOTYPE_PINNED_RUN_DATES)) {
      expect(d).toBeInstanceOf(Date)
      expect(isNaN(d.getTime())).toBe(false)
    }
  })

  it('CYCLE_BDAYS contains 17 business days', () => {
    expect(PROTOTYPE_CYCLE_BDAYS.length).toBe(17)
    for (const d of PROTOTYPE_CYCLE_BDAYS) {
      expect([0, 6]).not.toContain(d.getDay())
    }
  })

  it('OWNERS list is non-empty', () => {
    expect(PROTOTYPE_OWNERS.length).toBeGreaterThan(0)
  })
})
