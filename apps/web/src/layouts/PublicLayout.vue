<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const theme = useThemeStore()
const isLanding = computed(() => route.path === '/')
</script>

<template>
  <div class="relative min-h-screen overflow-x-hidden bg-mist text-ink dark:bg-ink dark:text-mist">
    <div class="grain-overlay fixed inset-0 z-[60] pointer-events-none" />

    <header
      :class="[
        'z-50 w-full',
        isLanding ? 'absolute inset-x-0 top-0' : 'sticky top-0 border-b border-ink/5 bg-mist/80 backdrop-blur-xl dark:border-white/5 dark:bg-ink/80',
      ]"
    >
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8 md:py-6">
        <RouterLink
          to="/"
          :class="[
            'font-display text-xl font-bold tracking-tight transition hover:opacity-80 md:text-2xl',
            isLanding ? 'text-white mix-blend-difference' : 'text-brand-800 dark:text-brand-300',
          ]"
        >
          BeautyBook
        </RouterLink>

        <nav class="flex items-center gap-3 md:gap-5">
          <a
            v-if="isLanding"
            href="#planes"
            class="hidden text-sm font-medium text-white/90 transition hover:text-white sm:inline"
          >
            Planes
          </a>
          <a
            v-if="isLanding"
            href="#barberias"
            class="hidden text-sm font-medium text-white/90 transition hover:text-white sm:inline"
          >
            Barberías
          </a>
          <RouterLink
            to="/login"
            :class="[
              'hidden text-sm font-medium transition sm:inline',
              isLanding ? 'text-white/90 hover:text-white' : 'text-ink-muted hover:text-ink dark:text-white/60 dark:hover:text-white',
            ]"
          >
            Entrar
          </RouterLink>
          <RouterLink
            to="/register"
            :class="isLanding ? 'btn-primary !bg-white !px-4 !py-2.5 !text-ink hover:!bg-mist' : 'btn-primary !px-4 !py-2.5'"
          >
            Empezar
          </RouterLink>
        </nav>
      </div>
    </header>

    <RouterView />

    <!-- Tema: control flotante, fuera de la navbar -->
    <button
      type="button"
      class="fixed bottom-5 right-5 z-[70] rounded-full border border-ink/10 bg-white/90 px-3.5 py-2.5 text-xs font-semibold text-ink shadow-soft backdrop-blur-md transition hover:border-brand-600 hover:text-brand-800 dark:border-white/15 dark:bg-ink/90 dark:text-mist dark:hover:border-brand-400 dark:hover:text-brand-300"
      :aria-label="theme.isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      @click="theme.toggle"
    >
      {{ theme.isDark ? 'Claro' : 'Oscuro' }}
    </button>
  </div>
</template>
