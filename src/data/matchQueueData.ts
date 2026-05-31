import { LP_DATA } from './lpData'
import { matchScore } from '../utils/fuzzyMatch'

function agentName(name: string, score: number, rng: () => number): string {
  if (score >= 95) {
    const variants = [
      name.replace(' Corporation', ' Corp.').replace(' Company', ' Co.').replace(' Limited', ' Ltd.').replace(' Management', ' Mgmt').replace(' Investment', ' Inv.'),
      name.replace('& ', '').replace(' and ', ' & '),
      name,
    ]
    return variants[Math.floor(rng() * variants.length)]
  }
  if (score >= 80) {
    return name
      .replace(' Corporation', ' Corp').replace(' Company', ' Co').replace(' Limited', ' Ltd')
      .replace(' Management', ' Mgmt').replace(' Investment', ' Inv').replace(' Pension Plan', ' Pension')
      .replace(' Retirement System', ' Ret. Sys.').replace(' Retirement', ' Ret.')
      .replace('Public Employees', 'Public Emp.').replace("Teachers'", 'Teachers')
  }
  const words = name.split(' ')
  return words.slice(0, Math.max(2, Math.floor(words.length * 0.6))).join(' ')
}

export const NEW_LP_NAMES = [
  'Apex Capital Partners','Bridgewater Strategic Fund','Clearview Capital LLC','Dorchester Investment Group','Everest Capital Partners','Fairmont Investment Trust','Granite Peak Capital','Highview Asset Management','Iron Bridge Capital','Juniper Capital Group','Keystone Investment Partners','Landmark Capital Advisors','Meridian Strategic Investments','Newport Capital LLC','Olympus Investment Partners','Pacific Ridge Capital','Quantum Capital Partners','Redwood Investment Group','Silvergate Capital','Tri-State Pension Investment','Union Capital Partners','Valor Investment Group','Westbridge Capital','Xcel Investment Partners','York Capital Management','Zenith Capital Partners','Alamo Investment Partners','Bristol Capital Group','Cascade Investment Partners','Douglas Capital LLC','Eagle Rock Investment Group','Fairview Capital Partners','Green Mountain Capital','Harbor Investment Group','Inland Capital Partners','Jefferson Capital Advisors','Kensington Investment Group','Liberty Capital Partners','Midland Investment Trust','Norwood Capital Group','Orion Capital Partners','Parkway Investment Group','Quincy Capital LLC','Riverside Capital Partners','Shoreline Investment Group','Timber Hill Capital','Unity Capital Partners','Viking Capital Group','Waterfall Capital Partners','Yellowstone Capital LLC','Zephyr Capital Partners','Abacus Investment Partners','Beacon Capital Group','Copper Mountain Capital','Dunmore Investment Trust','Exeter Capital Partners','Foothills Investment Group','Glacier Capital Partners','Hillside Investment Group','Ironwood Capital LLC','Jasper Capital Partners','Keystone Capital Advisors','Lexington Capital Group','Montrose Investment Partners','Northwood Capital LLC','Overland Investment Group','Pinebrook Capital Partners','Quantus Capital LLC','Rimrock Capital Partners','Stonewall Investment Group','Timberline Capital','Uplander Investment Partners','Valley Capital Group','Westpoint Capital LLC','Xenon Capital Partners','Yellowridge Investment Group','Zion Capital Partners','Acorn Capital Group','Blue River Investment Partners','Cedar Ridge Capital','Driftwood Capital LLC','Ember Capital Partners','Fenwick Investment Group','Glencoe Capital Partners','Highpoint Investment Group','Iris Capital LLC','Juniper Peak Capital','Kraken Capital Partners','Laguna Investment Group','Maplewood Capital','Nantucket Capital Partners','Oaktree Strategic Partners','Pine Bluff Capital','Quorum Investment Group','Ridgeline Capital Partners','Sedona Capital LLC','Thornwood Investment Group','Upton Capital Partners','Venture Bridge Capital','Wilmington Capital Group','Xenon Strategic Partners','Yellowleaf Capital','Zenon Investment Partners','Astoria Capital Group','Bayridge Investment Partners','Coppermine Capital','Dewpoint Capital LLC','Ebbtide Investment Group','Foxglove Capital Partners','Greystone Investment Group','Highcliff Capital','Irongate Capital Partners','Jameson Investment Group','Kingston Capital LLC','Lakeshore Investment Partners','Meadowbrook Capital','Northgate Investment Group','Overbrook Capital Partners','Pinecrest Capital','Queensway Investment Group','Ridgewood Capital Partners','Seagate Investment LLC','Thornbury Capital Group','Upland Capital Partners','Vanguard Strategic Capital','Westgate Investment Group','Yarmouth Capital Partners','Zurich Strategic Capital','Alpenglow Investment Group','Birchwood Capital Partners','Clearbrook Capital LLC','Dunbar Investment Group','Eastside Capital Partners','Fairfield Investment Group','Greenbrook Capital','Hawkwood Investment Partners','Inwood Capital Group','Juniper Grove Capital','Killmore Investment Partners','Landhaven Capital LLC','Moorfield Investment Group','Northcliff Capital Partners',
]

const nameHash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return (h >>> 0) / 0x100000000 }

function buildMatchQueue() {
  let _s = 0xdeadbeef
  const rng = () => { _s = (Math.imul(1664525, _s) + 1013904223) | 0; return (_s >>> 0) / 0x100000000 }
  const queue = []
  let id = 1
  const lps = [...LP_DATA]
  for (let i = lps.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [lps[i], lps[j]] = [lps[j], lps[i]] }
  lps.slice(0, 765).forEach((lp, i) => {
    rng()
    const tier = i < 617 ? 'high' : 'medium'
    rng()
    const aName  = agentName(lp.name, tier === 'high' ? 97 : 85, rng)
    const score  = matchScore(aName, lp.name)
    const status = score >= 95 ? 'Accepted' : 'Pending'
    const parentThreshold = tier === 'high' ? 0.25 : 0.60
    const agentParent = nameHash(lp.name + tier) < parentThreshold ? lp.parent : ''
    queue.push({ id: id++, agentName: aName, masterName: lp.name, masterParent: lp.parent, agentParent, score, facility: 'Blue Owl GP Stakes V', status })
  })
  const newCount = Math.min(NEW_LP_NAMES.length, 135)
  for (let i = 0; i < newCount; i++) {
    const score = 35 + Math.floor(rng() * 35)
    queue.push({ id: id++, agentName: NEW_LP_NAMES[i], masterName: null as string | null, masterParent: '', agentParent: '', score, facility: 'Blue Owl GP Stakes V', status: 'Pending' })
  }
  return queue
}

export const MATCH_QUEUE = buildMatchQueue()

export const SUBMISSION_SUMMARY = [
  { label: 'Facility',          value: 'Blue Owl GP Stakes V'         },
  { label: 'As of Date',        value: '30 Apr 2026'                  },
  { label: 'Agent Bank',        value: 'Goldman Sachs Bank USA'       },
  { label: 'LPs in Submission', value: '900'                          },
  { label: 'New LP Records',    value: '135 (will be created)'        },
  { label: 'Total Uncalled',    value: '$36,529,009,954'              },
]
