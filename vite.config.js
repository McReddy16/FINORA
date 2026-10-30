import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Charts are the heaviest dependency; keep them out of the main app chunk.
        manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'dexie'] },
      },
    },
  },
})
