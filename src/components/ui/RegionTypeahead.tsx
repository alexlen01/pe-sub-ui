import { useEffect, useMemo, useRef, useState } from 'react'
import {
  formatRegion,
  REGION_ENTRIES,
  searchRegions,
  tokenForEntry,
  type RegionEntry,
} from '../../config/regionReference'

export interface RegionTypeaheadProps {
  /** Current stored value (a `REGION|COUNTRY|SUB` token, or free text). */
  value: string
  /**
   * Emits the resolved token when a suggestion is picked, the raw entered text when nothing
   * matches (custom jurisdictions are accepted, not discarded), or '' when cleared.
   */
  onChange: (value: string) => void
  disabled?: boolean
  style?: React.CSSProperties
  placeholder?: string
}

/**
 * Single searchable Region/Location input. The user searches across regions, ISO2 countries, PE
 * domiciles and aliases; picking a suggestion resolves to a canonical token. If nothing matches,
 * the raw text is accepted as-is so bespoke jurisdictions can still be captured (it is stored as
 * free text, which the reference helpers render verbatim and treat as region-unknown).
 */
export default function RegionTypeahead({
  value, onChange, disabled = false, style, placeholder = 'Search country, region or domicile…',
}: RegionTypeaheadProps) {
  const [open, setOpen]         = useState(false)
  const [query, setQuery]       = useState('')
  const [editing, setEditing]   = useState(false)
  const [active, setActive]     = useState(0)
  const rootRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // While not actively editing, the field shows the resolved label for the stored value.
  const displayLabel = useMemo(() => formatRegion(value), [value])
  const suggestions  = useMemo(() => (editing ? searchRegions(query) : []), [editing, query])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      // Clicking away commits the current text (free text included) rather than discarding it.
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) commitText()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  })

  const close = () => { setOpen(false); setEditing(false); setQuery('') }

  const commit = (entry: RegionEntry) => {
    onChange(tokenForEntry(entry))
    close()
  }

  const enterEditing = (seed: string) => { setEditing(true); setQuery(seed); setActive(0); setOpen(true) }

  /**
   * Resolve the current text when focus leaves or Enter is pressed with no active suggestion:
   *   - empty            → clear the stored value
   *   - unchanged label  → keep the existing value (never downgrade a token to its label text)
   *   - exact label hit  → canonical token
   *   - anything else    → the raw text, accepted as a custom jurisdiction
   */
  const commitText = () => {
    const q = query.trim()
    if (q === '') { if (value) onChange(''); close(); return }
    if (q === displayLabel.trim()) { close(); return }
    const exact = REGION_ENTRIES.find(e => e.label.toLowerCase() === q.toLowerCase())
    onChange(exact ? tokenForEntry(exact) : q)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === 'ArrowDown')      { e.preventDefault(); if (!editing) { enterEditing(''); return } setOpen(true); setActive(a => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); if (open && suggestions[active]) commit(suggestions[active]); else commitText() }
    else if (e.key === 'Escape')    { e.preventDefault(); close() }
  }

  const onBlur = () => {
    // Defer so a click on a suggestion (which fires after blur) still registers via its onMouseDown.
    window.setTimeout(() => { if (editing) commitText() }, 120)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 12, color: 'var(--text)', background: disabled ? 'var(--tbl)' : '#FAFAFA',
    border: '1px solid var(--border)', borderRadius: 4, padding: '5px 8px', outline: 'none', ...style,
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        style={inputStyle}
        disabled={disabled}
        placeholder={placeholder}
        value={editing ? query : displayLabel}
        onFocus={() => { if (!disabled) { enterEditing(displayLabel); inputRef.current?.select() } }}
        onChange={e => { setEditing(true); setQuery(e.target.value); setActive(0); setOpen(true) }}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', zIndex: 20, top: 'calc(100% + 2px)', left: 0, right: 0, margin: 0,
            padding: 4, listStyle: 'none', maxHeight: 240, overflowY: 'auto', background: 'var(--card)',
            border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,.12)',
          }}
        >
          {suggestions.map((e, i) => {
            const token = tokenForEntry(e)
            const selected = token === value
            return (
              <li
                key={token}
                role="option"
                aria-selected={selected}
                onMouseDown={ev => { ev.preventDefault(); commit(e) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                  background: i === active ? 'var(--green-lt)' : 'transparent',
                  color: i === active ? 'var(--green)' : 'var(--text)',
                }}
              >
                <span>
                  {e.label}
                  {e.pinned && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>
                      domicile
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {e.country}{e.sub ? `·${e.sub}` : ''} · {e.region}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
