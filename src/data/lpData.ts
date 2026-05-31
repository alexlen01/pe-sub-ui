// LP Master — Blue Owl GP Stakes V (900 LPs)
// First 12: hand-crafted reference records. Remaining 888: deterministically generated.

import type { LP } from '../types/lp'
import { FACILITIES } from './facilityData'

// Deterministic 8-char ID keyed on LP name (no shared RNG dependency)
function genId(name: string): string {
  const C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193)
  h = h >>> 0
  let id = '', s = h
  for (let i = 0; i < 8; i++) { id += C[s % 36]; s = Math.imul(s ^ 0x9E3779B9, 1664525) >>> 0 }
  return id
}

const BASE_LPS: LP[] = [
  {
    rank:1, name:'Monarch Alternative Capital LP', parent:'Monarch Alternative Capital Mgmt',
    lei:'M4CA7R2X',
    spv:false, hq:true,
    type:'Institutional', cls:'Rated', clsTag:'tag-rated', ig:false,
    region:'North America',
    sp:'BB+', mdy:'Ba1', fitch:'BB+',
    aum:'$4.2B', nav:'$3.1B', pension:'', pensionFunded:'',
    capCommit:'$250.0M', pctCapCommit:'0.70%', calledCap:'$162.5M',
    uc:'$28.4M', pctUncalled:'11.4%', pctCalled:'65.0%',
    agentConc:'10.0%', ubsConc:'7.5%', rate:'90%', agentRate:'95%', abb:'$26.0M', ubb:'$22.5M', uec:'$25.0M', delta:'–$3.5M',
    inc:true, rcl:true, tf:false, notes:'',
  },
  {
    rank:2, name:'GIC Special Investments Pte. Ltd.', parent:'GIC Private Limited',
    lei:'G9B1K5PS',
    spv:false, hq:false,
    type:'Institutional', cls:'Rated', clsTag:'tag-rated', ig:true,
    region:'Asia-Pacific',
    sp:'AAA', mdy:'Aaa', fitch:'AAA',
    aum:'$744B', nav:'', pension:'', pensionFunded:'',
    capCommit:'$400.0M', pctCapCommit:'1.12%', calledCap:'$240.0M',
    uc:'$26.1M', pctUncalled:'6.5%', pctCalled:'60.0%',
    agentConc:'10.0%', ubsConc:'7.5%', rate:'90%', agentRate:'95%', abb:'$24.8M', ubb:'$22.5M', uec:'$25.0M', delta:'–$2.3M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:3, name:'Sequoia Heritage Fund', parent:'Sequoia Capital',
    lei:'S8HFND3Q',
    spv:true, hq:true,
    type:'HNW', cls:'Unrated >2bn', clsTag:'tag-un2', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$3.8B', nav:'$3.8B', pension:'', pensionFunded:'',
    capCommit:'$150.0M', pctCapCommit:'0.42%', calledCap:'$97.5M',
    uc:'$24.7M', pctUncalled:'16.5%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'75%', agentRate:'75%', abb:'$19.8M', ubb:'$18.5M', uec:'$24.7M', delta:'–$1.3M',
    inc:true, rcl:false, tf:false, notes:'SPV commits on behalf of Sequoia Capital partners.',
  },
  {
    rank:4, name:'Norges Bank Investment Mgmt', parent:'Norges Bank',
    lei:'N7BI6M2W',
    spv:false, hq:false,
    type:'Institutional', cls:'Rated', clsTag:'tag-rated', ig:true,
    region:'Europe',
    sp:'AAA', mdy:'Aaa', fitch:'AAA',
    aum:'$1.4T', nav:'', pension:'$1.4T', pensionFunded:'118%',
    capCommit:'$500.0M', pctCapCommit:'1.40%', calledCap:'$325.0M',
    uc:'$22.3M', pctUncalled:'4.5%', pctCalled:'65.0%',
    agentConc:'10.0%', ubsConc:'7.5%', rate:'90%', agentRate:'95%', abb:'$21.2M', ubb:'$20.1M', uec:'$22.3M', delta:'–$1.1M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:5, name:'Abu Dhabi Investment Authority', parent:'ADIA',
    lei:'A5DIA9PK',
    spv:false, hq:false,
    type:'Institutional', cls:'Rated', clsTag:'tag-rated', ig:true,
    region:'Middle East',
    sp:'AA', mdy:'Aa2', fitch:'AA',
    aum:'$829B', nav:'', pension:'', pensionFunded:'',
    capCommit:'$600.0M', pctCapCommit:'1.68%', calledCap:'$360.0M',
    uc:'$21.8M', pctUncalled:'3.6%', pctCalled:'60.0%',
    agentConc:'10.0%', ubsConc:'7.5%', rate:'90%', agentRate:'95%', abb:'$20.7M', ubb:'$19.6M', uec:'$21.8M', delta:'–$1.1M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:6, name:'Mubadala Investment Company', parent:'Mubadala',
    lei:'MBD3IC7Y',
    spv:false, hq:false,
    type:'Institutional', cls:'Unrated >2bn', clsTag:'tag-un2', ig:false,
    region:'Middle East',
    sp:'', mdy:'', fitch:'',
    aum:'$276B', nav:'', pension:'', pensionFunded:'',
    capCommit:'$350.0M', pctCapCommit:'0.98%', calledCap:'$227.5M',
    uc:'$19.2M', pctUncalled:'5.5%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'75%', agentRate:'75%', abb:'$15.4M', ubb:'$14.4M', uec:'$19.2M', delta:'–$1.0M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:7, name:'Tiger Global Management LLC', parent:'Tiger Global',
    lei:'T4GL6M9R',
    spv:false, hq:true,
    type:'Institutional', cls:'Unrated 1–2bn', clsTag:'tag-un1', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$1.1B', nav:'$1.1B', pension:'', pensionFunded:'',
    capCommit:'$200.0M', pctCapCommit:'0.56%', calledCap:'$130.0M',
    uc:'$17.4M', pctUncalled:'8.7%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'65%', agentRate:'75%', abb:'$13.1M', ubb:'$11.3M', uec:'$17.4M', delta:'–$1.8M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:8, name:'Rockefeller Family Office', parent:'Rockefeller & Co.',
    lei:'RCFO5X2B',
    spv:true, hq:true,
    type:'HNW', cls:'Eligible', clsTag:'tag-elig', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$620M', nav:'$620M', pension:'', pensionFunded:'',
    capCommit:'$100.0M', pctCapCommit:'0.28%', calledCap:'$65.0M',
    uc:'$15.9M', pctUncalled:'15.9%', pctCalled:'65.0%',
    agentConc:'5.0%', ubsConc:'3.5%', rate:'50%', agentRate:'', abb:'$0', ubb:'$8.0M', uec:'$15.9M', delta:'',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:9, name:'Hamilton Lane Fund II LP', parent:'Hamilton Lane',
    lei:'H8LF2N1Q',
    spv:true, hq:true,
    type:'Institutional', cls:'Unrated >2bn', clsTag:'tag-un2', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$2.4B', nav:'$2.4B', pension:'', pensionFunded:'',
    capCommit:'$300.0M', pctCapCommit:'0.84%', calledCap:'$195.0M',
    uc:'$14.1M', pctUncalled:'4.7%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'75%', agentRate:'75%', abb:'$11.3M', ubb:'$10.6M', uec:'$14.1M', delta:'–$0.7M',
    inc:true, rcl:false, tf:true, notes:'Transferee LP — original commitment held by Hamilton Lane Fund I.',
  },
  {
    rank:10, name:'Makena Capital Management', parent:'Makena Capital',
    lei:'MK3CM7WP',
    spv:false, hq:true,
    type:'HNW', cls:'Excluded', clsTag:'tag-excl', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$18B', nav:'$18B', pension:'', pensionFunded:'',
    capCommit:'$175.0M', pctCapCommit:'0.49%', calledCap:'$113.8M',
    uc:'$12.8M', pctUncalled:'7.3%', pctCalled:'65.0%',
    agentConc:'0.0%', ubsConc:'0.0%', rate:'0%', agentRate:'', abb:'$0', ubb:'$0', uec:'$0', delta:'$0',
    inc:false, rcl:false, tf:false, notes:'Excluded per credit agreement — ERISA test failure.',
  },
  {
    rank:11, name:'Pantheon Ventures (UK) LLP', parent:'Pantheon',
    lei:'PV6UK4NE',
    spv:false, hq:false,
    type:'Institutional', cls:'Unrated >2bn', clsTag:'tag-un2', ig:false,
    region:'Europe',
    sp:'', mdy:'', fitch:'',
    aum:'$58B', nav:'$58B', pension:'', pensionFunded:'',
    capCommit:'$225.0M', pctCapCommit:'0.63%', calledCap:'$146.3M',
    uc:'$11.6M', pctUncalled:'5.2%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'75%', agentRate:'75%', abb:'$9.3M', ubb:'$8.7M', uec:'$11.6M', delta:'–$0.6M',
    inc:true, rcl:false, tf:false, notes:'',
  },
  {
    rank:12, name:'StepStone Group LP', parent:'StepStone',
    lei:'SS9GRP2Z',
    spv:false, hq:true,
    type:'Institutional', cls:'Unrated >2bn', clsTag:'tag-un2', ig:false,
    region:'North America',
    sp:'', mdy:'', fitch:'',
    aum:'$65B', nav:'$65B', pension:'', pensionFunded:'',
    capCommit:'$280.0M', pctCapCommit:'0.78%', calledCap:'$182.0M',
    uc:'$10.2M', pctUncalled:'3.6%', pctCalled:'65.0%',
    agentConc:'7.5%', ubsConc:'5.0%', rate:'75%', agentRate:'75%', abb:'$8.2M', ubb:'$7.7M', uec:'$10.2M', delta:'–$0.5M',
    inc:true, rcl:false, tf:false, notes:'',
  },
]

// ── Deterministic generator ───────────────────────────────────────────────────
function generateBulk(): LP[] {
  let _s = 0x1337cafe
  const rng = () => { _s = (Math.imul(1664525, _s) + 1013904223) | 0; return (_s >>> 0) / 0x100000000 }
  const pick  = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]
  const fi    = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const ff    = (lo: number, hi: number) => lo + rng() * (hi - lo)
  const f1    = (n: number) => n.toFixed(1)
  const fM    = (n: number) => `$${f1(Math.max(0, n))}M`
  const fMsgn = (n: number) => n < 0 ? `–$${f1(-n)}M` : `$${f1(n)}M`
  const fB    = (n: number) => n >= 1 ? `$${f1(n)}B` : `$${f1(n * 1000)}M`
  const fPct  = (n: number) => `${(n * 100).toFixed(1)}%`

  const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming']
  const US_STATE_TYPES = ["Teachers' Retirement System","Public Employees' Retirement System","State Retirement Board","Municipal Employees' Pension Fund"]

  const US_CITIES = ['New York City','Los Angeles','Chicago','Houston','Philadelphia','Phoenix','San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville','Fort Worth','Columbus','Indianapolis','Charlotte','San Francisco','Seattle','Denver','Nashville','El Paso','Boston','Detroit','Memphis','Portland','Louisville','Baltimore','Milwaukee','Kansas City','Tucson']
  const US_CITY_TYPES = ['City Employees Pension Fund','Municipal Retirement System','Police & Fire Pension Plan']

  const US_CORPS = ['Apple Corporation','Microsoft Corporation','Amazon Corporation','Alphabet Corporation','Meta Platforms','Tesla Corporation','Berkshire Hathaway','Johnson & Johnson','JPMorgan Chase & Co.','Bank of America','Wells Fargo & Company','Goldman Sachs Group','Morgan Stanley','Citigroup Inc.','Pfizer Inc.','UnitedHealth Group','ExxonMobil Corporation','Chevron Corporation','General Electric Company','Boeing Company','Lockheed Martin Corporation','Raytheon Technologies','General Dynamics Corporation','Northrop Grumman Corporation','Caterpillar Inc.','Deere & Company','3M Company','Honeywell International','United Technologies Corporation','Emerson Electric Co.','AT&T Inc.','Verizon Communications','Comcast Corporation','Walt Disney Company','Walmart Inc.','Target Corporation','Costco Wholesale','Home Depot Inc.','FedEx Corporation','United Parcel Service','CSX Transportation','Union Pacific Corporation','Duke Energy Corporation','Southern Company','NextEra Energy Inc.','Dominion Energy Inc.','Exelon Corporation','American Electric Power','Consolidated Edison Inc.','Pacific Gas & Electric Company','Procter & Gamble Company','Colgate-Palmolive Company','Kimberly-Clark Corporation','Clorox Company','Church & Dwight Co.','Ecolab Inc.','Air Products & Chemicals','Linde Group','Praxair Inc.','Abbott Laboratories']

  const US_ENDOWS = ['Harvard University Endowment Fund','Yale University Endowment Fund','Princeton University Endowment Fund','Massachusetts Institute of Technology Endowment','University of Pennsylvania Endowment Fund','Columbia University Endowment Fund','Cornell University Endowment Fund','Duke University Endowment Fund','Dartmouth College Endowment Fund','Northwestern University Endowment Fund','University of Chicago Endowment Fund','Stanford University Endowment Management','Johns Hopkins University Endowment Fund','University of Notre Dame Endowment Fund','Vanderbilt University Endowment Fund','Rice University Endowment Fund','Washington University in St. Louis Endowment','Emory University Endowment Fund','Georgetown University Endowment Fund','Carnegie Mellon University Endowment Fund','University of Michigan Endowment Fund','University of California Regents Endowment','University of Virginia Endowment Fund','University of North Carolina Endowment','University of Texas System Endowment','University of Illinois Foundation','Ohio State University Foundation','Pennsylvania State University Endowment','Purdue University Endowment Fund','University of Wisconsin Foundation','University of Minnesota Foundation','Boston University Endowment Fund','New York University Endowment Fund','University of Southern California Endowment','Brown University Endowment Fund','Tulane University Endowment Fund','Ford Foundation Endowment','Rockefeller Foundation Investment','W.K. Kellogg Foundation','Robert Wood Johnson Foundation','MacArthur Foundation Investment','Bloomberg Philanthropies Investment','Bill & Melinda Gates Foundation Investment','Andrew W. Mellon Foundation','Carnegie Corporation of New York','Knight Foundation Investment','Lumina Foundation','Annie E. Casey Foundation','Alfred P. Sloan Foundation','David & Lucile Packard Foundation']

  const CANADIAN = ['Canada Pension Plan Investment Board','Caisse de dépôt et placement du Québec',"Ontario Teachers' Pension Plan",'BC Investment Management Corporation','Alberta Investment Management Corporation','Public Sector Pension Investment Board','OMERS Capital Markets','Healthcare of Ontario Pension Plan Trust Fund','OPTrust','CAAT Pension Plan','BC Municipal Pension Plan','Ontario Power Generation Pension Plan','Manitoba Investment Pool Board','New Brunswick Investment Management Corporation','Nova Scotia Teachers Pension Fund','Bell Canada Pension Plan','Hydro One Pension Plan','CN Investment Division','Air Canada Pension Plan','SNC-Lavalin Pension Fund']

  const EUROPEAN = ['ATP Danish Supplementary Pension','PensionDanmark','PFA Pension A/S','Danica Pension','PKA Pension Fund','Industriens Pension','AP Pension','Sampension','Laerernes Pension','Pensam','Velliv Pension & Livrente','Akademiker Pension','AP1 First Swedish National Pension Fund','AP2 Second Swedish National Pension Fund','AP3 Third Swedish National Pension Fund','AP4 Fourth Swedish National Pension Fund','AP7 Seventh Swedish National Pension Fund','Alecta Pensionsforsakring','AMF Pensionsforsakring','SPP Livforsakring','Folksam Liv','Handelsbanken Liv','Skandia Life Insurance','Lansforsakringar Liv','Keva Finnish Pension Fund','Varma Mutual Pension Insurance','Ilmarinen Mutual Pension Insurance','Elo Mutual Pension Insurance','Veritas Pension Insurance','LocalTapiola Group Pension','OP Financial Group Pension','Mandatum Life Insurance','Fennia Life Insurance','If P&C Insurance Pension','Universities Superannuation Scheme','BT Pension Scheme','Royal Mail Pension Plan','BP Pension Fund','Shell Contributory Pension Fund','National Grid UK Pension Scheme','BAE Systems Pension Scheme','Lloyds Banking Group Pension Fund','Barclays UK Retirement Fund','HSBC Bank Pension Trust','Standard Life Assurance','Legal & General Pension Management','Prudential UK Pension Investment','Aviva Life & Pensions','Phoenix Group Holdings Pension','Scottish Widows Investment Partnership','Aegon UK Pension Investment','Standard Life Aberdeen Pension','USS Investment Management','NEST Corporation','ABP Dutch Pension Fund','Pensioenfonds Zorg en Welzijn','PMT Pensioenfonds Metalektro','PME Pensioenfonds','bpfBOUW Bouwpensioen','PNO Media Pension Fund','Pensioenfonds Openbaar Vervoer','Stichting Pensioenfonds Unilever','ABN AMRO Pensioenfonds','ING Pensioenfonds','Rabobank Pensioenfonds','Pensioenfonds PGB','Pensioenfonds DSM','Pensioenfonds Akzo Nobel','Pensioenfonds Horeca & Catering','Bayerische Versorgungskammer','Zusatzversorgungskasse des Bundes ZVK','Versorgungswerk der Aerzte Nordrhein','Rechtsanwaltsversorgung Bayern','SwissLife SA Insurance','Swiss Re Asset Management','Zurich Insurance Life Switzerland','Swiss Post Pension Fund','Publica Swiss Federal Pension Fund','AXA France Vie SA','CNP Assurances France','Groupama Gan Vie','Covea Assurances','AGEAS SA Belgium','Generali Vie SA France','Natixis Life France','BNP Paribas Cardif','AG2R LA MONDIALE','Caisse des Depots et Consignations','FRR Fonds de Reserve pour les Retraites','Ireland Strategic Investment Fund','Luxembourg Future Fund','EIB Staff Pension Fund','EBRD Staff Retirement Plan','Intesa Sanpaolo Pension Fund','UniCredit Group Pension Fund','Banco Santander Pension Plan','BBVA Pension Fund Spain','ING Groep Pension Netherlands','Allianz SE Pension Germany']

  const APAC = ['Japan Post Insurance Company','Nippon Life Insurance Company','Dai-ichi Life Insurance Company','Meiji Yasuda Life Insurance','Sumitomo Life Insurance Company','Tokio Marine Holdings Pension','Sompo Japan Insurance Pension','Aflac Life Insurance Japan','T&D Financial Life Insurance','Sony Life Insurance Pension','Taiyo Life Insurance Company','Fukoku Mutual Life Insurance','Asahi Mutual Life Insurance','Kyoei Mutual Life Insurance','Daido Life Insurance Company','Gibraltar Life Insurance Japan','Government Pension Investment Fund Japan','Pension Fund Association Japan','Mutual Aid Association of Public School Teachers Japan','Federation of National Public Service Mutual Aid Associations Japan','National Federation of Municipal Aid Associations Japan','National Pension Service Korea','Korea Investment Corporation','Public Officials Benefit Association Korea','Korean Teachers Pension','Korea Post Investment Division','Nonghyup Mutual Finance Korea','Military Mutual Aid Association Korea','Private School Teachers Pension Korea','Government Employees Pension Service Korea','Korail Pension Fund Korea','AustralianSuper','Australian Retirement Trust','Aware Super','Hostplus','CBUS Super Fund','HESTA Super Fund','Rest Industry Super','UniSuper','Spirit Super','First Super','Australian Catholic Superannuation','Media Super Australia','IFM Investors Australia','Future Fund Australia','Queensland Investment Corporation','Victorian Funds Management Corporation','Local Government Super NSW','State Super New South Wales','Emergency Services Super Victoria','GESB Government Employees Super WA','Temasek Holdings Investment','Central Provident Fund Singapore','Singapore Labour Foundation','Khazanah Nasional Malaysia','Employees Provident Fund Malaysia','Armed Forces Fund Board Malaysia','KWAP Retirement Fund Malaysia','Mandatory Provident Fund Authority Hong Kong','China Life Investment Holding','Ping An Asset Management','PICC Asset Management','Life Insurance Corporation India','Employees Provident Fund Organisation India','New Zealand Superannuation Fund','ACC Investment Management New Zealand','Government Pension Fund Thailand','Social Security Office Thailand','Government Service Insurance System Philippines','Social Security System Philippines','Vietnam Social Insurance Fund']

  const MIDEAST = ['Abu Dhabi Investment Council','Abu Dhabi Developmental Holding Company ADQ','Investment Corporation of Dubai','DIFC Investments LLC','Emirates Investment Authority','Dubai Electricity and Water Authority Pension','Dubai World Pension Fund','Etihad Airways Pension Fund','Kuwait Investment Authority','Kuwait Petroleum Pension Fund','Kuwait Public Institution for Social Security','National Investments Company Kuwait','Saudi Public Investment Fund','Hassana Investment Company','Saudi Aramco Pension Trust','GOSI Saudi General Organisation for Social Insurance','National Infrastructure Fund Saudi Arabia','Saudi National Bank Investment','Qatar Investment Authority','Qatar Foundation Endowment','Qatar Airways Pension Fund','Qatar National Bank Pension Fund','Qatar Petroleum Pension Fund','Bahrain Mumtalakat Holding Company','Social Insurance Organisation Bahrain','Oman Investment Authority','State General Reserve Fund Oman','Jordan Social Security Corporation','Central Bank of UAE Pension Fund','Abu Dhabi Retirement Pensions and Benefits Fund']

  const LATAM = ['Petros Petrobras Pension Fund','FUNCEF Federal Bank Pension Fund','PREVI Banco do Brasil Pension','FUNCESP Sao Paulo Energy Pension','FAPES Brazilian Pension Fund','Real Grandeza Brazilian Pension','Sistel Brazilian Pension','Centrus Brazilian Pension','Banesprev Sao Paulo Bank Pension','Telos Brazilian Pension Fund','Valia Brazilian Pension','PPSP Petrobras Brazilian Pension','Fundacao Copel Pension','Fundacao Celesc Pension','Fundacao Sanepar Pension','AFP Capital Chile','AFP Cuprum Chile','AFP Habitat Chile','AFP Modelo Chile','AFP Planvital Chile','AFP Provida Chile','AFP Uno Chile','Afore Banamex Mexico','Afore Bancomer Mexico','Afore SURA Mexico','Afore Citibanamex Mexico','Afore Principal Mexico','Afore Profuturo Mexico','Afore Invercap Mexico','Porvenir AFP Colombia','Proteccion AFP Colombia','Old Mutual Pensiones Colombia','Colfondos Colombia','Prima AFP Peru','Integra AFP Peru','Profuturo AFP Peru','AFP Horizonte Peru','AFP Union Vida Peru','AFP Genesis Peru','Aporte y Credito Argentina']

  const INSURANCE = ['Prudential Insurance Company of America','MetLife Investment Management','New York Life Investments','Northwestern Mutual Capital','Massachusetts Mutual Life Insurance','Guardian Life Insurance Investments','Nationwide Mutual Life Insurance','Pacific Life Insurance','Principal Financial Life Insurance','Lincoln National Life Insurance','Transamerica Life Insurance','TIAA Investments','USAA Investment Management','Erie Indemnity Company Investments','Unum Group Pension','Aflac Incorporated Investments','Cincinnati Financial Investments','Markel Corporation Investments','W.R. Berkley Investments','Alleghany Corporation Investments','Sun Life Investment Management','Manulife Investment Management','Great-West Life Investments','Empire Life Investments','Industrial Alliance Investments','Munich Re Investment Partners','Hannover Re Investment Management','Zurich Investment Management SE','Allianz Investment Management SE','AXA Investment Managers','Generali Insurance Asset Management','Aviva Investors','Legal & General Investment Management','Standard Life Investments','Phoenix Group Investments','Aegon Asset Management','Talanx Asset Management','Helvetia Group Investments','Baloise Group Investments','AIG Asset Management','Liberty Mutual Investments','Nationwide Financial Services Pension','Guardian Financial Services','MetLife Reinsurance Investment','Sun Life Reinsurance Management']

  const FAMILY_OFFICE = ['Walton Family Holdings Trust','Bezos Expeditions LLC','Cascade Investment LLC','Emerson Collective Investment','Soros Fund Management LLC','Icahn Capital Management','Robertson Family Investment Trust','Koch Strategic Platforms','Mars Family Investment Trust','Pritzker Group Private Capital','Lauder Investment Advisors','Ziff Brothers Investments','Steinhardt Capital Management','Klarman Family Office','Appaloosa Family Trust','Baupost Group LP','Greenlight Capital Partners','Third Point Family Office','Pershing Square Family Trust','Loews Corporation Investments','Cargill Family Investment Trust','Hearst Family Investment Trust','DeVos Family Investment Trust','Phipps Family Investment','Mellon Family Office Trust','Cabot Family Office','Pitcairn Trust Company','Glenmede Investment Management','Whittier Trust Company','Bessemer Trust Company','GenSpring Family Offices','Brown Brothers Harriman Family','Fiduciary Trust International','Threshold Group Investment','WE Family Offices','Veritable LP Family Office','Hall Capital Partners','Windward Capital Group','Angeles Equity Partners','Menlo Capital Group','Silicon Valley Capital Partners','Pacific Investment Counsel','Atlantic Capital Partners Family','Meridian Capital Group','Pinnacle Investment Group','Summit Capital Partners','Ridgecrest Family Office','Stoneleigh Capital','Wentworth Capital Group','Harborview Family Investment','Riverview Capital Partners','Lakewood Investment Partners','Cedarbrook Capital','Maple Tree Family Office','Blue Ridge Capital Partners','Highbridge Capital Family','Greenfield Capital Family Office','Clearwater Capital','Magellan Capital Partners','Falcon Investment Advisors']

  const FUND_OF_FUNDS = ['Hamilton Lane Capital Partners','StepStone Capital Partners','Pantheon Partners','Adams Street Partners','LGT Capital Partners','HarbourVest Partners','Neuberger Berman Private Equity','BlackRock Alternative Capital','Morgan Stanley Alternative Investments','Goldman Sachs Vintage Partners','Lexington Capital Partners','Partners Group Holdings','Blue Owl Capital Partners','Ares Management Partners','Brookfield Asset Management Pension','Apollo Alternative Assets','KKR Capital Management','Carlyle Investment Management','Blackstone Alternative Asset Management','TPG Capital Partners','Bain Capital Investors','Francisco Partners','Silver Lake Management','Vista Equity Partners','Advent International Partners','Warburg Pincus Partners','New Mountain Capital','Hellman & Friedman Partners','CVC Capital Partners','EQT Investment Partners']

  const HEALTHCARE = ['Mayo Clinic Investment Office','Cleveland Clinic Investment Office','Johns Hopkins Medicine Investment','Massachusetts General Hospital Investment','UCSF Medical Center Investment','Cedars-Sinai Investment Management','Northwestern Memorial Hospital Investment','Vanderbilt University Medical Center Investment','Duke University Medical Center Investment','NewYork-Presbyterian Investment Office','Brigham and Womens Hospital Investment','Houston Methodist Investment','Stanford Health Care Investment','UPMC Investment Office','Henry Ford Health System Investment','Baylor Scott & White Investment','SSM Health Investment','Mercy Health Investment','Trinity Health Investment','Advocate Aurora Investment','CommonSpirit Health Investment','Ascension Investment Management','Providence St. Joseph Investment','Sutter Health Investment','Kaiser Foundation Investment','Intermountain Health Investment','Mayo Foundation Investment','Memorial Sloan Kettering Investment']

  // Build flat name list with metadata
  const all: Array<{ name: string; region: string; hq: boolean; type: string }> = []
  US_STATES.forEach(st => US_STATE_TYPES.forEach(t  => all.push({ name: `${st} ${t}`,          region: 'North America', hq: true,  type: 'Public Pension'  })))
  US_CITIES.forEach(c  => US_CITY_TYPES.forEach(t   => all.push({ name: `${c} ${t}`,            region: 'North America', hq: true,  type: 'Public Pension'  })))
  US_CORPS.forEach(c                                  => all.push({ name: `${c} Pension Plan`,   region: 'North America', hq: true,  type: 'Corporate'       }))
  US_ENDOWS.forEach(n                                 => all.push({ name: n,                     region: 'North America', hq: true,  type: 'Endowment'       }))
  CANADIAN.forEach(n                                  => all.push({ name: n,                     region: 'North America', hq: false, type: 'Public Pension'  }))
  EUROPEAN.forEach(n                                  => all.push({ name: n,                     region: 'Europe',        hq: false, type: 'Institutional'   }))
  APAC.forEach(n                                      => all.push({ name: n,                     region: 'Asia-Pacific',  hq: false, type: 'Institutional'   }))
  MIDEAST.forEach(n                                   => all.push({ name: n,                     region: 'Middle East',   hq: false, type: 'Institutional'   }))
  LATAM.forEach(n                                     => all.push({ name: n,                     region: 'Latin America', hq: false, type: 'Institutional'   }))
  INSURANCE.forEach(n                                 => all.push({ name: n,                     region: 'North America', hq: true,  type: 'Insurance'       }))
  FAMILY_OFFICE.forEach(n                             => all.push({ name: n,                     region: 'North America', hq: true,  type: 'HNW'             }))
  FUND_OF_FUNDS.forEach(n                             => all.push({ name: n,                     region: 'North America', hq: true,  type: 'Institutional'   }))
  HEALTHCARE.forEach(n                                => all.push({ name: n,                     region: 'North America', hq: true,  type: 'Institutional'   }))

  // Assign classifications in target ratio (199+177+124+151+237 = 888)
  const clsList: string[] = [
    ...Array(199).fill('Rated'),
    ...Array(177).fill('Unrated >2bn'),
    ...Array(124).fill('Unrated 1–2bn'),
    ...Array(151).fill('Eligible'),
    ...Array(237).fill('Excluded'),
  ]
  // Fisher-Yates shuffle with seeded RNG
  for (let i = clsList.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [clsList[i], clsList[j]] = [clsList[j], clsList[i]]
  }

  const RATED_SP = ['BB+','BB','BB-','B+','BBB','BBB-','BBB+','A-','A','AA-','AA','AAA']
  const SP_MDY: Record<string, string>   = { 'AAA':'Aaa','AA':'Aa2','AA-':'Aa3','A':'A2','A-':'A3','BBB+':'Baa1','BBB':'Baa2','BBB-':'Baa3','BB+':'Ba1','BB':'Ba2','BB-':'Ba3','B+':'B1' }
  const IG_SET   = new Set(['AAA','AA','AA-','AA+','A','A-','A+','BBB','BBB-','BBB+'])
  const CLS_TAG: Record<string, string>  = { 'Rated':'tag-rated','Unrated >2bn':'tag-un2','Unrated 1–2bn':'tag-un1','Eligible':'tag-elig','Excluded':'tag-excl' }
  const CLS_RATE: Record<string, string> = { 'Rated':'90%','Unrated >2bn':'75%','Unrated 1–2bn':'65%','Eligible':'50%','Excluded':'0%' }
  const CLS_ARATE: Record<string, string>= { 'Rated':'95%','Unrated >2bn':'75%','Unrated 1–2bn':'75%','Eligible':'','Excluded':'' }
  const CLS_BUSA: Record<string, number> = { 'Rated':0.90,'Unrated >2bn':0.75,'Unrated 1–2bn':0.65,'Eligible':0.50,'Excluded':0.00 }
  const CLS_ABUSA: Record<string, number>= { 'Rated':0.95,'Unrated >2bn':0.75,'Unrated 1–2bn':0.75,'Eligible':0,'Excluded':0 }
  const TOTAL_FAC = 35600  // $35.6B total facility committed (denominator for pctCapCommit)

  return all.slice(0, 888).map((info, i) => {
    const cls = clsList[i]
    const rank = 13 + i
    const inc  = cls !== 'Excluded'

    let sp = '', mdy = '', fitch = '', ig = false
    if (cls === 'Rated') {
      sp    = pick(RATED_SP)
      mdy   = SP_MDY[sp] ?? ''
      fitch = sp
      ig    = IG_SET.has(sp)
    }

    let aumB: number
    if      (cls === 'Rated')          aumB = ff(0.5, 150)
    else if (cls === 'Unrated >2bn')   aumB = ff(2.0, 80)
    else if (cls === 'Unrated 1–2bn') aumB = ff(1.0, 2.0)
    else if (cls === 'Eligible')       aumB = ff(0.1, 1.0)
    else                               aumB = ff(0.05, 0.5)

    const isPension = info.type === 'Public Pension' || info.type === 'Insurance'
    const aum           = fB(aumB)
    const nav           = isPension ? '' : fB(aumB * ff(0.5, 1.0))
    const pension       = isPension ? fB(aumB) : ''
    const pensionFunded = isPension ? `${fi(65, 120)}%` : ''

    const maxCommit  = Math.max(10, Math.min(600, Math.round(aumB * 1000 * 0.04)))
    const commitM    = fi(10, maxCommit)
    const callRate   = ff(0.55, 0.75)
    const calledM    = commitM * callRate
    const ucM        = Math.max(1, commitM * (1 - callRate) * ff(0.6, 1.0))

    const uecM  = inc ? Math.min(ucM, 25) : 0
    const busaR = CLS_BUSA[cls]
    const abuR  = CLS_ABUSA[cls]
    const ubbM  = uecM * busaR
    const abbM  = uecM * abuR

    const agentConc = cls === 'Rated' ? '10.0%' : cls === 'Excluded' ? '0.0%' : '7.5%'
    const ubsConc   = cls === 'Rated' ? '7.5%'  : cls === 'Excluded' ? '0.0%' : '5.0%'
    const rcl = rng() < 0.03
    const tf  = rng() < 0.03
    const spv = info.type === 'HNW' ? rng() < 0.35 : rng() < 0.08

    return {
      rank, name: info.name, parent: info.name, lei: genId(info.name),
      spv, hq: info.hq, type: info.type, cls, clsTag: CLS_TAG[cls], ig,
      region: info.region,
      sp, mdy, fitch,
      aum, nav, pension, pensionFunded,
      capCommit: fM(commitM), pctCapCommit: fPct(commitM / TOTAL_FAC),
      calledCap: fM(calledM), uc: fM(ucM),
      pctUncalled: fPct(ucM / commitM), pctCalled: fPct(callRate),
      agentConc, ubsConc,
      rate: CLS_RATE[cls], agentRate: CLS_ARATE[cls],
      abb: abbM > 0 ? fM(abbM) : '$0',
      ubb: fM(ubbM), uec: inc ? fM(uecM) : '$0',
      delta: abbM > 0 ? fMsgn(ubbM - abbM) : '$0',
      inc, rcl, tf, notes: '',
    } as LP
  })
}

export const LP_DATA: LP[] = [...BASE_LPS, ...generateBulk()]

// ── Dashboard donut data ──────────────────────────────────────────────────────

export interface DonutSegment {
  label: string
  n:     number
  pct:   string
  color: string
}

export interface DonutEntry {
  total:              number
  pendingReviews:     number
  pendingReviewsSub:  string
  lastBBRun:          Date
  lastBBSub:          string
  segments:           DonutSegment[]
}

function hash(str: string): number {
  return Math.abs([...str].reduce((a, c) => (Math.imul(31, a) + c.charCodeAt(0)) | 0, 0))
}

function facilityDonut(f: { name: string; lps: number; status: string }): DonutEntry {
  const h = hash(f.name)
  const total = f.lps
  const r0 = 0.18 + (h % 13) / 100
  const r1 = 0.15 + ((h >> 3) % 11) / 100
  const r2 = 0.11 + ((h >> 6) % 9)  / 100
  const r3 = 0.12 + ((h >> 9) % 10) / 100
  const n0 = Math.round(total * r0), n1 = Math.round(total * r1),
        n2 = Math.round(total * r2), n3 = Math.round(total * r3),
        n4 = total - n0 - n1 - n2 - n3
  const pct = (n: number) => (n / total * 100).toFixed(1) + '%'
  const pendingReviews = f.status === 'Review' ? 15 + (h % 31) : f.status === 'Pending' ? 5 + (h % 21) : 0
  const _now  = new Date()
  const _hAgo = (hrs: number) => new Date(_now.getTime() - hrs * 3_600_000)
  const TIMES = [_hAgo(2),_hAgo(4),_hAgo(6),_hAgo(24),_hAgo(48),_hAgo(72),_hAgo(120)]
  const SUBS  = ['2026-05','2026-04','2026-03','2026-02']
  return {
    total, pendingReviews,
    pendingReviewsSub: 'unmatched / flagged',
    lastBBRun: TIMES[h % TIMES.length],
    lastBBSub: SUBS[h % SUBS.length],
    segments: [
      { label: 'Rated (90%)',          n: n0, pct: pct(n0), color: '#4F4F4F' },
      { label: 'Unrated >$2bn (75%)',  n: n1, pct: pct(n1), color: '#E60000' },
      { label: 'Unrated $1–2bn (65%)', n: n2, pct: pct(n2), color: '#767676' },
      { label: 'Eligible <$1bn (50%)', n: n3, pct: pct(n3), color: '#007A38' },
      { label: 'Excluded (0%)',        n: n4, pct: pct(n4), color: '#C8C8C8' },
    ],
  }
}

const generated: Record<string, DonutEntry> = Object.fromEntries(
  [...FACILITIES].sort((a, b) => a.name.localeCompare(b.name)).map(f => [f.name, facilityDonut(f)])
)

export const DONUT_DATA: Record<string, DonutEntry> = {
  ...generated,
  'Blue Owl GP Stakes V': {
    ...generated['Blue Owl GP Stakes V'],
    total: 900,
    pendingReviews: 0, lastBBRun: new Date('2026-05-27T09:15:00'), lastBBSub: '2026-04',
    segments: [
      { label: 'Rated (90%)',          n: 203, pct: '22.6%', color: '#4F4F4F' },
      { label: 'Unrated >$2bn (75%)',  n: 182, pct: '20.2%', color: '#E60000' },
      { label: 'Unrated $1–2bn (65%)', n: 125, pct: '13.9%', color: '#767676' },
      { label: 'Eligible <$1bn (50%)', n: 152, pct: '16.9%', color: '#007A38' },
      { label: 'Excluded (0%)',        n: 238, pct: '26.4%', color: '#C8C8C8' },
    ],
  },
  'Blackstone CRE VII': {
    ...generated['Blackstone CRE VII'],
    pendingReviews: 0, lastBBRun: new Date(Date.now() - 48 * 3_600_000), lastBBSub: '2026-04',
    segments: [
      { label: 'Rated (90%)',          n: 210, pct: '21.3%', color: '#4F4F4F' },
      { label: 'Unrated >$2bn (75%)',  n: 195, pct: '19.8%', color: '#E60000' },
      { label: 'Unrated $1–2bn (65%)', n: 142, pct: '14.4%', color: '#767676' },
      { label: 'Eligible <$1bn (50%)', n: 178, pct: '18.1%', color: '#007A38' },
      { label: 'Excluded (0%)',        n: 259, pct: '26.3%', color: '#C8C8C8' },
    ],
  },
}
