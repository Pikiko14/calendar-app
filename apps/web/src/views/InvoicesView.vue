<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { FileText, Plus, Banknote, XCircle, Printer } from '@lucide/vue'
import { api } from '@/api/client'
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
const selectedInvoice = ref<InvoiceRow | null>(null)
const auth = useAuthStore()

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
  selectedAppointmentId.value = ''
  try {
    const list = await api<AppointmentOption[]>('/appointments')
    const sorted = [...(Array.isArray(list) ? list : [])].sort(
      (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
    )
    appointments.value = sorted.slice(0, 50)
  } catch {
    appointments.value = []
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
    await toastSuccess('Factura creada')
    await load()
    const full = await api<InvoiceRow>(`/invoices/${invoice.id}`)
    selectedInvoice.value = full
  } catch (e) {
    await toastError('No se pudo facturar', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
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

async function markPaid(row: InvoiceRow) {
  const ok = await confirmAction({
    title: `¿Marcar ${row.number} como pagada?`,
    text: `Total ${money(row.total)}. Se registrará el pago en efectivo.`,
    confirmText: 'Marcar pagada',
  })
  if (!ok) return
  try {
    await api(`/invoices/${row.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method: 'CASH' }),
    })
    await toastSuccess('Factura pagada')
    await load()
  } catch (e) {
    await toastError('No se pudo cobrar', e instanceof Error ? e.message : 'Error')
  }
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

onMounted(load)
</script>

<template>
  <section class="animate-fade-in space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="section-eyebrow">Negocio</p>
        <h1 class="font-display mt-1 text-display-md font-bold">Facturación</h1>
        <p class="mt-2 text-sm text-ink-muted">
          Emite facturas desde citas, cobra y lleva el control de pagos.
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
      @click.self="showModal = false"
    >
      <div class="surface w-full max-w-lg p-6 shadow-lift">
        <h2 class="font-display text-xl font-bold">Facturar cita</h2>
        <p class="mt-1 text-sm text-ink-muted">
          Se genera el número automáticamente y se toma el precio de la cita.
        </p>
        <label class="mt-5 block text-sm text-ink-muted">
          Cita
          <select v-model="selectedAppointmentId" class="input-field mt-2">
            <option value="">Selecciona una cita…</option>
            <option v-for="a in appointments" :key="a.id" :value="a.id">
              {{ new Date(a.startAt).toLocaleString('es-CO') }}
              · {{ a.client.firstName }} {{ a.client.lastName }}
              · {{ a.service.name }}
              · {{ money(a.price) }}
            </option>
          </select>
        </label>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-ghost" @click="showModal = false">Cerrar</button>
          <button
            type="button"
            class="btn-primary"
            :disabled="busy || !selectedAppointmentId"
            @click="createFromAppointment"
          >
            {{ busy ? 'Creando…' : 'Crear factura' }}
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
