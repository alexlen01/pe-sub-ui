import { describe, expect, it } from 'vitest'
import { buildLpRecordFromForm } from '../../components/ui/LPRecordPanel'
import type { LPRecord } from '../../services/lpService'

// LPRecord mirrors LpRecordDto: money and the concentration limits are pre-formatted display
// strings, while advance rates and the ratio fields are raw fractions (0.9 = 90%). The panel's
// percent inputs edit the rates as text, so buildLpRecordFromForm converts back at the boundary.
const baseRecord = (over: Partial<LPRecord> = {}): LPRecord => ({
  investorName: 'Test LP',
  parent: '',
  spv: false,
  highQuality: false,
  institutionalOrHnw: 'Institutional',
  investorType: '',
  regionLocation: 'North America',
  investmentGrade: false,
  ubsLpCategory: 'Rated',
  ubsLpCategoryTag: '',
  spRating: '',
  moodysRating: '',
  fitchRating: '',
  aum: '',
  nav: '',
  pensionAssets: '',
  fundingRatio: null,
  capitalCommitment: '$100M',
  pctOfFundCommitments: null,
  calledCapital: '',
  uncalledCapital: '$100M',
  pctOfFundUncalled: null,
  pctLpCalled: null,
  agentConcentrationLimit: '',
  ubsConcentrationLimit: '',
  ubsAdvanceRate: 0.9,
  agentAdvanceRate: 0.5,
  agentBorrowingBase: '$0',
  ubsBorrowingBase: '$0',
  delta: '$0',
  uncalledEligibleCapital: '$0',
  included: true,
  reclassified: false,
  transferee: false,
  notes: '',
  ...over,
})

const EMPTY_CLASS_CFG = { UBS_CLS_DEFAULT_RATE: {}, BUSA_RATE_MAP: {}, CLS_TAG_MAP: {} }

describe('buildLpRecordFromForm', () => {
  it('preserves an edited agent advance rate in the saved LP record payload', () => {
    const saved = buildLpRecordFromForm(baseRecord(), { agentAdvanceRate: '75%' }, EMPTY_CLASS_CFG, {})

    expect(saved.agentAdvanceRate).toBe(0.75)
    expect(saved.agentBorrowingBase).toBe('$75.0M')
  })

  it('recalculates Agent and UBS excess concentration from edited percentage limits', () => {
    const record = baseRecord({
      investorName: 'Concentrated LP',
      uncalledCapital: '$30M',
      capitalCommitment: '$30M',
      agentAdvanceRate: 0.9,
      agentConcentrationLimit: '20%',
      ubsConcentrationLimit: '20%',
    })

    const saved = buildLpRecordFromForm(
      record,
      { agentConcentrationLimit: '10%', ubsConcentrationLimit: '10%' },
      EMPTY_CLASS_CFG,
      {},
      100,
    )

    expect(saved.agentExcessConcentration).toBe('$20.0M')
    expect(saved.ubsExcessConcentration).toBe('$20.0M')
    expect(saved.uncalledEligibleCapital).toBe('$10.0M')
    expect(saved.ubsBorrowingBase).toBe('$9.0M')
  })

  it('preserves free-form LP Size text without currency conversion', () => {
    const saved = buildLpRecordFromForm(
      baseRecord({ investorName: 'Free-form LP', uncalledCapital: '$10M', capitalCommitment: '$10M' }),
      { lpSizeCriteria: 'AUM', lpSize: '$21 bn+ / reported tier' },
      EMPTY_CLASS_CFG,
      {},
    )

    expect(saved.aum).toBe('$21 bn+ / reported tier')
  })

  it.each([
    ['Agent classification', { agentLpCategory: 'Excluded' }],
    ['UBS classification', { ubsLpCategory: 'Excluded' }],
  ])('marks a record reclassified when %s changes during Save', (_label, edit) => {
    const record = baseRecord({
      investorName: 'Changed LP',
      agentLpCategory: 'Included',
      uncalledCapital: '$10M',
      capitalCommitment: '$10M',
      agentAdvanceRate: 0.9,
    })

    const saved = buildLpRecordFromForm(record, edit, EMPTY_CLASS_CFG, {})

    expect(saved.reclassified).toBe(true)
  })

  it('leaves a record unreclassified when neither classification changes', () => {
    const saved = buildLpRecordFromForm(baseRecord(), { notes: 'reviewed' }, EMPTY_CLASS_CFG, {})

    expect(saved.reclassified).toBe(false)
  })

  it('converts the form\'s percent text back to the fraction the API stores', () => {
    const saved = buildLpRecordFromForm(baseRecord(), { ubsAdvanceRate: '65%' }, EMPTY_CLASS_CFG, {})

    expect(saved.ubsAdvanceRate).toBe(0.65)
  })
})
