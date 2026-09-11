import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    // @base44/vite-plugin used to wire this up; every file under src/ imports
    // via "@/..." (see components.json's aliases too), so this alias has to
    // exist for the app to build at all now that the plugin is gone.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
});
