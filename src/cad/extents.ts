/**
 * Robust drawing extents for "zoom to fit".
 *
 * Real DWGs (and LibreDWG decoding quirks) often contain a few entities very far
 * from the actual drawing — a stray attribute, a block at 1e6… Plain min/max
 * bounds then shrink the drawing to an invisible dot. We take one bounding box
 * per entity and drop entities whose centre is an extreme outlier.
 */

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface Pt {
  x: number
  y: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DxfEntity = Record<string, any>

const POINT_KEYS = ['position', 'center', 'startPoint', 'endPoint', 'insertionPoint', 'start', 'end']

function isPt(p: unknown): p is Pt {
  return !!p && typeof p === 'object' && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y)
}

function entityPoints(e: DxfEntity): Pt[] {
  const pts: Pt[] = []
  if (Array.isArray(e.vertices)) for (const v of e.vertices) if (isPt(v)) pts.push(v)
  if (Array.isArray(e.controlPoints)) for (const v of e.controlPoints) if (isPt(v)) pts.push(v)
  for (const k of POINT_KEYS) if (isPt(e[k])) pts.push(e[k])
  if (isPt(e.center) && Number.isFinite(e.radius)) {
    pts.push({ x: e.center.x - e.radius, y: e.center.y - e.radius }, { x: e.center.x + e.radius, y: e.center.y + e.radius })
  }
  return pts
}

/** One bounding box per entity, so dense curves don't outweigh simple entities. */
function entityBoxes(entities: DxfEntity[]): Bounds[] {
  const boxes: Bounds[] = []
  for (const e of entities) {
    if (e.type === 'XLINE' || e.type === 'RAY') continue // infinite by definition
    if (e.inPaperSpace) continue // hidden by the viewer (suppressPaperSpace)
    const pts = entityPoints(e)
    if (!pts.length) continue
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    for (const p of pts) {
      b.minX = Math.min(b.minX, p.x)
      b.maxX = Math.max(b.maxX, p.x)
      b.minY = Math.min(b.minY, p.y)
      b.maxY = Math.max(b.maxY, p.y)
    }
    boxes.push(b)
  }
  return boxes
}

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Range of "normal" values: far outliers (beyond 3× the 5–95% span) are rejected. */
function inlierRange(values: number[]): [number, number] {
  const s = [...values].sort((a, b) => a - b)
  const p05 = quantile(s, 0.05)
  const p95 = quantile(s, 0.95)
  const span = Math.max(p95 - p05, (s[s.length - 1] - s[0]) * 1e-3, 1e-9)
  return [p05 - 3 * span, p95 + 3 * span]
}

/** Returns robust bounds in drawing coordinates, or null if not enough data. */
export function robustBounds(entities: DxfEntity[] | undefined): Bounds | null {
  if (!entities?.length) return null
  const boxes = entityBoxes(entities)
  if (!boxes.length) return null

  const [xLo, xHi] = inlierRange(boxes.map((b) => (b.minX + b.maxX) / 2))
  const [yLo, yHi] = inlierRange(boxes.map((b) => (b.minY + b.maxY) / 2))
  const out = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const b of boxes) {
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    if (cx < xLo || cx > xHi || cy < yLo || cy > yHi) continue
    out.minX = Math.min(out.minX, b.minX)
    out.maxX = Math.max(out.maxX, b.maxX)
    out.minY = Math.min(out.minY, b.minY)
    out.maxY = Math.max(out.maxY, b.maxY)
  }
  return Number.isFinite(out.minX) && (out.maxX > out.minX || out.maxY > out.minY) ? out : null
}
