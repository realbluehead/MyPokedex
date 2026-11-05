/// <reference lib="webworker" />
/**
 * Web Worker: DWG → DXF with LibreDWG compiled to WebAssembly.
 *
 * One worker = one conversion. The caller terminates it afterwards, which frees
 * all WASM memory and avoids LibreDWG state leaking between files.
 */
import { LibreDwg } from '@mlightcad/libredwg-web'

export type ConverterRequest = { dwg: ArrayBuffer }

export type ConverterResponse =
  | { ok: true; dxf: Uint8Array; ms: number }
  | { ok: false; error: string }

self.onmessage = async (ev: MessageEvent<ConverterRequest>) => {
  const t0 = performance.now()
  try {
    const libredwg = await LibreDwg.create()
    const dxf = libredwg.dwg_write_dxf(ev.data.dwg)
    if (!dxf || dxf.byteLength === 0) {
      post({ ok: false, error: 'LibreDWG no ha pogut convertir el fitxer (pot estar malmès o tenir objectes no suportats).' })
      return
    }
    // Copy out of the WASM heap so the buffer can be transferred.
    const out = dxf.slice()
    post({ ok: true, dxf: out, ms: Math.round(performance.now() - t0) }, [out.buffer])
  } catch (e) {
    post({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
}

function post(msg: ConverterResponse, transfer: Transferable[] = []) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)
}
