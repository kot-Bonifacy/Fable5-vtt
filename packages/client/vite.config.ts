import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cel proxy z env: instancja testów E2E (`packages/e2e`) stoi na własnym porcie,
// żeby nie zderzyć się z `pnpm dev` MG na :3001.
const apiTarget = process.env.VTT_API_TARGET ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in the browser — cookies work without CORS; prod mirrors
    // this with a reverse proxy (Caddy, stage 27). `vite preview` inherits it.
    proxy: {
      '/api': apiTarget,
      '/uploads': apiTarget,
      '/public': apiTarget,
      '/socket.io': { target: apiTarget, ws: true },
    },
  },
});
