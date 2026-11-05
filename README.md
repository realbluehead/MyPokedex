# Visor DWG

Visor web de fitxers **DWG** (pensat per a **DWG 2014**, format `AC1027` / AutoCAD 2013–2017) i **DXF**.
Tot passa al navegador: el fitxer no s'envia a cap servidor, així que es pot publicar a GitHub Pages.

## Com funciona

```
.dwg ──► detectVersion (capçalera "AC1027")
     ──► Web Worker + LibreDWG (WebAssembly) ──► DXF ──► [Descarregar DXF]
     ──► dxf-viewer (three.js / WebGL) ──► dibuix amb zoom, pan, capes
```

| Peça | Fitxer | Què fa |
|---|---|---|
| Detecció de format | `src/cad/detectVersion.ts` | Llegeix els 6 primers bytes del DWG i en treu la versió. |
| Conversor DWG → DXF | `src/cad/dwgConverter.worker.ts`, `src/cad/convertDwg.ts` | [`@mlightcad/libredwg-web`](https://github.com/mlightcad/libredwg-web) (LibreDWG compilat a WASM). Cada fitxer fa servir un worker nou que es tanca en acabar: allibera la memòria i evita que LibreDWG arrossegui estat d'un fitxer a l'altre. |
| Visor | `src/components/CadViewer.tsx`, `src/cad/dxfViewer.worker.ts` | [`dxf-viewer`](https://github.com/vagran/dxf-viewer). El DXF s'analitza en un worker i es dibuixa amb WebGL. |
| Encaix a pantalla | `src/cad/extents.ts` | Calcula uns límits que ignoren entitats aberrants (p. ex. un atribut a coordenades de milions), que si no deixarien el dibuix com un punt invisible. |
| Interfície | `src/App.tsx`, `src/components/LayerPanel.tsx` | Arrossegar i deixar anar, capes, fons clar/fosc, coordenades del cursor, descàrrega del DXF i desat en PNG. |

El fitxer `libredwg-web.wasm` (~11 MB) el gestiona Vite com a asset separat, i només es baixa quan s'obre un DWG.

## Desenvolupament

```bash
npm install
npm run dev       # http://localhost:5173/MyPokedex/
npm run build     # genera dist/
npm run preview
npm run deploy    # publica dist/ a la branca gh-pages
```

## Estat i limitacions

Provat amb fitxers de mostra de LibreDWG:

| Fitxer | Resultat |
|---|---|
| DWG 2013 (`AC1027`, el mateix format que DWG 2014) | ✅ Es converteix en ~0,3 s i es veu bé |
| DWG 2018 (`AC1032`) | ✅ |
| DWG 2000 (`AC1015`) | ❌ LibreDWG‑WASM falla (`function signature mismatch`); es mostra un error |

- **Fidelitat:** les entitats *proxy* (objectes de Civil 3D, MEP…), les referències externes (xrefs) i algunes entitats (ATTDEF, línies amb gruix, tipus de línia discontinus) no es dibuixen o es dibuixen simplificades. Vegeu les [limitacions de dxf-viewer](https://github.com/vagran/dxf-viewer#incomplete-features).
- **Fonts:** les fonts SHX d'AutoCAD se substitueixen per DejaVu Sans (`public/fonts/`).
- **Espai paper / layouts:** de moment només es mostra l'espai model.
- **Mida:** límit de 150 MB per fitxer (memòria del WASM).

## Llicència

LibreDWG i `@mlightcad/libredwg-web` són **GPL‑3.0**, i `dxf-viewer` és MPL‑2.0. Si distribueixes l'aplicació compilada
(p. ex. a GitHub Pages), el conjunt queda sota els termes de la GPL‑3.0. L'Apache‑2.0 del repositori hi és compatible,
però el codi de l'app s'ha de poder obtenir sota GPL‑3.0. La font DejaVu Sans té la seva pròpia llicència lliure (Bitstream Vera).
