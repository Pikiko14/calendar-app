<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, mediaUrl } from '@/api/client'
import dayjs from 'dayjs'
import { Users, X, Copy, Percent, Tag } from '@lucide/vue'
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
type PublicCoupon = {
  id: string
  code: string
  discountPct?: number | null
  discountAmt?: string | number | null
  expiresAt?: string | null
  maxUses?: number | null
  usedCount: number
}

const route = useRoute()
const slug = computed(() => String(route.params.tenantSlug))

const portalTab = ref<'book' | 'reviews'>('book')
const step = ref(1)
const tenant = ref<Tenant | null>(null)
const services = ref<Service[]>([])
const workers = ref<Worker[]>([])
const slots = ref<string[]>([])
const loading = ref(true)
const error = ref('')
const confirmed = ref(false)
const bookingResult = ref<{ startAt: string } | null>(null)
const reviewsSummary = ref<{ avg: number; count: number; stylistCount: number } | null>(null)
const publicCoupons = ref<PublicCoupon[]>([])
const showCouponPopup = ref(false)
const couponCopied = ref('')

const serviceId = ref('')
const workerId = ref('')
const autoWorker = ref(true)
const date = ref('')
const startAt = ref('')
const documentNumber = ref('')
const firstName = ref('')
const lastName = ref('')
const phone = ref('')
const publicReviews = ref<
  Array<{
    id: string
    rating: number
    comment: string | null
    createdAt: string
    client: { firstName: string; lastName: string }
    worker: { firstName: string; lastName: string }
  }>
>([])

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
  if (step.value === 5)
    return (
      firstName.value &&
      lastName.value &&
      phone.value.length >= 8 &&
      documentNumber.value.replace(/\D/g, '').length >= 5
    )
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
    const rev = await api<{
      summary?: { avg: number; count: number; stylistCount: number }
      items: typeof publicReviews.value
    }>(`/public/${slug.value}/reviews`).catch(() => ({
      summary: undefined,
      items: [] as typeof publicReviews.value,
    }))
    publicReviews.value = rev.items || []
    reviewsSummary.value = rev.summary || tenant.value.rating || null

    publicCoupons.value = await api<PublicCoupon[]>(
      `/public/${slug.value}/coupons`,
    ).catch(() => [])
    maybeOpenCouponPopup()
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
        documentNumber: documentNumber.value.replace(/\D/g, ''),
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

/** Oculta comentarios basura de reseñas antiguas (solo número o estrellas). */
function reviewComment(comment: string | null | undefined) {
  const t = (comment || '').trim()
  if (!t) return null
  if (/^[1-5]$/.test(t)) return null
  if (/^⭐+$/.test(t)) return null
  return t
}

function couponDismissKey() {
  const ids = publicCoupons.value
    .map((c) => c.id)
    .sort()
    .join(',')
  return `coupon-popup:${slug.value}:${ids}`
}

function maybeOpenCouponPopup() {
  if (!publicCoupons.value.length) return
  if (sessionStorage.getItem(couponDismissKey())) return
  window.setTimeout(() => {
    showCouponPopup.value = true
  }, 600)
}

function closeCouponPopup() {
  showCouponPopup.value = false
  if (publicCoupons.value.length) {
    sessionStorage.setItem(couponDismissKey(), '1')
  }
}

function openCouponPopup() {
  showCouponPopup.value = true
}

function couponLabel(c: PublicCoupon) {
  if (c.discountPct) return `${c.discountPct}% de descuento`
  if (c.discountAmt != null) {
    return `${Number(c.discountAmt).toLocaleString('es-CO', {
      style: 'currency',
      currency: tenant.value?.currency || 'COP',
      maximumFractionDigits: 0,
    })} de descuento`
  }
  return 'Descuento especial'
}

async function copyCoupon(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    couponCopied.value = code
    window.setTimeout(() => {
      if (couponCopied.value === code) couponCopied.value = ''
    }, 2000)
  } catch {
    couponCopied.value = ''
  }
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
        <h1 class="mt-3 text-lg text-ink-muted dark:text-white/55">
          {{ portalTab === 'book' ? 'Reserva tu cita en minutos' : 'Lo que dicen nuestros clientes' }}
        </h1>
      </div>

      <div
        class="mx-auto mt-8 flex w-full max-w-sm rounded-full border border-black/10 bg-white/80 p-1 shadow-soft dark:border-white/10 dark:bg-ink-soft/80"
        role="tablist"
        aria-label="Secciones del portal"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="portalTab === 'book'"
          :class="
            portalTab === 'book'
              ? 'bg-brand-700 text-white shadow-glow'
              : 'text-ink-muted hover:text-ink dark:text-white/50 dark:hover:text-white'
          "
          class="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition"
          @click="portalTab = 'book'"
        >
          Reservar
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="portalTab === 'reviews'"
          :class="
            portalTab === 'reviews'
              ? 'bg-brand-700 text-white shadow-glow'
              : 'text-ink-muted hover:text-ink dark:text-white/50 dark:hover:text-white'
          "
          class="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition"
          @click="portalTab = 'reviews'"
        >
          Reseñas
          <span v-if="reviewsSummary?.count" class="opacity-80">({{ reviewsSummary.count }})</span>
        </button>
      </div>

      <button
        v-if="publicCoupons.length"
        type="button"
        class="mx-auto mt-4 flex items-center gap-2 rounded-full border border-violet-300/60 bg-violet-50 px-4 py-2 text-xs font-semibold text-violet-900 shadow-soft transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950"
        @click="openCouponPopup"
      >
        <Percent class="h-3.5 w-3.5" />
        Ver cupones ({{ publicCoupons.length }})
      </button>

      <p
        v-if="error"
        class="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        {{ error }}
      </p>

      <template v-if="portalTab === 'reviews'">
        <div class="surface mt-8 animate-fade-up p-6 md:p-8">
          <div class="flex flex-col items-center gap-2 text-center">
            <h2 class="font-display text-2xl font-bold">Reseñas</h2>
            <StarRating
              v-if="reviewsSummary && reviewsSummary.count > 0"
              :avg="reviewsSummary.avg"
              :count="reviewsSummary.count"
              size="md"
            />
            <p v-else class="text-sm text-ink-muted">Aún no hay reseñas públicas.</p>
            <p v-if="reviewsSummary?.stylistCount" class="text-xs text-ink-muted">
              Basado en {{ reviewsSummary.stylistCount }} profesional{{
                reviewsSummary.stylistCount === 1 ? '' : 'es'
              }}
            </p>
          </div>

          <div v-if="publicReviews.length" class="mt-8 space-y-3">
            <article
              v-for="r in publicReviews"
              :key="r.id"
              class="rounded-2xl border border-black/5 bg-mist/60 p-4 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <div class="flex items-start justify-between gap-3">
                <StarRating :avg="r.rating" :count="0" :show-count="false" />
                <span class="shrink-0 text-[11px] text-ink-muted">
                  {{ dayjs(r.createdAt).format('MMM YYYY') }}
                </span>
              </div>
              <p v-if="reviewComment(r.comment)" class="mt-3 leading-relaxed text-ink dark:text-mist">
                “{{ reviewComment(r.comment) }}”
              </p>
              <p class="mt-3 text-xs text-ink-muted">
                {{ r.client.firstName }}
                <template v-if="r.worker?.firstName"> · {{ r.worker.firstName }}</template>
              </p>
            </article>
          </div>

          <button
            type="button"
            class="btn-primary mt-8 w-full"
            @click="portalTab = 'book'"
          >
            Reservar cita
          </button>
        </div>
      </template>

      <template v-else>
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
          <p v-if="!slots.length" class="mt-4 text-sm text-ink-muted">
            No hay horarios ese día. Prueba con otra fecha.
          </p>
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
            <input
              v-model="documentNumber"
              inputmode="numeric"
              placeholder="Número de documento (cédula)"
              class="input-field"
            />
            <input v-model="firstName" placeholder="Nombre" class="input-field" />
            <input v-model="lastName" placeholder="Apellido" class="input-field" />
            <input v-model="phone" placeholder="WhatsApp / teléfono" class="input-field" />
          </div>
          <p class="mt-2 text-xs text-ink-muted">
            Con tu documento te identificamos en próximas reservas.
          </p>
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
    </template>

    <!-- Popup cupones activos -->
    <Teleport to="body">
      <div
        v-if="showCouponPopup && publicCoupons.length"
        class="fixed inset-0 z-[80] flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-popup-title"
        @click.self="closeCouponPopup"
      >
        <div
          class="relative w-full max-w-md animate-fade-up overflow-hidden rounded-3xl border border-white/20 bg-white shadow-lift dark:border-white/10 dark:bg-ink-soft"
        >
          <div class="bg-gradient-to-br from-violet-600 to-brand-700 px-5 py-6 text-white">
            <button
              type="button"
              class="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Cerrar"
              @click="closeCouponPopup"
            >
              <X class="h-4 w-4" />
            </button>
            <div class="flex items-center gap-3">
              <span class="grid h-11 w-11 place-items-center rounded-2xl bg-white/20">
                <Tag class="h-5 w-5" />
              </span>
              <div>
                <p id="coupon-popup-title" class="font-display text-xl font-bold">
                  Cupones disponibles
                </p>
                <p class="text-sm text-white/80">
                  Usa estos códigos al pagar en {{ tenant?.name || 'el local' }}.
                </p>
              </div>
            </div>
          </div>

          <div class="max-h-[60vh] space-y-3 overflow-y-auto p-5">
            <article
              v-for="c in publicCoupons"
              :key="c.id"
              class="rounded-2xl border border-dashed border-violet-300/50 bg-violet-50/70 p-4 dark:border-violet-500/25 dark:bg-violet-950/30"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700 dark:text-violet-300">
                {{ couponLabel(c) }}
              </p>
              <p class="mt-1 font-display text-2xl font-bold tracking-wide text-ink dark:text-mist">
                {{ c.code }}
              </p>
              <p v-if="c.expiresAt" class="mt-1 text-xs text-ink-muted">
                Válido hasta {{ dayjs(c.expiresAt).format('DD/MM/YYYY') }}
              </p>
              <button
                type="button"
                class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 shadow-sm dark:bg-white/10 dark:text-violet-100"
                @click="copyCoupon(c.code)"
              >
                <Copy class="h-3.5 w-3.5" />
                {{ couponCopied === c.code ? '¡Copiado!' : 'Copiar código' }}
              </button>
            </article>
          </div>

          <div class="border-t border-black/5 px-5 py-4 dark:border-white/10">
            <button type="button" class="btn-primary w-full" @click="closeCouponPopup">
              Continuar reservando
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>
