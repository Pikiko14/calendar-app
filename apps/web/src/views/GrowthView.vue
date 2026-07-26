<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api/client'
import { toastError, toastSuccess } from '@/lib/swal'

const route = useRoute()
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
  price: 0,
  serviceId: '',
  validityDays: 30,
})
const sellForm = ref({ packageId: '', clientId: '' })
const couponForm = ref({ code: '', discountPct: 10 })
const giftForm = ref({ amount: 50000, code: '' })

function money(n: string | number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n || 0))
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
  await toastSuccess('Marcado como ofertado')
  await load()
}

async function createPackage() {
  busy.value = true
  try {
    await api('/packages', {
      method: 'POST',
      body: JSON.stringify({
        name: pkgForm.value.name,
        sessions: Number(pkgForm.value.sessions),
        price: Number(pkgForm.value.price),
        serviceId: pkgForm.value.serviceId || undefined,
        validityDays: Number(pkgForm.value.validityDays) || undefined,
      }),
    })
    pkgForm.value = { name: '', sessions: 5, price: 0, serviceId: '', validityDays: 30 }
    await toastSuccess('Paquete creado')
    await load()
  } catch (e) {
    await toastError('Paquete', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function sellPackage() {
  busy.value = true
  try {
    await api('/packages/sell', {
      method: 'POST',
      body: JSON.stringify(sellForm.value),
    })
    await toastSuccess('Paquete vendido')
    await load()
  } catch (e) {
    await toastError('Venta', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function createCoupon() {
  busy.value = true
  try {
    await api('/marketing/coupons', {
      method: 'POST',
      body: JSON.stringify({
        code: couponForm.value.code,
        discountPct: Number(couponForm.value.discountPct),
      }),
    })
    couponForm.value = { code: '', discountPct: 10 }
    await toastSuccess('Cupón creado')
    await load()
  } catch (e) {
    await toastError('Cupón', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

async function createGift() {
  busy.value = true
  try {
    await api('/marketing/gift-cards', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(giftForm.value.amount),
        code: giftForm.value.code || undefined,
      }),
    })
    giftForm.value = { amount: 50000, code: '' }
    await toastSuccess('Gift card creada')
    await load()
  } catch (e) {
    await toastError('Gift card', e instanceof Error ? e.message : 'Error')
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <header>
      <h1 class="font-display text-3xl font-bold">Crecimiento</h1>
      <p class="mt-1 text-sm text-ink-muted">Lista de espera, paquetes, cupones y gift cards.</p>
      <nav class="mt-4 flex flex-wrap gap-2 text-sm">
        <RouterLink
          v-for="t in [
            { id: 'waitlist', label: 'Espera' },
            { id: 'packages', label: 'Paquetes' },
            { id: 'coupons', label: 'Cupones' },
            { id: 'gifts', label: 'Gift cards' },
          ]"
          :key="t.id"
          :to="{ name: 'growth', query: { tab: t.id } }"
          class="rounded-full px-3 py-1.5"
          :class="tab === t.id ? 'bg-brand-700 text-white' : 'bg-black/5 dark:bg-white/10'"
        >
          {{ t.label }}
        </RouterLink>
      </nav>
    </header>

    <section v-if="tab === 'waitlist'" class="surface p-5">
      <h2 class="font-display text-lg font-semibold">Lista de espera</h2>
      <ul class="mt-4 space-y-2 text-sm">
        <li
          v-for="row in waitlist"
          :key="row.id"
          class="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 py-2 dark:border-white/5"
        >
          <div>
            <b>{{ row.client?.firstName }} {{ row.client?.lastName }}</b>
            · {{ row.service?.name }}
            <span class="text-ink-muted"> · {{ row.status }}</span>
          </div>
          <button
            v-if="row.status === 'WAITING'"
            class="rounded-lg bg-brand-700 px-3 py-1 text-xs text-white"
            @click="notifyWait(row.id)"
          >
            Ofertar cupo
          </button>
        </li>
        <li v-if="!waitlist.length" class="text-ink-muted">Sin entradas.</li>
      </ul>
    </section>

    <section v-else-if="tab === 'packages'" class="space-y-4">
      <article class="surface p-5">
        <h2 class="font-display text-lg font-semibold">Nuevo paquete / membresía</h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <input v-model="pkgForm.name" placeholder="Ej. 5 cortes" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
          <select v-model="pkgForm.serviceId" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft">
            <option value="">Cualquier servicio</option>
            <option v-for="s in services" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
          <input v-model.number="pkgForm.sessions" type="number" min="1" placeholder="Sesiones" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
          <input v-model.number="pkgForm.price" type="number" min="0" placeholder="Precio" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
        </div>
        <button class="mt-3 rounded-xl bg-brand-700 px-4 py-2 text-sm text-white" :disabled="busy || !pkgForm.name" @click="createPackage">
          Crear
        </button>
      </article>

      <article class="surface p-5">
        <h2 class="font-display text-lg font-semibold">Vender paquete</h2>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <select v-model="sellForm.packageId" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft">
            <option value="">Paquete…</option>
            <option v-for="p in packages.filter((x) => x.isActive)" :key="p.id" :value="p.id">
              {{ p.name }} ({{ p.sessions }} · {{ money(p.price) }})
            </option>
          </select>
          <select v-model="sellForm.clientId" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft">
            <option value="">Cliente…</option>
            <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.firstName }} {{ c.lastName }}</option>
          </select>
        </div>
        <button class="mt-3 rounded-xl border border-black/10 px-4 py-2 text-sm dark:border-white/10" :disabled="busy || !sellForm.packageId || !sellForm.clientId" @click="sellPackage">
          Registrar venta
        </button>
        <ul class="mt-4 space-y-1 text-sm">
          <li v-for="b in purchases" :key="b.id">
            {{ b.client?.firstName }} — {{ b.package?.name }} · {{ b.usedSessions }}/{{ b.totalSessions }}
          </li>
        </ul>
      </article>
    </section>

    <section v-else-if="tab === 'coupons'" class="surface p-5">
      <h2 class="font-display text-lg font-semibold">Cupones</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <input v-model="couponForm.code" placeholder="Código" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
        <input v-model.number="couponForm.discountPct" type="number" min="1" max="100" class="w-24 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
        <button class="rounded-xl bg-brand-700 px-4 py-2 text-sm text-white" :disabled="busy" @click="createCoupon">Crear</button>
      </div>
      <ul class="mt-4 space-y-1 text-sm">
        <li v-for="c in coupons" :key="c.id">
          <b>{{ c.code }}</b> · {{ c.discountPct || 0 }}% · usos {{ c.usedCount }}/{{ c.maxUses ?? '∞' }}
          <span class="text-ink-muted">{{ c.isActive ? '' : '(inactivo)' }}</span>
        </li>
      </ul>
    </section>

    <section v-else class="surface p-5">
      <h2 class="font-display text-lg font-semibold">Gift cards</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        <input v-model.number="giftForm.amount" type="number" min="1" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
        <input v-model="giftForm.code" placeholder="Código (opcional)" class="rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10 dark:bg-ink-soft" />
        <button class="rounded-xl bg-brand-700 px-4 py-2 text-sm text-white" :disabled="busy" @click="createGift">Crear</button>
      </div>
      <ul class="mt-4 space-y-1 text-sm">
        <li v-for="g in gifts" :key="g.id">
          <b>{{ g.code }}</b> · saldo {{ money(g.balance) }} / {{ money(g.initial) }}
        </li>
      </ul>
    </section>
  </div>
</template>
