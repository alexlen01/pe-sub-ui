import type { CSSProperties, MouseEvent, ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'action'
  size?: 'sm' | ''
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  style?: CSSProperties
  title?: string
}

export default function Button({ children, variant = 'primary', size = '', onClick, type = 'button', disabled = false, style, title }: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, size ? `btn-${size}` : ''].filter(Boolean).join(' ')
  return (
    <button className={cls} onClick={onClick} type={type} disabled={disabled} style={style} title={title}>
      {children}
    </button>
  )
}
