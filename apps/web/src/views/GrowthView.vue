<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Clock3,
  Gift,
  Package,
  Percent,
  Printer,
  Copy,
  Sparkles,
  Users,
  Check,
  Minus,
  Plus,
  RotateCcw,
} from '@lucide/vue'
import { api } from '@/api/client'
import { toastError, toastSuccess } from '@/lib/swal'
import { printGiftCard } from '@/lib/printGiftCard'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const tab = computed(() => {
  const t = String(route.query.tab || 'waitlist')
  return ['waitlist', 'packages', 'coupons', 'gifts'].includes(t) ? t : 'waitlist'
})

const waitlist = ref<any[]>([])
const packages = ref<any[]>([])
const purchases = ref<any[]>([])
const coupons = ref<any[]>([])
const gifts = ref<any[]>([])
const services = ref<Array<{ id: string; name: string }>>([])
const clients = ref<Array<{ id: string; firstName: string; lastName: string }>>([])
const busy = ref(false)

const pkgForm = ref({
  name: '',
  sessions: 5,
  price: 100000,
  serviceId: '',
  validityDays: 90,
})
const sellForm = ref({ packageId: '', clientId: '' })
const couponForm = ref({ code: '', discountPct: 15, maxUses: 50 })
const giftForm = ref({
  amount: 100000,
  code: '',
  clientId: '',
  message: '',
})
const giftPreview = ref<any | null>(null)
const giftAmounts = [50000, 100000, 150000, 200000]
const purchaseFilter = ref('')
const consumeBusyId = ref<string | null>(null)

const activePurchases = computed(() =>
  purchases.value.filter((p) => p.isActive && p.usedSessions < p.totalSessions),
)
const filteredPurchases = computed(() => {
  const q = purchaseFilter.value.trim().toLowerCase()
  let list = [...purchases.value]
  if (q) {
    list = list.filter((p) => {
      const name = `${p.client?.firstName || ''} ${p.client?.lastName || ''} ${p.package?.name || ''}`.toLowerCase()
      return name.includes(q)
    })
  }
  return list
})

function money(n: string | number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
}

function waitStatus(s: string) {
  if (s === 'WAITING') return 'En espera'
  if (s === 'OFFERED') return 'Cupo ofertado'
  if (s === 'BOOKED') return 'Reservó'
  if (s === 'CANCELLED') return 'Cancelado'
  return s
}

function clientName(c?: { firstName?: string; lastName?: string } | null) {
  if (!c) return ''
  return `${c.firstName || ''} ${c.lastName || ''}`.trim()
}

async function load() {
  try {
    const [w, p, buy, c, g, svc, cli] = await Promise.all([
      api<any[]>('/waitlist').catch(() => []),
      api<any[]>('/packages').catch(() => []),
      api<any[]>('/packages/purchases').catch(() => []),
      api<any[]>('/marketing/coupons').catch(() => []),
      api<any[]>('/marketing/gift-cards').catch(() => []),
      api<any[]>('/services').catch(() => []),
      api<any[]>('/clients').catch(() => []),
    ])
    waitlist.value = w
    packages.value = p
    purchases.value = buy
    coupons.value = c
    gifts.value = g
    services.value = svc
    clients.value = cli
  } catch (e) {
    await toastError('Crecimiento', e instanceof Error ? e.message : 'Error')
  }
}

async function notifyWait(id: string) {
  await api(`/waitlist/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'OFFERED' }),
  })
  await toastSuccess('Listo', 'Avisamos que hay un cupo disponible')
  await load()
}

async function createPackage() {
  if (!pkgForm.value.name.trim()) return
  busy.value = true
  try {
    await api('/packages', {
      method: 'POST',
      body: JSON.stringify({
        name: pkgForm.value.name.trim(),
        sessions: Number(pkgForm.value.sessions),
        price: Number(pkgForm.value.price),
        serviceId: pkgForm.value.serviceId || undefined,
        validityDays: Number(pkgForm.value.validityDays) || undefined,
      }),
    })
    pkgForm.value = { name: '', sessions: 5, price: 100000, serviceId: '', validityDays: 90 }
    await toastSuccess('Paquete listo', 'Ya puedes venderlo a un cliente')
    await load()
  } catch (e) {
    await toastError('Paquete', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function sellPackage() {
  if (!sellForm.value.packageId || !sellForm.value.clientId) return
  busy.value = true
  try {
    await api('/packages/sell', {
      method: 'POST',
      body: JSON.stringify(sellForm.value),
    })
    sellForm.value = { packageId: '', clientId: '' }
    await toastSuccess('Venta registrada', 'El cliente ya tiene sus visitas a favor')
    await load()
  } catch (e) {
    await toastError('Venta', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function consumeVisit(purchaseId: string) {
  consumeBusyId.value = purchaseId
  try {
    const row = await api<any>(`/packages/purchases/${purchaseId}/consume`, {
      method: 'POST',
    })
    await toastSuccess(
      'Visita descontada',
      `Quedan ${row.totalSessions - row.usedSessions} de ${row.totalSessions}`,
    )
    await load()
  } catch (e) {
    await toastError('No se pudo descontar', e instanceof Error ? e.message : 'Error')
  } finally {
    consumeBusyId.value = null
  }
}

async function restoreVisit(purchaseId: string) {
  consumeBusyId.value = purchaseId
  try {
    const row = await api<any>(`/packages/purchases/${purchaseId}/restore`, {
      method: 'POST',
    })
    await toastSuccess(
      'Visita devuelta',
      `Ahora ${row.usedSessions}/${row.totalSessions} usadas`,
    )
    await load()
  } catch (e) {
    await toastError('No se pudo devolver', e instanceof Error ? e.message : 'Error')
  } finally {
    consumeBusyId.value = null
  }
}

function remaining(p: { totalSessions: number; usedSessions: number }) {
  return Math.max(0, p.totalSessions - p.usedSessions)
}

function progressPct(p: { totalSessions: number; usedSessions: number }) {
  if (!p.totalSessions) return 0
  return Math.min(100, Math.round((p.usedSessions / p.totalSessions) * 100))
}

function purchaseStatus(p: any) {
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return 'Vencido'
  if (!p.isActive || p.usedSessions >= p.totalSessions) return 'Agotado'
  return 'Activo'
}

async function createCoupon() {
  if (!couponForm.value.code.trim()) return
  busy.value = true
  try {
    await api('/marketing/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: couponForm.value.code.trim(),
        discountPct: Number(couponForm.value.discountPct),
        maxUses: Number(couponForm.value.maxUses) || undefined,
      }),
    })
    couponForm.value = { code: '', discountPct: 15, maxUses: 50 }
    await toastSuccess('Cupón creado', 'Compártelo con tus clientes')
    await load()
  } catch (e) {
    await toastError('Cupón', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function createGift() {
  if (!giftForm.value.amount || giftForm.value.amount < 1) return
  busy.value = true
  try {
    const created = await api<any>('/marketing/gift-cards', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(giftForm.value.amount),
        code: giftForm.value.code.trim() || undefined,
        clientId: giftForm.value.clientId || undefined,
      }),
    })
    const recipient =
      clientName(clients.value.find((c) => c.id === giftForm.value.clientId)) || null
    giftPreview.value = {
      ...created,
      recipientName: recipient,
      message: giftForm.value.message.trim() || null,
    }
    giftForm.value = { amount: 100000, code: '', clientId: '', message: '' }
    await toastSuccess('Gift card creada', 'Ya puedes imprimirla o copiar el código')
    await load()
  } catch (e) {
    await toastError('Gift card', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

function openGiftPrint(g: any) {
  printGiftCard(
    {
      code: g.code,
      amount: g.initial ?? g.amount,
      balance: g.balance,
      expiresAt: g.expiresAt,
      recipientName: g.recipientName || clientName(g.client),
      message: g.message,
    },
    { name: auth.user?.tenant?.name },
  )
}

function giftRecipientPreview() {
  const c = clients.value.find((x) => x.id === giftForm.value.clientId)
  return c ? `${c.firstName} ${c.lastName}` : ''
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    await toastSuccess('Código copiado')
  } catch {
    await toastError('No se pudo copiar')
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header>
      <p class="section-eyebrow">Fideliza y vende más</p>
      <h1 class="font-display text-3xl font-bold md:text-4xl">Crecimiento</h1>
      <p class="mt-2 max-w-2xl text-sm text-ink-muted">
        Gestiona espera, packs de sesiones, descuentos y tarjetas regalo con un flujo simple.
      </p>
      <nav class="mt-5 flex flex-wrap gap-2 text-sm">
        <RouterLink
          v-for="t in [
            { id: 'waitlist', label: 'Lista de espera', icon: Clock3 },
            { id: 'packages', label: 'Paquetes', icon: Package },
            { id: 'coupons', label: 'Cupones', icon: Percent },
            { id: 'gifts', label: 'Gift cards', icon: Gift },
          ]"
          :key="t.id"
          :to="{ name: 'growth', query: { tab: t.id } }"
          class="inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium transition"
          :class="
            tab === t.id
              ? 'bg-brand-700 text-white shadow-soft'
              : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15'
          "
        >
          <component :is="t.icon" class="h-4 w-4" />
          {{ t.label }}
        </RouterLink>
      </nav>
    </header>

    <!-- ESPERA -->
    <section v-if="tab === 'waitlist'" class="space-y-4">
      <article class="surface p-5 md:p-6">
        <div class="flex items-start gap-3">
          <div class="rounded-2xl bg-brand-50 p-2.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
            <Users class="h-5 w-5" />
          </div>
          <div>
            <h2 class="font-display text-xl font-semibold">Lista de espera</h2>
            <p class="mt-1 text-sm text-ink-muted">
              Cuando no hay agenda libre, anota al cliente aquí y ofrécele el próximo cupo.
            </p>
          </div>
        </div>

        <ul class="mt-5 space-y-3">
          <li
            v-for="row in waitlist"
            :key="row.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5"
          >
            <div>
              <p class="font-semibold">
                {{ row.client?.firstName }} {{ row.client?.lastName }}
              </p>
              <p class="text-sm text-ink-muted">
                {{ row.service?.name || 'Servicio' }}
                · {{ waitStatus(row.status) }}
              </p>
            </div>
            <button
              v-if="row.status === 'WAITING'"
              type="button"
              class="rounded-full bg-brand-700 px-4 py-2 text-xs font-semibold text-white"
              @click="notifyWait(row.id)"
            >
              Ofertar cupo
            </button>
            <span
              v-else
              class="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-ink-muted dark:bg-white/10"
            >
              {{ waitStatus(row.status) }}
            </span>
          </li>
          <li
            v-if="!waitlist.length"
            class="rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-ink-muted dark:border-white/10"
          >
            Nadie en espera por ahora.
          </li>
        </ul>
      </article>
    </section>

    <!-- PAQUETES -->
    <section v-else-if="tab === 'packages'" class="space-y-4">
      <article class="surface p-5 md:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-brand-50 p-2.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              <Users class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-xl font-semibold">Visitas de clientes</h2>
              <p class="mt-1 max-w-xl text-sm text-ink-muted">
                Aquí descuentas visitas manualmente. También se descuenta sola al marcar la cita como
                <b>Atendida</b> en el calendario.
              </p>
            </div>
          </div>
          <div
            class="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
          >
            {{ activePurchases.length }} activos
          </div>
        </div>

        <div class="mt-4">
          <input
            v-model="purchaseFilter"
            type="search"
            placeholder="Buscar cliente o paquete…"
            class="input-field !rounded-xl !py-3"
          />
        </div>

        <div class="mt-4 grid gap-3">
          <article
            v-for="b in filteredPurchases"
            :key="b.id"
            class="rounded-2xl border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-semibold">
                  {{ b.client?.firstName }} {{ b.client?.lastName }}
                </p>
                <p class="text-sm text-ink-muted">
                  {{ b.package?.name }}
                  <span v-if="b.package?.service?.name"> · {{ b.package.service.name }}</span>
                </p>
              </div>
              <span
                class="rounded-full px-2.5 py-1 text-xs font-bold"
                :class="
                  purchaseStatus(b) === 'Activo'
                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : purchaseStatus(b) === 'Vencido'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-black/5 text-ink-muted dark:bg-white/10'
                "
              >
                {{ purchaseStatus(b) }}
              </span>
            </div>

            <div class="mt-3">
              <div class="mb-1.5 flex items-center justify-between text-xs">
                <span class="font-semibold text-ink-muted">
                  {{ b.usedSessions }} usadas · {{ remaining(b) }} disponibles
                </span>
                <span class="font-bold">{{ b.usedSessions }}/{{ b.totalSessions }}</span>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div
                  class="h-full rounded-full bg-brand-600 transition-all"
                  :style="{ width: `${progressPct(b)}%` }"
                />
              </div>
              <p v-if="b.expiresAt" class="mt-1.5 text-xs text-ink-muted">
                Vence {{ new Date(b.expiresAt).toLocaleDateString('es-CO') }}
              </p>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-brand-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                :disabled="
                  consumeBusyId === b.id ||
                  remaining(b) < 1 ||
                  purchaseStatus(b) !== 'Activo'
                "
                @click="consumeVisit(b.id)"
              >
                <Minus class="h-3.5 w-3.5" />
                Usar 1 visita
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-4 py-2 text-xs font-semibold dark:border-white/10 dark:bg-white/5 disabled:opacity-50"
                :disabled="consumeBusyId === b.id || b.usedSessions < 1"
                @click="restoreVisit(b.id)"
              >
                <RotateCcw class="h-3.5 w-3.5" />
                Devolver visita
              </button>
            </div>
          </article>

          <p
            v-if="!filteredPurchases.length"
            class="rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-ink-muted dark:border-white/10"
          >
            {{
              purchases.length
                ? 'No hay resultados con ese filtro.'
                : 'Aún no hay paquetes vendidos. Créalo y véndelo abajo.'
            }}
          </p>
        </div>
      </article>

      <div class="grid gap-4 lg:grid-cols-2">
        <article class="surface p-5 md:p-6">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-brand-50 p-2.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              <Package class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-xl font-semibold">1. Crear paquete</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Define cuántas visitas incluye y a qué precio lo vendes.
              </p>
            </div>
          </div>
          <div class="mt-5 space-y-3">
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Nombre</span>
              <input
                v-model="pkgForm.name"
                placeholder="Ej. 5 cortes clásicos"
                class="input-field !rounded-xl !py-3"
              />
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Servicio (opcional)</span>
              <select v-model="pkgForm.serviceId" class="input-field !rounded-xl !py-3">
                <option value="">Cualquier servicio</option>
                <option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block text-sm">
                <span class="mb-1.5 block text-ink-muted">Visitas</span>
                <input
                  v-model.number="pkgForm.sessions"
                  type="number"
                  min="1"
                  class="input-field !rounded-xl !py-3"
                />
              </label>
              <label class="block text-sm">
                <span class="mb-1.5 block text-ink-muted">Precio</span>
                <input
                  v-model.number="pkgForm.price"
                  type="number"
                  min="0"
                  step="1000"
                  class="input-field !rounded-xl !py-3"
                />
              </label>
            </div>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Vigencia (días)</span>
              <input
                v-model.number="pkgForm.validityDays"
                type="number"
                min="1"
                class="input-field !rounded-xl !py-3"
              />
            </label>
            <button
              type="button"
              class="btn-primary !rounded-xl !px-5 !py-3"
              :disabled="busy || !pkgForm.name.trim()"
              @click="createPackage"
            >
              <Plus class="h-4 w-4" />
              Guardar paquete
            </button>
          </div>

          <div v-if="packages.length" class="mt-6 space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Catálogo</p>
            <div
              v-for="p in packages"
              :key="p.id"
              class="rounded-xl border border-black/5 bg-white/50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
            >
              <b>{{ p.name }}</b>
              · {{ p.sessions }} visitas · {{ money(p.price) }}
            </div>
          </div>
        </article>

        <article class="surface p-5 md:p-6">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-amber-50 p-2.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <Sparkles class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-xl font-semibold">2. Vender a un cliente</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Se registra el cobro y el cliente queda con visitas a favor.
              </p>
            </div>
          </div>
          <div class="mt-5 space-y-3">
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Paquete</span>
              <select v-model="sellForm.packageId" class="input-field !rounded-xl !py-3">
                <option value="">Selecciona…</option>
                <option v-for="p in packages.filter((x) => x.isActive)" :key="p.id" :value="p.id">
                  {{ p.name }} ({{ p.sessions }} · {{ money(p.price) }})
                </option>
              </select>
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Cliente</span>
              <select v-model="sellForm.clientId" class="input-field !rounded-xl !py-3">
                <option value="">Selecciona…</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">
                  {{ c.firstName }} {{ c.lastName }}
                </option>
              </select>
            </label>
            <button
              type="button"
              class="btn-primary !rounded-xl !px-5 !py-3"
              :disabled="busy || !sellForm.packageId || !sellForm.clientId"
              @click="sellPackage"
            >
              Registrar venta
            </button>
          </div>
        </article>
      </div>
    </section>

    <!-- CUPONES -->
    <section v-else-if="tab === 'coupons'" class="space-y-4">
      <article class="surface p-5 md:p-6">
        <div class="flex items-start gap-3">
          <div class="rounded-2xl bg-violet-50 p-2.5 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
            <Percent class="h-5 w-5" />
          </div>
          <div>
            <h2 class="font-display text-xl font-semibold">Cupones de descuento</h2>
            <p class="mt-1 text-sm text-ink-muted">
              Crea códigos fáciles de recordar para campañas y redes.
            </p>
          </div>
        </div>
        <div class="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_120px_auto]">
          <label class="block text-sm">
            <span class="mb-1.5 block text-ink-muted">Código</span>
            <input
              v-model="couponForm.code"
              placeholder="VERANO20"
              class="input-field !rounded-xl !py-3 uppercase"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block text-ink-muted">% dto.</span>
            <input
              v-model.number="couponForm.discountPct"
              type="number"
              min="1"
              max="100"
              class="input-field !rounded-xl !py-3"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block text-ink-muted">Máx. usos</span>
            <input
              v-model.number="couponForm.maxUses"
              type="number"
              min="1"
              class="input-field !rounded-xl !py-3"
            />
          </label>
          <div class="flex items-end">
            <button
              type="button"
              class="btn-primary w-full !rounded-xl !px-5 !py-3"
              :disabled="busy || !couponForm.code.trim()"
              @click="createCoupon"
            >
              Crear
            </button>
          </div>
        </div>
      </article>

      <div class="grid gap-3 sm:grid-cols-2">
        <article
          v-for="c in coupons"
          :key="c.id"
          class="relative overflow-hidden rounded-3xl border border-dashed border-brand-700/30 bg-gradient-to-br from-white to-brand-50/60 p-5 dark:from-ink-soft dark:to-brand-950/40"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">
            Cupón
          </p>
          <p class="mt-2 font-display text-2xl font-bold tracking-wide">{{ c.code }}</p>
          <p class="mt-1 text-sm text-ink-muted">
            {{ c.discountPct || 0 }}% de descuento · usos {{ c.usedCount }}/{{ c.maxUses ?? '∞' }}
          </p>
          <button
            type="button"
            class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold dark:bg-white/10"
            @click="copyCode(c.code)"
          >
            <Copy class="h-3.5 w-3.5" />
            Copiar código
          </button>
        </article>
        <p
          v-if="!coupons.length"
          class="rounded-3xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-ink-muted dark:border-white/10 sm:col-span-2"
        >
          Todavía no hay cupones. Crea el primero arriba.
        </p>
      </div>
    </section>

    <!-- GIFT CARDS -->
    <section v-else class="space-y-4">
      <article class="surface p-5 md:p-6">
        <div class="flex items-start gap-3">
          <div class="rounded-2xl bg-rose-50 p-2.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <Gift class="h-5 w-5" />
          </div>
          <div>
            <h2 class="font-display text-xl font-semibold">Crear gift card</h2>
            <p class="mt-1 text-sm text-ink-muted">
              Genera una tarjeta regalo bonita para imprimir o enviar. El código queda listo para canjear.
            </p>
          </div>
        </div>

        <div class="mt-5 space-y-4">
          <div>
            <p class="mb-2 text-sm text-ink-muted">Monto rápido</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="amt in giftAmounts"
                :key="amt"
                type="button"
                class="rounded-full px-4 py-2 text-sm font-semibold transition"
                :class="
                  giftForm.amount === amt
                    ? 'bg-brand-700 text-white'
                    : 'bg-black/5 hover:bg-black/10 dark:bg-white/10'
                "
                @click="giftForm.amount = amt"
              >
                {{ money(amt) }}
              </button>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Monto</span>
              <input
                v-model.number="giftForm.amount"
                type="number"
                min="1000"
                step="1000"
                class="input-field !rounded-xl !py-3"
              />
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Código (opcional)</span>
              <input
                v-model="giftForm.code"
                placeholder="Se genera solo si lo dejas vacío"
                class="input-field !rounded-xl !py-3 uppercase"
              />
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Para (cliente, opcional)</span>
              <select v-model="giftForm.clientId" class="input-field !rounded-xl !py-3">
                <option value="">Quien la reciba</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">
                  {{ c.firstName }} {{ c.lastName }}
                </option>
              </select>
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block text-ink-muted">Mensaje en la tarjeta</span>
              <input
                v-model="giftForm.message"
                placeholder="Feliz cumpleaños…"
                class="input-field !rounded-xl !py-3"
              />
            </label>
          </div>

          <!-- Vista previa en vivo -->
          <div
            class="relative overflow-hidden rounded-[28px] p-6 text-white shadow-lift"
            style="
              background:
                radial-gradient(ellipse 80% 60% at 10% 0%, rgba(255,255,255,0.22), transparent 55%),
                linear-gradient(135deg, #0f766e 0%, #115e59 42%, #134e4a 100%);
            "
          >
            <div class="pointer-events-none absolute inset-3 rounded-2xl border border-white/20" />
            <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80">Gift card</p>
            <p class="mt-1 font-display text-2xl font-semibold">
              {{ auth.user?.tenant?.name || 'BeautyBook' }}
            </p>
            <p class="mt-5 font-display text-4xl font-bold tracking-tight">
              {{ money(giftForm.amount || 0) }}
            </p>
            <p v-if="giftForm.clientId" class="mt-2 text-sm text-white/90">
              Para <b>{{ giftRecipientPreview() }}</b>
            </p>
            <p class="mt-2 max-w-sm text-sm text-white/80">
              {{
                giftForm.message.trim() ||
                'Un detalle especial para ti. Disfruta tu experiencia con nosotros.'
              }}
            </p>
            <p class="mt-6 text-[10px] uppercase tracking-[0.2em] text-white/60">Código</p>
            <p class="font-mono text-lg tracking-widest">
              {{ giftForm.code.trim().toUpperCase() || 'SE GENERARÁ AL CREAR' }}
            </p>
          </div>

          <button
            type="button"
            class="btn-primary !rounded-xl !px-5 !py-3"
            :disabled="busy || !giftForm.amount"
            @click="createGift"
          >
            <Gift class="h-4 w-4" />
            Generar gift card
          </button>
        </div>
      </article>

      <div>
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Tarjetas emitidas
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <article
            v-for="g in gifts"
            :key="g.id"
            class="relative overflow-hidden rounded-[24px] p-5 text-white shadow-soft"
            style="
              background:
                radial-gradient(ellipse 70% 50% at 100% 0%, rgba(255,255,255,0.16), transparent 50%),
                linear-gradient(145deg, #0f766e, #134e4a);
            "
          >
            <div class="pointer-events-none absolute inset-2.5 rounded-2xl border border-white/15" />
            <div class="relative">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
                    Gift card
                  </p>
                  <p class="mt-1 font-display text-2xl font-bold">{{ money(g.balance) }}</p>
                  <p class="text-xs text-white/70">de {{ money(g.initial) }}</p>
                </div>
                <Gift class="h-5 w-5 text-white/70" />
              </div>
              <p v-if="g.client" class="mt-3 text-sm">
                Para {{ g.client.firstName }} {{ g.client.lastName }}
              </p>
              <p class="mt-3 font-mono text-sm tracking-wider">{{ g.code }}</p>
              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
                  @click="openGiftPrint(g)"
                >
                  <Printer class="h-3.5 w-3.5" />
                  Ver / imprimir
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
                  @click="copyCode(g.code)"
                >
                  <Copy class="h-3.5 w-3.5" />
                  Copiar
                </button>
              </div>
            </div>
          </article>
          <p
            v-if="!gifts.length"
            class="rounded-3xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-ink-muted dark:border-white/10 sm:col-span-2"
          >
            Aún no hay gift cards. Crea una y se verá aquí como tarjeta.
          </p>
        </div>
      </div>
    </section>

    <!-- Modal post-creación gift -->
    <div
      v-if="giftPreview"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      @click.self="giftPreview = null"
    >
      <div class="w-full max-w-md space-y-4">
        <div
          class="relative overflow-hidden rounded-[28px] p-6 text-white shadow-lift"
          style="
            background:
              radial-gradient(ellipse 80% 60% at 10% 0%, rgba(255,255,255,0.22), transparent 55%),
              linear-gradient(135deg, #0f766e 0%, #115e59 42%, #134e4a 100%);
          "
        >
          <div class="pointer-events-none absolute inset-3 rounded-2xl border border-white/20" />
          <div class="relative">
            <p class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80">
              <Check class="h-3.5 w-3.5" /> Lista
            </p>
            <p class="mt-2 font-display text-2xl font-semibold">
              {{ auth.user?.tenant?.name || 'BeautyBook' }}
            </p>
            <p class="mt-5 font-display text-4xl font-bold">{{ money(giftPreview.initial) }}</p>
            <p v-if="giftPreview.recipientName" class="mt-2 text-sm">
              Para <b>{{ giftPreview.recipientName }}</b>
            </p>
            <p class="mt-2 text-sm text-white/85">
              {{
                giftPreview.message ||
                'Un detalle especial para ti. Disfruta tu experiencia con nosotros.'
              }}
            </p>
            <p class="mt-6 text-[10px] uppercase tracking-[0.2em] text-white/60">Código</p>
            <p class="font-mono text-xl tracking-widest">{{ giftPreview.code }}</p>
          </div>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class="btn-ghost !py-2.5" @click="giftPreview = null">Cerrar</button>
          <button
            type="button"
            class="btn-ghost !py-2.5"
            @click="copyCode(giftPreview.code)"
          >
            <Copy class="h-4 w-4" />
            Copiar código
          </button>
          <button
            type="button"
            class="btn-primary !py-2.5"
            @click="openGiftPrint(giftPreview)"
          >
            <Printer class="h-4 w-4" />
            Imprimir carta
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
