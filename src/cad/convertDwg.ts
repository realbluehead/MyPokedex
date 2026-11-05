import type { ConverterRequest, ConverterResponse } from './dwgConverter.worker'

export interface DwgConversion {
  dxf: Uint8Array
  ms: number
}

/**
 * Converts a DWG to DXF in a dedicated Web Worker.
 * A fresh worker is used per call and terminated at the end (frees WASM memory).
 */
export function convertDwgToDxf(dwg: ArrayBuffer, signal?: AbortSignal): Promise<DwgConversion> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./dwgConverter.worker.ts', import.meta.url), { type: 'module' })

    const finish = () => {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      finish()
      reject(new DOMException('Conversió cancel·lada', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)

    worker.onmessage = (ev: MessageEvent<ConverterResponse>) => {
      finish()
      if (ev.data.ok) resolve({ dxf: ev.data.dxf, ms: ev.data.ms })
      else reject(new Error(friendly(ev.data.error)))
    }
    worker.onerror = (ev) => {
      finish()
      reject(new Error(ev.message || 'Error inesperat al conversor (possible falta de memòria).'))
    }

    // Copy so the caller keeps its buffer; transfer the copy to the worker.
    const copy = dwg.slice(0)
    worker.postMessage({ dwg: copy } satisfies ConverterRequest, [copy])
  })
}

/** WASM runtime errors are cryptic; explain them while keeping the detail. */
function friendly(error: string) {
  if (/signature mismatch|unreachable|out of bounds|RuntimeError/i.test(error)) {
    return `LibreDWG no ha pogut llegir aquest DWG (pot contenir objectes no suportats o estar malmès). Detall: ${error}`
  }
  return error
}
