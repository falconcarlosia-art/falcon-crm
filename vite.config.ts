import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Puerto propio para no chocar con apps/web (5173) al levantar ambas a la vez.
  server: { port: 5174 },
  build: {
    // Firebase pesa ~800 kB y casi nunca cambia: en su propio chunk queda en
    // caché entre despliegues de la app.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
        },
      },
    },
  },
})
