import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) return 'three'
            if (id.includes('vue')) return 'vue-vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9969,
    proxy: {
      '/mars-elevation': {
        target: 'https://mw1.google.com/mw-planetary/mars/elevation',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mars-elevation/, ''),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/__tests__/**',
        'src/**/*.test.ts',
        'src/lib/**/index.ts',
      ],
    },
  },
})
