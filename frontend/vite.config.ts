import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const SPA_ROUTES = [
  'crossings',
  'forecasts',
  'trains',
  'planner',
  'saved-places',
  'notifications',
  'data-health',
  'settings',
  'analytics'
];

function spaFallbackPlugin(): Plugin {
  return {
    name: 'spa-fallback-generator',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist');
      const indexFile = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexFile)) return;

      // 404 fallback
      fs.copyFileSync(indexFile, path.join(distDir, '404.html'));

      // Generate static HTML files and directory indexes for all client SPA routes
      for (const route of SPA_ROUTES) {
        fs.copyFileSync(indexFile, path.join(distDir, `${route}.html`));
        const routeDir = path.join(distDir, route);
        if (!fs.existsSync(routeDir)) {
          fs.mkdirSync(routeDir, { recursive: true });
        }
        fs.copyFileSync(indexFile, path.join(routeDir, 'index.html'));
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaFallbackPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
      }
    }
  }
})
