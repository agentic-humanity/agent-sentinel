import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const webRoot = resolve(__dirname)
const repoRoot = resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const serverPort = env.PORT || '8777'
  const apiProxy = `http://localhost:${serverPort}`

  return {
    root: webRoot,
    envDir: repoRoot,
    plugins: [vue(), tailwindcss()],
    define: {
      'import.meta.env.VITE_SERVER_PORT': JSON.stringify(serverPort),
    },
    server: {
      port: 5188,
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          widget: resolve(__dirname, 'widget.html'),
        },
      },
    },
  }
})
