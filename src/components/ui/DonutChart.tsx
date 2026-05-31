interface Segment { label: string; n: number; pct: string; color: string }
interface DonutChartProps { segments?: Segment[]; total?: number; centerLabel?: string }

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, ro: number, ri: number, a1: number, a2: number) {
  const s1 = polar(cx, cy, ro, a1), e1 = polar(cx, cy, ro, a2)
  const s2 = polar(cx, cy, ri, a2), e2 = polar(cx, cy, ri, a1)
  const lg = (a2 - a1) > 180 ? 1 : 0
  return `M${s1.x} ${s1.y} A${ro} ${ro} 0 ${lg} 1 ${e1.x} ${e1.y} L${s2.x} ${s2.y} A${ri} ${ri} 0 ${lg} 0 ${e2.x} ${e2.y}Z`
}

export default function DonutChart({ segments = [], total, centerLabel }: DonutChartProps) {
  const totalN = segments.reduce((s, d) => s + d.n, 0)
  let angle = -90
  const paths = segments.map(seg => {
    const sweep = (seg.n / totalN) * 360
    const path  = arcPath(70, 70, 62, 38, angle, angle + sweep - 0.8)
    angle += sweep
    return { ...seg, path }
  })

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width="140" height="140" style={{ flexShrink: 0 }}>
        {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} />)}
        <text x="70" y="66" textAnchor="middle" fontSize="15" fontWeight="700" fill="#4F4F4F">{centerLabel ?? total?.toLocaleString()}</text>
        <text x="70" y="80" textAnchor="middle" fontSize="10" fill="#767676">LPs</text>
      </svg>
      <div style={{ flex: 1 }}>
        {segments.map((seg, i) => (
          <div className="legend-item" key={i}>
            <div className="legend-dot" style={{ background: seg.color }} />
            <span style={{ flex: 1, fontSize: 11 }}>{seg.label}</span>
            <span className="legend-n">{seg.n}</span>
            <span className="legend-pct">{seg.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
