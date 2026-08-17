import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// New admin builder (React/Tailwind/shadcn). Builds to public/admin-app/ during
// migration so it coexists with the legacy public/admin/index.html — see
// src/index.js's '/app' route. At cutover, outDir moves to public/admin/.
export default defineConfig({
  root: __dirname,
  // Built asset URLs must be namespaced under /admin-app/ (not root-relative)
  // so the Worker's static-asset serving finds them at their real path
  // (public/admin-app/assets/...) — see RESERVED in src/index.js.
  base: '/admin-app/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5183,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../public/admin-app'),
    emptyOutDir: true,
  },
});
