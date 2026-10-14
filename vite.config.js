import { defineConfig } from 'vite';
// Rapier (version « compat ») embarque son WebAssembly en base64 : un seul gros module, c'est attendu.
export default defineConfig({
  server: { port: 9000, strictPort: true, host: '127.0.0.1' },
  preview: { port: 9000, strictPort: true, host: '127.0.0.1' },
  build: { chunkSizeWarningLimit: 4000, target: 'es2020' },
});
