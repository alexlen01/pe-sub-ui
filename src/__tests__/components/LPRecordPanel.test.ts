import { describe, expect, it } from 'vitest'
import { buildLpRecordFromForm } from '../../components/ui/LPRecordPanel'
import type { LPRecord } from '../../services/lpService'

describe('buildLpRecordFromForm', () => {
  it('preserves an edited agent advance rate in the saved LP record payload', () => {
    const baseRecord: LPRecord = {
      name: 'Test LP',
      parent: '',
      spv: false,
      hq: false,
      instVsHnw: 'Institutional',
      region: 'North America',
      ig: false,
      cls: 'Rated',
      clsTag: '',
      sp: '',
      mdy: '',
      fitch: '',
      aum: '',
      nav: '',
      pension: '',
      pensionFunded: '',
      capCommit: '$100M',
      pctCapCommit: '',
      calledCap: '',
      uc: '$100M',
      pctUncalled: '',
      pctCalled: '',
      agentConc: '',
      ubsConc: '',
      rate: '90%',
      agentRate: '50%',
      abb: '$0',
      ubb: '$0',
      delta: '$0',
      uec: '$0',
      inc: true,
      rcl: false,
      tf: false,
      notes: '',
    }

    const saved = buildLpRecordFromForm(baseRecord, { agentRate: '75%' }, {
      UBS_CLS_DEFAULT_RATE: {},
      BUSA_RATE_MAP: {},
      CLS_TAG_MAP: {},
    }, {})

    expect(saved.agentRate).toBe('75%')
    expect(saved.abb).toBe('$75.0M')
  })
})
