import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayerInfo } from 'dxf-viewer'
import CadViewer, { type CadViewerHandle, type LoadPhase } from './components/CadViewer'
import LayerPanel from './components/LayerPanel'
import { detectCadFile, type CadFileInfo } from './cad/detectVersion'
import { convertDwgToDxf } from './cad/convertDwg'

type Status =
  | { phase: 'idle' }
  | { phase: 'busy'; label: string; progress?: number }
  | { phase: 'ready' }
  | { phase: 'error'; message: string }

interface LoadedFile {
  name: string
  size: number
  info: CadFileInfo
  convertMs?: number
  dxfUrl: string
  dxfSize: number
}

const MAX_SIZE = 150 * 1024 * 1024
const BACKGROUNDS = { dark: '#1b1d21', light: '#ffffff' } as const

const PHASE_LABEL: Record<LoadPhase, string> = {
  font: 'Carregant fonts…',
  fetch: 'Llegint DXF…',
  parse: 'Analitzant DXF…',
  prepare: 'Preparant el dibuix…',
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '')
}

export default function App() {
  const viewerRef = useRef<CadViewerHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [status, setStatus] = useState<Status>({ phase: 'idle' })
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [theme, setTheme] = useState<keyof typeof BACKGROUNDS>('dark')
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showLayers, setShowLayers] = useState(true)

  const busy = status.phase === 'busy'

  const openFile = useCallback(async (f: File) => {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    try {
      if (f.size > MAX_SIZE) {
        throw new Error(`El fitxer fa ${formatSize(f.size)}. El límit al navegador és ${formatSize(MAX_SIZE)}.`)
      }
      setStatus({ phase: 'busy', label: 'Llegint fitxer…' })
      const buf = await f.arrayBuffer()
      const info = detectCadFile(buf)

      if (info.kind === 'unknown') throw new Error('No és un fitxer DWG ni DXF vàlid.')
      if (info.kind === 'dwg' && !info.supported) {
        throw new Error(`Versió de DWG no suportada: ${info.release}.`)
      }

      let dxf: ArrayBuffer | Uint8Array = buf
      let convertMs: number | undefined
      if (info.kind === 'dwg') {
        setStatus({ phase: 'busy', label: `Convertint DWG (${info.release}) a DXF…` })
        const res = await convertDwgToDxf(buf, abort.signal)
        dxf = res.dxf
        convertMs = res.ms
      }
      if (abort.signal.aborted) return

      const dxfUrl = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }))
      setStatus({ phase: 'busy', label: 'Dibuixant…' })
      const loadedLayers = await viewerRef.current!.load(dxfUrl, (phase, done, total) => {
        if (abort.signal.aborted) return
        setStatus({ phase: 'busy', label: PHASE_LABEL[phase], progress: total ? done / total : undefined })
      })
      if (abort.signal.aborted) {
        URL.revokeObjectURL(dxfUrl)
        return
      }

      setFile((prev) => {
        if (prev) URL.revokeObjectURL(prev.dxfUrl)
        return { name: f.name, size: f.size, info, convertMs, dxfUrl, dxfSize: dxf.byteLength }
      })
      setLayers(loadedLayers)
      setHidden(new Set(loadedLayers.filter((l) => !l.visible).map((l) => l.name)))
      setStatus({ phase: 'ready' })
    } catch (e) {
      if (abort.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
      console.error(e)
      setStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  // Drag & drop anywhere on the page.
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)
      const f = e.dataTransfer?.files?.[0]
      if (f) void openFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [openFile])

  const toggleLayer = (name: string, show: boolean) => {
    viewerRef.current?.showLayer(name, show)
    setHidden((prev) => {
      const next = new Set(prev)
      if (show) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const allLayers = (show: boolean) => {
    layers.forEach((l) => viewerRef.current?.showLayer(l.name, show))
    setHidden(show ? new Set() : new Set(layers.map((l) => l.name)))
  }

  const changeTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    viewerRef.current?.setBackground(BACKGROUNDS[next])
  }

  const savePng = () => {
    const url = viewerRef.current?.snapshot()
    if (!url || !file) return
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName(file.name)}.png`
    a.click()
  }

  const hasDrawing = file !== null

  return (
    <div className="app" data-theme={theme}>
      <header className="toolbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M3 21V3h12l6 6v12H3Z M15 3v6h6 M7 17l4-6 3 4 2-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span>Visor DWG</span>
        </div>

        <button type="button" className="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          Obrir fitxer…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".dwg,.dxf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openFile(f)
            e.target.value = ''
          }}
        />

        {hasDrawing && (
          <>
            <span className="sep" />
            <button type="button" onClick={() => viewerRef.current?.fit()} title="Ajustar a la pantalla">Ajustar</button>
            <button type="button" onClick={() => setShowLayers((v) => !v)} aria-pressed={showLayers}>Capes</button>
            <button type="button" onClick={changeTheme} title="Canviar el fons">
              Fons {theme === 'dark' ? 'clar' : 'fosc'}
            </button>
            <span className="sep" />
            {file.info.kind === 'dwg' && (
              <a className="button" href={file.dxfUrl} download={`${baseName(file.name)}.dxf`}>Descarregar DXF</a>
            )}
            <button type="button" onClick={savePng}>Desar PNG</button>
          </>
        )}

        {busy && (
          <button type="button" className="danger" onClick={() => { abortRef.current?.abort(); setStatus({ phase: file ? 'ready' : 'idle' }) }}>
            Cancel·lar
          </button>
        )}
      </header>

      <main className="workspace">
        {hasDrawing && showLayers && layers.length > 0 && (
          <LayerPanel layers={layers} hidden={hidden} onToggle={toggleLayer} onAll={allLayers} />
        )}

        <div className="stage">
          <CadViewer
            ref={viewerRef}
            background={BACKGROUNDS[theme]}
            onCursor={setCursor}
            onMessage={(m, level) => level !== 'info' && console.warn('[dxf-viewer]', m)}
          />

          {!hasDrawing && !busy && (
            <div className="empty" onClick={() => inputRef.current?.click()}>
              <div className="empty-card">
                <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
                  <path d="M10 42V6h20l8 8v28H10Z M30 6v8h8 M24 34V20 M18 26l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
                <h1>Arrossega un fitxer DWG o DXF</h1>
                <p>o fes clic per triar-lo. Pensat per a <strong>DWG 2014</strong> (format 2013–2017); també obre DWG 2018 i DXF.</p>
                <p className="muted">El fitxer es converteix al teu navegador amb LibreDWG (WebAssembly). No s'envia a cap servidor.</p>
              </div>
            </div>
          )}

          {busy && (
            <div className="overlay">
              <div className="spinner" />
              <p>{status.label}</p>
              {status.progress !== undefined && (
                <div className="progress"><div style={{ width: `${Math.round(status.progress * 100)}%` }} /></div>
              )}
            </div>
          )}

          {status.phase === 'error' && (
            <div className="toast error" role="alert">
              <strong>No s'ha pogut obrir el fitxer.</strong> {status.message}
              <button type="button" className="link" onClick={() => setStatus({ phase: file ? 'ready' : 'idle' })}>Tancar</button>
            </div>
          )}

          {dragging && <div className="dropzone">Deixa anar el fitxer per obrir-lo</div>}
        </div>
      </main>

      <footer className="statusbar">
        {file ? (
          <>
            <span title={file.name} className="filename">{file.name}</span>
            <span>{formatSize(file.size)}</span>
            {file.info.kind === 'dwg' ? (
              <span>{file.info.tag} · {file.info.release}</span>
            ) : (
              <span>DXF</span>
            )}
            {file.convertMs !== undefined && <span>Conversió {file.convertMs} ms → DXF {formatSize(file.dxfSize)}</span>}
            <span>{layers.length} capes</span>
          </>
        ) : (
          <span>Cap fitxer obert</span>
        )}
        <span className="coords">
          {cursor ? `X ${cursor.x.toFixed(3)}  Y ${cursor.y.toFixed(3)}` : ''}
        </span>
      </footer>
    </div>
  )
}
