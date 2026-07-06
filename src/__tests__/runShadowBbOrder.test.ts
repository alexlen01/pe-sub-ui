import { describe, it, expect } from 'vitest'
import { orderSubmissionLPs } from '../screens/RunShadowBB'

// Run Shadow BB must render LP rows in the original Agent BB file (row_index / source_seq) order,
// never alphabetically. In live mode that order is whatever the API returns (already source_seq
// ordered); in prototype mode it is derived from the match queue's upload order.

type Row = { name?: string; _agentName?: string }

// Deliberately non-alphabetical to prove order is never sorted by name.
const apiRows: Row[] = [
  { name: 'Zephyr Capital', _agentName: 'Zephyr Capital' },
  { name: 'Apex Partners',  _agentName: 'Apex Partners'  },
  { name: 'Meridian LPRecord',    _agentName: 'Meridian LPRecord'    },
]

describe('orderSubmissionLPs — live mode', () => {
  it('preserves the API (source_seq) order exactly', () => {
    const out = orderSubmissionLPs(apiRows, [], true)
    expect(out.map(r => r.name)).toEqual(['Zephyr Capital', 'Apex Partners', 'Meridian LPRecord'])
  })

  it('does not alphabetize', () => {
    const out = orderSubmissionLPs(apiRows, [], true)
    expect(out.map(r => r.name)).not.toEqual([...apiRows].map(r => r.name).sort())
  })
})

describe('orderSubmissionLPs — prototype mode', () => {
  it('orders rows by the match queue upload order (by id), not alphabetically', () => {
    // Queue carries the Agent BB file order via ascending id; rows arrive shuffled.
    const queue = [
      { id: 30, agentName: 'Meridian LPRecord',    masterName: 'Meridian LPRecord'    },
      { id: 10, agentName: 'Zephyr Capital', masterName: 'Zephyr Capital' },
      { id: 20, agentName: 'Apex Partners',  masterName: 'Apex Partners'  },
    ]
    const shuffled: Row[] = [apiRows[1], apiRows[2], apiRows[0]]
    const out = orderSubmissionLPs(shuffled, queue, false)
    // id 10 → Zephyr, id 20 → Apex, id 30 → Meridian
    expect(out.map(r => r.name)).toEqual(['Zephyr Capital', 'Apex Partners', 'Meridian LPRecord'])
  })

  it('matches rows by matched master name when the agent name differs', () => {
    const queue = [
      { id: 1, agentName: 'Apex Ptnrs',  masterName: 'Apex Partners' },
      { id: 2, agentName: 'Zephyr Cap.', masterName: 'Zephyr Capital' },
    ]
    const rows: Row[] = [
      { name: 'Zephyr Capital', _agentName: 'Zephyr Capital' },
      { name: 'Apex Partners',  _agentName: 'Apex Partners'  },
    ]
    const out = orderSubmissionLPs(rows, queue, false)
    expect(out.map(r => r.name)).toEqual(['Apex Partners', 'Zephyr Capital'])
  })

  it('sends rows with no queue position to the end', () => {
    const queue = [{ id: 1, agentName: 'Apex Partners', masterName: 'Apex Partners' }]
    const rows: Row[] = [
      { name: 'Orphan LPRecord',     _agentName: 'Orphan LPRecord'     },
      { name: 'Apex Partners', _agentName: 'Apex Partners' },
    ]
    const out = orderSubmissionLPs(rows, queue, false)
    expect(out.map(r => r.name)).toEqual(['Apex Partners', 'Orphan LPRecord'])
  })
})
