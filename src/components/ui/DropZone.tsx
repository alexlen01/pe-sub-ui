import { useState, useRef } from 'react'
import Button from './Button'

interface DropZoneProps { onFile?: (f: File) => void }

export default function DropZone({ onFile }: DropZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile]         = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = (f: File | null | undefined) => {
    if (!f) return
    setFile(f)
    onFile?.(f)
  }

  return (
    <div>
      <div
        className={`drop-zone ${dragging ? 'dragover' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files[0]) }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="drop-zone-icon">📄</div>
        <p>Drag &amp; drop Agent BB Excel file here</p>
        <small>or click to browse · .xlsx only · max 50 MB</small>
        <input ref={inputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={e => accept(e.target.files?.[0])} />
      </div>
      {file && (
        <div className="file-preview">
          <span style={{ fontSize: 22 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div className="file-preview-name">{file.name}</div>
            <div className="file-preview-meta">Ready to upload</div>
            <div className="progress-bar" style={{ width: 200, marginTop: 4 }}>
              <div className="progress-fill" style={{ width: '100%' }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); setFile(null) }}>✕</Button>
        </div>
      )}
    </div>
  )
}
