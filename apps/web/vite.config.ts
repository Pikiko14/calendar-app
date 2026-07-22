import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

function resolvePkg(name: string) {
  return path.dirname(require.resolve(`${name}/package.json`))
}

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BeautyBook',
        short_name: 'BeautyBook',
        description: 'Gestión y reservas para negocios de belleza',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      vue: path.join(resolvePkg('vue'), 'dist/vue.runtime.esm-bundler.js'),
    },
    dedupe: ['vue'],
  },
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      '@tanstack/vue-query',
      '@vueuse/core',
      'dayjs',
      'chart.js',
      'vue-chartjs',
      '@lucide/vue',
    ],
  },
  server: {
    fs: {
      allow: ['..', '../..'],
    },
  },
})
