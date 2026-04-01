import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: resolve(__dirname),
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5188,
    proxy: {
      '/api': {
        target: 'http://localhost:8777',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
