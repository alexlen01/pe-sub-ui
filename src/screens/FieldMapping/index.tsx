import { useState, useEffect, Fragment } from 'react'
import { useApp }   from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import Button        from '../../components/ui/Button'
import { getAliasGroups } from '../../services/fieldMappingService'
import { api } from '../../services/api'

type AliasGroup = Awaited<ReturnType<typeof getAliasGroups>>

const CHIP: Record<string, React.CSSProperties> = {
  Core: { background: 'var(--tbl)',      color: 'var(--muted)', fontStyle: 'italic' },
  Bank: { background: '#e8f0fb',         color: 'var(--blue)',  fontWeight: 600      },
  User: { background: 'var(--amber-lt)', color: 'var(--amber)', fontWeight: 600      },
}

const inputStyle: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', fontSize: 11 }

export default function FieldMapping() {
  const { toast, navigate } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'
  const [groups,      setGroups]      = useState<AliasGroup>([])
  const [addingTo,    setAddingTo]    = useState<{ groupName: string; fieldIdx: number } | null>(null)
  const [newAlias,    setNewAlias]    = useState('')
  const [newBank,     setNewBank]     = useState('')
  const [editingId,   setEditingId]   = useState<number | null>(null)
  const [editText,    setEditText]    = useState('')
  const [editBank,    setEditBank]    = useState('')
  const [loadError,   setLoadError]   = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    getAliasGroups(live).then(setGroups).catch(e => setLoadError(String(e)))
  }, [mode])

  const updateAliases = (groupName: string, fieldIdx: number, fn: (aliases: AliasGroup[0]['fields'][0]['aliases']) => AliasGroup[0]['fields'][0]['aliases']) =>
    setGroups(prev => prev.map(g => g.group !== groupName ? g : {
      ...g,
      fields: g.fields.map((f, i) => i !== fieldIdx ? f : { ...f, aliases: fn(f.aliases) }),
    }))

  const removeAlias = async (groupName: string, fieldIdx: number, aliasId: number) => {
    try {
      await api.fieldMapping.aliases.remove(aliasId)
      updateAliases(groupName, fieldIdx, aliases => aliases.filter(a => a.id !== aliasId))
      toast('Alias removed.')
    } catch {
      toast('Failed to remove alias.')
    }
  }

  const addAlias = async (groupName: string, fieldIdx: number) => {
    if (!newAlias.trim()) return
    const field = groups.find(g => g.group === groupName)?.fields[fieldIdx]
    if (!field?.id) { toast('Cannot add alias: not connected to server.'); return }
    try {
      const created = await api.fieldMapping.aliases.create(field.id, newAlias.trim(), 'Bank', newBank.trim() || null)
      updateAliases(groupName, fieldIdx, aliases => [...aliases, created])
      setNewAlias(''); setNewBank(''); setAddingTo(null)
      toast('Alias added.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to add alias.')
    }
  }

  const startEdit = (alias: { id: number; text: string; bank?: string | null }) => {
    setEditingId(alias.id)
    setEditText(alias.text)
    setEditBank(alias.bank ?? '')
    setAddingTo(null)
  }

  const saveEdit = async (groupName: string, fieldIdx: number) => {
    if (!editText.trim() || editingId === null) return
    try {
      const updated = await api.fieldMapping.aliases.update(editingId, editText.trim(), editBank.trim() || null)
      updateAliases(groupName, fieldIdx, aliases =>
        aliases.map(a => a.id !== editingId ? a : updated)
      )
      setEditingId(null)
      toast('Alias updated.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update alias.')
    }
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <div style={{ padding: '20px 24px 40px' }}>
      {loadError && <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fff0f0', color: 'var(--red)', borderRadius: 6, fontSize: 12 }}>API error — {loadError}</div>}
      <div style={{ marginBottom: 16 }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('upload')}>← Back to Upload</Button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--tbl)' }}>
            <th style={{ width: 220, padding: '7px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', borderBottom: '2px solid var(--border)', fontSize: 11 }}>
              Canonical Field
            </th>
            <th style={{ padding: '7px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--navy)', borderBottom: '2px solid var(--border)', fontSize: 11 }}>
              Mapped Aliases
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (
            <Fragment key={group.group}>
              <tr>
                <td colSpan={2} style={{ padding: '5px 14px', background: 'var(--navy)', color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.03em' }}>
                  {group.group}
                </td>
              </tr>

              {group.fields.map((field, fi) => {
                const isAdding = addingTo?.groupName === group.group && addingTo?.fieldIdx === fi
                const rowBg    = fi % 2 === 0 ? 'var(--card)' : 'var(--tbl)'

                return (
                  <tr key={field.canonical} style={{ background: rowBg }}>

                    <td style={{ padding: '9px 14px', verticalAlign: 'top', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{field.canonical}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{field.lpMasterField}</div>
                      {field.disambiguation && (
                        <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 5, fontStyle: 'italic' }}>
                          ↳ {field.disambiguation}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '9px 14px', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>

                        {field.aliases.map(alias => {
                          const isEditing = editingId === alias.id

                          if (isEditing) {
                            return (
                              <span key={alias.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <input
                                  autoFocus
                                  value={editText}
                                  onChange={e => setEditText(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && saveEdit(group.group, fi)}
                                  placeholder="Alias text"
                                  style={{ width: 140, ...inputStyle }}
                                />
                                <input
                                  value={editBank}
                                  onChange={e => setEditBank(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && saveEdit(group.group, fi)}
                                  placeholder="Bank (opt.)"
                                  style={{ width: 80, ...inputStyle }}
                                />
                                <Button size="sm" onClick={() => saveEdit(group.group, fi)}>Save</Button>
                                <Button size="sm" variant="secondary" onClick={cancelEdit}>✕</Button>
                              </span>
                            )
                          }

                          return (
                            <span
                              key={alias.id}
                              title={alias.bank ? `${alias.bank} — bank-specific alias` : undefined}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                padding: '2px 8px', borderRadius: 10, fontSize: 11,
                                cursor: alias.tier !== 'Core' ? 'text' : 'default',
                                ...(CHIP[alias.tier] ?? CHIP.Core),
                              }}
                            >
                              {alias.tier !== 'Core' ? (
                                <span
                                  onClick={() => startEdit(alias)}
                                  title="Click to edit"
                                  style={{ cursor: 'text' }}
                                >
                                  {alias.text}
                                </span>
                              ) : alias.text}
                              {alias.tier !== 'Core' && (
                                <button
                                  onClick={() => removeAlias(group.group, fi, alias.id)}
                                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, opacity: 0.6 }}
                                >×</button>
                              )}
                            </span>
                          )
                        })}

                        {isAdding ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <input
                              autoFocus
                              value={newAlias}
                              onChange={e => setNewAlias(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addAlias(group.group, fi)}
                              placeholder="Alias text"
                              style={{ width: 140, ...inputStyle }}
                            />
                            <input
                              value={newBank}
                              onChange={e => setNewBank(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addAlias(group.group, fi)}
                              placeholder="Bank (opt.)"
                              style={{ width: 80, ...inputStyle }}
                            />
                            <Button size="sm" onClick={() => addAlias(group.group, fi)}>Add</Button>
                            <Button size="sm" variant="secondary" onClick={() => { setAddingTo(null); setNewAlias(''); setNewBank('') }}>✕</Button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setAddingTo({ groupName: group.group, fieldIdx: fi }); setNewAlias(''); setNewBank(''); setEditingId(null) }}
                            style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--blue)', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
                          >+ alias</button>
                        )}

                      </div>
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
