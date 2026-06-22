import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',   // expõe para fora do container
    port: 5173,
    watch: {
      usePolling: true,  // necessário dentro de container Docker no Windows
      interval: 500,
    },
  },
})
