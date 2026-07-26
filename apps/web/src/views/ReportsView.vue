<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { BarChart3, Download } from '@lucide/vue'
import { api, API_ORIGIN } from '@/api/client'
import { toastError } from '@/lib/swal'

type Overview = {
  revenueTotal: number
  invoicesCount?: number
  paymentsCount: number
  breakdown?: {
    appointments: number
    packages: number
    giftCards: number
    other: number
  }
  appointments: number
  completed: number
  cancelled: number
  noShows: number
  noShowRate: number
  topServices: Array<{ name: string; count: number; revenue: number }>
  topWorkers: Array<{ name: string; count: number; revenue: number; commission: number }>
}

const loading = ref(true)
const error = ref('')
const overview = ref<Overview | null>(null)
const from = ref(new Date().toISOString().slice(0, 10))
const to = ref(new Date().toISOString().slice(0, 10))

function money(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n || 0)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    // Solo YYYY-MM-DD: el backend aplica zona América/Bogotá
    overview.value = await api<Overview>(
      `/reports/overview?from=${from.value}&to=${to.value}`,
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudieron cargar reportes'
    overview.value = null
  } finally {
    loading.value = false
  }
}

async function downloadCsv() {
  try {
    const token = localStorage.getItem('beautybook-token')
    const base =
      (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
      `${API_ORIGIN}/api/v1`
    const url = `${base}/reports/revenue.csv?from=${from.value}&to=${to.value}`
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('No se pudo descargar CSV')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ingresos-${from.value}-${to.value}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (e) {
    await toastError('CSV', e instanceof Error ? e.message : 'Error')
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-brand-700 dark:text-brand-300">Panel</p>
        <h1 class="font-display text-3xl font-bold tracking-tight">Reportes</h1>
        <p class="mt-1 text-sm text-ink-muted">
          Ingresos por facturas pagadas (citas, paquetes y gift cards).
        </p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="text-xs text-ink-muted">
          Desde
          <input
            v-model="from"
            type="date"
            class="mt-1 block rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
          />
        </label>
        <label class="text-xs text-ink-muted">
          Hasta
          <input
            v-model="to"
            type="date"
            class="mt-1 block rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
          />
        </label>
        <button class="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white" @click="load">
          Actualizar
        </button>
        <button
          class="inline-flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10"
          @click="downloadCsv"
        >
          <Download class="h-4 w-4" /> CSV
        </button>
      </div>
    </header>

    <p
      v-if="error"
      class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
    >
      {{ error }}
    </p>
    <p v-else-if="loading" class="text-sm text-ink-muted">Cargando…</p>

    <template v-else-if="overview">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article class="surface p-4">
          <p class="text-xs text-ink-muted">Ingresos</p>
          <p class="mt-1 font-display text-2xl font-bold">{{ money(overview.revenueTotal) }}</p>
          <p class="text-xs text-ink-muted">
            {{ overview.invoicesCount ?? overview.paymentsCount }} factura{{
              (overview.invoicesCount ?? overview.paymentsCount) === 1 ? '' : 's'
            }}
          </p>
        </article>
        <article class="surface p-4">
          <p class="text-xs text-ink-muted">Citas</p>
          <p class="mt-1 font-display text-2xl font-bold">{{ overview.appointments }}</p>
          <p class="text-xs text-ink-muted">{{ overview.completed }} completadas</p>
        </article>
        <article class="surface p-4">
          <p class="text-xs text-ink-muted">No-show</p>
          <p class="mt-1 font-display text-2xl font-bold">{{ overview.noShows }}</p>
          <p class="text-xs text-ink-muted">{{ overview.noShowRate }}% del total</p>
        </article>
        <article class="surface p-4">
          <p class="text-xs text-ink-muted">Canceladas</p>
          <p class="mt-1 font-display text-2xl font-bold">{{ overview.cancelled }}</p>
          <p class="text-xs text-ink-muted flex items-center gap-1">
            <BarChart3 class="h-3.5 w-3.5" /> periodo
          </p>
        </article>
      </div>

      <div v-if="overview.breakdown" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article class="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
          <p class="text-xs text-ink-muted">Citas facturadas</p>
          <p class="mt-1 text-lg font-bold">{{ money(overview.breakdown.appointments) }}</p>
        </article>
        <article class="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
          <p class="text-xs text-ink-muted">Paquetes</p>
          <p class="mt-1 text-lg font-bold">{{ money(overview.breakdown.packages) }}</p>
        </article>
        <article class="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
          <p class="text-xs text-ink-muted">Gift cards</p>
          <p class="mt-1 text-lg font-bold">{{ money(overview.breakdown.giftCards) }}</p>
        </article>
        <article class="rounded-2xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/5">
          <p class="text-xs text-ink-muted">Otros</p>
          <p class="mt-1 text-lg font-bold">{{ money(overview.breakdown.other) }}</p>
        </article>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <section class="surface p-5">
          <h2 class="font-display text-lg font-semibold">Servicios top</h2>
          <p class="mt-1 text-xs text-ink-muted">Solo facturas de citas (no paquetes ni gift cards).</p>
          <ul class="mt-4 space-y-2">
            <li
              v-for="s in overview.topServices"
              :key="s.name"
              class="flex items-center justify-between gap-3 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/5"
            >
              <span>{{ s.name }} <span class="text-ink-muted">({{ s.count }})</span></span>
              <b>{{ money(s.revenue) }}</b>
            </li>
            <li v-if="!overview.topServices.length" class="text-sm text-ink-muted">Sin datos.</li>
          </ul>
        </section>
        <section class="surface p-5">
          <h2 class="font-display text-lg font-semibold">Estilistas + comisión</h2>
          <p class="mt-1 text-xs text-ink-muted">Comisión sobre facturas de citas.</p>
          <ul class="mt-4 space-y-2">
            <li
              v-for="w in overview.topWorkers"
              :key="w.name"
              class="flex items-center justify-between gap-3 border-b border-black/5 py-2 text-sm last:border-0 dark:border-white/5"
            >
              <span>{{ w.name }} <span class="text-ink-muted">({{ w.count }})</span></span>
              <span class="text-right">
                <b class="block">{{ money(w.revenue) }}</b>
                <span class="text-xs text-ink-muted">Comisión {{ money(w.commission) }}</span>
              </span>
            </li>
            <li v-if="!overview.topWorkers.length" class="text-sm text-ink-muted">Sin datos.</li>
          </ul>
        </section>
      </div>
    </template>
  </div>
</template>
