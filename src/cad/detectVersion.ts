/**
 * Detects the CAD file format from its first bytes, without loading any WASM.
 *
 * Every DWG starts with a 6-byte ASCII version tag ("AC1027" for 2013–2017).
 * A DXF is plain text (or "AutoCAD Binary DXF").
 */

export type CadFileKind = 'dwg' | 'dxf' | 'unknown'

export interface CadFileInfo {
  kind: CadFileKind
  /** Raw tag, e.g. "AC1027". Only for DWG. */
  tag?: string
  /** Human readable release, e.g. "AutoCAD 2013–2017". */
  release?: string
  /** Whether LibreDWG can read this DWG version. */
  supported: boolean
}

const DWG_RELEASES: Record<string, { release: string; supported: boolean }> = {
  AC1012: { release: 'AutoCAD R13', supported: true },
  AC1014: { release: 'AutoCAD R14', supported: true },
  AC1015: { release: 'AutoCAD 2000–2002', supported: true },
  AC1018: { release: 'AutoCAD 2004–2006', supported: true },
  AC1021: { release: 'AutoCAD 2007–2009', supported: true },
  AC1024: { release: 'AutoCAD 2010–2012', supported: true },
  AC1027: { release: 'AutoCAD 2013–2017', supported: true },
  AC1032: { release: 'AutoCAD 2018–2025', supported: true },
}

export function detectCadFile(bytes: ArrayBuffer): CadFileInfo {
  const head = new TextDecoder('latin1').decode(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)))
  const tag = head.slice(0, 6)

  if (/^AC\d{4}$/.test(tag)) {
    const known = DWG_RELEASES[tag]
    return {
      kind: 'dwg',
      tag,
      release: known?.release ?? `Versió desconeguda (${tag})`,
      supported: known?.supported ?? false,
    }
  }

  // Text DXF begins with group code 0 / SECTION, optionally preceded by 999 comments.
  if (/^\s*(0|999)\s*\r?\n/.test(head) || head.startsWith('AutoCAD Binary DXF')) {
    return { kind: 'dxf', supported: true }
  }

  return { kind: 'unknown', supported: false }
}
