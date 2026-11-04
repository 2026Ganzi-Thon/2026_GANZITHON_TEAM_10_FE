import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: env.VITE_API_DEVELOPMENT_URL
      ? { proxy: { '/api': { target: env.VITE_API_DEVELOPMENT_URL, changeOrigin: true } } }
      : undefined,
  }
})
