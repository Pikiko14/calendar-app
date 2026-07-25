<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, mediaUrl } from '@/api/client'

const features = [
  {
    title: 'Agenda inteligente',
    copy: 'Sin choques de horario. Disponibilidad en tiempo real para cada profesional.',
  },
  {
    title: 'WhatsApp que vende',
    copy: 'Reservas, confirmaciones y recordatorios automáticos desde el chat.',
  },
  {
    title: 'Portal a tu medida',
    copy: 'Tu marca, tus colores, tu enlace. Los clientes reservan en segundos.',
  },
]

type Business = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  primaryColor: string
  address: string | null
  city: string | null
  country: string | null
  title: string
  subtitle: string | null
  workersCount: number
  servicesCount: number
  rating?: { avg: number; count: number } | null
}

type Plan = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  maxWorkers: number | null
  maxServices: number | null
  maxBranches: number | null
  features: unknown
  sortOrder: number
}

const businesses = ref<Business[]>([])
const businessesLoading = ref(true)
const businessesError = ref('')

const plans = ref<Plan[]>([])
const plansLoading = ref(true)

/** Preferir demo oficial; si no, el primer negocio público. */
const demoPortalPath = computed(() => {
  const demo = businesses.value.find((b) => b.slug === 'barberia-premium')
  if (demo) return `/${demo.slug}`
  if (businesses.value[0]) return `/${businesses.value[0].slug}`
  return '/barberia-premium'
})

function placeLabel(b: Business) {
  return [b.city, b.country].filter(Boolean).join(', ')
}

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)
}

function featureList(p: Plan): string[] {
  return Array.isArray(p.features) ? (p.features as string[]) : []
}

function limitLabel(n: number | null) {
  return n == null ? 'Ilimitado' : String(n)
}

onMounted(async () => {
  businessesLoading.value = true
  plansLoading.value = true
  businessesError.value = ''
  try {
    const [biz, planList] = await Promise.all([
      api<Business[]>('/public/businesses'),
      api<Plan[]>('/plans'),
    ])
    businesses.value = biz
    plans.value = planList
  } catch (e) {
    businessesError.value =
      e instanceof Error ? e.message : 'No se pudieron cargar las barberías'
    businesses.value = []
    try {
      plans.value = await api<Plan[]>('/plans')
    } catch {
      plans.value = []
    }
  } finally {
    businessesLoading.value = false
    plansLoading.value = false
  }
})
</script>

<template>
  <div>
    <!-- HERO -->
    <section class="relative min-h-[100svh] overflow-hidden">
      <div class="absolute inset-0 animate-scale-in">
        <img
          src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=2400&q=80"
          alt="Interior de barbería con sillas y espejos"
          class="h-full w-full object-cover"
        />
        <div
          class="absolute inset-0 bg-gradient-to-b from-ink/55 via-ink/45 to-ink/85 dark:from-ink/70 dark:via-ink/60 dark:to-ink"
        />
        <div class="absolute inset-0 bg-mesh opacity-40" />
      </div>

      <div class="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-5 pb-16 pt-28 md:px-8 md:pb-24">
        <p class="font-display animate-fade-up text-display-xl font-extrabold text-white">
          BeautyBook
        </p>
        <h1 class="mt-5 max-w-3xl animate-fade-up-delay text-balance text-2xl font-light leading-snug text-white/90 md:text-4xl">
          La agenda que hace brillar barberías, peluquerías y SPA.
        </h1>
        <p class="mt-5 max-w-lg animate-fade-up-delay-2 text-base leading-relaxed text-white/70 md:text-lg">
          Reservas fluidas, equipo sincronizado y WhatsApp automático. Menos caos, más citas.
        </p>
        <div class="mt-10 flex flex-wrap gap-3 animate-fade-up-delay-2">
          <RouterLink to="/register" class="btn-primary !bg-white !text-ink hover:!bg-mist">
            Crear mi empresa
          </RouterLink>
          <RouterLink
            :to="demoPortalPath"
            class="btn-ghost !border-white/30 !bg-white/10 !text-white hover:!bg-white/20"
          >
            Ver portal demo
          </RouterLink>
        </div>
      </div>

      <div class="pointer-events-none absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 md:block">
        <div class="h-10 w-px animate-float bg-gradient-to-b from-white/0 via-white/60 to-white/0" />
      </div>
    </section>

    <!-- Promesa -->
    <section class="relative overflow-hidden bg-mist px-5 py-24 dark:bg-ink md:px-8 md:py-32">
      <div class="absolute inset-0 bg-mesh opacity-60 dark:opacity-30" />
      <div class="relative mx-auto max-w-5xl text-center">
        <p class="section-eyebrow">Hecho para crecer</p>
        <h2 class="font-display mt-5 text-display-md font-bold text-ink dark:text-mist">
          Belleza en movimiento.<br class="hidden sm:block" />
          Operación en control.
        </h2>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted dark:text-white/55">
          Una plataforma multiempresa pensada como Calendly, con el ritmo de Fresha y la cercanía de Booksy.
        </p>
      </div>
    </section>

    <!-- Features -->
    <section class="border-y border-ink/5 bg-white px-5 py-20 dark:border-white/5 dark:bg-ink-soft md:px-8 md:py-28">
      <div class="mx-auto grid max-w-7xl gap-16 md:grid-cols-3 md:gap-10">
        <article
          v-for="(item, i) in features"
          :key="item.title"
          class="group"
          :style="{ animationDelay: `${i * 0.1}s` }"
        >
          <span class="font-display text-5xl font-bold text-brand-700/20 transition group-hover:text-brand-700/40 dark:text-brand-400/20">
            0{{ i + 1 }}
          </span>
          <h3 class="font-display mt-4 text-2xl font-bold text-ink dark:text-mist">{{ item.title }}</h3>
          <p class="mt-3 text-base leading-relaxed text-ink-muted dark:text-white/55">{{ item.copy }}</p>
        </article>
      </div>
    </section>

    <!-- CTA -->
    <section class="relative overflow-hidden px-5 py-24 md:px-8 md:py-32">
      <div class="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=2000&q=80"
          alt="Salón de belleza con luz natural"
          class="h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-ink/75" />
      </div>
      <div class="relative mx-auto max-w-3xl text-center text-white">
        <h2 class="font-display text-display-md font-bold">Tu marca. Tu ritmo. Tu agenda.</h2>
        <p class="mx-auto mt-5 max-w-xl text-lg text-white/70">
          Empieza en minutos. Invita a tu equipo. Abre el portal y deja que las reservas fluyan.
        </p>
        <div class="mt-10 flex flex-wrap justify-center gap-3">
          <RouterLink to="/register" class="btn-primary !bg-brand-500 hover:!bg-brand-400">
            Empezar gratis
          </RouterLink>
          <RouterLink to="/login" class="btn-ghost !border-white/25 !text-white">
            Ya tengo cuenta
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- BARBERÍAS -->
    <section id="barberias" class="scroll-mt-24 border-y border-ink/5 bg-white px-5 py-20 dark:border-white/5 dark:bg-ink-soft md:px-8 md:py-28">
      <div class="mx-auto max-w-7xl">
        <div class="max-w-2xl">
          <p class="section-eyebrow">En BeautyBook</p>
          <h2 class="font-display mt-4 text-display-md font-bold text-ink dark:text-mist">
            Barberías y salones
          </h2>
          <p class="mt-4 text-lg leading-relaxed text-ink-muted dark:text-white/55">
            Reserva directo en el portal de cada negocio. Sin apps, sin llamadas.
          </p>
        </div>

        <div v-if="businessesLoading" class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="n in 3"
            :key="n"
            class="h-48 animate-pulse rounded-2xl bg-ink/5 dark:bg-white/5"
          />
        </div>

        <p v-else-if="businessesError" class="mt-10 text-sm text-red-600">
          {{ businessesError }}
        </p>

        <div
          v-else-if="!businesses.length"
          class="mt-12 rounded-2xl border border-dashed border-ink/15 px-6 py-14 text-center dark:border-white/15"
        >
          <p class="font-display text-xl font-bold text-ink dark:text-mist">
            Aún no hay negocios públicos
          </p>
          <p class="mx-auto mt-2 max-w-md text-sm text-ink-muted dark:text-white/50">
            Cuando un negocio active la reserva online, aparecerá aquí.
          </p>
          <RouterLink to="/register" class="btn-primary mt-6 inline-flex">
            Registrar el mío
          </RouterLink>
        </div>

        <div v-else class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <RouterLink
            v-for="b in businesses"
            :key="b.id"
            :to="`/${b.slug}`"
            class="group flex flex-col rounded-2xl border border-ink/8 bg-mist/40 p-5 transition hover:border-brand-600/40 hover:bg-brand-50/50 dark:border-white/10 dark:bg-ink/40 dark:hover:border-brand-400/40 dark:hover:bg-brand-950/30"
          >
            <div class="flex items-start gap-4">
              <div
                class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-bold text-white"
                :style="{ backgroundColor: b.primaryColor || '#0F766E' }"
              >
                <img
                  v-if="b.logoUrl"
                  :src="mediaUrl(b.logoUrl)"
                  :alt="b.name"
                  class="h-full w-full object-cover"
                />
                <span v-else>{{ b.name.slice(0, 1).toUpperCase() }}</span>
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-display truncate text-xl font-bold text-ink transition group-hover:text-brand-800 dark:text-mist dark:group-hover:text-brand-300">
                  {{ b.title || b.name }}
                </h3>
                <p v-if="placeLabel(b)" class="mt-1 truncate text-sm text-ink-muted dark:text-white/50">
                  {{ placeLabel(b) }}
                </p>
                <p v-else-if="b.subtitle" class="mt-1 line-clamp-2 text-sm text-ink-muted dark:text-white/50">
                  {{ b.subtitle }}
                </p>
              </div>
            </div>

            <div class="mt-5 flex flex-wrap gap-3 text-xs font-medium text-ink-muted dark:text-white/45">
              <span>{{ b.workersCount }} estilistas</span>
              <span aria-hidden="true">·</span>
              <span>{{ b.servicesCount }} servicios</span>
              <template v-if="b.rating && b.rating.count > 0">
                <span aria-hidden="true">·</span>
                <span>{{ b.rating.avg.toFixed(1) }} ★ ({{ b.rating.count }})</span>
              </template>
            </div>

            <span class="mt-5 text-sm font-semibold text-brand-800 group-hover:underline dark:text-brand-300">
              Reservar →
            </span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- PLANES (debajo de barberías) -->
    <section id="planes" class="scroll-mt-24 bg-mist px-5 py-20 dark:bg-ink md:px-8 md:py-28">
      <div class="mx-auto max-w-7xl">
        <div class="mx-auto max-w-2xl text-center">
          <p class="section-eyebrow">Precios claros</p>
          <h2 class="font-display mt-4 text-display-md font-bold text-ink dark:text-mist">
            Elige tu plan
          </h2>
          <p class="mt-4 text-lg leading-relaxed text-ink-muted dark:text-white/55">
            Desde 2 estilistas hasta todo ilimitado. Cambia cuando crezcas.
          </p>
        </div>

        <div v-if="plansLoading" class="mt-12 grid gap-6 lg:grid-cols-3">
          <div
            v-for="n in 3"
            :key="n"
            class="h-80 animate-pulse rounded-2xl bg-ink/5 dark:bg-white/5"
          />
        </div>

        <div v-else-if="plans.length" class="mt-12 grid gap-6 lg:grid-cols-3">
          <article
            v-for="(p, i) in plans"
            :key="p.id"
            class="relative flex flex-col rounded-2xl border p-6 transition"
            :class="
              i === 1
                ? 'border-brand-600 bg-white shadow-lift dark:border-brand-400 dark:bg-ink-soft'
                : 'border-ink/10 bg-white/70 dark:border-white/10 dark:bg-ink-soft/60'
            "
          >
            <p
              v-if="i === 1"
              class="absolute -top-3 left-6 rounded-full bg-brand-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white"
            >
              Recomendado
            </p>
            <p class="text-xs font-bold uppercase tracking-wide text-ink-muted">{{ p.code }}</p>
            <h3 class="font-display mt-1 text-2xl font-bold text-ink dark:text-mist">{{ p.name }}</h3>
            <p class="mt-3 text-3xl font-bold text-brand-800 dark:text-brand-300">
              {{ formatCop(p.priceMonthly) }}
              <span class="text-sm font-medium text-ink-muted">/ mes</span>
            </p>
            <p v-if="p.description" class="mt-3 text-sm text-ink-muted dark:text-white/55">
              {{ p.description }}
            </p>
            <ul class="mt-5 flex-1 space-y-2.5 text-sm text-ink dark:text-mist/90">
              <template v-if="featureList(p).length">
                <li v-for="(f, fi) in featureList(p)" :key="fi" class="flex gap-2">
                  <span class="text-brand-700">✓</span>
                  {{ f }}
                </li>
              </template>
              <template v-else>
                <li class="flex gap-2">
                  <span class="text-brand-700">✓</span>
                  {{ limitLabel(p.maxWorkers) }} estilistas
                </li>
                <li class="flex gap-2">
                  <span class="text-brand-700">✓</span>
                  {{ limitLabel(p.maxServices) }} servicios
                </li>
                <li class="flex gap-2">
                  <span class="text-brand-700">✓</span>
                  {{ limitLabel(p.maxBranches) }} sedes
                </li>
              </template>
            </ul>
            <RouterLink
              to="/register"
              class="mt-6 block w-full text-center !py-3"
              :class="i === 1 ? 'btn-primary' : 'btn-ghost'"
            >
              Empezar con {{ p.name }}
            </RouterLink>
          </article>
        </div>
      </div>
    </section>

    <footer class="border-t border-ink/5 bg-mist px-5 py-10 dark:border-white/5 dark:bg-ink md:px-8">
      <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p class="font-display text-lg font-bold">BeautyBook</p>
        <p class="text-sm text-ink-muted dark:text-white/40">© {{ new Date().getFullYear() }} — Agenda para negocios de belleza</p>
      </div>
    </footer>
  </div>
</template>
