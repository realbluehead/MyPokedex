import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/MyPokedex/',
  // LibreDWG's Emscripten glue locates its .wasm via `new URL(..., import.meta.url)`;
  // pre-bundling would break that path in dev.
  optimizeDeps: { exclude: ['@mlightcad/libredwg-web'] },
  // Workers use ES modules (needed for the WASM glue and three.js imports).
  worker: { format: 'es' },
  build: { target: 'es2022' },
})
