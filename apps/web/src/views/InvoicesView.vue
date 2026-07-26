<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  FileText,
  Plus,
  Banknote,
  XCircle,
  Printer,
  MessageCircle,
  Download,
  ChevronDown,
  Check,
  Gift,
  Package,
} from '@lucide/vue'
import { api, API_ORIGIN } from '@/api/client'
import { confirmAction, toastSuccess, toastError } from '@/lib/swal'
import { printInvoice } from '@/lib/printInvoice'
import { useAuthStore } from '@/stores/auth'

type InvoiceRow = {
  id: string
  number: string
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED'
  currency: string
  subtotal: string | number
  tax: string | number
  total: string | number
  notes?: string | null
  issuedAt: string
  paidAt?: string | null
  client?: { id: string; firstName: string; lastName: string; phone?: string | null } | null
  appointment?: { id: string; startAt: string } | null
  items?: Array<{
    id: string
    description: string
    quantity: number
    unitPrice: string | number
    total: string | number
  }>
}

type Summary = {
  issued: number
  paid: number
  cancelled: number
  paidTotal: number
}

type AppointmentOption = {
  id: string
  startAt: string
  price: string | number
  client: { firstName: string; lastName: string }
  service: { name: string }
  worker: { firstName: string; lastName: string }
}

const loading = ref(true)
const error = ref('')
const rows = ref<InvoiceRow[]>([])
const summary = ref<Summary | null>(null)
const filter = ref<'ALL' | 'ISSUED' | 'PAID' | 'CANCELLED'>('ALL')
const showModal = ref(false)
const busy = ref(false)
const appointments = ref<AppointmentOption[]>([])
const selectedAppointmentId = ref('')
const appointmentMenuOpen = ref(false)
const selectedInvoice = ref<InvoiceRow | null>(null)
const auth = useAuthStore()

type CreateMode = 'appointment' | 'package' | 'gift'
const createMode = ref<CreateMode>('appointment')
const packages = ref<Array<{ id: string; name: string; sessions: number; price: string | number; isActive: boolean }>>([])
const clients = ref<Array<{ id: string; firstName: string; lastName: string }>>([])
const sellPackageId = ref('')
const sellClientId = ref('')
const giftAmount = ref(100000)
const giftClientId = ref('')
const giftCode = ref('')

const showPayModal = ref(false)
const payInvoice = ref<InvoiceRow | null>(null)
const payMethod = ref<'CASH' | 'CARD' | 'TRANSFER'>('CASH')
const payGiftCode = ref('')
const giftCheck = ref<{
  valid?: boolean
  code?: string
  balance?: number
  message?: string
  error?: string
} | null>(null)
const giftCheckBusy = ref(false)

const selectedAppointment = computed(() =>
  appointments.value.find((a) => a.id === selectedAppointmentId.value) || null,
)

function appointmentLabel(a: AppointmentOption) {
  return `${new Date(a.startAt).toLocaleString('es-CO')} · ${a.client.firstName} ${a.client.lastName} · ${a.service.name} · ${money(a.price)}`
}

function pickAppointment(id: string) {
  selectedAppointmentId.value = id
  appointmentMenuOpen.value = false
}

function onDocClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target?.closest('[data-appointment-picker]')) {
    appointmentMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  void load()
})
onUnmounted(() => document.removeEventListener('click', onDocClick))

function money(value: string | number | undefined | null) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

function statusLabel(s: string) {
  if (s === 'PAID') return 'Pagada'
  if (s === 'ISSUED') return 'Emitida'
  if (s === 'CANCELLED') return 'Cancelada'
  if (s === 'DRAFT') return 'Borrador'
  return s
}

function statusClass(s: string) {
  if (s === 'PAID') return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
  if (s === 'ISSUED') return 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  if (s === 'CANCELLED') return 'bg-black/5 text-ink-muted dark:bg-white/10'
  return 'bg-sky-50 text-sky-800'
}

const filtered = computed(() => {
  if (filter.value === 'ALL') return rows.value
  return rows.value.filter((r) => r.status === filter.value)
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [list, sum] = await Promise.all([
      api<InvoiceRow[]>('/invoices'),
      api<Summary>('/invoices/summary'),
    ])
    rows.value = list
    summary.value = sum
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar facturación'
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  showModal.value = true
  createMode.value = 'appointment'
  selectedAppointmentId.value = ''
  appointmentMenuOpen.value = false
  sellPackageId.value = ''
  sellClientId.value = ''
  giftAmount.value = 100000
  giftClientId.value = ''
  giftCode.value = ''
  try {
    const [list, pkgs, cli] = await Promise.all([
      api<AppointmentOption[]>('/appointments').catch(() => []),
      api<typeof packages.value>('/packages').catch(() => []),
      api<typeof clients.value>('/clients').catch(() => []),
    ])
    const sorted = [...(Array.isArray(list) ? list : [])].sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
    )
    appointments.value = sorted.slice(0, 50)
    packages.value = Array.isArray(pkgs) ? pkgs.filter((p) => p.isActive) : []
    clients.value = Array.isArray(cli) ? cli : []
  } catch {
    appointments.value = []
    packages.value = []
    clients.value = []
  }
}

async function createFromAppointment() {
  if (!selectedAppointmentId.value) return
  busy.value = true
  try {
    const invoice = await api<InvoiceRow>('/invoices/from-appointment', {
      method: 'POST',
      body: JSON.stringify({ appointmentId: selectedAppointmentId.value }),
    })
    showModal.value = false
    await toastSuccess('Factura creada', 'Queda emitida. Cobra cuando el cliente pague.')
    await load()
    const full = await api<InvoiceRow>(`/invoices/${invoice.id}`)
    selectedInvoice.value = full
  } catch (e) {
    await toastError('No se pudo facturar', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function createFromPackage() {
  if (!sellPackageId.value || !sellClientId.value) return
  busy.value = true
  try {
    const sold = await api<{ invoice?: { id: string; number: string } }>('/packages/sell', {
      method: 'POST',
      body: JSON.stringify({
        packageId: sellPackageId.value,
        clientId: sellClientId.value,
      }),
    })
    showModal.value = false
    await toastSuccess(
      'Paquete facturado',
      sold.invoice?.number ? `Factura ${sold.invoice.number} pagada` : 'Venta registrada',
    )
    await load()
    if (sold.invoice?.id) {
      selectedInvoice.value = await api<InvoiceRow>(`/invoices/${sold.invoice.id}`)
    }
  } catch (e) {
    await toastError('No se pudo facturar el paquete', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function createFromGift() {
  if (!giftAmount.value || giftAmount.value < 1) return
  busy.value = true
  try {
    const created = await api<{
      invoice?: { id: string; number: string }
    }>('/marketing/gift-cards', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(giftAmount.value),
        code: giftCode.value.trim() || undefined,
        clientId: giftClientId.value || undefined,
      }),
    })
    showModal.value = false
    await toastSuccess(
      'Gift card facturada',
      created.invoice?.number
        ? `Factura ${created.invoice.number} pagada`
        : 'Gift card creada',
    )
    await load()
    if (created.invoice?.id) {
      selectedInvoice.value = await api<InvoiceRow>(`/invoices/${created.invoice.id}`)
    }
  } catch (e) {
    await toastError('No se pudo facturar la gift card', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function submitCreate() {
  if (createMode.value === 'appointment') return createFromAppointment()
  if (createMode.value === 'package') return createFromPackage()
  return createFromGift()
}

async function doPrint(invoice: InvoiceRow) {
  try {
    const full =
      invoice.items && invoice.items.length
        ? invoice
        : await api<InvoiceRow>(`/invoices/${invoice.id}`)
    printInvoice(full, { name: auth.user?.tenant?.name })
  } catch (e) {
    await toastError('No se pudo imprimir', e instanceof Error ? e.message : 'Error')
  }
}

async function downloadPdf(row: InvoiceRow) {
  try {
    const token = localStorage.getItem('beautybook-token')
    const base =
      (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ??
      `${API_ORIGIN}/api/v1`
    const res = await fetch(`${base}/invoices/${row.id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('No se pudo descargar')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${row.number}.html`
    a.click()
    URL.revokeObjectURL(a.href)
    await toastSuccess('Descarga lista (ábrela e imprime como PDF)')
  } catch (e) {
    await toastError('PDF', e instanceof Error ? e.message : 'Error')
  }
}

async function sendWhatsApp(row: InvoiceRow) {
  const ok = await confirmAction({
    title: '¿Enviar por WhatsApp?',
    text: `Se enviará el resumen de ${row.number} al cliente.`,
    confirmText: 'Enviar',
  })
  if (!ok) return
  try {
    await api(`/invoices/${row.id}/send-whatsapp`, { method: 'POST' })
    await toastSuccess('Enviado por WhatsApp')
  } catch (e) {
    await toastError('WhatsApp', e instanceof Error ? e.message : 'Error')
  }
}

async function openPay(row: InvoiceRow) {
  payInvoice.value = row
  payMethod.value = 'CASH'
  payGiftCode.value = ''
  giftCheck.value = null
  showPayModal.value = true
}

async function validateGiftInput() {
  const code = payGiftCode.value.trim()
  giftCheck.value = null
  if (!code) return
  giftCheckBusy.value = true
  try {
    const res = await api<{
      code: string
      balance: number
      message: string
      valid: boolean
    }>('/invoices/validate-gift-card', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    giftCheck.value = {
      valid: true,
      code: res.code,
      balance: res.balance,
      message: res.message,
    }
  } catch (e) {
    giftCheck.value = {
      valid: false,
      error: e instanceof Error ? e.message : 'Gift card inválida',
    }
  } finally {
    giftCheckBusy.value = false
  }
}

async function confirmPay() {
  if (!payInvoice.value) return
  if (payGiftCode.value.trim() && giftCheck.value && giftCheck.value.valid === false) {
    await toastError('Gift card', giftCheck.value.error || 'Código inválido')
    return
  }
  if (payGiftCode.value.trim() && !giftCheck.value?.valid) {
    await validateGiftInput()
    if (!giftCheck.value?.valid) {
      await toastError('Gift card', giftCheck.value?.error || 'Valida el código primero')
      return
    }
  }
  busy.value = true
  try {
    const result = await api<{
      giftApplied?: number
      remainder?: number
      giftCard?: { code: string; remainingBalance: number }
    }>(`/invoices/${payInvoice.value.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({
        method: payMethod.value,
        giftCardCode: payGiftCode.value.trim() || undefined,
      }),
    })
    showPayModal.value = false
    payInvoice.value = null
    if (result.giftApplied) {
      await toastSuccess(
        'Factura pagada',
        `Gift card ${money(result.giftApplied)}${
          result.remainder ? ` + ${money(result.remainder)} en ${payMethod.value}` : ''
        }`,
      )
    } else {
      await toastSuccess('Factura pagada')
    }
    await load()
  } catch (e) {
    await toastError('No se pudo cobrar', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function markPaid(row: InvoiceRow) {
  openPay(row)
}

async function cancelInvoice(row: InvoiceRow) {
  const ok = await confirmAction({
    title: `¿Cancelar ${row.number}?`,
    text: 'La factura quedará anulada.',
    confirmText: 'Cancelar factura',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/invoices/${row.id}/cancel`, { method: 'PATCH' })
    await toastSuccess('Factura cancelada')
    await load()
  } catch (e) {
    await toastError('No se pudo cancelar', e instanceof Error ? e.message : 'Error')
  }
}

async function openDetail(row: InvoiceRow) {
  try {
    selectedInvoice.value = await api<InvoiceRow>(`/invoices/${row.id}`)
  } catch (e) {
    await toastError('No se pudo abrir', e instanceof Error ? e.message : 'Error')
  }
}

</script>

<template>
  <section class="animate-fade-in space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="section-eyebrow">Negocio</p>
        <h1 class="font-display mt-1 text-display-md font-bold">Facturación</h1>
        <p class="mt-2 text-sm text-ink-muted">
          Factura citas, paquetes y gift cards. Al cobrar puedes canjear una gift card.
        </p>
      </div>
      <button type="button" class="btn-primary inline-flex items-center gap-2" @click="openCreate">
        <Plus class="h-4 w-4" />
        Nueva factura
      </button>
    </div>

    <div v-if="summary" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div class="surface p-4">
        <p class="text-xs text-ink-muted">Emitidas</p>
        <p class="mt-1 font-display text-2xl font-bold">{{ summary.issued }}</p>
      </div>
      <div class="surface p-4">
        <p class="text-xs text-ink-muted">Pagadas</p>
        <p class="mt-1 font-display text-2xl font-bold">{{ summary.paid }}</p>
      </div>
      <div class="surface p-4">
        <p class="text-xs text-ink-muted">Canceladas</p>
        <p class="mt-1 font-display text-2xl font-bold">{{ summary.cancelled }}</p>
      </div>
      <div class="surface p-4">
        <p class="text-xs text-ink-muted">Cobrado</p>
        <p class="mt-1 font-display text-2xl font-bold">{{ money(summary.paidTotal) }}</p>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="f in [
          { id: 'ALL', label: 'Todas' },
          { id: 'ISSUED', label: 'Emitidas' },
          { id: 'PAID', label: 'Pagadas' },
          { id: 'CANCELLED', label: 'Canceladas' },
        ]"
        :key="f.id"
        type="button"
        class="rounded-full px-3 py-1.5 text-xs font-semibold transition"
        :class="
          filter === f.id
            ? 'bg-brand-700 text-white'
            : 'bg-black/5 text-ink-muted hover:bg-black/10 dark:bg-white/5'
        "
        @click="filter = f.id as typeof filter"
      >
        {{ f.label }}
      </button>
    </div>

    <p v-if="error" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>
    <p v-else-if="loading" class="text-ink-muted">Cargando facturas…</p>

    <div v-else-if="!filtered.length" class="surface px-6 py-14 text-center">
      <FileText class="mx-auto h-10 w-10 text-ink-muted/40" />
      <p class="mt-3 font-display text-lg font-bold">Sin facturas</p>
      <p class="mt-1 text-sm text-ink-muted">Genera la primera desde una cita completada o confirmada.</p>
    </div>

    <div v-else class="overflow-hidden rounded-2xl border border-black/5 dark:border-white/10">
      <table class="w-full text-left text-sm">
        <thead class="bg-black/[0.03] text-xs uppercase tracking-wide text-ink-muted dark:bg-white/5">
          <tr>
            <th class="px-4 py-3 font-semibold">Número</th>
            <th class="px-4 py-3 font-semibold">Cliente</th>
            <th class="px-4 py-3 font-semibold">Estado</th>
            <th class="px-4 py-3 font-semibold">Total</th>
            <th class="px-4 py-3 font-semibold">Fecha</th>
            <th class="px-4 py-3 font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in filtered"
            :key="row.id"
            class="border-t border-black/5 dark:border-white/10"
          >
            <td class="px-4 py-3 font-semibold">
              <button type="button" class="hover:underline" @click="openDetail(row)">
                {{ row.number }}
              </button>
            </td>
            <td class="px-4 py-3">
              {{
                row.client
                  ? `${row.client.firstName} ${row.client.lastName}`
                  : '—'
              }}
            </td>
            <td class="px-4 py-3">
              <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="statusClass(row.status)">
                {{ statusLabel(row.status) }}
              </span>
            </td>
            <td class="px-4 py-3 font-medium">{{ money(row.total) }}</td>
            <td class="px-4 py-3 text-ink-muted">
              {{ new Date(row.issuedAt).toLocaleDateString('es-CO') }}
            </td>
            <td class="px-4 py-3">
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-brand-800 dark:bg-white/5"
                  @click="doPrint(row)"
                >
                  <Printer class="h-3.5 w-3.5" />
                  Imprimir
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-brand-800 dark:bg-white/5"
                  @click="downloadPdf(row)"
                >
                  <Download class="h-3.5 w-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  @click="sendWhatsApp(row)"
                >
                  <MessageCircle class="h-3.5 w-3.5" />
                  WA
                </button>
                <button
                  v-if="row.status === 'ISSUED'"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                  @click="markPaid(row)"
                >
                  <Banknote class="h-3.5 w-3.5" />
                  Cobrar
                </button>
                <button
                  v-if="row.status === 'ISSUED'"
                  type="button"
                  class="inline-flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted hover:text-red-600 dark:bg-white/5"
                  @click="cancelInvoice(row)"
                >
                  <XCircle class="h-3.5 w-3.5" />
                  Anular
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal crear -->
    <div
      v-if="showModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      @click.self="showModal = false; appointmentMenuOpen = false"
    >
      <div class="surface w-full max-w-lg p-6 shadow-lift">
        <h2 class="font-display text-xl font-bold">Nueva factura</h2>
        <p class="mt-1 text-sm text-ink-muted">
          Elige el tipo de venta. Paquetes y gift cards se facturan y cobran al crear.
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="m in [
              { id: 'appointment', label: 'Cita', icon: FileText },
              { id: 'package', label: 'Paquete', icon: Package },
              { id: 'gift', label: 'Gift card', icon: Gift },
            ]"
            :key="m.id"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition"
            :class="
              createMode === m.id
                ? 'bg-brand-700 text-white'
                : 'bg-black/5 text-ink-muted dark:bg-white/10'
            "
            @click="createMode = m.id as CreateMode"
          >
            <component :is="m.icon" class="h-3.5 w-3.5" />
            {{ m.label }}
          </button>
        </div>

        <!-- Cita -->
        <div v-if="createMode === 'appointment'" class="mt-5" data-appointment-picker>
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Cita</span>
            <div class="relative">
              <button
                type="button"
                class="input-field flex w-full items-center justify-between gap-3 text-left"
                @click.stop="appointmentMenuOpen = !appointmentMenuOpen"
              >
                <span
                  class="min-w-0 flex-1 truncate"
                  :class="selectedAppointment ? 'text-ink dark:text-mist' : 'text-ink-muted/60'"
                >
                  {{
                    selectedAppointment
                      ? appointmentLabel(selectedAppointment)
                      : 'Selecciona una cita…'
                  }}
                </span>
                <ChevronDown
                  class="h-4 w-4 shrink-0 text-ink-muted transition"
                  :class="appointmentMenuOpen ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="appointmentMenuOpen"
                class="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-2xl border border-black/10 bg-white py-1.5 shadow-lift dark:border-white/10 dark:bg-ink-soft"
              >
                <p v-if="!appointments.length" class="px-4 py-3 text-sm text-ink-muted">
                  No hay citas disponibles.
                </p>
                <button
                  v-for="a in appointments"
                  :key="a.id"
                  type="button"
                  class="flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-brand-50 dark:hover:bg-brand-950/40"
                  :class="
                    selectedAppointmentId === a.id
                      ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200'
                      : 'text-ink dark:text-mist'
                  "
                  @click="pickAppointment(a.id)"
                >
                  <Check
                    class="mt-0.5 h-4 w-4 shrink-0"
                    :class="selectedAppointmentId === a.id ? 'opacity-100' : 'opacity-0'"
                  />
                  <span class="min-w-0">
                    <span class="block font-medium">
                      {{ a.client.firstName }} {{ a.client.lastName }} · {{ a.service.name }}
                    </span>
                    <span class="mt-0.5 block text-xs text-ink-muted">
                      {{ new Date(a.startAt).toLocaleString('es-CO') }} · {{ money(a.price) }}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </label>
        </div>

        <!-- Paquete -->
        <div v-else-if="createMode === 'package'" class="mt-5 space-y-3">
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Paquete</span>
            <select v-model="sellPackageId" class="input-field !rounded-xl !py-3">
              <option value="">Selecciona…</option>
              <option v-for="p in packages" :key="p.id" :value="p.id">
                {{ p.name }} ({{ p.sessions }} · {{ money(p.price) }})
              </option>
            </select>
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Cliente</span>
            <select v-model="sellClientId" class="input-field !rounded-xl !py-3">
              <option value="">Selecciona…</option>
              <option v-for="c in clients" :key="c.id" :value="c.id">
                {{ c.firstName }} {{ c.lastName }}
              </option>
            </select>
          </label>
        </div>

        <!-- Gift -->
        <div v-else class="mt-5 space-y-3">
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Monto</span>
            <input
              v-model.number="giftAmount"
              type="number"
              min="1000"
              step="1000"
              class="input-field !rounded-xl !py-3"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Código (opcional)</span>
            <input
              v-model="giftCode"
              placeholder="Se genera solo si lo dejas vacío"
              class="input-field !rounded-xl !py-3 uppercase"
            />
          </label>
          <label class="block text-sm">
            <span class="mb-1.5 block font-medium text-ink">Cliente (opcional)</span>
            <select v-model="giftClientId" class="input-field !rounded-xl !py-3">
              <option value="">Sin asignar</option>
              <option v-for="c in clients" :key="c.id" :value="c.id">
                {{ c.firstName }} {{ c.lastName }}
              </option>
            </select>
          </label>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="btn-ghost"
            @click="showModal = false; appointmentMenuOpen = false"
          >
            Cerrar
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="
              busy ||
              (createMode === 'appointment' && !selectedAppointmentId) ||
              (createMode === 'package' && (!sellPackageId || !sellClientId)) ||
              (createMode === 'gift' && !giftAmount)
            "
            @click="submitCreate"
          >
            {{
              busy
                ? 'Procesando…'
                : createMode === 'appointment'
                  ? 'Crear factura'
                  : 'Facturar y cobrar'
            }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal cobrar -->
    <div
      v-if="showPayModal && payInvoice"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      @click.self="showPayModal = false"
    >
      <div class="surface w-full max-w-md p-6 shadow-lift">
        <h2 class="font-display text-xl font-bold">Cobrar {{ payInvoice.number }}</h2>
        <p class="mt-1 text-sm text-ink-muted">
          Total <b>{{ money(payInvoice.total) }}</b>. Puedes aplicar una gift card.
        </p>

        <label class="mt-5 block text-sm">
          <span class="mb-1.5 block font-medium text-ink">Método (saldo restante)</span>
          <select v-model="payMethod" class="input-field !rounded-xl !py-3">
            <option value="CASH">Efectivo</option>
            <option value="CARD">Tarjeta</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
        </label>

        <label class="mt-3 block text-sm">
          <span class="mb-1.5 block font-medium text-ink">Gift card (opcional)</span>
          <div class="flex gap-2">
            <input
              v-model="payGiftCode"
              placeholder="Código"
              class="input-field !rounded-xl !py-3 uppercase"
              @blur="validateGiftInput"
            />
            <button
              type="button"
              class="btn-ghost !px-4 !py-2.5 shrink-0"
              :disabled="giftCheckBusy || !payGiftCode.trim()"
              @click="validateGiftInput"
            >
              Validar
            </button>
          </div>
        </label>

        <p
          v-if="giftCheck?.valid"
          class="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        >
          {{ giftCheck.message }}
          <span v-if="giftCheck.balance != null && payInvoice">
            · Se aplicarán
            {{
              money(Math.min(giftCheck.balance, Number(payInvoice.total)))
            }}
          </span>
        </p>
        <p
          v-else-if="giftCheck && giftCheck.valid === false"
          class="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {{ giftCheck.error }}
        </p>

        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showPayModal = false">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="busy" @click="confirmPay">
            {{ busy ? 'Cobrando…' : 'Confirmar cobro' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal detalle -->
    <div
      v-if="selectedInvoice"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      @click.self="selectedInvoice = null"
    >
      <div class="surface w-full max-w-lg p-6 shadow-lift">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-ink-muted">Factura</p>
            <h2 class="font-display text-2xl font-bold">{{ selectedInvoice.number }}</h2>
          </div>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-bold"
            :class="statusClass(selectedInvoice.status)"
          >
            {{ statusLabel(selectedInvoice.status) }}
          </span>
        </div>
        <p v-if="selectedInvoice.client" class="mt-3 text-sm">
          {{ selectedInvoice.client.firstName }} {{ selectedInvoice.client.lastName }}
          <span v-if="selectedInvoice.client.phone" class="text-ink-muted">
            · {{ selectedInvoice.client.phone }}
          </span>
        </p>
        <p v-if="selectedInvoice.notes" class="mt-2 text-sm text-ink-muted">
          {{ selectedInvoice.notes }}
        </p>
        <ul class="mt-5 space-y-2 border-t border-black/5 pt-4 dark:border-white/10">
          <li
            v-for="item in selectedInvoice.items || []"
            :key="item.id"
            class="flex justify-between gap-3 text-sm"
          >
            <span>
              {{ item.description }}
              <span class="text-ink-muted">× {{ item.quantity }}</span>
            </span>
            <span class="font-medium">{{ money(item.total) }}</span>
          </li>
        </ul>
        <div class="mt-4 flex justify-between border-t border-black/5 pt-4 text-sm dark:border-white/10">
          <span class="text-ink-muted">Subtotal</span>
          <span>{{ money(selectedInvoice.subtotal) }}</span>
        </div>
        <div class="flex justify-between text-sm">
          <span class="text-ink-muted">Impuesto</span>
          <span>{{ money(selectedInvoice.tax) }}</span>
        </div>
        <div class="mt-1 flex justify-between font-display text-lg font-bold">
          <span>Total</span>
          <span>{{ money(selectedInvoice.total) }}</span>
        </div>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" class="btn-ghost" @click="selectedInvoice = null">Cerrar</button>
          <button
            type="button"
            class="btn-primary inline-flex items-center gap-2"
            @click="doPrint(selectedInvoice)"
          >
            <Printer class="h-4 w-4" />
            Imprimir
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
