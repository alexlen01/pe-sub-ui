import { useState, useEffect } from 'react'
import { useApp }        from '../../context/AppContext'
import { useScreenMode } from '../../hooks/useScreenMode'
import StepBar            from '../../components/ui/StepBar'
import Card               from '../../components/ui/Card'
import Button             from '../../components/ui/Button'
import Tag                from '../../components/ui/Tag'
import Modal              from '../../components/ui/Modal'
import DropZone           from '../../components/ui/DropZone'
import DataTable          from '../../components/ui/DataTable'
import InfoTip            from '../../components/ui/InfoTip'
import { getSubmissions, getFacilities, createFacility } from '../../services/facilityService'
import { api } from '../../services/api'
import { WIZARD_STEPS } from '../../config/wizardConfig'
import type { SubmissionRow } from '../../services/facilityService'

const SUB_COLS = [
  { key: 'facility', label: 'Facility', style: { minWidth: 160 }, render: (r: SubmissionRow) => (
    <span>
      {r.facility}
      {r.notes && (
        <span title={r.notes} style={{ marginLeft: 6, display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', verticalAlign: 'middle' }} />
      )}
    </span>
  )},
  { key: 'date',     label: 'Date' },
  { key: 'status',   label: 'Status', render: (r: SubmissionRow) => <Tag>{r.status}</Tag> },
  { key: 'action',   label: 'Action', render: (r: SubmissionRow) => (
    <span style={{ color: r.action === 'Resolve' ? 'var(--red)' : r.action === 'Pending' ? 'var(--muted)' : 'var(--blue)', fontWeight: 600, fontSize: 12 }}>
      {r.action}
    </span>
  )},
]

// ── Status legend ─────────────────────────────────────────────────────────────

const SUBMISSION_STATUS_ITEMS = [
  { label: 'Review',     desc: 'Requires credit officer action. Open LP Classification & Shadow BB to continue.' },
  { label: 'Processed',  desc: 'Shadow BB complete. Open LP Classification & Shadow BB to review or re-run.' },
  { label: 'Error',      desc: 'Extraction failed — pe-sub-extraction was unreachable. Re-upload to retry.' },
]

// ── Submission Detail Panel ───────────────────────────────────────────────────

function SubmissionDetailPanel({ sub, onClose, navigate, onAbort }: { sub: SubmissionRow; onClose: () => void; navigate: (screen: string) => void; onAbort: (sub: SubmissionRow) => void }) {
  const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }
  const valueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)' }
  const canAbort = sub.status !== 'Processed' && sub.status !== 'Aborted' && sub.status !== 'Cancelled'
  return (
    <Card
      title="Submission Detail"
      action={
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', lineHeight: 1, padding: '0 2px' }}
          title="Close"
        >
          &#x2715;
        </button>
      }
    >
      <div style={{ padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          <div><div style={labelStyle}>Facility</div><div style={valueStyle}>{sub.facility}</div></div>
          <div><div style={labelStyle}>Date</div><div style={valueStyle}>{sub.date}</div></div>
          <div><div style={labelStyle}>Agent Bank</div><div style={valueStyle}>{sub.agentBank}</div></div>
          <div><div style={labelStyle}>File</div><div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{sub.file}</div></div>
          <div><div style={labelStyle}>Status</div><div style={{ marginTop: 2 }}><Tag>{sub.status}</Tag></div></div>
        </div>

        <div>
          <div style={labelStyle}>Notes</div>
          {sub.notes
            ? <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, padding: '6px 8px', background: 'var(--hover)', borderRadius: 4 }}>{sub.notes}</div>
            : <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No notes for this submission.</div>
          }
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sub.status === 'Processing' && (
            <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', alignSelf: 'center' }}>Processing in progress…</span>
          )}
          {sub.status === 'Error' && (
            <span style={{ fontSize: 12, color: 'var(--red)', fontStyle: 'italic', alignSelf: 'center' }}>Extraction failed — pe-sub-extraction was unreachable during processing.</span>
          )}
          {sub.status === 'Review' && (
            <Button size="sm" onClick={() => navigate(sub.step === 4 ? 'match-queue' : sub.step === 5 ? 'run-shadow-bb' : 'extraction-preview')}>View Submission</Button>
          )}
          {sub.status === 'Processed' && (
            <Button size="sm" onClick={() => navigate('shadow-bb')}>View Shadow BB</Button>
          )}
          {canAbort && (
            <Button size="sm" variant="danger" onClick={() => onAbort(sub)}>Abort Submission</Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── New Facility Modal ────────────────────────────────────────────────────────

function NewFacilityModal({ open, onClose, onSave, existingNames, defaultAgentBank }: {
  open: boolean
  onClose: () => void
  onSave: (data: { name: string; agentBank: string; creditRef: string; id?: number }) => void
  existingNames: string[]
  defaultAgentBank: string
}) {
  const [name,      setName]      = useState('')
  const [agentBank, setAgentBank] = useState(defaultAgentBank)
  const [creditRef, setCreditRef] = useState('')
  const [error,     setError]     = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    if (open) {
      setName(''); setAgentBank(defaultAgentBank)
      setCreditRef(''); setError(''); setSaving(false)
    }
  }, [open, defaultAgentBank])

  const duplicate = existingNames.some(n => n.toLowerCase() === name.trim().toLowerCase())

  const validate = () => {
    if (!name.trim())      { setError('Facility name is required.'); return false }
    if (!agentBank.trim()) { setError('Agent bank is required.'); return false }
    if (duplicate)         { setError('A facility with this name already exists.'); return false }
    return true
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    setError('')
    const result = await createFacility(name.trim(), agentBank.trim())
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    onSave({ name: name.trim(), agentBank: agentBank.trim(), creditRef: creditRef.trim(), id: result.id })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Onboard New Facility"
      subtitle="Register a new credit facility before uploading its first borrowing base."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Create Facility'}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="info-box">
          After creation, configure the facility's credit agreement rules — advance rate schedule, concentration limits, and eligibility criteria — in <strong>Configuration</strong> before the Shadow BB can be calculated.
        </div>

        <div className="form-group">
          <label className="form-label">Facility Name *</label>
          <input
            type="text"
            style={{ width: '100%' }}
            placeholder="e.g. Ares Capital Partners VIII"
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            autoFocus
          />
          {duplicate && (
            <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
              A facility with this name already exists.
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Agent Bank *</label>
          <input
            type="text"
            style={{ width: '100%' }}
            placeholder="e.g. Goldman Sachs Bank USA"
            value={agentBank}
            onChange={e => { setAgentBank(e.target.value); setError('') }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Credit Agreement Reference <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            style={{ width: '100%' }}
            placeholder="e.g. CA-2024-BLK-007 · Amendment 3"
            value={creditRef}
            onChange={e => setCreditRef(e.target.value)}
          />
        </div>

        {error && (
          <div style={{ padding: '6px 10px', background: 'var(--red-lt)', borderRadius: 4, color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

const NEW_SENTINEL = '__new__'

export default function Upload() {
  const { toast, navigate, setActiveSubmission, setActiveSubmissionId, setActiveFacilityId, abortedFacilities, abortSubmission } = useApp()
  const mode = useScreenMode()
  const live = mode === 'live'

  const [allSubmissions, setAllSubmissions] = useState<SubmissionRow[]>([])
  const [facilities,     setFacilities]     = useState<{ id?: number; name: string; agentBank: string }[]>([])
  const [loadError,      setLoadError]      = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'detecting') return
    setLoadError(null)
    Promise.all([
      getSubmissions(live),
      getFacilities(live),
    ]).then(([subs, fs]) => {
      setAllSubmissions(subs)
      setFacilities(fs.map(f => ({
        id:        f.id,
        name:      f.name,
        agentBank: f.agentBank ?? '',
      })))
    }).catch(e => setLoadError(String(e)))
  }, [mode])

  const submissions = allSubmissions.filter(s => !abortedFacilities.includes(s.facility))

  const [facility,      setFacility]      = useState('')
  const [facilityId,    setFacilityId]    = useState<number | null>(null)
  const [isNewFacility, setIsNewFacility] = useState(false)
  const [newFacModal, setNewFacModal] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const [subDate,    setSubDate]    = useState(today)
  const [agentBank,  setAgentBank]  = useState('')
  const [file,       setFile]       = useState<File | null>(null)
  const [notes,      setNotes]      = useState('')
  const [processing, setProcessing] = useState(false)
  const [error,      setError]      = useState('')
  const [selectedSub,  setSelectedSub]  = useState<SubmissionRow | null>(null)
  const [abortOpen,    setAbortOpen]    = useState(false)
  const [abortTarget,  setAbortTarget]  = useState<SubmissionRow | null>(null)
  const [aborting,     setAborting]     = useState(false)

  const handleAbort = async () => {
    if (!abortTarget) return
    setAborting(true)
    try {
      if (live && abortTarget.id != null) {
        await api.submissions.abort(abortTarget.id)
        setAllSubmissions(prev => prev.map(s => s.id === abortTarget.id ? { ...s, status: 'Aborted', action: '—' } : s))
      } else {
        abortSubmission(abortTarget.facility)
      }
      setSelectedSub(null)
      toast(`Submission for ${abortTarget.facility} has been aborted.`)
    } catch (e) {
      toast(`Abort failed: ${String(e)}`)
    } finally {
      setAborting(false)
      setAbortOpen(false)
      setAbortTarget(null)
    }
  }

  const handleFacilityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === NEW_SENTINEL) {
      setNewFacModal(true)
    } else {
      const f = facilities.find(f => f.name === e.target.value)
      setFacility(e.target.value)
      setFacilityId(f?.id ?? null)
      setAgentBank(f?.agentBank ?? '')
      setIsNewFacility(false)
    }
  }

  const handleNewFacilitySave = ({ name, agentBank: ab, id }: { name: string; agentBank: string; creditRef: string; id?: number }) => {
    setFacilities(prev => [...prev, { id, name, agentBank: ab }])
    setFacility(name)
    setFacilityId(id ?? null)
    setAgentBank(ab)
    setIsNewFacility(true)
    setNewFacModal(false)
    toast(`Facility "${name}" registered. Configure credit agreement rules in Configuration before calculating Shadow BB.`)
  }

  const handleFileSelected = (f: File) => {
    setFile(f)
    setError('')
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select an Agent BB Excel file before uploading.')
      return
    }
    if (!facilityId) {
      setError('Please select a facility.')
      return
    }
    setProcessing(true)
    setError('')
    toast(`Uploading ${file.name} for ${facility}…`)
    try {
      const sub = await api.submissions.create(facilityId, agentBank, subDate, file, notes)
      setActiveSubmission(facility)
      setActiveSubmissionId(sub.id)
      setActiveFacilityId(facilityId)
      toast('Upload complete. Please review extracted records before matching.')
      navigate('extraction-preview')
    } catch {
      setProcessing(false)
      setError('Upload failed — ensure pe-sub-api is running and try again.')
    }
  }

  const handleCancel = () => navigate('dashboard')

  return (
    <div>
      {loadError && <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fff0f0', color: 'var(--red)', borderRadius: 6, fontSize: 12 }}>API error — {loadError}</div>}
      <StepBar steps={WIZARD_STEPS} current={1} />

      <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: 12, padding: '12px 24px 24px' }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="1 Select Facility" bodyStyle={{ padding: 18 }}>
            <div className="form-group">
              <label className="form-label">Facility</label>
              <select style={{ width: '100%' }} value={facility} onChange={handleFacilityChange}>
                <option value="">— Select a facility —</option>
                {facilities.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                <option disabled>────────────────</option>
                <option value={NEW_SENTINEL}>+ Onboard New Facility…</option>
              </select>
            </div>

            {isNewFacility && (
              <div style={{ marginTop: -6, marginBottom: 10, padding: '7px 10px', background: '#FFF8E1', border: '1px solid #F9A825', borderRadius: 4, fontSize: 11 }}>
                <strong style={{ color: '#E65100' }}>New facility — credit agreement rules not yet configured.</strong>
                {' '}Shadow BB advance rates and concentration limits will use system defaults until rules are set in{' '}
                <span
                  style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => navigate('configuration')}
                >
                  Configuration
                </span>.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Submission Date</label>
                <input type="date" value={subDate} onChange={e => setSubDate(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Agent Bank</label>
                <input type="text" value={agentBank} onChange={e => setAgentBank(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
          </Card>

          <Card title="2 Upload Document" bodyStyle={{ padding: 18 }}>
            {!facility && (
              <div style={{ marginBottom: 12, padding: '7px 10px', background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, color: 'var(--muted)' }}>
                Select a facility in <strong style={{ color: 'var(--text)' }}>Step 1</strong> to enable upload.
              </div>
            )}
            <div style={{ opacity: facility ? 1 : 0.4, pointerEvents: facility ? undefined : 'none', transition: 'opacity 0.15s' }}>
              <DropZone onFile={handleFileSelected} />
              {error && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--red-lt)', borderRadius: 4, color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
                  {error}
                </div>
              )}
              <div className="form-group" style={{ marginTop: 14 }}>
                <label className="form-label">Notes (optional)</label>
                <textarea
                  style={{ width: '100%', height: 60 }}
                  placeholder="Add any notes about this submission..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Button onClick={handleUpload} disabled={processing || !facility}>
                  {processing ? 'Processing…' : '↑ Upload and Process'}
                </Button>
                <Button variant="secondary" onClick={handleCancel} disabled={processing}>Cancel</Button>
              </div>
            </div>
          </Card>

        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card
            title="Submission History"
            action={<InfoTip title="Submission Status" items={SUBMISSION_STATUS_ITEMS} />}
          >
            <DataTable
              columns={SUB_COLS}
              rows={submissions}
              onRowClick={r => setSelectedSub(s => s === r ? null : r)}
              selectedRow={selectedSub}
            />
          </Card>

          {selectedSub ? (
            <SubmissionDetailPanel
              sub={selectedSub}
              onClose={() => setSelectedSub(null)}
              navigate={(screen) => { setActiveSubmission(selectedSub?.facility ?? null); setActiveSubmissionId(selectedSub?.id ?? null); navigate(screen) }}
              onAbort={s => { setAbortTarget(s); setAbortOpen(true) }}
            />
          ) : (
            <Card bodyStyle={{ padding: '14px 18px' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 8 }}>LP Matching on Upload</div>
              <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                Each uploaded Agent BB is automatically matched to <strong>lp_master</strong> using Jaro-Winkler + Levenshtein distance.
                High-confidence matches (&gt;95%) are auto-accepted. Below threshold are queued for credit officer review.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Button variant="secondary" size="sm" onClick={() => navigate('match-thresholds')}>Configure Thresholds</Button>
                <Button variant="secondary" size="sm" onClick={() => navigate('field-mapping')}>Field Mapping Dictionary</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <NewFacilityModal
        open={newFacModal}
        onClose={() => setNewFacModal(false)}
        onSave={handleNewFacilitySave}
        existingNames={facilities.map(f => f.name)}
        defaultAgentBank={agentBank}
      />

      <Modal
        open={abortOpen}
        onClose={() => { if (!aborting) { setAbortOpen(false); setAbortTarget(null) } }}
        title="Abort Submission?"
        subtitle={`${abortTarget?.facility} · ${abortTarget?.date}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setAbortOpen(false); setAbortTarget(null) }} disabled={aborting}>Keep</Button>
            <Button variant="danger" onClick={handleAbort} disabled={aborting}>{aborting ? 'Aborting…' : 'Abort Submission'}</Button>
          </>
        }
      >
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
          The uploaded file will be deleted and the submission will be marked <strong>Aborted</strong> in history. Any extracted LP data will also be removed. This cannot be undone.
        </div>
      </Modal>
    </div>
  )
}
