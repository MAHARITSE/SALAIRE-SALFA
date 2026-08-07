import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Site 100% statique / local (aucun backend). Déployable sur Cloudflare Pages.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
