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
    <div class="grain-overlay fixed inset-0 z-[60]" />

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

        <div class="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            :class="[
              'rounded-full px-3 py-2 text-xs font-medium transition',
              isLanding
                ? 'border border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20'
                : 'border border-ink/10 bg-white/60 text-ink hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-mist',
            ]"
            @click="theme.toggle"
          >
            {{ theme.isDark ? 'Claro' : 'Oscuro' }}
          </button>
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
        </div>
      </div>
    </header>

    <RouterView />
  </div>
</template>
