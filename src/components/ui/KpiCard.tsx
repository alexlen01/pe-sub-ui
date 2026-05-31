import type { CSSProperties, ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string | number
  sub?: ReactNode
  color?: string
  onClick?: () => void
  style?: CSSProperties
}

export default function KpiCard({ label, value, sub, color = '', onClick, style }: KpiCardProps) {
  return (
    <div
      className={`kpi-card ${color}`}
      onClick={onClick}
      style={{ ...(onClick ? { cursor: 'pointer' } : {}), ...style }}
    >
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
