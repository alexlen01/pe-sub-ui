import { useEffect, type CSSProperties, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose?: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: number | string
}

export default function Modal({ open, onClose, title, subtitle, children, footer, width }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const boxStyle: CSSProperties = width ? { width } : {}

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="modal-box" style={boxStyle}>
        {(title || subtitle) && (
          <div className="modal-head">
            <div style={{ minWidth: 0 }}>
              {title && <div className="modal-title">{title}</div>}
              {subtitle && <div className="modal-subtitle">{subtitle}</div>}
            </div>
            {onClose && (
              <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
