import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const wamp = loadEnv(mode, process.cwd(), '').VITE_BACKEND === 'wamp' || mode === 'wamp';
  return {
    plugins: [react()],
    base: wamp ? './' : '/',
    define: wamp ? { 'import.meta.env.VITE_BACKEND': JSON.stringify('wamp') } : {},
    resolve: wamp ? { alias: [{ find: '../data/salfa_data.json', replacement: path.resolve('src/data/wamp-empty.json') }] } : {},
    server: { host: '0.0.0.0', port: 3000, strictPort: true, allowedHosts: true },
  };
});
