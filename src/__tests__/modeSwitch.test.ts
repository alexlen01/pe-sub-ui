import { describe, it, expect } from 'vitest'

// Lightweight type/contract checks that don't need a DOM/jsdom setup.

import { DEFAULT_FACILITY_PARAMS } from '../services/bbCalculationService'

describe('DEFAULT_FACILITY_PARAMS', () => {
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
      name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lps: 100,
      facilitySize: '$1B', ubsParticipation: '$100M', ubsParticipationRate: '10%',
      agentBB: '$80M', ubsBB: '$78M',
      delta: '-$2M', ear: '88%', lastRun: '2d ago',
      step: null, submittedBy: null,
      accountNumber: '5VX1796', loanAmount: '$100M', maturityDate: 'Mar 1, 2029', facilityStatusDate: 'May 26, 2026',
    }
    expect(row.id).toBeUndefined()
    expect(row.latestSubmissionId).toBeUndefined()
  })

  it('id and latestSubmissionId are accepted when provided', () => {
    const row: FacilityRow = {
      name: 'Test Fund', agentBank: 'Bank NA', status: 'Active', lps: 100,
      facilitySize: '$1B', ubsParticipation: '$100M', ubsParticipationRate: '10%',
      agentBB: '$80M', ubsBB: '$78M',
      delta: '-$2M', ear: '88%', lastRun: '2d ago',
      step: null, submittedBy: null,
      accountNumber: '5VX1796', loanAmount: '$100M', maturityDate: 'Mar 1, 2029', facilityStatusDate: 'May 26, 2026',
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
      name: 'Test LP', parent: '', spv: false, hq: false,
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
      name: 'Typed Fund', parent: '', spv: false, hq: false,
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

