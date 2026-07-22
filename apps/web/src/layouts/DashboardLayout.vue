<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  LayoutDashboard,
  CalendarDays,
  Scissors,
  UsersRound,
  Contact,
  Settings2,
  LogOut,
  SunMedium,
  MoonStar,
  ExternalLink,
} from '@lucide/vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { mediaUrl } from '@/api/client'
import { applyBrandTheme } from '@/lib/brand'

const route = useRoute()
const router = useRouter()
const theme = useThemeStore()
const auth = useAuthStore()

const tenantLogo = computed(() => mediaUrl(auth.user?.tenant?.logoUrl))
const tenantName = computed(() => auth.user?.tenant?.name || 'Tu negocio')
const tenantInitial = computed(() => (tenantName.value || 'N').slice(0, 1).toUpperCase())

const nav = [
  { label: 'Inicio', to: '/app', icon: LayoutDashboard },
  { label: 'Calendario', to: '/app/calendar', icon: CalendarDays },
  { label: 'Servicios', to: '/app/services', icon: Scissors },
  { label: 'Equipo', to: '/app/workers', icon: UsersRound },
  { label: 'Clientes', to: '/app/clients', icon: Contact },
  { label: 'Ajustes', to: '/app/settings', icon: Settings2 },
]

function isActive(to: string) {
  if (to === '/app') return route.path === '/app'
  return route.path.startsWith(to)
}

async function logout() {
  auth.signOut()
  await router.push('/login')
}

onMounted(async () => {
  if (!auth.user && localStorage.getItem('beautybook-token')) {
    await auth.fetchMe()
  } else if (auth.user?.tenant?.primaryColor) {
    applyBrandTheme(auth.user.tenant.primaryColor)
  }
})

watch(
  () => auth.user?.tenant?.primaryColor,
  (color) => {
    if (color) applyBrandTheme(color)
  },
)
</script>

<template>
  <div class="min-h-screen bg-mist text-ink dark:bg-ink dark:text-mist">
    <div class="grain-overlay fixed inset-0 z-50 opacity-[0.03]" />

    <aside
      class="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-black/5 bg-white/70 p-5 backdrop-blur-xl dark:border-white/5 dark:bg-ink-soft/80 md:flex md:flex-col"
    >
      <RouterLink to="/app" class="flex items-center gap-3 px-2">
        <div
          class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-brand-700/15 bg-brand-50 shadow-soft dark:border-white/10 dark:bg-brand-950/40"
        >
          <img
            v-if="tenantLogo"
            :src="tenantLogo"
            :alt="tenantName"
            class="h-full w-full object-contain p-1"
          />
          <span v-else class="font-display text-lg font-bold text-brand-800 dark:text-brand-300">
            {{ tenantInitial }}
          </span>
        </div>
        <div class="min-w-0">
          <p class="truncate font-display text-lg font-bold tracking-tight text-ink dark:text-mist">
            {{ tenantName }}
          </p>
          <p class="text-[11px] font-medium text-ink-muted">BeautyBook</p>
        </div>
      </RouterLink>

      <nav class="mt-8 flex-1 space-y-1">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          :class="[
            'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition',
            isActive(item.to)
              ? 'bg-brand-700 text-white shadow-glow'
              : 'text-ink-muted hover:bg-brand-50 hover:text-brand-900 dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white',
          ]"
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0 opacity-90" :stroke-width="2" />
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="mt-auto space-y-2 border-t border-black/5 pt-4 dark:border-white/5">
        <RouterLink
          :to="`/${auth.user?.tenant?.slug || 'barberia-premium'}`"
          class="flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-ink-muted transition hover:bg-brand-50 hover:text-brand-800 dark:text-white/40 dark:hover:bg-white/5"
        >
          <ExternalLink class="h-4 w-4" />
          Portal público
        </RouterLink>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950/30"
          @click="logout"
        >
          <LogOut class="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>

    <main class="md:ml-64">
      <header
        class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-black/5 bg-mist/80 px-5 backdrop-blur-xl dark:border-white/5 dark:bg-ink/80 md:px-9"
      >
        <RouterLink to="/app" class="flex items-center gap-2 font-display font-bold text-brand-800 dark:text-brand-300 md:hidden">
          <img
            v-if="tenantLogo"
            :src="tenantLogo"
            :alt="tenantName"
            class="h-8 w-8 rounded-xl object-contain"
          />
          <span class="truncate max-w-[10rem]">{{ tenantName }}</span>
        </RouterLink>
        <div class="hidden items-center gap-3 md:flex">
          <div
            class="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
          >
            {{ (auth.displayName || 'U').slice(0, 1).toUpperCase() }}
          </div>
          <div>
            <p class="text-sm font-semibold leading-tight">{{ auth.displayName || 'Sesión activa' }}</p>
            <p class="text-xs text-ink-muted">{{ auth.user?.role || 'ADMIN' }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-2 text-xs font-medium transition hover:border-brand-600 dark:border-white/10 dark:bg-white/5"
            @click="theme.toggle"
          >
            <MoonStar v-if="!theme.isDark" class="h-3.5 w-3.5" />
            <SunMedium v-else class="h-3.5 w-3.5" />
            {{ theme.isDark ? 'Claro' : 'Oscuro' }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 md:hidden"
            @click="logout"
          >
            <LogOut class="h-3.5 w-3.5" />
            Salir
          </button>
        </div>
      </header>

      <div class="mx-auto max-w-7xl p-5 md:p-9">
        <RouterView />
      </div>
    </main>
  </div>
</template>
