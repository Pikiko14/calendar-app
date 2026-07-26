<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, apiUpload, mediaUrl } from '@/api/client'
import { confirmAction, toastSuccess, toastError } from '@/lib/swal'
import { applyBrandTheme } from '@/lib/brand'
import { useAuthStore } from '@/stores/auth'
import BusinessScheduleEditor from '@/components/BusinessScheduleEditor.vue'
import LocationPicker from '@/components/LocationPicker.vue'

type SettingsTab =
  | 'marca'
  | 'ubicacion'
  | 'reservas'
  | 'horario'
  | 'especialidades'
  | 'whatsapp'
  | 'planes'

const tabs = computed(() => {
  if (!auth.hasSubscription) {
    return [{ id: 'planes' as SettingsTab, label: 'Planes' }]
  }
  return [
    { id: 'marca' as SettingsTab, label: 'Marca' },
    { id: 'ubicacion' as SettingsTab, label: 'Ubicación' },
    { id: 'reservas' as SettingsTab, label: 'Reservas' },
    { id: 'horario' as SettingsTab, label: 'Horario' },
    { id: 'especialidades' as SettingsTab, label: 'Especialidades' },
    { id: 'whatsapp' as SettingsTab, label: 'WhatsApp' },
    { id: 'planes' as SettingsTab, label: 'Planes' },
  ]
})

const activeTab = ref<SettingsTab>('marca')
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const locationPickerRef = ref<{ refreshMapSize: () => void } | null>(null)

const SETTINGS_TABS: SettingsTab[] = [
  'marca',
  'ubicacion',
  'reservas',
  'horario',
  'especialidades',
  'whatsapp',
  'planes',
]

function applyTabFromQuery() {
  const tab = String(route.query.tab || '')
  if (!auth.hasSubscription) {
    activeTab.value = 'planes'
    return
  }
  if (SETTINGS_TABS.includes(tab as SettingsTab)) {
    activeTab.value = tab as SettingsTab
  }
}

watch(activeTab, async (tab) => {
  if (tab !== 'ubicacion') return
  await nextTick()
  locationPickerRef.value?.refreshMapSize()
})

watch(
  () => route.query.tab,
  () => applyTabFromQuery(),
)

const COLOR_PRESETS = [
  '#0F766E',
  '#0D9488',
  '#0369A1',
  '#1D4ED8',
  '#7C3AED',
  '#BE185D',
  '#C2410C',
  '#B45309',
  '#15803D',
  '#334155',
]

const saved = ref(false)
const loading = ref(true)
const saving = ref(false)
const applying = ref(false)
const error = ref('')
const name = ref('')
const primaryColor = ref('#0F766E')
const logoUrl = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const logoPreview = ref('')
const timezone = ref('America/Bogota')
const currency = ref('COP')
const address = ref('')
const city = ref('')
const mapUrl = ref('')
const latitude = ref<number | null>(null)
const longitude = ref<number | null>(null)
const country = ref('')
const minNotice = ref(60)
const maxDays = ref(60)
const scheduleRef = ref<InstanceType<typeof BusinessScheduleEditor> | null>(null)
const branchSchedules = ref<
  Array<{ dayOfWeek: string; isClosed: boolean; blocks: { startTime: string; endTime: string }[] }>
>([])
const specialties = ref<Array<{ id: string; name: string; isActive: boolean }>>([])
const newSpecialty = ref('')
const specialtyBusy = ref(false)

const waStatus = ref<'disconnected' | 'connecting' | 'qr' | 'connected'>('disconnected')
const waPhone = ref<string | null>(null)
const waQr = ref<string | null>(null)
const waBusy = ref(false)
const waError = ref('')
const waSavingConfig = ref(false)
const waEnabled = ref(false)
const waAiEnabled = ref(false)
const waBusinessName = ref('')
const waWelcomeMsg = ref('')
const waSessionKey = ref('')
const waHasSession = ref(false)
const waTenantName = ref('')
let waPoll: ReturnType<typeof setInterval> | null = null

const waLabel: Record<string, string> = {
  disconnected: 'Desconectado',
  connecting: 'Conectando…',
  qr: 'Escanea el QR',
  connected: 'Conectado',
}

type PlanRow = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  currency: string
  maxWorkers: number | null
  maxServices: number | null
  maxBranches: number | null
  features: string[] | null
  sortOrder: number
}

const plans = ref<PlanRow[]>([])
const planCurrent = ref<{
  plan: PlanRow | null
  subscriptionActive?: boolean
  subscription?: { status: string } | null
  usage: { workers: number; services: number; branches: number }
  limits?: {
    whatsappEnabled?: boolean
    aiEnabled?: boolean
  }
} | null>(null)
const planBusy = ref(false)

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)
}

function limitLabel(n: number | null) {
  return n == null ? 'Ilimitado' : String(n)
}

function featureList(p: PlanRow): string[] {
  if (Array.isArray(p.features)) return p.features
  return []
}

async function refreshPlans() {
  try {
    const [list, current] = await Promise.all([
      api<PlanRow[]>('/plans'),
      api<{
        plan: PlanRow | null
        subscriptionActive?: boolean
        subscription?: { status: string } | null
        usage: { workers: number; services: number; branches: number }
        limits?: { whatsappEnabled?: boolean; aiEnabled?: boolean }
      }>('/plans/current'),
    ])
    plans.value = list
    planCurrent.value = current
  } catch {
    plans.value = []
    planCurrent.value = null
  }
}

const pendingPaymentId = ref<string | null>(null)

async function selectPlan(planId: string) {
  if (planCurrent.value?.plan?.id === planId && planCurrent.value.subscriptionActive) return
  const target = plans.value.find((p) => p.id === planId)
  const ok = await confirmAction({
    title: `¿Suscribirte a ${target?.name || ''}?`,
    text: target
      ? `${formatCop(target.priceMonthly)} / mes con ePayco. Se abrirá el checkout seguro.`
      : 'Se abrirá el checkout de ePayco.',
    confirmText: 'Ir a pagar',
  })
  if (!ok) return
  planBusy.value = true
  try {
    const checkout = await api<{
      paymentId: string
      demoMode?: boolean
      amount: number
      provider: string
      checkoutUrl?: string | null
      sessionId?: string | null
      publicKey?: string | null
      test?: boolean
      configured?: boolean
    }>('/plans/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    })
    pendingPaymentId.value = checkout.paymentId

    if (checkout.sessionId && !checkout.demoMode) {
      const { openEpaycoCheckout } = await import('@/lib/epayco')
      await openEpaycoCheckout({
        sessionId: checkout.sessionId,
        test: checkout.test !== false,
      })
      await toastSuccess('Checkout ePayco abierto')
      return
    }

    if (checkout.checkoutUrl && !checkout.demoMode) {
      window.location.href = checkout.checkoutUrl
      return
    }

    if (checkout.demoMode) {
      const payOk = await confirmAction({
        title: 'Activar plan (demo)',
        text: `Simular cobro de ${formatCop(checkout.amount)} y activar la suscripción.`,
        confirmText: 'Simular pago y activar',
      })
      if (payOk) {
        await api('/plans/confirm-payment', {
          method: 'POST',
          body: JSON.stringify({ paymentId: checkout.paymentId }),
        })
        await auth.fetchMe()
        await refreshPlans()
        pendingPaymentId.value = null
        await toastSuccess('Suscripción activada (demo)')
      } else {
        await toastSuccess('Pago pendiente. Confírmalo cuando estés listo.')
        await refreshPlans()
      }
    }
  } catch (e) {
    await toastError('No se pudo iniciar el pago', e instanceof Error ? e.message : 'Error')
  } finally {
    planBusy.value = false
  }
}

async function confirmPendingPayment() {
  if (!pendingPaymentId.value) return
  planBusy.value = true
  try {
    await api('/plans/confirm-payment', {
      method: 'POST',
      body: JSON.stringify({ paymentId: pendingPaymentId.value }),
    })
    pendingPaymentId.value = null
    await auth.fetchMe()
    await refreshPlans()
    await toastSuccess('Suscripción activada')
  } catch (e) {
    await toastError('Pago', e instanceof Error ? e.message : 'Error')
  } finally {
    planBusy.value = false
  }
}

async function syncEpaycoReturn() {
  const status = String(route.query.epayco || '')
  const refPayco = String(route.query.ref_payco || route.query.refPayco || '')
  if (status === 'cancel') {
    await toastError('Pago cancelado', 'Puedes intentar de nuevo cuando quieras.')
    return
  }
  if (!refPayco && status !== 'return') return
  if (!refPayco) return
  planBusy.value = true
  try {
    await api('/plans/epayco/sync', {
      method: 'POST',
      body: JSON.stringify({ refPayco }),
    })
    await auth.fetchMe()
    await refreshPlans()
    pendingPaymentId.value = null
    await toastSuccess('¡Pago recibido! Suscripción activa.')
  } catch (e) {
    await toastError(
      'Pago en proceso',
      e instanceof Error
        ? e.message
        : 'Si ya pagaste, espera unos segundos y recarga.',
    )
  } finally {
    planBusy.value = false
    const q = { ...route.query } as Record<string, string>
    delete q.epayco
    delete q.ref_payco
    delete q.refPayco
    await router.replace({ query: { ...q, tab: 'planes' } })
  }
}

async function load() {
  loading.value = true
  error.value = ''
  const needsPlan = !auth.hasSubscription

  try {
    // Sin suscripción: solo lo mínimo + planes (el resto de endpoints están 403).
    if (needsPlan) {
      try {
        const tenant = await api<{
          name: string
          primaryColor: string
          logoUrl?: string | null
        }>('/tenants/me')
        name.value = tenant.name
        primaryColor.value = tenant.primaryColor
        logoUrl.value = tenant.logoUrl || null
        logoPreview.value = tenant.logoUrl ? mediaUrl(tenant.logoUrl) : ''
        applyBrandTheme(tenant.primaryColor)
      } catch {
        // Igual mostramos planes
      }
      await refreshPlans()
      activeTab.value = 'planes'
      if (String(route.query.tab || '') !== 'planes') {
        await router.replace({ name: 'settings', query: { tab: 'planes' } })
      }
      return
    }

    const [tenant, settings] = await Promise.all([
      api<{
        name: string
        primaryColor: string
        logoUrl?: string | null
        timezone: string
        currency: string
        address: string | null
        city: string | null
        mapUrl: string | null
        latitude: number | null
        longitude: number | null
        country: string | null
      }>('/tenants/me'),
      api<{
        minBookingNoticeMinutes: number
        maxBookingDaysAhead: number
      }>('/tenants/settings'),
    ])
    name.value = tenant.name
    primaryColor.value = tenant.primaryColor
    logoUrl.value = tenant.logoUrl || null
    logoFile.value = null
    logoPreview.value = tenant.logoUrl ? mediaUrl(tenant.logoUrl) : ''
    applyBrandTheme(tenant.primaryColor)
    timezone.value = tenant.timezone
    currency.value = tenant.currency
    address.value = tenant.address || ''
    city.value = tenant.city || ''
    mapUrl.value = tenant.mapUrl || ''
    latitude.value = tenant.latitude
    longitude.value = tenant.longitude
    country.value = tenant.country || ''
    minNotice.value = settings.minBookingNoticeMinutes
    maxDays.value = settings.maxBookingDaysAhead

    try {
      const branch = await api<{
        schedules: Array<{
          dayOfWeek: string
          isClosed: boolean
          blocks: { startTime: string; endTime: string }[]
        }>
      }>('/branches/main/schedules')
      branchSchedules.value = branch.schedules || []
    } catch {
      try {
        const branch = await api<{
          schedules: Array<{
            dayOfWeek: string
            isClosed: boolean
            blocks: { startTime: string; endTime: string }[]
          }>
        }>('/branches/main')
        branchSchedules.value = branch.schedules || []
      } catch {
        branchSchedules.value = []
      }
    }

    try {
      specialties.value = await api('/specialties')
      if (!specialties.value.length) {
        specialties.value = await api('/specialties/ensure-defaults', {
          method: 'POST',
        })
      }
    } catch {
      specialties.value = []
    }

    await refreshWhatsapp()
    await refreshPlans()
  } catch (e) {
    // No bloquear la UI de planes si falla algo secundario
    if (!auth.hasSubscription) {
      await refreshPlans()
      activeTab.value = 'planes'
    } else {
      error.value = e instanceof Error ? e.message : 'No se pudo cargar'
    }
  } finally {
    loading.value = false
  }
}

async function refreshWhatsapp() {
  try {
    const status = await api<{
      status: 'disconnected' | 'connecting' | 'qr' | 'connected'
      phone: string | null
      hasQr: boolean
      hasSession?: boolean
      sessionKey?: string
      lastError: string | null
      config?: {
        enabled: boolean
        welcomeMsg: string
        businessName: string | null
        aiEnabled: boolean
        phoneNumber: string | null
        tenantName: string
        tenantSlug: string
        sessionKey: string
      }
    }>('/whatsapp/status')
    waStatus.value = status.status
    waPhone.value = status.phone
    waError.value = status.lastError || ''
    waHasSession.value = Boolean(status.hasSession)
    waSessionKey.value = status.sessionKey || status.config?.sessionKey || ''
    if (status.config) {
      waEnabled.value = status.config.enabled
      waAiEnabled.value = status.config.aiEnabled
      waBusinessName.value = status.config.businessName || status.config.tenantName || ''
      waWelcomeMsg.value = status.config.welcomeMsg || ''
      waTenantName.value = status.config.tenantName || ''
      if (!waPhone.value) waPhone.value = status.config.phoneNumber
    }
    if (status.status === 'qr' || status.hasQr) {
      const qr = await api<{ qr: string | null; status: string }>('/whatsapp/qr')
      waQr.value = qr.qr
      waStatus.value = qr.status as typeof waStatus.value
    } else if (status.status === 'connected') {
      waQr.value = null
      stopWaPoll()
    }
  } catch {
    /* rutas WA pueden no existir en API antigua */
  }
}

async function saveWhatsappConfig() {
  waSavingConfig.value = true
  try {
    await api('/whatsapp/config', {
      method: 'PATCH',
      body: JSON.stringify({
        enabled: waEnabled.value,
        aiEnabled: waAiEnabled.value,
        businessName: waBusinessName.value.trim() || undefined,
        welcomeMsg: waWelcomeMsg.value,
      }),
    })
    await toastSuccess('Configuración WhatsApp guardada')
    await refreshWhatsapp()
  } catch (e) {
    await toastError('No se pudo guardar', e instanceof Error ? e.message : 'Error')
  } finally {
    waSavingConfig.value = false
  }
}

function startWaPoll() {
  stopWaPoll()
  waPoll = setInterval(() => {
    void refreshWhatsapp()
  }, 2500)
}

function stopWaPoll() {
  if (waPoll) {
    clearInterval(waPoll)
    waPoll = null
  }
}

async function connectWhatsapp() {
  waBusy.value = true
  waError.value = ''
  try {
    await api('/whatsapp/connect', { method: 'POST', body: '{}' })
    startWaPoll()
    await refreshWhatsapp()
    await toastSuccess(
      'Conexión iniciada',
      'Escanea el código QR con WhatsApp en tu teléfono.',
    )
  } catch (e) {
    await toastError('No se pudo conectar', e instanceof Error ? e.message : 'Error')
  } finally {
    waBusy.value = false
  }
}

async function disconnectWhatsapp() {
  const ok = await confirmAction({
    title: '¿Desconectar WhatsApp?',
    text: 'Tendrás que escanear el QR otra vez para vincular el número.',
    confirmText: 'Desconectar',
    danger: true,
  })
  if (!ok) return
  waBusy.value = true
  try {
    await api('/whatsapp/disconnect', {
      method: 'POST',
      body: JSON.stringify({ logout: true }),
    })
    waQr.value = null
    waPhone.value = null
    waStatus.value = 'disconnected'
    stopWaPoll()
    await toastSuccess('WhatsApp desconectado')
  } catch (e) {
    await toastError('No se pudo desconectar', e instanceof Error ? e.message : 'Error')
  } finally {
    waBusy.value = false
  }
}

async function addSpecialty() {
  const value = newSpecialty.value.trim()
  if (value.length < 2) return
  specialtyBusy.value = true
  error.value = ''
  try {
    await api('/specialties', {
      method: 'POST',
      body: JSON.stringify({ name: value }),
    })
    newSpecialty.value = ''
    specialties.value = await api('/specialties')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo crear'
  } finally {
    specialtyBusy.value = false
  }
}

async function removeSpecialty(id: string, label: string) {
  const ok = await confirmAction({
    title: '¿Eliminar especialidad?',
    text: `Se eliminará “${label}” del catálogo.`,
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  specialtyBusy.value = true
  try {
    await api(`/specialties/${id}`, { method: 'DELETE' })
    specialties.value = await api('/specialties')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo eliminar'
  } finally {
    specialtyBusy.value = false
  }
}

async function save() {
  error.value = ''
  const invalid = scheduleRef.value?.validate()
  if (invalid) {
    error.value = invalid
    return
  }
  saving.value = true
  try {
    const days = scheduleRef.value?.toPayload() || []
    const [tenantRes] = await Promise.all([
      api<{
        name: string
        primaryColor: string
        logoUrl?: string | null
        slug: string
      }>('/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.value,
          primaryColor: primaryColor.value,
          timezone: timezone.value,
          currency: currency.value,
          address: address.value.trim() || null,
          city: city.value.trim() || null,
          mapUrl: mapUrl.value.trim() || null,
          country: country.value.trim() || null,
          latitude: latitude.value,
          longitude: longitude.value,
          ...(logoUrl.value === null && !logoFile.value ? { logoUrl: null } : {}),
        }),
      }),
      api('/tenants/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          minBookingNoticeMinutes: Number(minNotice.value),
          maxBookingDaysAhead: Number(maxDays.value),
        }),
      }),
      api('/branches/main/schedules/week', {
        method: 'PUT',
        body: JSON.stringify({ days }),
      }),
    ])

    if (logoFile.value) {
      const fd = new FormData()
      fd.append('logo', logoFile.value)
      const uploaded = await apiUpload<{ logoUrl: string }>('/tenants/me/logo', fd)
      logoUrl.value = uploaded.logoUrl
      logoPreview.value = mediaUrl(uploaded.logoUrl)
      logoFile.value = null
      tenantRes.logoUrl = uploaded.logoUrl
    }

    applyBrandTheme(primaryColor.value)
    auth.patchTenant({
      name: tenantRes.name,
      primaryColor: tenantRes.primaryColor,
      logoUrl: tenantRes.logoUrl ?? logoUrl.value,
      slug: tenantRes.slug,
    })

    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
    await toastSuccess('Cambios guardados')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

function onLogoChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  logoFile.value = file
  logoPreview.value = URL.createObjectURL(file)
}

async function clearLogo() {
  logoFile.value = null
  logoPreview.value = ''
  logoUrl.value = null
}

function onLocationUpdate(payload: {
  latitude: number
  longitude: number
  address: string
  city: string
  country: string
  mapUrl: string
}) {
  latitude.value = payload.latitude
  longitude.value = payload.longitude
  if (payload.address) address.value = payload.address
  if (payload.city) city.value = payload.city
  if (payload.country) country.value = payload.country
  mapUrl.value = payload.mapUrl
}

async function applyToTeam() {
  applying.value = true
  error.value = ''
  try {
    const invalid = scheduleRef.value?.validate()
    if (invalid) {
      error.value = invalid
      return
    }
    const days = scheduleRef.value?.toPayload() || []
    await api('/branches/main/schedules/week', {
      method: 'PUT',
      body: JSON.stringify({ days }),
    })
    const result = await api<{ updated: number }>(
      '/branches/main/schedules/apply-to-workers',
      { method: 'POST' },
    )
    saved.value = true
    setTimeout(() => (saved.value = false), 2500)
    await toastSuccess(
      'Horario aplicado',
      `Se actualizó el horario de ${result.updated} profesionales.`,
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo aplicar'
  } finally {
    applying.value = false
  }
}

onMounted(() => {
  applyTabFromQuery()
  const pay = String(route.query.pay || '')
  if (pay) pendingPaymentId.value = pay
  void load().then(() => syncEpaycoReturn())
})
onUnmounted(stopWaPoll)

const colorHex = computed({
  get: () => {
    const v = primaryColor.value?.trim() || '#0F766E'
    return /^#[0-9A-Fa-f]{6}$/.test(v) ? v : '#0F766E'
  },
  set: (v: string) => {
    primaryColor.value = v
    applyBrandTheme(v)
  },
})

function normalizeColorInput() {
  let v = primaryColor.value.trim()
  if (!v.startsWith('#')) v = `#${v}`
  if (/^#[0-9A-Fa-f]{3}$/.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    primaryColor.value = v.toUpperCase()
    applyBrandTheme(primaryColor.value)
  }
}

const showSaveBar = computed(() =>
  ['marca', 'ubicacion', 'reservas', 'horario'].includes(activeTab.value),
)
</script>

<template>
  <section
    class="animate-fade-in"
    :class="activeTab === 'planes' ? 'max-w-6xl' : 'max-w-3xl'"
  >
    <p class="section-eyebrow">Negocio</p>
    <h1 class="font-display mt-2 text-display-md font-bold">Ajustes</h1>

    <p
      v-if="error && auth.hasSubscription"
      class="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </p>
    <p v-else-if="loading" class="mt-4 text-ink-muted">Cargando…</p>

    <template v-if="!loading && (!error || !auth.hasSubscription)">
      <div
        v-if="!auth.hasSubscription"
        class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Elige un plan para desbloquear el resto de la app.
      </div>
      <div
        class="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-black/[0.04] p-1 dark:bg-white/5"
        role="tablist"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          class="shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition"
          :class="
            activeTab === tab.id
              ? 'bg-white text-brand-800 shadow-soft dark:bg-ink-soft dark:text-brand-300'
              : 'text-ink-muted hover:text-ink'
          "
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <form class="mt-6 space-y-6" @submit.prevent="save">
        <!-- MARCA -->
        <article v-show="activeTab === 'marca'" class="surface p-6">
          <h2 class="font-display text-xl font-bold">Marca</h2>
          <p class="mt-1 text-sm text-ink-muted">
            Logo, nombre y color que identifican tu negocio en la app y el portal.
          </p>
          <div class="mt-5 space-y-6">
            <div>
              <p class="text-sm text-ink-muted">Logo</p>
              <div class="mt-3 flex flex-wrap items-center gap-4">
                <div
                  class="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-black/10 bg-mist shadow-soft dark:border-white/15 dark:bg-white/5"
                >
                  <img
                    v-if="logoPreview"
                    :src="logoPreview"
                    alt="Logo"
                    class="h-full w-full object-contain p-1.5"
                  />
                  <span
                    v-else
                    class="font-display text-2xl font-bold text-brand-700"
                  >
                    {{ (name || 'N').slice(0, 1).toUpperCase() }}
                  </span>
                </div>
                <div class="space-y-2">
                  <label class="btn-ghost !inline-flex !cursor-pointer !py-2.5">
                    Subir logo
                    <input
                      type="file"
                      accept="image/*"
                      class="hidden"
                      @change="onLogoChange"
                    />
                  </label>
                  <button
                    v-if="logoPreview"
                    type="button"
                    class="block text-xs font-semibold text-red-600 hover:underline"
                    @click="clearLogo"
                  >
                    Quitar logo
                  </button>
                  <p class="text-xs text-ink-muted">PNG o JPG, máx. 5 MB. Fondo transparente recomendado.</p>
                </div>
              </div>
            </div>

            <label class="block text-sm text-ink-muted">
              Nombre del negocio
              <input v-model="name" class="input-field mt-2" />
            </label>

            <div>
              <p class="text-sm text-ink-muted">Color principal</p>
              <div class="mt-3 flex flex-wrap items-center gap-4">
                <label class="relative block h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-black/10 shadow-soft dark:border-white/15">
                  <span
                    class="absolute inset-0"
                    :style="{ backgroundColor: colorHex }"
                  />
                  <input
                    v-model="colorHex"
                    type="color"
                    class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Elegir color"
                  />
                </label>
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <input
                      v-model="primaryColor"
                      class="input-field !w-36 !py-2.5 font-mono text-sm uppercase"
                      maxlength="7"
                      placeholder="#0F766E"
                      @blur="normalizeColorInput"
                    />
                    <span
                      class="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1.5 text-xs font-semibold text-ink-muted dark:bg-white/5"
                    >
                      <span
                        class="h-3 w-3 rounded-full ring-1 ring-black/10"
                        :style="{ backgroundColor: colorHex }"
                      />
                      Vista previa
                    </span>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="c in COLOR_PRESETS"
                      :key="c"
                      type="button"
                      class="h-8 w-8 rounded-full border-2 transition hover:scale-110"
                      :class="
                        colorHex.toUpperCase() === c.toUpperCase()
                          ? 'border-ink ring-2 ring-brand-700/30 dark:border-white'
                          : 'border-white shadow-soft dark:border-white/20'
                      "
                      :style="{ backgroundColor: c }"
                      :title="c"
                      @click="primaryColor = c; applyBrandTheme(c)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- UBICACIÓN (v-if: Leaflet necesita montarse con el contenedor visible) -->
        <article v-if="activeTab === 'ubicacion'" class="surface p-6">
          <h2 class="font-display text-xl font-bold">Ubicación</h2>
          <p class="mt-1 text-sm text-ink-muted">
            Se usa en confirmaciones de WhatsApp, el bot y el portal de reservas. Marca el local en el
            mapa o usa GPS.
          </p>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="text-sm text-ink-muted">
              Dirección
              <input
                v-model="address"
                class="input-field mt-2"
                placeholder="Calle 100 #15-20"
              />
            </label>
            <label class="text-sm text-ink-muted">
              Ciudad
              <input v-model="city" class="input-field mt-2" placeholder="Bogotá" />
            </label>
            <label class="text-sm text-ink-muted sm:col-span-2">
              Enlace de mapa
              <input
                v-model="mapUrl"
                class="input-field mt-2"
                type="url"
                placeholder="https://maps.google.com/?q=..."
              />
            </label>
            <p
              v-if="latitude != null && longitude != null"
              class="sm:col-span-2 text-xs text-ink-muted"
            >
              Coordenadas: {{ latitude.toFixed(6) }}, {{ longitude.toFixed(6) }}
            </p>
          </div>
          <div class="mt-4">
            <LocationPicker
              ref="locationPickerRef"
              :latitude="latitude"
              :longitude="longitude"
              @update="onLocationUpdate"
            />
          </div>
        </article>

        <!-- RESERVAS -->
        <article v-show="activeTab === 'reservas'" class="surface p-6">
          <h2 class="font-display text-xl font-bold">Zona y reservas</h2>
          <p class="mt-1 text-sm text-ink-muted">
            La disponibilidad usa esta zona horaria y solo ofrece inicios donde cabe la duración del
            servicio.
          </p>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="text-sm text-ink-muted">
              Zona horaria
              <select v-model="timezone" class="input-field mt-2">
                <option>America/Bogota</option>
                <option>America/Mexico_City</option>
                <option>America/Santiago</option>
              </select>
            </label>
            <label class="text-sm text-ink-muted">
              Moneda
              <select v-model="currency" class="input-field mt-2">
                <option>COP</option>
                <option>MXN</option>
                <option>USD</option>
                <option>CLP</option>
              </select>
            </label>
            <label class="text-sm text-ink-muted">
              Aviso mínimo (minutos)
              <input v-model.number="minNotice" type="number" min="0" class="input-field mt-2" />
            </label>
            <label class="text-sm text-ink-muted">
              Días máximos hacia adelante
              <input v-model.number="maxDays" type="number" min="1" max="365" class="input-field mt-2" />
            </label>
          </div>
        </article>

        <!-- ESPECIALIDADES -->
        <article v-show="activeTab === 'especialidades'" class="surface p-6">
          <h2 class="font-display text-xl font-bold">Especialidades</h2>
          <p class="mt-1 text-sm text-ink-muted">
            Catálogo del negocio. Luego las asignas a cada profesional desde Equipo.
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="s in specialties"
              :key="s.id"
              class="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
            >
              {{ s.name }}
              <button
                type="button"
                class="text-brand-700/70 hover:text-red-600"
                :disabled="specialtyBusy"
                @click="removeSpecialty(s.id, s.name)"
              >
                ×
              </button>
            </span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <input
              v-model="newSpecialty"
              class="input-field !w-auto min-w-[180px] flex-1"
              placeholder="Nueva especialidad"
              @keydown.enter.prevent="addSpecialty"
            />
            <button
              type="button"
              class="btn-ghost !py-2.5"
              :disabled="specialtyBusy || newSpecialty.trim().length < 2"
              @click="addSpecialty"
            >
              Añadir
            </button>
          </div>
        </article>

        <!-- WHATSAPP -->
        <article v-show="activeTab === 'whatsapp'" class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-xl font-bold">WhatsApp (Baileys)</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Cada negocio tiene su propia sesión aislada. Configura el bot y vincula el número de
                <b v-if="waTenantName"> {{ waTenantName }}</b
                ><span v-else> este local</span>.
              </p>
            </div>
            <span
              class="rounded-full px-3 py-1 text-xs font-bold"
              :class="
                waStatus === 'connected'
                  ? 'bg-brand-50 text-brand-800'
                  : waStatus === 'qr'
                    ? 'bg-amber-50 text-amber-800'
                    : 'bg-black/5 text-ink-muted'
              "
            >
              {{ waLabel[waStatus] }}
            </span>
          </div>

          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label class="flex items-center gap-2 text-sm font-medium">
              <input v-model="waEnabled" type="checkbox" class="h-4 w-4 accent-brand-700" />
              Bot activo para este negocio
            </label>
            <label class="flex items-center gap-2 text-sm font-medium">
              <input v-model="waAiEnabled" type="checkbox" class="h-4 w-4 accent-brand-700" />
              FAQ con IA (opción 7)
            </label>
            <label class="text-sm text-ink-muted sm:col-span-2">
              Nombre en el bot
              <input v-model="waBusinessName" class="input-field mt-2" placeholder="Ej. Barbería Premium" />
            </label>
            <label class="text-sm text-ink-muted sm:col-span-2">
              Mensaje de bienvenida
              <textarea
                v-model="waWelcomeMsg"
                rows="4"
                class="input-field mt-2"
                placeholder="Bienvenido…"
              />
            </label>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="btn-ghost !py-2.5"
              :disabled="waSavingConfig"
              @click="saveWhatsappConfig"
            >
              {{ waSavingConfig ? 'Guardando…' : 'Guardar config del bot' }}
            </button>
            <span v-if="waSessionKey" class="text-[11px] text-ink-muted">
              Sesión: {{ waSessionKey.slice(0, 10) }}… ·
              {{ waHasSession ? 'credenciales guardadas' : 'sin sesión previa' }}
            </span>
          </div>

          <p v-if="waPhone" class="mt-4 text-sm font-medium">Número vinculado: {{ waPhone }}</p>
          <p v-if="waError" class="mt-2 text-xs text-red-600">{{ waError }}</p>

          <div v-if="waQr && waStatus !== 'connected'" class="mt-5 flex justify-center">
            <img
              :src="waQr"
              alt="Código QR WhatsApp"
              class="h-64 w-64 rounded-2xl border border-black/5 bg-white p-3 dark:border-white/10"
            />
          </div>
          <p v-if="waQr && waStatus !== 'connected'" class="mt-3 text-center text-xs text-ink-muted">
            WhatsApp → Dispositivos vinculados → Vincular dispositivo
          </p>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              v-if="waStatus !== 'connected'"
              type="button"
              class="btn-primary !py-2.5"
              :disabled="waBusy"
              @click="connectWhatsapp"
            >
              {{ waBusy ? 'Conectando…' : waQr ? 'Renovar QR' : 'Conectar WhatsApp' }}
            </button>
            <button
              v-if="waStatus === 'connected' || waStatus === 'qr' || waStatus === 'connecting'"
              type="button"
              class="btn-ghost !py-2.5"
              :disabled="waBusy"
              @click="disconnectWhatsapp"
            >
              Desconectar
            </button>
          </div>
        </article>

        <!-- PLANES -->
        <article v-show="activeTab === 'planes'" class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-xl font-bold">Planes</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Cobro mensual con <b>ePayco</b>.
              </p>
            </div>
            <div
              class="rounded-full px-3 py-1 text-xs font-bold"
              :class="
                planCurrent?.subscriptionActive
                  ? 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-300'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              "
            >
              {{
                planCurrent?.subscriptionActive
                  ? `Activa: ${planCurrent.plan?.name || 'Plan'}`
                  : 'Sin suscripción'
              }}
            </div>
          </div>

          <div
            v-if="!planCurrent?.subscriptionActive"
            class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Activa un plan para desbloquear calendario, equipo, servicios y WhatsApp.
            <button
              v-if="pendingPaymentId"
              type="button"
              class="ml-2 font-semibold underline"
              :disabled="planBusy"
              @click="confirmPendingPayment"
            >
              Confirmar pago pendiente
            </button>
          </div>

          <div
            v-if="planCurrent?.plan"
            class="mt-4 grid gap-3 rounded-2xl border border-black/5 bg-black/[0.02] p-4 text-sm sm:grid-cols-3 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div>
              <p class="text-xs text-ink-muted">Estilistas</p>
              <p class="mt-1 font-semibold">
                {{ planCurrent.usage.workers }}
                <span class="font-normal text-ink-muted">
                  / {{ limitLabel(planCurrent.plan.maxWorkers) }}
                </span>
              </p>
            </div>
            <div>
              <p class="text-xs text-ink-muted">Servicios</p>
              <p class="mt-1 font-semibold">
                {{ planCurrent.usage.services }}
                <span class="font-normal text-ink-muted">
                  / {{ limitLabel(planCurrent.plan.maxServices) }}
                </span>
              </p>
            </div>
            <div>
              <p class="text-xs text-ink-muted">Sedes</p>
              <p class="mt-1 font-semibold">
                {{ planCurrent.usage.branches }}
                <span class="font-normal text-ink-muted">
                  / {{ limitLabel(planCurrent.plan.maxBranches) }}
                </span>
              </p>
            </div>
          </div>

          <div class="mt-6 grid gap-4 lg:grid-cols-3">
            <div
              v-for="p in plans"
              :key="p.id"
              class="relative flex flex-col rounded-2xl border p-5 transition"
              :class="
                planCurrent?.subscriptionActive && planCurrent?.plan?.id === p.id
                  ? 'border-brand-600 bg-brand-50/40 shadow-sm dark:border-brand-400 dark:bg-brand-950/30'
                  : 'border-black/10 dark:border-white/10'
              "
            >
              <p class="text-xs font-bold uppercase tracking-wide text-ink-muted">{{ p.code }}</p>
              <h3 class="mt-1 font-display text-2xl font-bold">{{ p.name }}</h3>
              <p class="mt-2 text-2xl font-bold text-brand-800 dark:text-brand-300">
                {{ formatCop(p.priceMonthly) }}
                <span class="text-sm font-medium text-ink-muted">/ mes</span>
              </p>
              <p v-if="p.description" class="mt-2 text-sm text-ink-muted">{{ p.description }}</p>
              <ul class="mt-4 flex-1 space-y-2 text-sm">
                <li v-for="(f, i) in featureList(p)" :key="i" class="flex gap-2">
                  <span class="text-brand-700">✓</span>
                  <span>{{ f }}</span>
                </li>
              </ul>
              <button
                type="button"
                class="mt-5 w-full !py-2.5"
                :class="
                  planCurrent?.subscriptionActive && planCurrent?.plan?.id === p.id
                    ? 'btn-ghost'
                    : 'btn-primary'
                "
                :disabled="
                  planBusy ||
                  (planCurrent?.subscriptionActive && planCurrent?.plan?.id === p.id)
                "
                @click="selectPlan(p.id)"
              >
                {{
                  planCurrent?.subscriptionActive && planCurrent?.plan?.id === p.id
                    ? 'Plan actual'
                    : planBusy
                      ? 'Activando…'
                      : 'Activar'
                }}
              </button>
            </div>
          </div>
        </article>

        <!-- HORARIO -->
        <article v-show="activeTab === 'horario'" class="surface p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-display text-xl font-bold">Horario del negocio</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Define cuándo abre el local. Los profesionales trabajan dentro de este horario (se
                intersectan).
              </p>
            </div>
            <button
              type="button"
              class="btn-ghost !py-2 text-xs"
              :disabled="applying"
              @click="applyToTeam"
            >
              {{ applying ? 'Aplicando…' : 'Aplicar a todo el equipo' }}
            </button>
          </div>
          <div class="mt-5">
            <BusinessScheduleEditor ref="scheduleRef" :schedules="branchSchedules" />
          </div>
        </article>

        <div v-if="showSaveBar" class="flex items-center gap-4">
          <button type="submit" class="btn-primary" :disabled="saving">
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>
          <span v-if="saved" class="text-sm font-semibold text-brand-700">Cambios guardados</span>
        </div>
      </form>
    </template>
  </section>
</template>
