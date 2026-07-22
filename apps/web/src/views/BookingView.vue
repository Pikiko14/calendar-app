<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, mediaUrl } from '@/api/client'
import dayjs from 'dayjs'
import { Users } from '@lucide/vue'
import StarRating from '@/components/StarRating.vue'
import { applyBrandTheme, resetBrandTheme } from '@/lib/brand'

type Service = { id: string; name: string; durationMinutes: number; price: string | number }
type Worker = {
  id: string
  firstName: string
  lastName: string
  photoUrl?: string | null
  specialties?: string[] | string
  color?: string
  ratingAvg?: number
  ratingCount?: number
}
type Tenant = {
  name: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string
  currency?: string
  timezone?: string
  rating?: { avg: number; count: number; stylistCount: number }
  settings?: {
    maxBookingDaysAhead?: number
    minBookingNoticeMinutes?: number
    allowOnlineBooking?: boolean
  }
}

const route = useRoute()
const slug = computed(() => String(route.params.tenantSlug))

const step = ref(1)
const tenant = ref<Tenant | null>(null)
const services = ref<Service[]>([])
const workers = ref<Worker[]>([])
const slots = ref<string[]>([])
const loading = ref(true)
const error = ref('')
const confirmed = ref(false)
const bookingResult = ref<{ startAt: string } | null>(null)

const serviceId = ref('')
const workerId = ref('')
const autoWorker = ref(true)
const date = ref('')
const startAt = ref('')
const firstName = ref('')
const lastName = ref('')
const phone = ref('')

const dates = computed(() => {
  const ahead = Math.min(tenant.value?.settings?.maxBookingDaysAhead ?? 14, 60)
  const count = Math.max(ahead, 1)
  return Array.from({ length: count }, (_, i) =>
    dayjs().add(i + 1, 'day').format('YYYY-MM-DD'),
  )
})

const canNext = computed(() => {
  if (step.value === 1) return Boolean(serviceId.value)
  if (step.value === 2) return autoWorker.value || Boolean(workerId.value)
  if (step.value === 3) return Boolean(date.value)
  if (step.value === 4) return Boolean(startAt.value)
  if (step.value === 5) return firstName.value && lastName.value && phone.value.length >= 8
  return false
})

const selectedService = computed(() => services.value.find((s) => s.id === serviceId.value))
const selectedWorker = computed(() => workers.value.find((w) => w.id === workerId.value))

onMounted(async () => {
  try {
    tenant.value = await api<Tenant>(`/public/${slug.value}`)
    if (!tenant.value) throw new Error('Negocio no encontrado')
    applyBrandTheme(tenant.value.primaryColor)
    services.value = await api<Service[]>(`/public/${slug.value}/services`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar el portal'
    resetBrandTheme()
  } finally {
    loading.value = false
  }
})

async function loadWorkersForService(id: string) {
  if (!id) {
    workers.value = []
    return
  }
  try {
    let list = await api<Worker[]>(
      `/public/${slug.value}/workers?serviceId=${id}`,
    )
    if (!list?.length) {
      list = await api<Worker[]>(`/public/${slug.value}/workers`)
    }
    workers.value = list || []
  } catch {
    workers.value = []
  }
}

watch(serviceId, (id) => {
  void loadWorkersForService(id)
})

watch(step, (n) => {
  if (n === 2 && serviceId.value && !workers.value.length) {
    void loadWorkersForService(serviceId.value)
  }
})

function specialtyLabel(w: Worker) {
  const fromLinks = (w as any).specialtyLinks
    ?.map((l: { specialty?: { name?: string } }) => l.specialty?.name)
    .filter(Boolean)
  if (fromLinks?.length) return fromLinks.slice(0, 2).join(' · ')
  const raw = w.specialties
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw
      ? raw.split(/[,\s]+/).filter(Boolean)
      : []
  return list.slice(0, 2).join(' · ')
}

watch([date, workerId, serviceId, autoWorker], async () => {
  if (!date.value || !serviceId.value) return
  const wid = autoWorker.value ? workers.value[0]?.id : workerId.value
  if (!wid) {
    slots.value = []
    return
  }
  if (autoWorker.value) {
    const all = new Set<string>()
    for (const w of workers.value) {
      const list = await api<string[]>(
        `/public/${slug.value}/availability?serviceId=${serviceId.value}&workerId=${w.id}&date=${date.value}`,
      )
      list.forEach((s) => all.add(s))
    }
    slots.value = [...all].sort()
  } else {
    slots.value = await api<string[]>(
      `/public/${slug.value}/availability?serviceId=${serviceId.value}&workerId=${wid}&date=${date.value}`,
    )
  }
})

async function next() {
  if (!canNext.value) return
  if (step.value < 5) {
    step.value++
    return
  }
  try {
    error.value = ''
    let wid = workerId.value
    if (autoWorker.value) {
      for (const w of workers.value) {
        const list = await api<string[]>(
          `/public/${slug.value}/availability?serviceId=${serviceId.value}&workerId=${w.id}&date=${date.value}`,
        )
        if (list.includes(startAt.value)) {
          wid = w.id
          break
        }
      }
    }
    bookingResult.value = await api(`/public/${slug.value}/book`, {
      method: 'POST',
      body: JSON.stringify({
        firstName: firstName.value,
        lastName: lastName.value,
        phone: phone.value,
        serviceId: serviceId.value,
        workerId: wid,
        startAt: startAt.value,
      }),
    })
    confirmed.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo confirmar la reserva'
  }
}

function money(v: string | number) {
  return Number(v).toLocaleString('es-CO', {
    style: 'currency',
    currency: tenant.value?.currency || 'COP',
    maximumFractionDigits: 0,
  })
}

function shortName(name: string, max = 28) {
  const clean = name.trim()
  if (clean.length <= max) return clean
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

function initials(w: Worker) {
  return `${w.firstName?.[0] || ''}${w.lastName?.[0] || ''}`.toUpperCase()
}
</script>

<template>
  <main class="relative mx-auto max-w-xl px-5 py-12 md:py-16">
    <div class="absolute inset-x-0 top-0 -z-10 h-72 bg-mesh opacity-70" />

    <div v-if="loading" class="py-24 text-center text-ink-muted">Cargando portal…</div>

    <div v-else-if="!tenant" class="py-24 text-center">
      <h1 class="font-display text-display-md font-bold">Portal no encontrado</h1>
      <RouterLink to="/" class="btn-primary mt-8 inline-flex">Volver a BeautyBook</RouterLink>
    </div>

    <template v-else>
      <div class="animate-fade-up text-center">
        <div class="mx-auto mb-5 grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border border-brand-700/15 bg-white shadow-soft dark:border-white/10 dark:bg-ink-soft">
          <img
            v-if="tenant.logoUrl"
            :src="mediaUrl(tenant.logoUrl)"
            :alt="tenant.name"
            class="h-full w-full object-contain p-2"
          />
          <span
            v-else
            class="font-display text-3xl font-bold text-brand-700"
          >
            {{ tenant.name.slice(0, 1).toUpperCase() }}
          </span>
        </div>
        <p class="font-display text-4xl font-bold tracking-tight text-ink dark:text-mist md:text-5xl">
          {{ tenant.name }}
        </p>
        <div v-if="tenant.rating && tenant.rating.count > 0" class="mt-3 flex justify-center">
          <StarRating
            :avg="tenant.rating.avg"
            :count="tenant.rating.count"
            size="md"
          />
        </div>
        <h1 class="mt-3 text-lg text-ink-muted dark:text-white/55">Reserva tu cita en minutos</h1>
      </div>

      <p
        v-if="error"
        class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        {{ error }}
      </p>

      <div v-if="!confirmed" class="surface mt-10 animate-fade-up-delay p-6 md:p-8">
        <div class="mb-8 flex gap-2">
          <span
            v-for="n in 5"
            :key="n"
            :class="n <= step ? 'bg-brand-700' : 'bg-ink/10 dark:bg-white/10'"
            class="h-1.5 flex-1 rounded-full transition-all duration-500"
          />
        </div>

        <template v-if="step === 1">
          <h2 class="font-display text-2xl font-bold">¿Qué servicio deseas?</h2>
          <button
            v-for="s in services"
            :key="s.id"
            type="button"
            @click="serviceId = s.id"
            :class="
              serviceId === s.id
                ? 'border-brand-700 bg-brand-50 shadow-glow dark:bg-brand-950/40'
                : 'border-ink/8 hover:border-brand-600/40 dark:border-white/10'
            "
            class="mt-3 w-full rounded-2xl border p-4 text-left transition"
          >
            <span class="block truncate font-semibold" :title="s.name">{{ shortName(s.name) }}</span>
            <span class="mt-1 block text-sm text-ink-muted">
              {{ s.durationMinutes }} min · {{ money(s.price) }}
            </span>
          </button>
        </template>

        <template v-else-if="step === 2">
          <h2 class="font-display text-2xl font-bold">¿Quién te atiende?</h2>
          <button
            type="button"
            @click=";(autoWorker = true), (workerId = '')"
            :class="autoWorker ? 'border-brand-700 bg-brand-50 dark:bg-brand-950/40' : 'border-ink/8 dark:border-white/10'"
            class="mt-3 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm font-medium transition"
          >
            <span
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-950"
            >
              <Users class="h-5 w-5" />
            </span>
            <span>
              <span class="block font-semibold">Cualquiera</span>
              <span class="text-xs text-ink-muted">Asignación automática</span>
            </span>
          </button>
          <p v-if="!workers.length" class="mt-4 text-sm text-ink-muted">
            No hay profesionales disponibles para este servicio.
          </p>
          <button
            v-for="w in workers"
            :key="w.id"
            type="button"
            @click=";(autoWorker = false), (workerId = w.id)"
            :class="
              !autoWorker && workerId === w.id
                ? 'border-brand-700 bg-brand-50 dark:bg-brand-950/40'
                : 'border-ink/8 dark:border-white/10'
            "
            class="mt-3 flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left text-sm font-medium transition"
          >
            <img
              v-if="w.photoUrl"
              :src="mediaUrl(w.photoUrl)"
              :alt="`${w.firstName} ${w.lastName}`"
              class="h-11 w-11 shrink-0 rounded-full object-cover"
            />
            <span
              v-else
              class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
              :style="{ backgroundColor: w.color || '#0F766E' }"
            >
              {{ initials(w) }}
            </span>
            <span class="min-w-0">
              <span class="block truncate font-semibold">{{ w.firstName }} {{ w.lastName }}</span>
              <StarRating
                v-if="(w.ratingCount || 0) > 0"
                class="mt-0.5"
                :avg="w.ratingAvg"
                :count="w.ratingCount"
              />
              <span
                v-if="specialtyLabel(w)"
                class="block truncate text-xs text-ink-muted"
              >
                {{ specialtyLabel(w) }}
              </span>
            </span>
          </button>
        </template>

        <template v-else-if="step === 3">
          <h2 class="font-display text-2xl font-bold">¿Qué día?</h2>
          <div class="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            <button
              v-for="d in dates"
              :key="d"
              type="button"
              @click="date = d"
              :class="date === d ? 'bg-brand-700 text-white shadow-glow' : 'bg-mist dark:bg-white/5'"
              class="rounded-2xl p-3 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              {{ dayjs(d).format('DD/MM') }}
            </button>
          </div>
        </template>

        <template v-else-if="step === 4">
          <h2 class="font-display text-2xl font-bold">¿Qué hora?</h2>
          <p v-if="selectedService" class="mt-1 text-sm text-ink-muted">
            Servicio de {{ selectedService.durationMinutes }} min · horarios cada
            {{ selectedService.durationMinutes }} min
          </p>
          <p v-if="!slots.length" class="mt-4 text-sm text-ink-muted">No hay horarios ese día.</p>
          <div class="mt-4 grid grid-cols-3 gap-2.5">
            <button
              v-for="slot in slots"
              :key="slot"
              type="button"
              @click="startAt = slot"
              :class="startAt === slot ? 'bg-brand-700 text-white shadow-glow' : 'bg-mist dark:bg-white/5'"
              class="rounded-2xl p-3 text-sm font-semibold transition"
            >
              {{ dayjs(slot).format('HH:mm') }}
            </button>
          </div>
        </template>

        <template v-else>
          <h2 class="font-display text-2xl font-bold">Tus datos</h2>
          <div class="mt-4 space-y-3">
            <input v-model="firstName" placeholder="Nombre" class="input-field" />
            <input v-model="lastName" placeholder="Apellido" class="input-field" />
            <input v-model="phone" placeholder="WhatsApp / teléfono" class="input-field" />
          </div>
          <p class="mt-4 text-sm text-ink-muted">
            <span class="truncate" :title="selectedService?.name">{{
              shortName(selectedService?.name || '', 36)
            }}</span>
            · {{ dayjs(startAt).format('DD/MM HH:mm') }}
            <template v-if="!autoWorker && selectedWorker"> · {{ selectedWorker.firstName }}</template>
          </p>
        </template>

        <div class="mt-8 flex items-center justify-between">
          <button
            v-if="step > 1"
            type="button"
            class="text-sm font-semibold text-ink-muted hover:text-brand-700"
            @click="step--"
          >
            Atrás
          </button>
          <span v-else />
          <button type="button" class="btn-primary disabled:opacity-40" :disabled="!canNext" @click="next">
            {{ step === 5 ? 'Confirmar reserva' : 'Continuar' }}
          </button>
        </div>
      </div>

      <div v-else class="surface mt-10 animate-fade-up p-10 text-center">
        <p class="font-display text-5xl font-bold text-brand-700">Listo</p>
        <h2 class="mt-4 text-2xl font-semibold">Tu cita quedó agendada</h2>
        <p class="mt-3 text-ink-muted dark:text-white/55">
          <span :title="selectedService?.name">{{ shortName(selectedService?.name || '', 36) }}</span
          ><br />
          {{ dayjs(bookingResult?.startAt || startAt).format('DD/MM/YYYY HH:mm') }}
        </p>
        <RouterLink to="/" class="btn-ghost mt-8 inline-flex">Volver a BeautyBook</RouterLink>
      </div>
    </template>
  </main>
</template>
