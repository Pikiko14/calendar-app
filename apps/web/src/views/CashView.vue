<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Wallet, Receipt } from '@lucide/vue'
import { api } from '@/api/client'
import { confirmAction, toastError, toastSuccess } from '@/lib/swal'

type CashReg = {
  id: string
  openingFloat: string | number
  closingCash?: string | number | null
  openedAt: string
  closedAt?: string | null
  notes?: string | null
  branch?: { name: string } | null
}

type Expense = {
  id: string
  category: string
  amount: string | number
  description?: string | null
  date: string
}

const current = ref<CashReg | null>(null)
const history = ref<CashReg[]>([])
const expenses = ref<Expense[]>([])
const loading = ref(true)
const openingFloat = ref(0)
const closingCash = ref(0)
const expenseForm = ref({ category: 'Insumos', amount: 0, description: '' })
const busy = ref(false)

function money(n: string | number | null | undefined) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
}

async function load() {
  loading.value = true
  try {
    const [cur, hist, exp] = await Promise.all([
      api<CashReg | null>('/cash/current'),
      api<CashReg[]>('/cash'),
      api<Expense[]>('/cash/expenses'),
    ])
    current.value = cur
    history.value = hist
    expenses.value = exp
    if (cur) closingCash.value = Number(cur.openingFloat || 0)
  } catch (e) {
    await toastError('Caja', e instanceof Error ? e.message : 'Error')
  } finally {
    loading.value = false
  }
}

async function openCash() {
  busy.value = true
  try {
    await api('/cash/open', {
      method: 'POST',
      body: JSON.stringify({ openingFloat: Number(openingFloat.value) || 0 }),
    })
    await toastSuccess('Caja abierta')
    await load()
  } catch (e) {
    await toastError('No se pudo abrir', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function closeCash() {
  if (!current.value) return
  const ok = await confirmAction({
    title: '¿Cerrar caja del día?',
    text: `Arqueo con ${money(closingCash.value)} en efectivo.`,
    confirmText: 'Cerrar caja',
  })
  if (!ok) return
  busy.value = true
  try {
    const res = await api<{ summary?: { expected: number; difference: number } }>(
      `/cash/${current.value.id}/close`,
      {
        method: 'POST',
        body: JSON.stringify({ closingCash: Number(closingCash.value) }),
      },
    )
    const s = res.summary
    await toastSuccess(
      s
        ? `Cerrada. Esperado ${money(s.expected)} · Diff ${money(s.difference)}`
        : 'Caja cerrada',
    )
    await load()
  } catch (e) {
    await toastError('No se pudo cerrar', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function addExpense() {
  busy.value = true
  try {
    await api('/cash/expenses', {
      method: 'POST',
      body: JSON.stringify({
        category: expenseForm.value.category,
        amount: Number(expenseForm.value.amount),
        description: expenseForm.value.description || undefined,
      }),
    })
    expenseForm.value = { category: 'Insumos', amount: 0, description: '' }
    await toastSuccess('Gasto registrado')
    await load()
  } catch (e) {
    await toastError('Gasto', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header>
      <p class="text-sm font-medium text-brand-700 dark:text-brand-300">Operación</p>
      <h1 class="font-display text-3xl font-bold">Caja del día</h1>
      <p class="mt-1 text-sm text-ink-muted">Apertura, gastos y arqueo de cierre.</p>
    </header>

    <p v-if="loading" class="text-sm text-ink-muted">Cargando…</p>

    <section class="surface p-5">
      <div class="flex items-center gap-2">
        <Wallet class="h-5 w-5 text-brand-700" />
        <h2 class="font-display text-lg font-semibold">Estado actual</h2>
      </div>

      <div v-if="current && !current.closedAt" class="mt-4 space-y-3">
        <p class="text-sm">
          Abierta desde
          <b>{{ new Date(current.openedAt).toLocaleString('es-CO') }}</b>
          · Fondo {{ money(current.openingFloat) }}
        </p>
        <label class="block text-xs text-ink-muted">
          Efectivo al cierre
          <input
            v-model.number="closingCash"
            type="number"
            min="0"
            class="mt-1 w-full max-w-xs rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
          />
        </label>
        <button
          class="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-mist dark:text-ink"
          :disabled="busy"
          @click="closeCash"
        >
          Cerrar caja
        </button>
      </div>

      <div v-else class="mt-4 space-y-3">
        <p class="text-sm text-ink-muted">No hay caja abierta.</p>
        <label class="block text-xs text-ink-muted">
          Fondo inicial
          <input
            v-model.number="openingFloat"
            type="number"
            min="0"
            class="mt-1 w-full max-w-xs rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
          />
        </label>
        <button
          class="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          :disabled="busy"
          @click="openCash"
        >
          Abrir caja
        </button>
      </div>
    </section>

    <section class="surface p-5">
      <div class="flex items-center gap-2">
        <Receipt class="h-5 w-5 text-brand-700" />
        <h2 class="font-display text-lg font-semibold">Registrar gasto</h2>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <input
          v-model="expenseForm.category"
          placeholder="Categoría"
          class="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
        />
        <input
          v-model.number="expenseForm.amount"
          type="number"
          min="0"
          placeholder="Monto"
          class="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
        />
        <input
          v-model="expenseForm.description"
          placeholder="Descripción"
          class="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft"
        />
      </div>
      <button
        class="mt-3 rounded-xl border border-black/10 px-4 py-2 text-sm font-medium dark:border-white/10"
        :disabled="busy || !expenseForm.amount"
        @click="addExpense"
      >
        Guardar gasto
      </button>

      <ul class="mt-5 divide-y divide-black/5 text-sm dark:divide-white/5">
        <li v-for="e in expenses.slice(0, 12)" :key="e.id" class="flex justify-between gap-3 py-2">
          <span>
            <b>{{ e.category }}</b>
            <span class="text-ink-muted"> · {{ e.description || '—' }}</span>
          </span>
          <span>{{ money(e.amount) }}</span>
        </li>
      </ul>
    </section>

    <section class="surface p-5">
      <h2 class="font-display text-lg font-semibold">Historial</h2>
      <ul class="mt-3 space-y-2 text-sm">
        <li v-for="h in history" :key="h.id" class="flex justify-between gap-3 border-b border-black/5 py-2 dark:border-white/5">
          <span>
            {{ new Date(h.openedAt).toLocaleDateString('es-CO') }}
            · {{ h.closedAt ? 'Cerrada' : 'Abierta' }}
          </span>
          <span>{{ money(h.closingCash ?? h.openingFloat) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
