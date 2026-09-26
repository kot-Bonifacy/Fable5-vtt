import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  // Workspace package ships TS sources, so it must be bundled into the output.
  noExternal: ['@vtt/shared'],
  // tsup domyślnie zdejmuje `node:` z importów, a `sqlite` (kopie zapasowe,
  // `snapshots.ts`) istnieje wyłącznie jako `node:sqlite` — bez tego `dist/`
  // pada na starcie (znalezione w T1 testów bety, 26.09.2026).
  removeNodeProtocol: false,
});
