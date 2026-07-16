import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  // Workspace package ships TS sources, so it must be bundled into the output.
  noExternal: ['@vtt/shared'],
});
