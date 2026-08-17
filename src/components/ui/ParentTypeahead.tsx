import { useEffect, useMemo, useRef, useState } from 'react'

export interface ParentChoice {
  id: number
  investorName: string
  /** False when picking this row would make the hierarchy cyclic (it sits below the edited row). */
  selectable: boolean
}

export interface ParentTypeaheadProps {
  /** Currently linked sponsor id, or null when the record is an ultimate entity. */
  value: number | null
  /** Sponsor name to show when `value` is null but a name is recorded (an unlinked sponsor). */
  unlinkedName?: string
  /** Emits the picked row, or null when the field is cleared to "no parent". */
  onChange: (choice: ParentChoice | null) => void
  choices: ParentChoice[]
  disabled?: boolean
  style?: React.CSSProperties
}

const MAX_SUGGESTIONS = 50

/**
 * Searchable sponsor picker for the LP Master hierarchy.
 *
 * A `<select>` is the wrong control here: LP Master runs to thousands of rows, so the option list
 * is neither renderable nor scannable. This searches by substring and caps the visible list,
 * matching the Region field's interaction so the panel behaves consistently.
 *
 * Unselectable rows (the record itself and its descendants) are shown but greyed and inert, so it
 * is clear *why* an expected sponsor cannot be picked rather than it silently missing.
 */
export default function ParentTypeahead({
  value, unlinkedName = '', onChange, choices, disabled = false, style,
}: ParentTypeaheadProps) {
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [editing, setEditing] = useState(false)
  const [active, setActive]   = useState(0)
  const rootRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const linked = useMemo(
    () => (value == null ? null : choices.find(c => c.id === value) ?? null),
    [value, choices],
  )
  const displayLabel = linked?.investorName ?? unlinkedName

  const suggestions = useMemo(() => {
    if (!editing) return []
    const q = query.trim().toLowerCase()
    const pool = q === '' ? choices : choices.filter(c => c.investorName.toLowerCase().includes(q))
    return pool.slice(0, MAX_SUGGESTIONS)
  }, [editing, query, choices])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const close = () => { setOpen(false); setEditing(false); setQuery('') }

  const commit = (choice: ParentChoice) => {
    if (!choice.selectable) return
    onChange(choice)
    close()
  }

  /**
   * Leaving the field with the text cleared means "no parent". Any other text is left alone: a
   * sponsor is only ever linked by picking it, so a half-typed name never silently repoints a row.
   */
  const commitText = () => {
    if (editing && query.trim() === '') onChange(null)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === 'ArrowDown')     { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')  { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter')    { e.preventDefault(); if (open && suggestions[active]) commit(suggestions[active]); else commitText() }
    else if (e.key === 'Escape')   { e.preventDefault(); close() }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 12, color: 'var(--text)', background: disabled ? 'var(--tbl)' : '#FAFAFA',
    border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', outline: 'none', ...style,
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          ref={inputRef}
          type="text"
          style={inputStyle}
          disabled={disabled}
          placeholder="Search LP Master for a sponsor… (empty = no parent)"
          value={editing ? query : displayLabel}
          onFocus={() => { if (!disabled) { setEditing(true); setQuery(''); setActive(0); setOpen(true) } }}
          onChange={e => { setEditing(true); setQuery(e.target.value); setActive(0); setOpen(true) }}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => { if (editing) commitText() }, 120)}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Parent / Sponsor"
        />
        {displayLabel !== '' && !disabled && (
          <button
            type="button"
            onClick={() => { onChange(null); close() }}
            title="Clear sponsor — this record becomes an ultimate entity"
            aria-label="Clear sponsor"
            style={{ flex: '0 0 auto', border: '1px solid var(--border)', background: 'var(--tbl)', color: 'var(--muted)', borderRadius: 4, cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '5px 7px' }}
          >×</button>
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', zIndex: 20, top: 'calc(100% + 2px)', left: 0, right: 0, margin: 0,
            padding: 4, listStyle: 'none', maxHeight: 240, overflowY: 'auto', background: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,.12)',
          }}
        >
          {suggestions.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={c.id === value}
              aria-disabled={!c.selectable}
              onMouseDown={ev => { ev.preventDefault(); commit(c) }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '6px 8px', borderRadius: 4, fontSize: 12,
                cursor: c.selectable ? 'pointer' : 'not-allowed',
                background: i === active && c.selectable ? 'var(--green-lt)' : 'transparent',
                color: !c.selectable ? 'var(--muted)' : i === active ? 'var(--green)' : 'var(--text)',
              }}
            >
              <span>{c.investorName}</span>
              {!c.selectable && (
                <span title="Already below this record — linking it would create a cycle" style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>
                  descendant
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
