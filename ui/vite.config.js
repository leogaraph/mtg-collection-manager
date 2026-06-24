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
    // Mesmo /api relativo do front: o Vite faz proxy pra API. No dev compose
    // o alvo é 'http://api:3001' (rede Docker) via VITE_API_PROXY; rodando
    // `npm run dev` no host, cai no localhost:3001 padrão.
    proxy: {
      '/api': process.env.VITE_API_PROXY || 'http://localhost:3001',
    },
  },
})
