
export interface FacilityRow {
  name:                 string
  agentBank:            string
  facilitySize:         string
  ubsParticipation:     string
  ubsParticipationRate: string
  creditAgreementRef:   string
  agentBB:              string
  ubsBB:                string
  delta:                string
  ear:                  string
  status:               string
  lps:                  number
}

export interface SubmissionRow {
  id?:       number
  facility:  string
  date:      string
  status:    string
  action:    string
  step:      number
  file:      string
  agentBank: string
  notes:     string
}

export interface ActivityRow {
  ts:     string
  event:  string
  detail: string
  user:   string
  color:  string
}

export interface AuditLogRow {
  ts:       string
  event:    string
  facility: string
  detail:   string
  user:     string
  ip:       string
}

export const FACILITIES: FacilityRow[] = [
  // ── Tier 1 · Large-cap buyout ──────────────────────────────────────────
  { name:'Blue Owl GP Stakes V',              agentBank:'Goldman Sachs Bank USA',  facilitySize:'$2,850.0M', ubsParticipation:'$285.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-BOGS-V-001',   agentBB:'$142.3M', ubsBB:'$138.6M', delta:'-$3.7M', ear:'87.4%', status:'Active',  lps:900  },
  { name:'Blackstone CRE VII',               agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$1,600.0M', ubsParticipation:'$160.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-BCRE-VII-002', agentBB:'$98.1M',  ubsBB:'$95.0M',  delta:'-$3.1M', ear:'89.2%', status:'Active',  lps:984  },
  { name:'KKR Americas XII',                 agentBank:'Bank of America NA',      facilitySize:'$3,200.0M', ubsParticipation:'$384.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-KKRAM-XII-003',agentBB:'$211.4M', ubsBB:'$207.8M', delta:'-$3.6M', ear:'91.1%', status:'Pending', lps:1641 },
  { name:'Apollo Global Fund XI',            agentBank:'Citibank NA',             facilitySize:'$1,100.0M', ubsParticipation:'$99.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-APO-XI-004',   agentBB:'$67.5M',  ubsBB:'$64.2M',  delta:'-$3.3M', ear:'85.6%', status:'Active',  lps:762  },
  { name:'Carlyle Partners VIII',            agentBank:'Wells Fargo Bank NA',     facilitySize:'$2,400.0M', ubsParticipation:'$216.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-CARL-VIII-005',agentBB:'$155.2M', ubsBB:'$152.1M', delta:'-$3.1M', ear:'88.3%', status:'Active',  lps:1208 },
  { name:'Blackstone Capital Partners X',    agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$4,800.0M', ubsParticipation:'$576.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-BCP-X-006',    agentBB:'$318.7M', ubsBB:'$312.4M', delta:'-$6.3M', ear:'90.5%', status:'Active',  lps:2187 },
  { name:'KKR North America Fund XIV',       agentBank:'Goldman Sachs Bank USA',  facilitySize:'$3,050.0M', ubsParticipation:'$305.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2024-KKRNA-XIV-007',agentBB:'$187.2M', ubsBB:'$183.9M', delta:'-$3.3M', ear:'91.8%', status:'Active',  lps:1532 },
  { name:'Carlyle Global Partners IV',       agentBank:'Barclays Bank PLC',       facilitySize:'$1,450.0M', ubsParticipation:'$130.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-CARLGP-IV-008',agentBB:'$94.8M',  ubsBB:'$92.1M',  delta:'-$2.7M', ear:'89.6%', status:'Active',  lps:876  },
  { name:'Apollo Natural Resources III',     agentBank:'Citibank NA',             facilitySize:'$900.0M',   ubsParticipation:'$81.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-APONR-III-009',agentBB:'$52.3M',  ubsBB:'$50.8M',  delta:'-$1.5M', ear:'88.2%', status:'Review',  lps:618  },
  { name:'Bain Capital Fund XIII',           agentBank:'Morgan Stanley Bank NA',  facilitySize:'$2,200.0M', ubsParticipation:'$220.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-BAIN-XIII-010',agentBB:'$136.4M', ubsBB:'$133.2M', delta:'-$3.2M', ear:'90.1%', status:'Active',  lps:1147 },
  // ── Tier 2 · Growth & mid-market ──────────────────────────────────────
  { name:'Ares Capital IX',                  agentBank:'Bank of America NA',      facilitySize:'$1,350.0M', ubsParticipation:'$135.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-ARES-IX-011',  agentBB:'$89.7M',  ubsBB:'$87.4M',  delta:'-$2.3M', ear:'90.0%', status:'Review',  lps:843  },
  { name:'Warburg Pincus XIV',               agentBank:'Goldman Sachs Bank USA',  facilitySize:'$700.0M',   ubsParticipation:'$63.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-WP-XIV-012',   agentBB:'$44.3M',  ubsBB:'$43.1M',  delta:'-$1.2M', ear:'92.4%', status:'Active',  lps:512  },
  { name:'Vista Equity VII',                 agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$1,950.0M', ubsParticipation:'$195.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-VISTA-VII-013',agentBB:'$123.6M', ubsBB:'$120.9M', delta:'-$2.7M', ear:'88.8%', status:'Active',  lps:1092 },
  { name:'TPG Rise Climate',                 agentBank:'Wells Fargo Bank NA',     facilitySize:'$1,200.0M', ubsParticipation:'$120.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2022-TPGRC-014',    agentBB:'$76.4M',  ubsBB:'$74.8M',  delta:'-$1.6M', ear:'91.5%', status:'Active',  lps:698  },
  { name:'Advent Global IX',                 agentBank:'Barclays Bank PLC',       facilitySize:'$920.0M',   ubsParticipation:'$82.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-ADVG-IX-015',  agentBB:'$58.2M',  ubsBB:'$56.7M',  delta:'-$1.5M', ear:'89.9%', status:'Pending', lps:587  },
  { name:'Hellman & Friedman X',             agentBank:'Morgan Stanley Bank NA',  facilitySize:'$1,700.0M', ubsParticipation:'$170.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-HF-X-016',     agentBB:'$108.9M', ubsBB:'$106.3M', delta:'-$2.6M', ear:'91.2%', status:'Active',  lps:934  },
  { name:'Silver Lake Partners VII',         agentBank:'Goldman Sachs Bank USA',  facilitySize:'$2,550.0M', ubsParticipation:'$255.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-SLP-VII-017',  agentBB:'$162.1M', ubsBB:'$158.7M', delta:'-$3.4M', ear:'90.7%', status:'Active',  lps:1318 },
  { name:'Thoma Bravo Fund XVI',             agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$3,100.0M', ubsParticipation:'$372.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-TB-XVI-018',   agentBB:'$201.3M', ubsBB:'$197.4M', delta:'-$3.9M', ear:'92.1%', status:'Active',  lps:1486 },
  { name:'CVC Capital Partners IX',          agentBank:'Deutsche Bank AG',        facilitySize:'$2,250.0M', ubsParticipation:'$202.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-CVC-IX-019',   agentBB:'$143.6M', ubsBB:'$140.2M', delta:'-$3.4M', ear:'89.4%', status:'Active',  lps:1204 },
  { name:'EQT X Fund',                       agentBank:'Barclays Bank PLC',       facilitySize:'$2,750.0M', ubsParticipation:'$275.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2024-EQT-X-020',    agentBB:'$176.8M', ubsBB:'$173.1M', delta:'-$3.7M', ear:'90.3%', status:'Active',  lps:1391 },
  // ── Tier 3 · Sector-focused ────────────────────────────────────────────
  { name:'General Atlantic Growth IV',       agentBank:'Bank of America NA',      facilitySize:'$1,380.0M', ubsParticipation:'$124.2M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-GAG-IV-021',   agentBB:'$88.4M',  ubsBB:'$86.1M',  delta:'-$2.3M', ear:'91.6%', status:'Active',  lps:812  },
  { name:'Francisco Partners VII',           agentBank:'Wells Fargo Bank NA',     facilitySize:'$980.0M',   ubsParticipation:'$88.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-FP-VII-022',   agentBB:'$61.7M',  ubsBB:'$59.8M',  delta:'-$1.9M', ear:'90.8%', status:'Active',  lps:574  },
  { name:'Insight Partners XIII',            agentBank:'Citibank NA',             facilitySize:'$1,800.0M', ubsParticipation:'$180.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2024-INS-XIII-023', agentBB:'$114.2M', ubsBB:'$111.6M', delta:'-$2.6M', ear:'91.3%', status:'Pending', lps:1021 },
  { name:'New Mountain Partners VII',        agentBank:'Morgan Stanley Bank NA',  facilitySize:'$1,150.0M', ubsParticipation:'$103.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-NMP-VII-024',  agentBB:'$72.3M',  ubsBB:'$70.4M',  delta:'-$1.9M', ear:'90.5%', status:'Active',  lps:687  },
  { name:'Permira VIII',                     agentBank:'Deutsche Bank AG',        facilitySize:'$2,050.0M', ubsParticipation:'$184.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-PERM-VIII-025',agentBB:'$129.5M', ubsBB:'$126.4M', delta:'-$3.1M', ear:'89.7%', status:'Active',  lps:1098 },
  { name:'Leonard Green Partners XI',        agentBank:'Goldman Sachs Bank USA',  facilitySize:'$1,320.0M', ubsParticipation:'$118.8M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-LGP-XI-026',   agentBB:'$83.2M',  ubsBB:'$81.0M',  delta:'-$2.2M', ear:'90.2%', status:'Active',  lps:748  },
  { name:'Clayton Dubilier & Rice XII',      agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$1,550.0M', ubsParticipation:'$139.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-CDR-XII-027',  agentBB:'$97.6M',  ubsBB:'$95.1M',  delta:'-$2.5M', ear:'90.6%', status:'Active',  lps:892  },
  // ── Tier 4 · Infrastructure & real assets ─────────────────────────────
  { name:'Brookfield Infrastructure V',      agentBank:'Bank of America NA',      facilitySize:'$3,500.0M', ubsParticipation:'$420.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2023-BIF-V-028',    agentBB:'$224.1M', ubsBB:'$219.8M', delta:'-$4.3M', ear:'88.9%', status:'Active',  lps:1876 },
  { name:'Global Infrastructure Partners VI',agentBank:'Citibank NA',             facilitySize:'$3,050.0M', ubsParticipation:'$305.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-GIP-VI-029',   agentBB:'$196.4M', ubsBB:'$192.0M', delta:'-$4.4M', ear:'89.1%', status:'Active',  lps:1643 },
  { name:'Stonepeak Infrastructure IV',      agentBank:'Wells Fargo Bank NA',     facilitySize:'$1,850.0M', ubsParticipation:'$185.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2024-STONE-IV-030', agentBB:'$118.3M', ubsBB:'$115.6M', delta:'-$2.7M', ear:'90.4%', status:'Active',  lps:1024 },
  { name:'Blackstone Infrastructure III',    agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$4,400.0M', ubsParticipation:'$528.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-BINF-III-031', agentBB:'$284.6M', ubsBB:'$278.9M', delta:'-$5.7M', ear:'89.7%', status:'Pending', lps:2241 },
  { name:'KKR Global Infrastructure V',      agentBank:'Goldman Sachs Bank USA',  facilitySize:'$2,400.0M', ubsParticipation:'$240.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-KKRGI-V-032',  agentBB:'$152.7M', ubsBB:'$149.3M', delta:'-$3.4M', ear:'90.8%', status:'Active',  lps:1312 },
  // ── Tier 5 · Credit & special situations ──────────────────────────────
  { name:'Ares Senior Direct Lending IV',    agentBank:'Morgan Stanley Bank NA',  facilitySize:'$720.0M',   ubsParticipation:'$72.0M',  ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2022-ARESDL-IV-033',agentBB:'$47.8M',  ubsBB:'$46.4M',  delta:'-$1.4M', ear:'92.7%', status:'Active',  lps:438  },
  { name:'Golub Capital BDC Partners II',    agentBank:'Barclays Bank PLC',       facilitySize:'$520.0M',   ubsParticipation:'$46.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-GOLUB-II-034', agentBB:'$34.2M',  ubsBB:'$33.1M',  delta:'-$1.1M', ear:'91.4%', status:'Active',  lps:312  },
  { name:'Owl Rock Technology Finance II',   agentBank:'Deutsche Bank AG',        facilitySize:'$640.0M',   ubsParticipation:'$57.6M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ORTECH-II-035',agentBB:'$41.6M',  ubsBB:'$40.3M',  delta:'-$1.3M', ear:'90.9%', status:'Review',  lps:384  },
  // ── Tier 6 · Venture & growth equity ──────────────────────────────────
  { name:'Sequoia Heritage Fund III',          agentBank:'Goldman Sachs Bank USA',  facilitySize:'$1,050.0M', ubsParticipation:'$94.5M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-SEQH-III-036', agentBB:'$62.4M',  ubsBB:'$60.9M',  delta:'-$1.5M', ear:'92.1%', status:'Active',  lps:621  },
  { name:'Andreessen Horowitz LSV Fund III',   agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$1,400.0M', ubsParticipation:'$140.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2024-A16Z-III-037', agentBB:'$89.3M',  ubsBB:'$87.1M',  delta:'-$2.2M', ear:'91.4%', status:'Active',  lps:874  },
  { name:'Tiger Global Private Partners XIV',  agentBank:'Bank of America NA',      facilitySize:'$2,100.0M', ubsParticipation:'$189.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-TGPP-XIV-038', agentBB:'$121.7M', ubsBB:'$118.9M', delta:'-$2.8M', ear:'90.6%', status:'Active',  lps:1143 },
  { name:'General Catalyst Partners XII',      agentBank:'Citibank NA',             facilitySize:'$880.0M',   ubsParticipation:'$79.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-GCP-XII-039',  agentBB:'$52.6M',  ubsBB:'$51.2M',  delta:'-$1.4M', ear:'91.8%', status:'Active',  lps:538  },
  { name:'Lightspeed Venture Partners XV',     agentBank:'Wells Fargo Bank NA',     facilitySize:'$760.0M',   ubsParticipation:'$68.4M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-LSV-XV-040',   agentBB:'$45.1M',  ubsBB:'$43.8M',  delta:'-$1.3M', ear:'90.3%', status:'Pending', lps:463  },
  { name:'Accel Partners Growth VI',           agentBank:'Barclays Bank PLC',       facilitySize:'$620.0M',   ubsParticipation:'$55.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-ACCEL-VI-041', agentBB:'$37.2M',  ubsBB:'$36.1M',  delta:'-$1.1M', ear:'92.6%', status:'Active',  lps:389  },
  { name:'GV Growth Partners III',             agentBank:'Morgan Stanley Bank NA',  facilitySize:'$540.0M',   ubsParticipation:'$48.6M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-GVGP-III-042', agentBB:'$32.4M',  ubsBB:'$31.5M',  delta:'-$0.9M', ear:'91.7%', status:'Active',  lps:327  },
  { name:'Index Ventures Growth V',            agentBank:'Deutsche Bank AG',        facilitySize:'$480.0M',   ubsParticipation:'$43.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-IDXV-V-043',   agentBB:'$29.1M',  ubsBB:'$28.3M',  delta:'-$0.8M', ear:'91.2%', status:'Review',  lps:298  },
  { name:'Battery Ventures XIII',              agentBank:'Goldman Sachs Bank USA',  facilitySize:'$700.0M',   ubsParticipation:'$63.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-BATV-XIII-044',agentBB:'$42.3M',  ubsBB:'$41.1M',  delta:'-$1.2M', ear:'90.8%', status:'Active',  lps:441  },
  { name:'NEA 18 Fund',                        agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$580.0M',   ubsParticipation:'$52.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-NEA-18-045',   agentBB:'$34.9M',  ubsBB:'$33.9M',  delta:'-$1.0M', ear:'91.5%', status:'Active',  lps:362  },
  // ── Tier 7 · Real estate private equity ───────────────────────────────
  { name:'Blackstone Real Estate Partners XI', agentBank:'Bank of America NA',      facilitySize:'$4,200.0M', ubsParticipation:'$504.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-BREP-XI-046',  agentBB:'$271.8M', ubsBB:'$266.1M', delta:'-$5.7M', ear:'88.4%', status:'Active',  lps:2089 },
  { name:'Brookfield Real Estate V',           agentBank:'Citibank NA',             facilitySize:'$3,100.0M', ubsParticipation:'$310.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-BRE-V-047',    agentBB:'$198.4M', ubsBB:'$193.9M', delta:'-$4.5M', ear:'89.1%', status:'Active',  lps:1687 },
  { name:'KKR Real Estate Partners III',       agentBank:'Wells Fargo Bank NA',     facilitySize:'$2,400.0M', ubsParticipation:'$240.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-KKREP-III-048',agentBB:'$154.3M', ubsBB:'$150.8M', delta:'-$3.5M', ear:'88.7%', status:'Active',  lps:1298 },
  { name:'Starwood Opportunity Fund XII',      agentBank:'Barclays Bank PLC',       facilitySize:'$1,750.0M', ubsParticipation:'$157.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-STAR-XII-049', agentBB:'$109.6M', ubsBB:'$107.1M', delta:'-$2.5M', ear:'87.9%', status:'Review',  lps:942  },
  { name:'Lone Star Real Estate Fund VI',      agentBank:'Morgan Stanley Bank NA',  facilitySize:'$1,300.0M', ubsParticipation:'$117.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-LSRE-VI-050',  agentBB:'$81.2M',  ubsBB:'$79.1M',  delta:'-$2.1M', ear:'88.6%', status:'Active',  lps:756  },
  { name:'Harrison Street Core Property VII',  agentBank:'Deutsche Bank AG',        facilitySize:'$1,100.0M', ubsParticipation:'$99.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-HSCP-VII-051', agentBB:'$67.8M',  ubsBB:'$66.1M',  delta:'-$1.7M', ear:'89.3%', status:'Active',  lps:632  },
  { name:'Nuveen Real Estate Partners IV',     agentBank:'Goldman Sachs Bank USA',  facilitySize:'$980.0M',   ubsParticipation:'$88.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-NURE-IV-052',  agentBB:'$61.4M',  ubsBB:'$59.8M',  delta:'-$1.6M', ear:'89.7%', status:'Active',  lps:564  },
  { name:'Angelo Gordon Realty Fund III',      agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$820.0M',   ubsParticipation:'$73.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-AGRF-III-053', agentBB:'$51.3M',  ubsBB:'$49.8M',  delta:'-$1.5M', ear:'88.1%', status:'Pending', lps:487  },
  { name:'Fortress Real Estate Opps V',        agentBank:'Bank of America NA',      facilitySize:'$1,450.0M', ubsParticipation:'$130.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-FREO-V-054',   agentBB:'$89.7M',  ubsBB:'$87.4M',  delta:'-$2.3M', ear:'88.9%', status:'Active',  lps:812  },
  { name:'Cerberus Institutional RE Partners', agentBank:'Citibank NA',             facilitySize:'$1,600.0M', ubsParticipation:'$144.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-CIREP-055',    agentBB:'$98.2M',  ubsBB:'$95.7M',  delta:'-$2.5M', ear:'87.6%', status:'Active',  lps:876  },
  // ── Tier 8 · Secondary funds ───────────────────────────────────────────
  { name:'Lexington Capital Partners XI',      agentBank:'Wells Fargo Bank NA',     facilitySize:'$3,800.0M', ubsParticipation:'$456.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-LCP-XI-056',   agentBB:'$243.7M', ubsBB:'$238.4M', delta:'-$5.3M', ear:'91.2%', status:'Active',  lps:1943 },
  { name:'HarbourVest Dover Street X',         agentBank:'Barclays Bank PLC',       facilitySize:'$2,900.0M', ubsParticipation:'$290.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-HVDS-X-057',   agentBB:'$186.2M', ubsBB:'$182.1M', delta:'-$4.1M', ear:'91.8%', status:'Active',  lps:1578 },
  { name:'Partners Group Secondary VI',        agentBank:'Morgan Stanley Bank NA',  facilitySize:'$2,600.0M', ubsParticipation:'$260.0M', ubsParticipationRate:'10.0%', creditAgreementRef:'CA-2023-PGS-VI-058',   agentBB:'$168.4M', ubsBB:'$164.7M', delta:'-$3.7M', ear:'92.0%', status:'Active',  lps:1412 },
  { name:'Coller International Partners IX',   agentBank:'Deutsche Bank AG',        facilitySize:'$2,200.0M', ubsParticipation:'$198.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-CIP-IX-059',   agentBB:'$141.3M', ubsBB:'$138.2M', delta:'-$3.1M', ear:'91.5%', status:'Active',  lps:1198 },
  { name:'AlpInvest Secondary Fund VIII',      agentBank:'Goldman Sachs Bank USA',  facilitySize:'$1,950.0M', ubsParticipation:'$175.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ALPS-VIII-060',agentBB:'$124.6M', ubsBB:'$121.8M', delta:'-$2.8M', ear:'91.9%', status:'Active',  lps:1067 },
  { name:'Ardian Secondary Fund X',            agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$3,400.0M', ubsParticipation:'$408.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-ARDS-X-061',   agentBB:'$218.6M', ubsBB:'$213.9M', delta:'-$4.7M', ear:'91.3%', status:'Pending', lps:1754 },
  { name:'ICG Strategic Secondaries IV',       agentBank:'Bank of America NA',      facilitySize:'$1,650.0M', ubsParticipation:'$148.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ICGSS-IV-062', agentBB:'$104.9M', ubsBB:'$102.4M', delta:'-$2.5M', ear:'91.7%', status:'Active',  lps:892  },
  { name:'Neuberger Berman Secondary Opps V',  agentBank:'Citibank NA',             facilitySize:'$1,400.0M', ubsParticipation:'$126.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-NBSO-V-063',   agentBB:'$88.7M',  ubsBB:'$86.5M',  delta:'-$2.2M', ear:'91.4%', status:'Active',  lps:762  },
  { name:'Goldman Sachs Vintage Fund IX',      agentBank:'Goldman Sachs Bank USA',  facilitySize:'$2,050.0M', ubsParticipation:'$246.0M', ubsParticipationRate:'12.0%', creditAgreementRef:'CA-2024-GSVF-IX-064',  agentBB:'$131.4M', ubsBB:'$128.6M', delta:'-$2.8M', ear:'92.2%', status:'Active',  lps:1124 },
  { name:'Adams Street Secondary Fund VII',    agentBank:'Wells Fargo Bank NA',     facilitySize:'$1,200.0M', ubsParticipation:'$108.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ASSF-VII-065', agentBB:'$76.3M',  ubsBB:'$74.4M',  delta:'-$1.9M', ear:'91.6%', status:'Active',  lps:654  },
  // ── Tier 9 · Distressed & special situations ───────────────────────────
  { name:'Oaktree Opportunities Fund XII',     agentBank:'Barclays Bank PLC',       facilitySize:'$2,800.0M', ubsParticipation:'$252.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-OAK-XII-066',  agentBB:'$176.4M', ubsBB:'$172.1M', delta:'-$4.3M', ear:'87.2%', status:'Active',  lps:1432 },
  { name:'KKR Special Situations Fund III',    agentBank:'Morgan Stanley Bank NA',  facilitySize:'$1,900.0M', ubsParticipation:'$171.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-KKKSS-III-067',agentBB:'$118.6M', ubsBB:'$115.4M', delta:'-$3.2M', ear:'86.8%', status:'Active',  lps:978  },
  { name:'Apollo Credit Opportunity Fund IV',  agentBank:'Deutsche Bank AG',        facilitySize:'$1,650.0M', ubsParticipation:'$148.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ACOF-IV-068',  agentBB:'$102.3M', ubsBB:'$99.4M',  delta:'-$2.9M', ear:'86.4%', status:'Review',  lps:843  },
  { name:'Fortress Investment Fund VIII',      agentBank:'Goldman Sachs Bank USA',  facilitySize:'$1,350.0M', ubsParticipation:'$121.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-FORF-VIII-069',agentBB:'$84.7M',  ubsBB:'$82.3M',  delta:'-$2.4M', ear:'87.1%', status:'Active',  lps:712  },
  { name:'Avenue Capital Partners VII',        agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$920.0M',   ubsParticipation:'$82.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-AVE-VII-070',  agentBB:'$57.6M',  ubsBB:'$56.0M',  delta:'-$1.6M', ear:'87.8%', status:'Active',  lps:498  },
  { name:'Marathon Special Opportunity IV',    agentBank:'Bank of America NA',      facilitySize:'$780.0M',   ubsParticipation:'$70.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-MASO-IV-071',  agentBB:'$48.4M',  ubsBB:'$47.1M',  delta:'-$1.3M', ear:'88.0%', status:'Active',  lps:423  },
  { name:'Anchorage Capital Partners VIII',    agentBank:'Citibank NA',             facilitySize:'$1,100.0M', ubsParticipation:'$99.0M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ACP-VIII-072', agentBB:'$68.9M',  ubsBB:'$67.0M',  delta:'-$1.9M', ear:'86.7%', status:'Pending', lps:587  },
  { name:'Baupost Group Opportunity Fund VI',  agentBank:'Wells Fargo Bank NA',     facilitySize:'$1,450.0M', ubsParticipation:'$130.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-BAUF-VI-073',  agentBB:'$89.4M',  ubsBB:'$87.0M',  delta:'-$2.4M', ear:'87.5%', status:'Active',  lps:754  },
  { name:'Centerbridge Credit Partners V',     agentBank:'Barclays Bank PLC',       facilitySize:'$1,280.0M', ubsParticipation:'$115.2M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-CBCP-V-074',   agentBB:'$79.6M',  ubsBB:'$77.4M',  delta:'-$2.2M', ear:'87.3%', status:'Active',  lps:683  },
  { name:'Cerberus Institutional Partners VI', agentBank:'Morgan Stanley Bank NA',  facilitySize:'$2,100.0M', ubsParticipation:'$189.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-CERI-VI-075',  agentBB:'$131.2M', ubsBB:'$127.8M', delta:'-$3.4M', ear:'86.9%', status:'Review',  lps:1089 },
  // ── Tier 10 · Mid-market buyout ────────────────────────────────────────
  { name:'Veritas Capital Fund VIII',          agentBank:'Deutsche Bank AG',        facilitySize:'$1,600.0M', ubsParticipation:'$144.0M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-VERC-VIII-076',agentBB:'$98.7M',  ubsBB:'$96.2M',  delta:'-$2.5M', ear:'90.4%', status:'Active',  lps:832  },
  { name:'American Securities Partners X',     agentBank:'Goldman Sachs Bank USA',  facilitySize:'$1,850.0M', ubsParticipation:'$166.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-AMSP-X-077',   agentBB:'$114.8M', ubsBB:'$112.1M', delta:'-$2.7M', ear:'89.8%', status:'Active',  lps:963  },
  { name:'Harvest Partners VIII',              agentBank:'JPMorgan Chase Bank NA',  facilitySize:'$980.0M',   ubsParticipation:'$88.2M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-HARV-VIII-078',agentBB:'$61.3M',  ubsBB:'$59.7M',  delta:'-$1.6M', ear:'90.1%', status:'Active',  lps:537  },
  { name:'Jordan Industries Partners IV',      agentBank:'Bank of America NA',      facilitySize:'$720.0M',   ubsParticipation:'$64.8M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2022-JORD-IV-079',  agentBB:'$44.7M',  ubsBB:'$43.5M',  delta:'-$1.2M', ear:'90.6%', status:'Pending', lps:398  },
  { name:'Roark Capital Group Partners VI',    agentBank:'Citibank NA',             facilitySize:'$1,150.0M', ubsParticipation:'$103.5M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-ROAR-VI-080',  agentBB:'$71.8M',  ubsBB:'$69.9M',  delta:'-$1.9M', ear:'90.3%', status:'Active',  lps:621  },
  { name:'GTCR Fund XIV',                      agentBank:'Wells Fargo Bank NA',     facilitySize:'$1,380.0M', ubsParticipation:'$124.2M', ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2024-GTCR-XIV-081', agentBB:'$86.4M',  ubsBB:'$84.2M',  delta:'-$2.2M', ear:'90.7%', status:'Active',  lps:742  },
  { name:'Genstar Capital Partners XI',        agentBank:'Barclays Bank PLC',       facilitySize:'$1,050.0M', ubsParticipation:'$94.5M',  ubsParticipationRate:'9.0%',  creditAgreementRef:'CA-2023-GENS-XI-082',  agentBB:'$65.9M',  ubsBB:'$64.2M',  delta:'-$1.7M', ear:'91.0%', status:'Active',  lps:567  },
]

export const SUBMISSIONS: SubmissionRow[] = [
  // ── April 2026 BB cycle (uploaded May) — active / in-flight ──────────────
  { facility:'Apollo Natural Resources III', date:'2026-05-26', status:'Review',     action:'Resolve', step:3, file:'APONR_III_Apr2026.xlsx',    agentBank:'Citibank NA',             notes:'Citibank updated template format this cycle.' },
  { facility:'Ares Capital IX',              date:'2026-05-26', status:'Review',     action:'Resolve', step:4, file:'ARES_IX_Apr2026.xlsx',      agentBank:'Bank of America NA',      notes:'LP name updates following fund restructuring.' },
  { facility:'Advent Global IX',             date:'2026-05-26', status:'Processing', action:'Pending', step:3, file:'ADVG_IX_Apr2026.xlsx',      agentBank:'Barclays Bank PLC',       notes:'' },
  { facility:'Carlyle Partners VIII',        date:'2026-05-25', status:'Review',     action:'Resolve', step:5, file:'CARL_VIII_Apr2026.xlsx',    agentBank:'Wells Fargo Bank NA',     notes:'2 LP classification overrides require credit officer sign-off.' },
  { facility:'Blackstone CRE VII',           date:'2026-05-22', status:'Processed',  action:'View',    step:5, file:'BCRE_VII_Apr2026.xlsx',     agentBank:'JPMorgan Chase Bank NA',  notes:'' },
  // ── March 2026 BB cycle (uploaded April) — completed last month ──────────
  { facility:'KKR Americas XII',             date:'2026-04-30', status:'Processed',  action:'View',    step:5, file:'KKRAM_XII_Mar2026.xlsx',    agentBank:'Bank of America NA',      notes:'3 LP classification discrepancies detected.' },
  { facility:'Carlyle Partners VIII',        date:'2026-04-28', status:'Processed',  action:'View',    step:5, file:'CARL_VIII_Mar2026.xlsx',    agentBank:'Wells Fargo Bank NA',     notes:'' },
  { facility:'Apollo Global Fund XI',        date:'2026-04-24', status:'Processed',  action:'View',    step:5, file:'APO_XI_Mar2026.xlsx',       agentBank:'Citibank NA',             notes:'' },
  { facility:'Vista Equity VII',             date:'2026-04-22', status:'Processed',  action:'View',    step:5, file:'VISTA_VII_Mar2026.xlsx',    agentBank:'JPMorgan Chase Bank NA',  notes:'' },
  { facility:'TPG Rise Climate',             date:'2026-04-16', status:'Processed',  action:'View',    step:5, file:'TPGRC_Mar2026.xlsx',        agentBank:'Wells Fargo Bank NA',     notes:'Submitted early per agent request.' },
  { facility:'Blue Owl GP Stakes V',         date:'2026-04-02', status:'Processed',  action:'View',    step:5, file:'BOGS_V_Mar2026.xlsx',       agentBank:'Goldman Sachs Bank USA',  notes:'' },
]

export const ACTIVITY: ActivityRow[] = [
  { ts:'2026-05-26T16:30:00', event:'Agent BB Uploaded',    detail:'Apollo Natural Resources III · April 2026 · Citibank template change flagged',            user:'M. Chen',   color:'#2E75B6' },
  { ts:'2026-05-26T14:15:00', event:'Agent BB Uploaded',    detail:'Ares Capital IX · April 2026 · LP name updates detected · 248 require review',            user:'L. Torres', color:'#2E75B6' },
  { ts:'2026-05-25T11:30:00', event:'Agent BB Uploaded',    detail:'Carlyle Partners VIII · April 2026 · 1,208 LP records · 2 classification overrides flagged', user:'M. Chen', color:'#2E75B6' },
  { ts:'2026-05-23T10:44:00', event:'Shadow BB Calculated', detail:'KKR North America Fund XIV · 1,492 included LPs · UBS BB $183.9M',                        user:'L. Torres', color:'#007A38' },
  { ts:'2026-05-22T09:15:00', event:'Certificate Exported', detail:'Blackstone CRE VII · April 2026 · PDF + XLSX',                                             user:'M. Chen',   color:'#007A38' },
]

export const AUDIT_LOG: AuditLogRow[] = [
  { ts:'2026-05-26T16:30:00', event:'Upload',          facility:'Apollo Natural Resources III', detail:'April 2026 · template format change detected · extraction flagged',        user:'M. Chen',   ip:'10.0.1.67'   },
  { ts:'2026-05-26T14:15:00', event:'Upload',          facility:'Ares Capital IX',              detail:'April 2026 · 843 LP records · LP name updates flagged for review',         user:'L. Torres', ip:'10.0.1.33'   },
  { ts:'2026-05-25T11:30:00', event:'Upload',          facility:'Carlyle Partners VIII',        detail:'April 2026 · 1,208 LP records · 2 classification overrides flagged',       user:'M. Chen',   ip:'10.0.1.67'   },
  { ts:'2026-05-23T10:44:00', event:'BB Recalculated', facility:'KKR North America Fund XIV',   detail:'1,492 included · UBS BB $183.9M · EAR 91.8%',                             user:'L. Torres', ip:'10.0.1.33'   },
  { ts:'2026-05-22T09:15:00', event:'Export',          facility:'Blackstone CRE VII',           detail:'April 2026 · PDF + XLSX · DRAFT watermark',                               user:'M. Chen',   ip:'10.0.1.67'   },
  { ts:'2026-05-20T16:03:00', event:'Config Change',   facility:'All Facilities',               detail:'BUSA Rated rate: 90% (unchanged) · threshold rule update',                 user:'J. Smith',  ip:'10.0.1.44'   },
  { ts:'2026-05-20T11:44:00', event:'BB Recalculated', facility:'KKR Americas XII',             detail:'1,641 included · UBS BB $207.8M · EAR 91.1%',                             user:'M. Chen',   ip:'10.0.1.67'   },
  { ts:'2026-05-19T08:30:00', event:'Login',           facility:'—',                            detail:'User login via SSO',                                                       user:'M. Chen',   ip:'192.168.4.2' },
  { ts:'2026-05-19T08:28:00', event:'Login',           facility:'—',                            detail:'User login via SSO',                                                       user:'J. Smith',  ip:'10.0.1.44'   },
  { ts:'2026-05-18T14:55:00', event:'LP Reclassified', facility:'Apollo Global Fund XI',        detail:'Sequoia Heritage Fund · Unrated >2bn → Rated · S&P BBB assigned',         user:'M. Chen',   ip:'10.0.1.67'   },
]

// ── Prototype overlay data ────────────────────────────────────────────────────
// Used only by facilityService._localGetFacilities() to simulate a realistic
// in-flight cycle when screenMode === 'prototype'. Not referenced in live mode.

function businessDaysBefore(count: number, anchorIso: string): Date[] {
  const dates: Date[] = []
  const d = new Date(anchorIso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  while (dates.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(new Date(d))
    d.setDate(d.getDate() - 1)
  }
  return dates
}

export const PROTOTYPE_CYCLE_BDAYS = businessDaysBefore(17, '2026-05-24')
export const PROTOTYPE_OWNERS = ['J. Smith', 'M. Chen', 'L. Torres']

export const PROTOTYPE_STATUS_OVERRIDES: Record<string, string> = {
  'Apollo Natural Resources III': 'Needs Review',
  'Ares Capital IX':              'Needs Review',
  'Carlyle Partners VIII':        'Needs Review',
  'Advent Global IX':             'In Progress',
}

export const PROTOTYPE_SUBMITTED_BY_OVERRIDES: Record<string, string> = {
  'Blue Owl GP Stakes V': 'J. Smith',
  'Advent Global IX':     'L. Torres',
}

export const PROTOTYPE_PINNED_RUN_DATES: Record<string, Date> = {
  'Apollo Natural Resources III': new Date('2026-05-26T00:00:00'),
  'Ares Capital IX':              new Date('2026-05-26T00:00:00'),
  'Blackstone CRE VII':           new Date('2026-05-22T00:00:00'),
  'Carlyle Partners VIII':        new Date('2026-05-25T00:00:00'),
}
