<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/yup'
import {
  CalendarClock,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  Eye,
  Plus,
} from '@lucide/vue'
import { api, apiUpload, mediaUrl } from '@/api/client'
import { confirmAction } from '@/lib/swal'
import WorkerScheduleEditor from '@/components/WorkerScheduleEditor.vue'
import FormField from '@/components/ui/FormField.vue'
import StarRating from '@/components/StarRating.vue'
import {
  clientSchema,
  serviceSchema,
  workerSchema,
} from '@/validation/schemas'

type ServiceRow = {
  id: string
  name: string
  description?: string | null
  durationMinutes: number
  price: string | number
  isActive: boolean
}

type Specialty = { id: string; name: string; color?: string; isActive?: boolean }

type WorkerRow = {
  id: string
  firstName: string
  lastName: string
  specialties?: string[]
  specialtyLinks?: Array<{ specialtyId: string; specialty: Specialty }>
  photoUrl?: string | null
  isActive: boolean
  email?: string | null
  phone?: string | null
  ratingAvg?: number
  ratingCount?: number
  schedules?: Array<{
    dayOfWeek: string
    isOff: boolean
    blocks: Array<{ startTime: string; endTime: string }>
  }>
}

const route = useRoute()
const query = ref('')
const showModal = ref(false)
const editingId = ref<string | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const rows = ref<any[]>([])
const detail = ref<any>(null)
const history = ref<any[]>([])
const photoFile = ref<File | null>(null)
const photoPreview = ref('')
const scheduleWorker = ref<WorkerRow | null>(null)
const catalogSpecialties = ref<Specialty[]>([])
const selectedSpecialtyIds = ref<string[]>([])

const kind = computed(() =>
  route.name === 'services' ? 'Servicios' : route.name === 'workers' ? 'Equipo' : 'Clientes',
)

const endpoint = computed(() =>
  kind.value === 'Servicios' ? '/services' : kind.value === 'Equipo' ? '/workers' : '/clients',
)

const filtered = computed(() =>
  rows.value.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(query.value.toLowerCase()),
  ),
)

const modalTitle = computed(() => {
  const noun =
    kind.value === 'Servicios' ? 'servicio' : kind.value === 'Equipo' ? 'trabajador' : 'cliente'
  return editingId.value ? `Editar ${noun}` : `Nuevo ${noun}`
})

type ManagementFormValues = {
  name: string
  firstName: string
  lastName: string
  durationMinutes: number | undefined
  price: number | undefined
  description: string
  phone: string
  email: string
  isActive: boolean
}

const activeSchema = computed(() => {
  if (kind.value === 'Servicios') return toTypedSchema(serviceSchema)
  if (kind.value === 'Equipo') return toTypedSchema(workerSchema)
  return toTypedSchema(clientSchema)
})

const { handleSubmit, resetForm, values, setFieldValue } = useForm<ManagementFormValues>({
  validationSchema: activeSchema as any,
  initialValues: {
    name: '',
    firstName: '',
    lastName: '',
    durationMinutes: 30,
    price: 0,
    description: '',
    phone: '',
    email: '',
    isActive: true,
  },
})

function closeModal() {
  showModal.value = false
  editingId.value = null
  photoFile.value = null
  photoPreview.value = ''
  selectedSpecialtyIds.value = []
  resetForm()
}

function openCreate() {
  editingId.value = null
  photoFile.value = null
  photoPreview.value = ''
  selectedSpecialtyIds.value = []
  resetForm({
    values: {
      name: '',
      firstName: '',
      lastName: '',
      durationMinutes: 30,
      price: undefined,
      description: '',
      phone: '',
      email: '',
      isActive: true,
    },
  })
  showModal.value = true
}

function openEditService(row: ServiceRow) {
  editingId.value = row.id
  resetForm({
    values: {
      name: row.name,
      durationMinutes: Number(row.durationMinutes),
      price: Number(row.price),
      description: row.description || '',
      isActive: row.isActive,
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
    },
  })
  showModal.value = true
}

function openEditWorker(row: WorkerRow) {
  editingId.value = row.id
  photoPreview.value = mediaUrl(row.photoUrl)
  photoFile.value = null
  selectedSpecialtyIds.value =
    row.specialtyLinks?.map((l) => l.specialtyId || l.specialty?.id).filter(Boolean) ||
    []
  resetForm({
    values: {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone || '',
      isActive: row.isActive,
      name: '',
      durationMinutes: 30,
      price: 0,
      description: '',
      email: '',
    },
  })
  showModal.value = true
}

function toggleSpecialty(id: string) {
  const set = new Set(selectedSpecialtyIds.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  selectedSpecialtyIds.value = [...set]
}

function workerSpecialtyLabel(row: WorkerRow) {
  if (row.specialtyLinks?.length) {
    return row.specialtyLinks.map((l) => l.specialty?.name).filter(Boolean).join(', ')
  }
  return (row.specialties || []).join(', ') || 'Sin especialidad'
}

function onPhotoChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  photoFile.value = file
  photoPreview.value = URL.createObjectURL(file)
}

async function load() {
  loading.value = true
  error.value = ''
  detail.value = null
  try {
    if (route.name === 'client-detail') {
      const id = String(route.params.id)
      detail.value = await api(`/clients/${id}`)
      history.value = await api(`/clients/${id}/history`)
    } else {
      rows.value = await api(endpoint.value)
      if (kind.value === 'Equipo') {
        catalogSpecialties.value = await api<Specialty[]>('/specialties')
        if (!catalogSpecialties.value.length) {
          catalogSpecialties.value = await api<Specialty[]>('/specialties/ensure-defaults', {
            method: 'POST',
          })
        }
      }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al cargar'
  } finally {
    loading.value = false
  }
}

const onSubmit = handleSubmit(async (form) => {
  saving.value = true
  error.value = ''
  try {
    if (kind.value === 'Servicios') {
      const payload = {
        name: form.name,
        durationMinutes: Number(form.durationMinutes),
        price: Number(form.price),
        description: form.description || undefined,
        isActive: Boolean(form.isActive),
      }
      if (editingId.value) {
        await api(`/services/${editingId.value}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await api('/services', { method: 'POST', body: JSON.stringify(payload) })
      }
    } else if (kind.value === 'Equipo') {
      const payload = {
        firstName: String(form.firstName).trim(),
        lastName: String(form.lastName).trim() || '—',
        specialtyIds: selectedSpecialtyIds.value,
        phone: form.phone || undefined,
        isActive: Boolean(form.isActive),
      }
      let workerId = editingId.value
      if (workerId) {
        await api(`/workers/${workerId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        const created = await api<WorkerRow>('/workers', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        workerId = created.id
      }
      if (photoFile.value && workerId) {
        const fd = new FormData()
        fd.append('photo', photoFile.value)
        await apiUpload(`/workers/${workerId}/photo`, fd)
      }
    } else {
      const fullName = String(form.name).trim()
      const [firstName, ...rest] = fullName.split(' ')
      await api('/clients', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName || fullName,
          lastName: rest.join(' ') || '—',
          phone: form.phone || undefined,
          email: form.email || undefined,
        }),
      })
    }
    closeModal()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar'
  } finally {
    saving.value = false
  }
})

async function toggleService(row: ServiceRow) {
  try {
    await api(`/services/${row.id}/toggle`, { method: 'PATCH', body: '{}' })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cambiar el estado'
  }
}

async function deleteService(row: ServiceRow) {
  const ok = await confirmAction({
    title: '¿Eliminar servicio?',
    text: `Se eliminará “${row.name}”. Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/services/${row.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo eliminar'
  }
}

async function toggleWorker(row: WorkerRow) {
  try {
    await api(`/workers/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !row.isActive }),
    })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cambiar el estado'
  }
}

async function deleteWorker(row: WorkerRow) {
  const ok = await confirmAction({
    title: '¿Eliminar profesional?',
    text: `Se eliminará a ${row.firstName} ${row.lastName}.`,
    confirmText: 'Eliminar',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/workers/${row.id}`, { method: 'DELETE' })
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo eliminar'
  }
}

const statusLabel: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  ON_THE_WAY: 'En camino',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No Show',
  RESCHEDULED: 'Reprogramada',
}

function money(v: string | number) {
  return Number(v).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'L',
  TUESDAY: 'M',
  WEDNESDAY: 'X',
  THURSDAY: 'J',
  FRIDAY: 'V',
  SATURDAY: 'S',
  SUNDAY: 'D',
}

function scheduleSummary(row: WorkerRow) {
  const schedules = row.schedules || []
  if (!schedules.length) return 'Sin horario'
  const working = schedules.filter((s) => !s.isOff && s.blocks?.length)
  if (!working.length) return 'Sin días laborales'
  return working
    .map((s) => {
      const blocks = s.blocks.map((b) => `${b.startTime}-${b.endTime}`).join(', ')
      return `${DAY_SHORT[s.dayOfWeek] || s.dayOfWeek}: ${blocks}`
    })
    .join(' · ')
}

function openSchedule(row: WorkerRow) {
  scheduleWorker.value = row
}

watch(() => route.fullPath, load)
onMounted(load)
</script>

<template>
  <section class="animate-fade-in">
    <p v-if="error" class="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

    <template v-if="route.name === 'client-detail'">
      <RouterLink to="/app/clients" class="text-sm font-semibold text-brand-700">← Clientes</RouterLink>
      <div v-if="loading" class="mt-6 text-ink-muted">Cargando…</div>
      <div v-else-if="detail" class="surface mt-5 p-7">
        <div class="flex items-center gap-4">
          <div
            class="grid h-14 w-14 place-items-center rounded-full bg-brand-100 font-display text-lg font-bold text-brand-800"
          >
            {{ detail.firstName?.[0] }}{{ detail.lastName?.[0] }}
          </div>
          <div>
            <h1 class="font-display text-3xl font-bold">{{ detail.firstName }} {{ detail.lastName }}</h1>
            <p class="text-ink-muted">
              {{ detail.email || 'Sin email' }} · {{ detail.phone || 'Sin teléfono' }}
            </p>
          </div>
        </div>
        <div class="mt-8 grid gap-4 sm:grid-cols-3">
          <div>
            <p class="section-eyebrow">Visitas</p>
            <b class="mt-2 block font-display text-2xl">{{ detail.visitCount }}</b>
          </div>
          <div>
            <p class="section-eyebrow">Gastado</p>
            <b class="mt-2 block font-display text-2xl">{{ money(detail.totalSpent) }}</b>
          </div>
          <div>
            <p class="section-eyebrow">Última visita</p>
            <b class="mt-2 block font-display text-2xl">
              {{ detail.lastVisitAt ? new Date(detail.lastVisitAt).toLocaleDateString('es-CO') : '—' }}
            </b>
          </div>
        </div>
        <h2 class="font-display mt-9 text-xl font-bold">Historial</h2>
        <div class="mt-3 space-y-2">
          <div
            v-for="item in history"
            :key="item.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-mist px-4 py-3 text-sm dark:bg-white/5"
          >
            <div>
              <p class="font-semibold text-ink">
                {{ new Date(item.startAt).toLocaleString('es-CO') }}
                ·
                {{ item.service?.name }}
                ·
                {{ item.worker?.firstName }}
              </p>
              <p class="mt-0.5 text-xs text-ink-muted">
                {{ statusLabel[item.status] || item.status }}
                <template v-if="item.status === 'COMPLETED'">
                  · cuenta en gastado
                </template>
              </p>
            </div>
            <p
              v-if="item.service?.price != null"
              class="font-display text-base font-bold"
              :class="item.status === 'COMPLETED' ? 'text-brand-800' : 'text-ink-muted'"
            >
              {{ money(item.service.price) }}
            </p>
          </div>
          <p v-if="!history.length" class="text-sm text-ink-muted">Sin citas todavía.</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="section-eyebrow">Gestión</p>
          <h1 class="font-display mt-2 text-display-md font-bold">{{ kind }}</h1>
        </div>
        <button type="button" class="btn-primary inline-flex items-center gap-2" @click="openCreate">
          <Plus class="h-4 w-4" />
          Añadir
        </button>
      </div>

      <div class="surface mt-6 overflow-hidden">
        <div class="border-b border-black/5 p-4 dark:border-white/5">
          <input v-model="query" :placeholder="`Buscar en ${kind.toLowerCase()}`" class="input-field" />
        </div>
        <div v-if="loading" class="p-6 text-ink-muted">Cargando…</div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr class="border-b border-black/5 bg-mist/60 text-xs uppercase tracking-wide text-ink-muted dark:border-white/5 dark:bg-white/[0.03]">
                <template v-if="kind === 'Servicios'">
                  <th class="px-5 py-3 font-semibold">Servicio</th>
                  <th class="px-5 py-3 font-semibold">Estado</th>
                  <th class="px-5 py-3 font-semibold">Duración</th>
                  <th class="px-5 py-3 font-semibold">Precio</th>
                  <th class="px-5 py-3 font-semibold text-right">Acciones</th>
                </template>
                <template v-else-if="kind === 'Equipo'">
                  <th class="px-5 py-3 font-semibold">Trabajador</th>
                  <th class="px-5 py-3 font-semibold">Rating</th>
                  <th class="px-5 py-3 font-semibold">Estado</th>
                  <th class="px-5 py-3 font-semibold">Teléfono</th>
                  <th class="px-5 py-3 font-semibold text-right">Acciones</th>
                </template>
                <template v-else>
                  <th class="px-5 py-3 font-semibold">Cliente</th>
                  <th class="px-5 py-3 font-semibold">Contacto</th>
                  <th class="px-5 py-3 font-semibold">Visitas</th>
                  <th class="px-5 py-3 font-semibold text-right">Acciones</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filtered"
                :key="row.id"
                class="border-b border-black/5 last:border-0 hover:bg-mist/40 dark:border-white/5 dark:hover:bg-white/[0.02]"
              >
                <template v-if="kind === 'Servicios'">
                  <td class="max-w-[280px] px-5 py-4">
                    <b class="block truncate font-semibold" :title="row.name">{{ row.name }}</b>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex rounded-full px-2 py-0.5 text-xs font-bold"
                      :class="row.isActive ? 'bg-brand-50 text-brand-800' : 'bg-black/5 text-ink-muted'"
                    >
                      {{ row.isActive ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap text-ink-muted">
                    {{ row.durationMinutes }} min
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap text-ink-muted">
                    {{ money(row.price) }}
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300"
                        @click="openEditService(row)"
                      >
                        <Pencil class="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-black/10 dark:bg-white/5"
                        @click="toggleService(row)"
                      >
                        <PowerOff v-if="row.isActive" class="h-3.5 w-3.5" />
                        <Power v-else class="h-3.5 w-3.5" />
                        {{ row.isActive ? 'Desactivar' : 'Activar' }}
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40"
                        @click="deleteService(row)"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </template>

                <template v-else-if="kind === 'Equipo'">
                  <td class="max-w-[320px] px-5 py-4">
                    <div class="flex min-w-0 items-center gap-3">
                      <img
                        v-if="row.photoUrl"
                        :src="mediaUrl(row.photoUrl)"
                        :alt="row.firstName"
                        class="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                      <div
                        v-else
                        class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
                      >
                        {{ row.firstName?.[0] }}{{ row.lastName?.[0] }}
                      </div>
                      <div class="min-w-0">
                        <b class="block truncate">{{ row.firstName }} {{ row.lastName }}</b>
                        <p class="truncate text-xs text-ink-muted">
                          {{ workerSpecialtyLabel(row) }}
                        </p>
                        <p class="mt-0.5 truncate text-[11px] text-brand-700/80">
                          {{ scheduleSummary(row) }}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap">
                    <StarRating
                      v-if="(row.ratingCount || 0) > 0"
                      :avg="row.ratingAvg"
                      :count="row.ratingCount"
                    />
                    <span v-else class="text-xs text-ink-muted">Sin reseñas</span>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap">
                    <span
                      class="text-xs font-bold"
                      :class="row.isActive ? 'text-brand-700' : 'text-ink-muted'"
                    >
                      {{ row.isActive ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap text-ink-muted">
                    {{ row.phone || '—' }}
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300"
                        @click="openSchedule(row)"
                      >
                        <CalendarClock class="h-3.5 w-3.5" />
                        Horario
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300"
                        @click="openEditWorker(row)"
                      >
                        <Pencil class="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-black/10 dark:bg-white/5"
                        @click="toggleWorker(row)"
                      >
                        <PowerOff v-if="row.isActive" class="h-3.5 w-3.5" />
                        <Power v-else class="h-3.5 w-3.5" />
                        {{ row.isActive ? 'Desactivar' : 'Activar' }}
                      </button>
                      <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40"
                        @click="deleteWorker(row)"
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </template>

                <template v-else>
                  <td class="max-w-[240px] px-5 py-4">
                    <b class="block truncate">{{ row.firstName }} {{ row.lastName }}</b>
                  </td>
                  <td class="max-w-[220px] px-5 py-4">
                    <span class="block truncate text-ink-muted">{{ row.email || row.phone || '—' }}</span>
                  </td>
                  <td class="px-5 py-4 whitespace-nowrap text-ink-muted">
                    {{ row.visitCount }} visitas
                  </td>
                  <td class="px-5 py-4 text-right">
                    <RouterLink
                      :to="`/app/clients/${row.id}`"
                      class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-300"
                    >
                      <Eye class="h-3.5 w-3.5" />
                      Ver
                    </RouterLink>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
          <p v-if="!filtered.length" class="p-8 text-center text-sm text-ink-muted">Sin resultados</p>
        </div>
      </div>

      <!-- Modal con VeeValidate -->
      <div
        v-if="showModal"
        class="fixed inset-0 z-40 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm"
      >
        <form
          class="surface max-h-[90vh] w-full max-w-md overflow-y-auto p-6 shadow-lift"
          novalidate
          @submit="onSubmit"
        >
          <h2 class="font-display text-2xl font-bold">{{ modalTitle }}</h2>

          <div v-if="kind === 'Servicios'" class="mt-5 space-y-4">
            <FormField name="name" label="Nombre del servicio" placeholder="Ej. Corte + Barba" />
            <FormField
              name="durationMinutes"
              label="Duración (minutos)"
              type="number"
              min="15"
              step="15"
              hint="Mínimo 15 minutos"
            />
            <FormField name="price" label="Precio" type="number" min="0" placeholder="0" />
            <FormField name="description" label="Descripción" placeholder="Opcional" />
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-700"
                :checked="Boolean(values.isActive)"
                @change="setFieldValue('isActive', ($event.target as HTMLInputElement).checked)"
              />
              Servicio activo
            </label>
          </div>

          <div v-else-if="kind === 'Equipo'" class="mt-5 space-y-4">
            <div class="flex items-center gap-4">
              <img
                v-if="photoPreview"
                :src="photoPreview"
                alt="Vista previa"
                class="h-16 w-16 rounded-full object-cover"
              />
              <div
                v-else
                class="grid h-16 w-16 place-items-center rounded-full bg-brand-100 text-brand-800"
              >
                Foto
              </div>
              <label class="btn-ghost !cursor-pointer !py-2.5 text-xs">
                Subir imagen
                <input type="file" accept="image/*" class="hidden" @change="onPhotoChange" />
              </label>
            </div>
            <FormField name="firstName" label="Nombre" placeholder="Nombre" />
            <FormField name="lastName" label="Apellido" placeholder="Apellido" />
            <div>
              <p class="mb-2 text-sm font-medium text-ink-muted">Especialidades</p>
              <p v-if="!catalogSpecialties.length" class="text-xs text-ink-muted">
                Crea especialidades en Ajustes primero.
              </p>
              <div v-else class="flex flex-wrap gap-2">
                <button
                  v-for="s in catalogSpecialties.filter((x) => x.isActive !== false)"
                  :key="s.id"
                  type="button"
                  class="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                  :class="
                    selectedSpecialtyIds.includes(s.id)
                      ? 'bg-brand-700 text-white'
                      : 'bg-mist text-ink-muted hover:bg-brand-50 dark:bg-white/5'
                  "
                  @click="toggleSpecialty(s.id)"
                >
                  {{ s.name }}
                </button>
              </div>
            </div>
            <FormField name="phone" label="Teléfono" type="tel" placeholder="WhatsApp / teléfono" />
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 accent-brand-700"
                :checked="Boolean(values.isActive)"
                @change="setFieldValue('isActive', ($event.target as HTMLInputElement).checked)"
              />
              Trabajador activo
            </label>
          </div>

          <div v-else class="mt-5 space-y-4">
            <FormField name="name" label="Nombre completo" placeholder="Nombre y apellido" />
            <FormField name="phone" label="Teléfono / WhatsApp" type="tel" />
            <FormField name="email" label="Email" type="email" placeholder="opcional@correo.com" />
          </div>

          <div class="mt-6 flex justify-end gap-3">
            <button type="button" class="btn-ghost !py-2.5" @click="closeModal">Cancelar</button>
            <button type="submit" class="btn-primary !py-2.5" :disabled="saving">
              {{ saving ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>

      <WorkerScheduleEditor
        v-if="scheduleWorker"
        :worker-id="scheduleWorker.id"
        :worker-name="`${scheduleWorker.firstName} ${scheduleWorker.lastName}`"
        :schedules="scheduleWorker.schedules"
        @close="scheduleWorker = null"
        @saved="load"
      />
    </template>
  </section>
</template>
