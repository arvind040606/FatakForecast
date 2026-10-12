import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function copy404Plugin(): Plugin {
  return {
    name: 'copy-404-fallback',
    closeBundle() {
      const distDir = path.resolve(import.meta.dirname, 'dist')
      const indexFile = path.join(distDir, 'index.html')
      const fallbackFile = path.join(distDir, '404.html')
      if (fs.existsSync(indexFile)) {
        fs.copyFileSync(indexFile, fallbackFile)
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copy404Plugin()],
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
