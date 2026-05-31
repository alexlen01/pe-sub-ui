import type { CSSProperties, ReactNode } from 'react'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children?: ReactNode
  style?: CSSProperties
  bodyStyle?: CSSProperties
}

export default function Card({ title, subtitle, action, children, style, bodyStyle }: CardProps) {
  return (
    <div className="card" style={style}>
      {(title || action) && (
        <div className="card-header">
          <div>
            {title    && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      {children && <div style={bodyStyle}>{children}</div>}
    </div>
  )
}
