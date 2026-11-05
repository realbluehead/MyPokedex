import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Color } from 'three'
import { DxfViewer, type LayerInfo } from 'dxf-viewer'
import { robustBounds, type Bounds } from '../cad/extents'

export type LoadPhase = 'font' | 'fetch' | 'parse' | 'prepare'

export interface CadViewerHandle {
  /** Loads a DXF from a (blob) URL and resolves with its layers. */
  load(url: string, onProgress?: (phase: LoadPhase, done: number, total: number) => void): Promise<LayerInfo[]>
  clear(): void
  fit(): void
  showLayer(name: string, show: boolean): void
  setBackground(color: string): void
  /** Returns a PNG data URL of the current view. */
  snapshot(): string | null
}

interface Props {
  background: string
  onCursor?: (pos: { x: number; y: number } | null) => void
  onMessage?: (msg: string, level: string) => void
}

const FONTS = [`${import.meta.env.BASE_URL}fonts/DejaVuSans.ttf`]

const CadViewer = forwardRef<CadViewerHandle, Props>(function CadViewer({ background, onCursor, onMessage }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<DxfViewer | null>(null)
  /** Fit-to-screen extents in drawing coordinates. */
  const fitBoundsRef = useRef<Bounds | null>(null)
  const cbRef = useRef({ onCursor, onMessage })
  cbRef.current = { onCursor, onMessage }

  useEffect(() => {
    const viewer = new DxfViewer(containerRef.current!, {
      clearColor: new Color(background),
      autoResize: true,
      colorCorrection: true,
      antialias: true,
      pointerMoveEvent: true,
      preserveDrawingBuffer: true, // needed for PNG snapshot
      retainParsedDxf: true, // needed for robust zoom extents
      sceneOptions: { suppressPaperSpace: true },
    })
    viewerRef.current = viewer

    const onMove = (e: CustomEvent) => {
      const o = viewer.GetOrigin()
      const p = e.detail?.position
      cbRef.current.onCursor?.(p && o ? { x: p.x + o.x, y: p.y + o.y } : null)
    }
    const onMsg = (e: CustomEvent) => cbRef.current.onMessage?.(e.detail.message, e.detail.level)
    viewer.Subscribe('pointermove', onMove)
    viewer.Subscribe('message', onMsg)

    return () => {
      viewer.Destroy()
      viewerRef.current = null
    }
    // The viewer is created once; background changes go through setBackground().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    async load(url, onProgress) {
      const viewer = viewerRef.current!
      await viewer.Load({
        url,
        fonts: FONTS,
        progressCbk: onProgress,
        workerFactory: () =>
          new Worker(new URL('../cad/dxfViewer.worker.ts', import.meta.url), { type: 'module' }),
      })
      // The viewer fits to raw bounds, which a single stray entity can blow up.
      const raw = viewer.GetBounds()
      fitBoundsRef.current = robustBounds(viewer.GetDxf()?.entities) ?? raw
      this.fit()
      return [...viewer.GetLayers(true)].sort((a, b) => a.displayName.localeCompare(b.displayName))
    },
    clear() {
      viewerRef.current?.Clear()
    },
    fit() {
      const viewer = viewerRef.current
      const b = fitBoundsRef.current
      const o = viewer?.GetOrigin()
      if (viewer && b && o) viewer.FitView(b.minX - o.x, b.maxX - o.x, b.minY - o.y, b.maxY - o.y)
    },
    showLayer(name, show) {
      viewerRef.current?.ShowLayer(name, show)
    },
    setBackground(color) {
      viewerRef.current?.SetClearColor(color)
    },
    snapshot() {
      const viewer = viewerRef.current
      if (!viewer) return null
      viewer.Render()
      return viewer.GetCanvas().toDataURL('image/png')
    },
  }))

  return <div ref={containerRef} className="cad-canvas" />
})

export default CadViewer
