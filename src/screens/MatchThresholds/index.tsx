import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { api } from '../../services/api'
import type { MatchingThresholds, MatchingConfig, LegalSuffix, KnownAbbreviation, MatchTestResult } from '../../services/api'
import { DEFAULT_THRESHOLDS, LEGAL_SUFFIXES, KNOWN_ABBREVIATIONS } from '../../config/matchingConfig'

export default function MatchThresholds() {
  const { toast, navigate } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'

  const [thresholds,    setThresholds]    = useState<MatchingThresholds>(DEFAULT_THRESHOLDS)
  const [suffixes,      setSuffixes]      = useState<LegalSuffix[]>(LEGAL_SUFFIXES)
  const [abbreviations, setAbbreviations] = useState<KnownAbbreviation[]>(KNOWN_ABBREVIATIONS)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<string | null>(null)
  const [testName,      setTestName]      = useState('')
  const [testResult,    setTestResult]    = useState<MatchTestResult | null>(null)
  const [testLoading,   setTestLoading]   = useState(false)
  const [loadError,     setLoadError]     = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    if (!live) { setLoading(false); return }
    api.config.matching()
      .then(cfg => {
        setThresholds(cfg.thresholds)
        setSuffixes(cfg.legalSuffixes)
        setAbbreviations(cfg.knownAbbreviations)
      })
      .catch(e => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }, [mode])

  const buildConfig = useCallback((): MatchingConfig => ({
    thresholds,
    legalSuffixes:      suffixes,
    knownAbbreviations: abbreviations,
  }), [thresholds, suffixes, abbreviations])

  const handleSave = useCallback(async (section: string) => {
    setSaving(section)
    try {
      await api.config.setMatching(buildConfig(), section)
      toast('Matching configuration saved.')
    } catch {
      toast('Save failed — ensure pe-sub-api is running.')
    } finally {
      setSaving(null)
    }
  }, [buildConfig, toast])

  const set = (field: keyof MatchingThresholds) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value)
    setThresholds(prev => ({ ...prev, [field]: val }))
  }

  const runTest = async () => {
    if (!testName.trim()) return
    setTestLoading(true)
    try {
      setTestResult(await api.matching.test(testName))
    } catch {
      toast('Match test failed — ensure pe-sub-api is running.')
    } finally {
      setTestLoading(false)
    }
  }

  const Slider = ({ field, label, min, max, step = 1, fmt = (v: number) => String(v) }: {
    field: keyof MatchingThresholds; label: string; min: number; max: number; step?: number; fmt?: (v: number) => string
  }) => (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <strong style={{ color: 'var(--navy)' }}>{fmt(thresholds[field] as number)}</strong>
      </label>
      <input type="range" min={min} max={max} step={step} value={thresholds[field] as number} onChange={set(field)} style={{ width: '100%', accentColor: 'var(--blue)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
    </div>
  )

  if (loading) {
    return (
      <div style={{ padding: '40px 24px', color: 'var(--muted)', fontSize: 13 }}>
        Loading matching configuration…
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {loadError && <div style={{ padding: '10px 14px', background: '#fff0f0', color: 'var(--red)', borderRadius: 6, fontSize: 12 }}>API error — {loadError}</div>}
      <div><Button variant="ghost" size="sm" onClick={() => navigate('upload')}>← Back to Upload</Button></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Confidence Thresholds" subtitle="Controls when matches are auto-accepted vs. queued for review" action={<Button size="sm" onClick={() => handleSave('thresholds')} disabled={saving !== null || loading}>{saving === 'thresholds' ? 'Saving…' : 'Save'}</Button>}>
          <div style={{ padding: '4px 18px 16px' }}>
            <Slider field="autoAccept"  label="Auto-accept threshold"      min={80} max={100} fmt={v => `${v}%`} />
            <Slider field="reviewQueue" label="High-confidence review"     min={(thresholds.noMatch ?? 50) + 1} max={thresholds.autoAccept - 1} fmt={v => `${v}%`} />
            <Slider field="noMatch"     label="No-match / new-LP threshold" min={0} max={thresholds.reviewQueue - 1} fmt={v => `${v}%`} />
            <div className="info-box" style={{ marginTop: 8 }}>
              ≥ <strong>{thresholds.autoAccept}%</strong> auto-accepted. <strong>{thresholds.reviewQueue}%–{thresholds.autoAccept - 1}%</strong> high-confidence review.
              {' '}<strong>{thresholds.noMatch ?? 50}%–{thresholds.reviewQueue - 1}%</strong> low-confidence review. Below <strong>{thresholds.noMatch ?? 50}%</strong> queued as a potential new LP. Nothing is auto-rejected.
            </div>
          </div>
        </Card>

        <Card title="Algorithm Weights" subtitle="Balance between Jaro-Winkler and Levenshtein" action={<Button size="sm" onClick={() => handleSave('weights')} disabled={saving !== null || loading}>{saving === 'weights' ? 'Saving…' : 'Save'}</Button>}>
          <div style={{ padding: '4px 18px 16px' }}>
            <Slider field="jwWeight"  label="Jaro-Winkler weight"  min={0} max={1} step={0.05} fmt={v => v.toFixed(2)} />
            <Slider field="levWeight" label="Levenshtein weight"   min={0} max={1} step={0.05} fmt={v => v.toFixed(2)} />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Combined = (JW × {(thresholds.jwWeight as number).toFixed(2)}) + (Lev × {(thresholds.levWeight as number).toFixed(2)})
            </div>
            <div style={{ marginTop: 14 }}>
              {([
                ['caseFold',      'Case-insensitive matching'],
                ['punctuation',   'Strip punctuation & special characters'],
                ['stripSuffixes', 'Strip legal entity suffixes'],
                ['abbrevExpand',  'Expand known abbreviations'],
              ] as [keyof MatchingThresholds, string][]).map(([field, label]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={thresholds[field] as boolean} onChange={set(field)} />{label}
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Legal Entity Suffix Rules" subtitle="Suffixes stripped before comparison when suffix stripping is enabled" action={<Button size="sm" onClick={() => handleSave('suffixes')} disabled={saving !== null || loading}>{saving === 'suffixes' ? 'Saving…' : 'Save'}</Button>}>
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  {['Abbreviation', 'Full Form', 'Strip'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Strip' ? 'center' : 'left', color: 'var(--navy)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suffixes.map((s, i) => (
                  <tr key={i}>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>{s.abbr}</td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>{s.full}</td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={s.strip}
                        onChange={() => setSuffixes(prev => prev.map((r, j) => j === i ? { ...r, strip: !r.strip } : r))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Abbreviation Expansion Dictionary" subtitle="Known tokens expanded before matching" action={<Button size="sm" onClick={() => handleSave('abbreviations')} disabled={saving !== null || loading}>{saving === 'abbreviations' ? 'Saving…' : 'Save'}</Button>}>
          <div style={{ padding: '0 18px 16px' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--tbl)' }}>
                  {['Token', 'Expands To', ''].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--navy)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abbreviations.map((a, i) => (
                  <tr key={i}>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', width: 110 }}>
                      <input
                        type="text"
                        value={a.token}
                        placeholder="e.g. ADIA"
                        onChange={e => setAbbreviations(prev => prev.map((r, j) => j === i ? { ...r, token: e.target.value } : r))}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12, fontWeight: 700 }}
                      />
                    </td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        value={a.expansion}
                        placeholder="Full name"
                        onChange={e => setAbbreviations(prev => prev.map((r, j) => j === i ? { ...r, expansion: e.target.value } : r))}
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
                      />
                    </td>
                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', width: 32, textAlign: 'center' }}>
                      <button
                        onClick={() => setAbbreviations(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, lineHeight: 1 }}
                        title="Remove"
                      >×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: 10 }}
              onClick={() => setAbbreviations(prev => [...prev, { token: '', expansion: '' }])}
            >
              + Add Entry
            </Button>
          </div>
        </Card>
      </div>

      <Card title="Match Test Tool" subtitle="Preview how the algorithm would match a name against LP Master">
        <div style={{ padding: '8px 18px 16px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              placeholder="e.g. Monarch Alt Capital LP"
              style={{ flex: 1 }}
              value={testName}
              onChange={e => setTestName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runTest() }}
            />
            <Button onClick={runTest} disabled={testLoading}>
              {testLoading ? 'Running…' : 'Run Test'}
            </Button>
          </div>
          {testResult && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                Normalised: <strong style={{ color: 'var(--navy)' }}>{testResult.normalised}</strong>
              </div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--tbl)' }}>
                    {['LP Master Match', 'Confidence', 'Action'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Confidence' ? 'right' : 'left', color: 'var(--navy)', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testResult.matches.map((m, i) => {
                    const color = m.score >= thresholds.autoAccept ? 'var(--green)' : m.score >= thresholds.reviewQueue ? 'var(--amber)' : 'var(--red)'
                    return (
                      <tr key={i}>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>{m.name}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)', fontWeight: 700, color }}>{m.score}%</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color, fontWeight: 600, fontSize: 11 }}>{m.action}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
