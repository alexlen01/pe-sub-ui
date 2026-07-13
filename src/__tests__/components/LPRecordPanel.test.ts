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

  it('recalculates Agent and UBS excess concentration from edited percentage limits', () => {
    const baseRecord = {
      name: 'Concentrated LP', cls: 'Rated', inc: true, uc: '$30M', capCommit: '$30M',
      rate: '90%', agentRate: '90%', agentConc: '20%', ubsConc: '20%',
      parent: '', spv: false, hq: false, instVsHnw: 'Institutional', region: 'North America', ig: false,
      clsTag: '', sp: '', mdy: '', fitch: '', aum: '', nav: '', pension: '', pensionFunded: '',
      pctCapCommit: '', calledCap: '', pctUncalled: '', pctCalled: '', abb: '$0', ubb: '$0', delta: '$0', uec: '$0',
      rcl: false, tf: false, notes: '',
    } as LPRecord

    const saved = buildLpRecordFromForm(baseRecord, { agentConc: '10%', ubsConc: '10%' }, {
      UBS_CLS_DEFAULT_RATE: {}, BUSA_RATE_MAP: {}, CLS_TAG_MAP: {},
    }, {}, 100)

    expect(saved.agentExcessConc).toBe('$20.0M')
    expect(saved.ubsExcessConc).toBe('$20.0M')
    expect(saved.uec).toBe('$10.0M')
    expect(saved.ubb).toBe('$9.0M')
  })
})
