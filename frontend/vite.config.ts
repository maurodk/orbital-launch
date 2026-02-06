import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['react-icons', 'lucide-react', 'react-select'],
          'supabase': ['@supabase/supabase-js'],
          'axios': ['axios'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
    target: 'esnext',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  server: {
    hmr: {
      overlay: false,
    },
  },
})
