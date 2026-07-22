<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js'
import {
  CalendarDays,
  Users,
  Wallet,
  XCircle,
  UserX,
  Plus,
  Scissors,
  UserRound,
  Settings2,
  ArrowUpRight,
  Sparkles,
  TrendingUp,
  Clock3,
} from '@lucide/vue'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
  Legend,
)

type Metrics = {
  today: number
  completedToday: number
  revenue: number
  cancelled: number
  noShows: number
  weekly: { labels: string[]; data: number[] }
  monthly: { labels: string[]; data: number[] }
  topServices: { id: string; name: string; count: number }[]
  topWorkers: { id: string; name: string; count: number }[]
}

const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const metrics = ref<Metrics | null>(null)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
})

const todayLabel = computed(() =>
  new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }),
)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: {
      grid: { color: 'rgba(148,163,184,.12)' },
      border: { display: false },
      ticks: { color: '#3D5A54', font: { family: 'Outfit' } },
    },
    x: {
      grid: { display: false },
      border: { display: false },
      ticks: { color: '#3D5A54', font: { family: 'Outfit' } },
    },
  },
}

const weekChart = computed(() => ({
  labels: metrics.value?.weekly.labels ?? [],
  datasets: [
    {
      label: 'Reservas',
      data: metrics.value?.weekly.data ?? [],
      borderColor: '#0f766e',
      backgroundColor: 'rgba(15,118,110,.12)',
      fill: true,
      tension: 0.45,
      pointRadius: 0,
      borderWidth: 2.5,
    },
  ],
}))

const monthChart = computed(() => ({
  labels: metrics.value?.monthly.labels ?? [],
  datasets: [
    {
      label: 'Ingresos',
      data: metrics.value?.monthly.data ?? [],
      backgroundColor: '#0f766e',
      borderRadius: 10,
      barThickness: 28,
    },
  ],
}))

const stats = computed(() => [
  {
    label: 'Reservas hoy',
    value: String(metrics.value?.today ?? 0),
    hint: 'En agenda',
    icon: CalendarDays,
    tone: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
  },
  {
    label: 'Atendidos',
    value: String(metrics.value?.completedToday ?? 0),
    hint: 'Completadas',
    icon: Users,
    tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  },
  {
    label: 'Ingresos hoy',
    value: Number(metrics.value?.revenue ?? 0).toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }),
    hint: 'Pagos confirmados',
    icon: Wallet,
    tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  },
  {
    label: 'Cancelaciones',
    value: String(metrics.value?.cancelled ?? 0),
    hint: 'Hoy',
    icon: XCircle,
    tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  },
  {
    label: 'No-shows',
    value: String(metrics.value?.noShows ?? 0),
    hint: 'Sin asistencia',
    icon: UserX,
    tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  },
])

const quickActions = [
  {
    to: '/app/calendar',
    title: 'Nueva cita',
    desc: 'Abrir agenda',
    icon: Plus,
    color: 'bg-brand-700 text-white',
  },
  {
    to: '/app/services',
    title: 'Servicios',
    desc: 'Precios y duración',
    icon: Scissors,
    color: 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300',
  },
  {
    to: '/app/workers',
    title: 'Equipo',
    desc: 'Horarios y fotos',
    icon: UserRound,
    color: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  {
    to: '/app/clients',
    title: 'Clientes',
    desc: 'Historial',
    icon: Users,
    color: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  {
    to: '/app/settings',
    title: 'Ajustes',
    desc: 'Marca y zona',
    icon: Settings2,
    color: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
]

onMounted(async () => {
  try {
    metrics.value = await api<Metrics>('/dashboard')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar el dashboard'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="animate-fade-in space-y-8">
    <!-- Hero header -->
    <div
      class="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-7 text-white shadow-lift md:px-8 md:py-9"
    >
      <div class="absolute inset-0 bg-mesh opacity-40" />
      <div
        class="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-500/30 blur-3xl"
      />
      <div
        class="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-brand-300/20 blur-3xl"
      />

      <div class="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles class="h-3.5 w-3.5" />
            {{ todayLabel }}
          </div>
          <h1 class="font-display mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            {{ greeting }}{{ auth.displayName ? `, ${auth.displayName.split(' ')[0]}` : '' }}
          </h1>
          <p class="mt-2 max-w-lg text-sm text-white/65 md:text-base">
            {{ auth.user?.tenant?.name || 'Tu negocio' }} · panorama del día y accesos rápidos
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <RouterLink
            to="/app/calendar"
            class="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5"
          >
            <CalendarDays class="h-4 w-4" />
            Ver calendario
          </RouterLink>
          <RouterLink
            :to="`/${auth.user?.tenant?.slug || 'barberia-premium'}`"
            class="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
          >
            Portal público
            <ArrowUpRight class="h-4 w-4" />
          </RouterLink>
        </div>
      </div>
    </div>

    <p v-if="error" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <!-- Quick actions -->
    <div>
      <div class="mb-4 flex items-center gap-2">
        <Clock3 class="h-4 w-4 text-brand-700" />
        <h2 class="font-display text-lg font-bold">Acciones rápidas</h2>
      </div>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <RouterLink
          v-for="action in quickActions"
          :key="action.to"
          :to="action.to"
          class="group surface flex items-center gap-3 p-4 transition duration-300 hover:-translate-y-1 hover:shadow-lift"
        >
          <span
            class="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition group-hover:scale-105"
            :class="action.color"
          >
            <component :is="action.icon" class="h-5 w-5" />
          </span>
          <span class="min-w-0">
            <span class="block text-sm font-semibold">{{ action.title }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ action.desc }}</span>
          </span>
        </RouterLink>
      </div>
    </div>

    <div v-if="loading" class="surface p-8 text-center text-ink-muted">
      Cargando métricas…
    </div>

    <template v-else>
      <!-- Stats -->
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article
          v-for="stat in stats"
          :key="stat.label"
          class="surface group relative overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lift"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm text-ink-muted dark:text-white/45">{{ stat.label }}</p>
              <strong class="mt-3 block font-display text-2xl font-bold tracking-tight xl:text-3xl">
                {{ stat.value }}
              </strong>
              <p class="mt-1 text-xs text-ink-muted">{{ stat.hint }}</p>
            </div>
            <span
              class="grid h-11 w-11 place-items-center rounded-2xl transition group-hover:scale-110"
              :class="stat.tone"
            >
              <component :is="stat.icon" class="h-5 w-5" />
            </span>
          </div>
        </article>
      </div>

      <!-- Charts -->
      <div class="grid gap-6 lg:grid-cols-2">
        <article class="surface p-6">
          <div class="mb-1 flex items-center justify-between">
            <div>
              <h2 class="font-display text-xl font-bold">Reservas esta semana</h2>
              <p class="text-xs text-ink-muted">Flujo diario</p>
            </div>
            <span class="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <TrendingUp class="h-5 w-5" />
            </span>
          </div>
          <div class="mt-5 h-56">
            <Line :data="weekChart" :options="chartOptions" />
          </div>
        </article>
        <article class="surface p-6">
          <div class="mb-1 flex items-center justify-between">
            <div>
              <h2 class="font-display text-xl font-bold">Ingresos del mes</h2>
              <p class="text-xs text-ink-muted">Pagos registrados</p>
            </div>
            <span class="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Wallet class="h-5 w-5" />
            </span>
          </div>
          <div class="mt-5 h-56">
            <Bar :data="monthChart" :options="chartOptions" />
          </div>
        </article>
      </div>

      <!-- Rankings -->
      <div class="grid gap-6 md:grid-cols-2">
        <article class="surface p-6">
          <div class="mb-5 flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              <Scissors class="h-5 w-5" />
            </span>
            <div>
              <h2 class="font-display text-xl font-bold">Servicios top</h2>
              <p class="text-xs text-ink-muted">Más solicitados</p>
            </div>
          </div>
          <ol class="space-y-3">
            <li
              v-for="(row, i) in metrics?.topServices || []"
              :key="row.id"
              class="flex items-center justify-between rounded-2xl bg-mist/80 px-4 py-3 dark:bg-white/5"
            >
              <span class="flex items-center gap-3 text-sm">
                <span
                  class="grid h-8 w-8 place-items-center rounded-xl bg-white text-xs font-bold text-brand-700 shadow-sm dark:bg-ink-soft"
                >
                  {{ i + 1 }}
                </span>
                {{ row.name }}
              </span>
              <b class="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                {{ row.count }}
              </b>
            </li>
            <li v-if="!metrics?.topServices?.length" class="text-sm text-ink-muted">Sin datos aún</li>
          </ol>
        </article>

        <article class="surface p-6">
          <div class="mb-5 flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <UserRound class="h-5 w-5" />
            </span>
            <div>
              <h2 class="font-display text-xl font-bold">Equipo destacado</h2>
              <p class="text-xs text-ink-muted">Más citas asignadas</p>
            </div>
          </div>
          <ol class="space-y-3">
            <li
              v-for="(row, i) in metrics?.topWorkers || []"
              :key="row.id"
              class="flex items-center justify-between rounded-2xl bg-mist/80 px-4 py-3 dark:bg-white/5"
            >
              <span class="flex items-center gap-3 text-sm">
                <span
                  class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                >
                  {{ row.name.slice(0, 1) }}
                </span>
                <span>
                  <span class="block font-medium">{{ row.name }}</span>
                  <span class="text-xs text-ink-muted">#{{ i + 1 }} del equipo</span>
                </span>
              </span>
              <b class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {{ row.count }}
              </b>
            </li>
            <li v-if="!metrics?.topWorkers?.length" class="text-sm text-ink-muted">Sin datos aún</li>
          </ol>
        </article>
      </div>
    </template>
  </section>
</template>
