<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  Gift,
  Package,
  Percent,
  Printer,
  Copy,
  Users,
  Check,
  Minus,
  Plus,
  RotateCcw,
  Power,
  ShoppingBag,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue'
import { api } from '@/api/client'
import { toastError, toastSuccess, confirmAction } from '@/lib/swal'
import { printGiftCard } from '@/lib/printGiftCard'
import GiftCardQr from '@/components/GiftCardQr.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()

const tab = computed(() => {
  const t = String(route.query.tab || 'packages')
  return ['packages', 'coupons', 'gifts'].includes(t) ? t : 'packages'
})

const packages = ref<any[]>([])
const purchases = ref<any[]>([])
const coupons = ref<any[]>([])
const gifts = ref<any[]>([])
const giftPage = ref(1)
const GIFT_PAGE_SIZE = 4
const giftTotalPages = computed(() =>
  Math.max(1, Math.ceil(gifts.value.length / GIFT_PAGE_SIZE)),
)
const pagedGifts = computed(() => {
  const start = (giftPage.value - 1) * GIFT_PAGE_SIZE
  return gifts.value.slice(start, start + GIFT_PAGE_SIZE)
})

function clampGiftPage() {
  if (giftPage.value > giftTotalPages.value) giftPage.value = giftTotalPages.value
  if (giftPage.value < 1) giftPage.value = 1
}
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
const showCreatePkgModal = ref(false)
const showSellModal = ref(false)

function resetPkgForm() {
  pkgForm.value = {
    name: '',
    sessions: 5,
    price: 100000,
    serviceId: '',
    validityDays: 90,
  }
}

function openCreatePkg() {
  resetPkgForm()
  showCreatePkgModal.value = true
}

function openSell(pkgId?: string) {
  sellForm.value = {
    packageId: pkgId || '',
    clientId: '',
  }
  showSellModal.value = true
}

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

function clientName(c?: { firstName?: string; lastName?: string } | null) {
  if (!c) return ''
  return `${c.firstName || ''} ${c.lastName || ''}`.trim()
}

async function load() {
  try {
    const [p, buy, c, g, svc, cli] = await Promise.all([
      api<any[]>('/packages').catch(() => []),
      api<any[]>('/packages/purchases').catch(() => []),
      api<any[]>('/marketing/coupons').catch(() => []),
      api<any[]>('/marketing/gift-cards').catch(() => []),
      api<any[]>('/services').catch(() => []),
      api<any[]>('/clients').catch(() => []),
    ])
    packages.value = p
    purchases.value = buy
    coupons.value = c
    gifts.value = g
    services.value = svc
    clients.value = cli
    clampGiftPage()
  } catch (e) {
    await toastError('Crecimiento', e instanceof Error ? e.message : 'Error')
  }
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
    showCreatePkgModal.value = false
    resetPkgForm()
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
    const sold = await api<{
      invoice?: { number: string; total: string | number }
    }>('/packages/sell', {
      method: 'POST',
      body: JSON.stringify(sellForm.value),
    })
    showSellModal.value = false
    sellForm.value = { packageId: '', clientId: '' }
    await toastSuccess(
      'Venta facturada',
      sold.invoice?.number
        ? `Factura ${sold.invoice.number} · ${money(sold.invoice.total)}`
        : 'El cliente ya tiene sus visitas a favor',
    )
    await load()
  } catch (e) {
    await toastError('Venta', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function togglePackage(pkg: { id: string; name: string; isActive: boolean }) {
  const next = !pkg.isActive
  const ok = await confirmAction({
    title: next ? `¿Activar «${pkg.name}»?` : `¿Desactivar «${pkg.name}»?`,
    text: next
      ? 'Volverá a aparecer al vender paquetes.'
      : 'No se podrá vender hasta que lo actives de nuevo.',
    confirmText: next ? 'Activar' : 'Desactivar',
  })
  if (!ok) return
  busy.value = true
  try {
    await api(`/packages/${pkg.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: next }),
    })
    await toastSuccess(next ? 'Paquete activo' : 'Paquete desactivado')
    await load()
  } catch (e) {
    await toastError('Paquete', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function deletePackage(pkg: { id: string; name: string }) {
  const ok = await confirmAction({
    title: `¿Eliminar «${pkg.name}»?`,
    text: 'También se borrarán las visitas vendidas de este paquete.',
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await api(`/packages/${pkg.id}`, { method: 'DELETE' })
    await toastSuccess('Paquete eliminado')
    await load()
  } catch (e) {
    await toastError('Paquete', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function deleteCoupon(c: { id: string; code: string }) {
  const ok = await confirmAction({
    title: `¿Eliminar cupón ${c.code}?`,
    text: 'Ya no se podrá usar este código.',
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await api(`/marketing/coupons/${c.id}`, { method: 'DELETE' })
    await toastSuccess('Cupón eliminado')
    await load()
  } catch (e) {
    await toastError('Cupón', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function deleteGift(g: { id: string; code: string }) {
  const ok = await confirmAction({
    title: `¿Eliminar gift card ${g.code}?`,
    text: 'Se perderá el saldo restante.',
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await api(`/marketing/gift-cards/${g.id}`, { method: 'DELETE' })
    await toastSuccess('Gift card eliminada')
    await load()
  } catch (e) {
    await toastError('Gift card', e instanceof Error ? e.message : 'Error')
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
    giftPage.value = 1
    await toastSuccess(
      'Gift card facturada',
      created.invoice?.number
        ? `Factura ${created.invoice.number} · ${money(created.invoice.total)}`
        : 'Ya puedes imprimirla o copiar el código',
    )
    await load()
  } catch (e) {
    await toastError('Gift card', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function openGiftPrint(g: any) {
  await printGiftCard(
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
        Packs de sesiones, cupones y tarjetas regalo con un flujo simple.
      </p>
      <nav class="mt-5 flex flex-wrap gap-2 text-sm">
        <RouterLink
          v-for="t in [
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

    <!-- PAQUETES -->
    <section v-if="tab === 'packages'" class="space-y-4">
      <article class="surface overflow-hidden">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-black/5 p-5 md:p-6 dark:border-white/10">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-brand-50 p-2.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              <Package class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-xl font-semibold">Catálogo de paquetes</h2>
              <p class="mt-1 text-sm text-ink-muted">
                Crea packs de visitas y véndelos a tus clientes.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn-ghost !py-2.5 !px-4" @click="openSell()">
              <ShoppingBag class="h-4 w-4" />
              Vender
            </button>
            <button type="button" class="btn-primary !py-2.5 !px-4" @click="openCreatePkg">
              <Plus class="h-4 w-4" />
              Nuevo paquete
            </button>
          </div>
        </div>

        <div v-if="!packages.length" class="px-6 py-14 text-center">
          <Package class="mx-auto h-10 w-10 text-ink-muted/40" />
          <p class="mt-3 font-display text-lg font-bold">Sin paquetes</p>
          <p class="mt-1 text-sm text-ink-muted">Crea el primero para empezar a vender visitas.</p>
          <button type="button" class="btn-primary mt-5 !py-2.5" @click="openCreatePkg">
            <Plus class="h-4 w-4" />
            Crear paquete
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-left text-sm">
            <thead class="bg-black/[0.03] text-xs uppercase tracking-wide text-ink-muted dark:bg-white/5">
              <tr>
                <th class="px-4 py-3 font-semibold">Nombre</th>
                <th class="px-4 py-3 font-semibold">Servicio</th>
                <th class="px-4 py-3 font-semibold">Visitas</th>
                <th class="px-4 py-3 font-semibold">Precio</th>
                <th class="px-4 py-3 font-semibold">Vigencia</th>
                <th class="px-4 py-3 font-semibold">Estado</th>
                <th class="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in packages"
                :key="p.id"
                class="border-t border-black/5 dark:border-white/10"
              >
                <td class="px-4 py-3 font-semibold">{{ p.name }}</td>
                <td class="px-4 py-3 text-ink-muted">
                  {{ p.service?.name || 'Cualquiera' }}
                </td>
                <td class="px-4 py-3">{{ p.sessions }}</td>
                <td class="px-4 py-3">{{ money(p.price) }}</td>
                <td class="px-4 py-3 text-ink-muted">
                  {{ p.validityDays ? `${p.validityDays} días` : 'Sin límite' }}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="rounded-full px-2.5 py-1 text-xs font-bold"
                    :class="
                      p.isActive
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-black/5 text-ink-muted dark:bg-white/10'
                    "
                  >
                    {{ p.isActive ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 disabled:opacity-40 dark:bg-brand-950 dark:text-brand-300"
                      :disabled="!p.isActive || busy"
                      @click="openSell(p.id)"
                    >
                      <ShoppingBag class="h-3.5 w-3.5" />
                      Vender
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-ink dark:bg-white/5"
                      :disabled="busy"
                      @click="togglePackage(p)"
                    >
                      <Power class="h-3.5 w-3.5" />
                      {{ p.isActive ? 'Desactivar' : 'Activar' }}
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300"
                      :disabled="busy"
                      @click="deletePackage(p)"
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="surface p-5 md:p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <div class="rounded-2xl bg-brand-50 p-2.5 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
              <Users class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-xl font-semibold">Visitas de clientes</h2>
              <p class="mt-1 max-w-xl text-sm text-ink-muted">
                Descuenta visitas manualmente o al marcar la cita como <b>Atendida</b> en el calendario.
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
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Buscar</span>
            <input
              v-model="purchaseFilter"
              type="search"
              placeholder="Cliente o paquete…"
              class="input-field !rounded-xl !py-3"
            />
          </label>
        </div>

        <div class="mt-4 overflow-x-auto rounded-2xl border border-black/5 dark:border-white/10">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead class="bg-black/[0.03] text-xs uppercase tracking-wide text-ink-muted dark:bg-white/5">
              <tr>
                <th class="px-4 py-3 font-semibold">Cliente</th>
                <th class="px-4 py-3 font-semibold">Paquete</th>
                <th class="px-4 py-3 font-semibold">Progreso</th>
                <th class="px-4 py-3 font-semibold">Estado</th>
                <th class="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="b in filteredPurchases"
                :key="b.id"
                class="border-t border-black/5 dark:border-white/10"
              >
                <td class="px-4 py-3 font-semibold">
                  {{ b.client?.firstName }} {{ b.client?.lastName }}
                </td>
                <td class="px-4 py-3 text-ink-muted">
                  {{ b.package?.name }}
                  <span v-if="b.package?.service?.name"> · {{ b.package.service.name }}</span>
                </td>
                <td class="px-4 py-3">
                  <div class="min-w-[140px]">
                    <div class="mb-1 flex justify-between text-xs">
                      <span class="text-ink-muted">{{ remaining(b) }} disponibles</span>
                      <span class="font-bold">{{ b.usedSessions }}/{{ b.totalSessions }}</span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                      <div
                        class="h-full rounded-full bg-brand-600"
                        :style="{ width: `${progressPct(b)}%` }"
                      />
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3">
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
                </td>
                <td class="px-4 py-3">
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                      :disabled="
                        consumeBusyId === b.id ||
                        remaining(b) < 1 ||
                        purchaseStatus(b) !== 'Activo'
                      "
                      @click="consumeVisit(b.id)"
                    >
                      <Minus class="h-3.5 w-3.5" />
                      Usar 1
                    </button>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted dark:bg-white/5 disabled:opacity-40"
                      :disabled="consumeBusyId === b.id || b.usedSessions < 1"
                      @click="restoreVisit(b.id)"
                    >
                      <RotateCcw class="h-3.5 w-3.5" />
                      Devolver
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!filteredPurchases.length">
                <td colspan="5" class="px-4 py-10 text-center text-ink-muted">
                  {{
                    purchases.length
                      ? 'No hay resultados con ese filtro.'
                      : 'Aún no hay paquetes vendidos.'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <!-- Modal crear paquete -->
      <div
        v-if="showCreatePkgModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
        @click.self="showCreatePkgModal = false"
      >
        <div class="surface w-full max-w-lg p-6 shadow-lift">
          <h2 class="font-display text-xl font-bold">Nuevo paquete</h2>
          <p class="mt-1 text-sm text-ink-muted">
            Define cuántas visitas incluye y a qué precio lo vendes.
          </p>
          <div class="mt-5 space-y-3">
            <label class="block text-sm">
              <span class="mb-1.5 block font-medium text-ink">Nombre</span>
              <input
                v-model="pkgForm.name"
                placeholder="Ej. 5 cortes clásicos"
                class="input-field !rounded-xl !py-3"
              />
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block font-medium text-ink">Servicio</span>
              <select v-model="pkgForm.serviceId" class="input-field !rounded-xl !py-3">
                <option value="">Cualquier servicio</option>
                <option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="block text-sm">
                <span class="mb-1.5 block font-medium text-ink">Visitas incluidas</span>
                <input
                  v-model.number="pkgForm.sessions"
                  type="number"
                  min="1"
                  class="input-field !rounded-xl !py-3"
                />
              </label>
              <label class="block text-sm">
                <span class="mb-1.5 block font-medium text-ink">Precio</span>
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
              <span class="mb-1.5 block font-medium text-ink">Vigencia (días)</span>
              <input
                v-model.number="pkgForm.validityDays"
                type="number"
                min="1"
                class="input-field !rounded-xl !py-3"
              />
            </label>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showCreatePkgModal = false">
              Cancelar
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="busy || !pkgForm.name.trim()"
              @click="createPackage"
            >
              {{ busy ? 'Guardando…' : 'Crear paquete' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal vender paquete -->
      <div
        v-if="showSellModal"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
        @click.self="showSellModal = false"
      >
        <div class="surface w-full max-w-lg p-6 shadow-lift">
          <h2 class="font-display text-xl font-bold">Vender paquete</h2>
          <p class="mt-1 text-sm text-ink-muted">
            Se registra el cobro y el cliente queda con visitas a favor.
          </p>
          <div class="mt-5 space-y-3">
            <label class="block text-sm">
              <span class="mb-1.5 block font-medium text-ink">Paquete</span>
              <select v-model="sellForm.packageId" class="input-field !rounded-xl !py-3">
                <option value="">Selecciona un paquete…</option>
                <option
                  v-for="p in packages.filter((x) => x.isActive)"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.name }} ({{ p.sessions }} · {{ money(p.price) }})
                </option>
              </select>
            </label>
            <label class="block text-sm">
              <span class="mb-1.5 block font-medium text-ink">Cliente</span>
              <select v-model="sellForm.clientId" class="input-field !rounded-xl !py-3">
                <option value="">Selecciona un cliente…</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">
                  {{ c.firstName }} {{ c.lastName }}
                </option>
              </select>
            </label>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="btn-ghost" @click="showSellModal = false">
              Cancelar
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="busy || !sellForm.packageId || !sellForm.clientId"
              @click="sellPackage"
            >
              {{ busy ? 'Registrando…' : 'Registrar venta' }}
            </button>
          </div>
        </div>
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
          <button
            type="button"
            class="mt-2 ml-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
            :disabled="busy"
            @click="deleteCoupon(c)"
          >
            <Trash2 class="h-3.5 w-3.5" />
            Eliminar
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
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Tarjetas emitidas
            <span v-if="gifts.length" class="font-normal normal-case tracking-normal text-ink-muted/80">
              · {{ gifts.length }}
            </span>
          </p>
          <p
            v-if="gifts.length > GIFT_PAGE_SIZE"
            class="text-xs text-ink-muted"
          >
            Página {{ giftPage }} de {{ giftTotalPages }}
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <article
            v-for="g in pagedGifts"
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
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
                    Gift card
                  </p>
                  <p class="mt-1 font-display text-2xl font-bold">{{ money(g.balance) }}</p>
                  <p class="text-xs text-white/70">de {{ money(g.initial) }}</p>
                </div>
                <GiftCardQr :code="g.code" :image-url="g.imageUrl" :size="88" light />
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
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-full bg-red-500/25 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-red-500/40"
                  :disabled="busy"
                  @click="deleteGift(g)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  Eliminar
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

        <div
          v-if="gifts.length > GIFT_PAGE_SIZE"
          class="mt-4 flex items-center justify-center gap-2"
        >
          <button
            type="button"
            class="btn-ghost !px-3 !py-2"
            :disabled="giftPage <= 1"
            @click="giftPage--"
          >
            <ChevronLeft class="h-4 w-4" />
            Anterior
          </button>
          <div class="flex flex-wrap items-center gap-1">
            <button
              v-for="p in giftTotalPages"
              :key="p"
              type="button"
              class="min-w-9 rounded-xl px-2.5 py-2 text-sm font-semibold transition"
              :class="
                p === giftPage
                  ? 'bg-brand text-white'
                  : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15'
              "
              @click="giftPage = p"
            >
              {{ p }}
            </button>
          </div>
          <button
            type="button"
            class="btn-ghost !px-3 !py-2"
            :disabled="giftPage >= giftTotalPages"
            @click="giftPage++"
          >
            Siguiente
            <ChevronRight class="h-4 w-4" />
          </button>
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
            <div class="mt-6 flex items-end justify-between gap-4">
              <div>
                <p class="text-[10px] uppercase tracking-[0.2em] text-white/60">Código</p>
                <p class="font-mono text-xl tracking-widest">{{ giftPreview.code }}</p>
              </div>
              <GiftCardQr
                :code="giftPreview.code"
                :image-url="giftPreview.imageUrl"
                :size="100"
                light
              />
            </div>
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
