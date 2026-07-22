<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/es'
import { ChevronLeft, ChevronRight, ChevronDown, UsersRound } from '@lucide/vue'
import { api, mediaUrl } from '@/api/client'
import { confirmAction, promptText, toastSuccess, toastError } from '@/lib/swal'
import { useAuthStore } from '@/stores/auth'

dayjs.extend(isoWeek)
dayjs.locale('es')

const auth = useAuthStore()
const isWorkerView = computed(() => auth.isWorker)

type Mode = 'Día' | 'Semana' | 'Mes'
type DayKey =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
type ScheduleBlock = { startTime: string; endTime: string }
type DaySchedule = {
  dayOfWeek: DayKey | string
  isClosed: boolean
  blocks: ScheduleBlock[]
}

type Appointment = {
  id: string
  startAt: string
  endAt?: string
  status: string
  version: number
  workerId?: string
  client: { firstName: string; lastName: string }
  worker: { id?: string; firstName: string; lastName: string }
  service: { name: string; durationMinutes?: number }
}

type WorkerOption = {
  id: string
  firstName: string
  lastName: string
  isActive: boolean
  photoUrl?: string | null
  schedules: Array<{
    dayOfWeek: DayKey | string
    isOff: boolean
    blocks: ScheduleBlock[]
  }>
}

const DAY_KEYS: DayKey[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]

const mode = ref<Mode>('Semana')
const cursor = ref(dayjs().startOf('day'))
const selectedWorkerId = ref('')
const service = ref('Todos')
const status = ref('Todos')
const loading = ref(true)
const error = ref('')
const busyId = ref<string | null>(null)
const appointments = ref<Appointment[]>([])
const workersList = ref<WorkerOption[]>([])
const selected = ref<Appointment | null>(null)
const businessSchedules = ref<DaySchedule[]>([])

function workerLabel(w: { firstName: string; lastName: string }) {
  return `${w.firstName} ${w.lastName}`.trim()
}

function workerInitials(w: { firstName: string; lastName: string }) {
  const a = (w.firstName || '').trim().charAt(0)
  const b = (w.lastName || '').trim().charAt(0)
  return `${a}${b}`.toUpperCase() || '?'
}

const activeWorkers = computed(() =>
  workersList.value.filter((w) => w.isActive !== false),
)

const selectedWorker = computed(
  () => activeWorkers.value.find((w) => w.id === selectedWorkerId.value) || null,
)

/** Horario activo: del trabajador filtrado, o del negocio. */
const activeSchedules = computed<DaySchedule[]>(() => {
  const worker = selectedWorker.value
  if (worker?.schedules?.length) {
    return worker.schedules.map((s) => ({
      dayOfWeek: s.dayOfWeek,
      isClosed: s.isOff,
      blocks: s.blocks || [],
    }))
  }
  return businessSchedules.value
})

function toMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function dayKey(day: Dayjs): DayKey {
  return DAY_KEYS[day.day()]
}

function scheduleFor(day: Dayjs): DaySchedule | undefined {
  return activeSchedules.value.find((s) => s.dayOfWeek === dayKey(day))
}

function isBusinessClosed(day: Dayjs) {
  const s = scheduleFor(day)
  if (!s) return false
  return s.isClosed || !s.blocks.length
}

function openBlocks(day: Dayjs): ScheduleBlock[] {
  const s = scheduleFor(day)
  if (!s || s.isClosed) return []
  return s.blocks
}

const hourRange = computed(() => {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const s of activeSchedules.value) {
    if (s.isClosed) continue
    for (const b of s.blocks) {
      min = Math.min(min, toMinutes(b.startTime))
      max = Math.max(max, toMinutes(b.endTime))
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return { start: 9, end: 19 }
  }
  return {
    start: Math.floor(min / 60),
    end: Math.max(Math.floor(min / 60) + 1, Math.ceil(max / 60)),
  }
})

const hours = computed(() =>
  Array.from(
    { length: Math.max(1, hourRange.value.end - hourRange.value.start) },
    (_, i) => hourRange.value.start + i,
  ),
)

const gridHeightPx = computed(() =>
  Math.max(360, (hourRange.value.end - hourRange.value.start) * 64),
)

/** En semana solo columnas de días abiertos. */
const weekDays = computed(() => {
  const start = cursor.value.startOf('isoWeek')
  const all = Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
  const open = all.filter((d) => !isBusinessClosed(d))
  return open.length ? open : all
})

const weekHeaderDays = computed(() => {
  const start = cursor.value.startOf('isoWeek')
  return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'))
})

const monthCells = computed(() => {
  const start = cursor.value.startOf('month').startOf('isoWeek')
  return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
})

const services = computed(() => [
  'Todos',
  ...new Set(
    appointments.value
      .filter((a) => {
        if (!selectedWorkerId.value) return true
        return (a.workerId || a.worker.id) === selectedWorkerId.value
      })
      .map((a) => a.service.name),
  ),
])

const filtered = computed(() =>
  appointments.value.filter((a) => {
    const wid = a.workerId || a.worker.id
    return (
      (!selectedWorkerId.value || wid === selectedWorkerId.value) &&
      (service.value === 'Todos' || a.service.name === service.value) &&
      (status.value === 'Todos' || a.status === status.value)
    )
  }),
)

const statusLabel: Record<string, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  ON_THE_WAY: 'En camino',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No Show',
  RESCHEDULED: 'Reprogramada',
}

const statusTone: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMED: 'bg-brand-50 text-brand-800 border-brand-200',
  ON_THE_WAY: 'bg-sky-50 text-sky-800 border-sky-200',
  COMPLETED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  NO_SHOW: 'bg-orange-50 text-orange-800 border-orange-200',
  RESCHEDULED: 'bg-black/5 text-ink-muted border-black/10',
}

const periodLabel = computed(() => {
  if (mode.value === 'Día') return cursor.value.format('dddd D [de] MMMM YYYY')
  if (mode.value === 'Semana') {
    const start = cursor.value.startOf('isoWeek')
    const end = cursor.value.endOf('isoWeek')
    return `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`
  }
  return cursor.value.format('MMMM YYYY')
})

const calendarTitle = computed(() =>
  selectedWorker.value
    ? `Agenda de ${workerLabel(selectedWorker.value)}`
    : 'Calendario',
)

function selectWorker(id: string) {
  if (isWorkerView.value) return
  selectedWorkerId.value = id
  if (service.value !== 'Todos') {
    const stillValid = services.value.includes(service.value)
    if (!stillValid) service.value = 'Todos'
  }
}

function isActive(s: string) {
  return ['PENDING', 'CONFIRMED', 'ON_THE_WAY'].includes(s)
}

function sameDay(a: Dayjs, b: Dayjs) {
  return a.isSame(b, 'day')
}

function appsForDay(day: Dayjs) {
  return filtered.value
    .filter((a) => dayjs(a.startAt).isSame(day, 'day'))
    .sort((a, b) => dayjs(a.startAt).valueOf() - dayjs(b.startAt).valueOf())
}

type DayLayoutItem = {
  item: Appointment
  col: number
  cols: number
}

/** Reparte columnas cuando hay citas solapadas (vista Todo el equipo). */
function layoutDay(day: Dayjs): DayLayoutItem[] {
  const apps = appsForDay(day)
  if (!apps.length) return []

  const ranges = apps.map((a) => {
    const start = dayjs(a.startAt)
    const end = start.add(eventDurationMinutes(a), 'minute')
    return { item: a, start: start.valueOf(), end: end.valueOf() }
  })

  const colEnds: number[] = []
  const placed = ranges.map((r) => {
    let col = colEnds.findIndex((end) => end <= r.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(r.end)
    } else {
      colEnds[col] = r.end
    }
    return { ...r, col }
  })

  return placed.map((r) => {
    const overlapping = placed.filter((o) => o.start < r.end && o.end > r.start)
    const cols = Math.max(...overlapping.map((o) => o.col)) + 1
    return { item: r.item, col: r.col, cols }
  })
}

function rangeTotalMinutes() {
  return Math.max(60, (hourRange.value.end - hourRange.value.start) * 60)
}

function minutesFromRangeStart(totalMinutes: number) {
  return totalMinutes - hourRange.value.start * 60
}

function hourLineTop(h: number) {
  return `${(minutesFromRangeStart(h * 60) / rangeTotalMinutes()) * 100}%`
}

function blockBandStyle(block: ScheduleBlock) {
  const total = rangeTotalMinutes()
  const top = Math.max(0, minutesFromRangeStart(toMinutes(block.startTime)))
  const bottom = Math.min(total, minutesFromRangeStart(toMinutes(block.endTime)))
  const height = Math.max(0, bottom - top)
  return {
    top: `${(top / total) * 100}%`,
    height: `${(height / total) * 100}%`,
  }
}

function eventDurationMinutes(item: Appointment) {
  const fromService = Number(item.service?.durationMinutes)
  if (Number.isFinite(fromService) && fromService > 0) return fromService
  if (item.endAt) {
    const diff = dayjs(item.endAt).diff(dayjs(item.startAt), 'minute')
    if (diff > 0) return diff
  }
  return 30
}

function eventStyle(
  item: Appointment,
  layout?: { col: number; cols: number },
) {
  const start = dayjs(item.startAt)
  const duration = eventDurationMinutes(item)
  const end = start.add(duration, 'minute')
  const dayStart = start.startOf('day').add(hourRange.value.start, 'hour')
  const dayEnd = start.startOf('day').add(hourRange.value.end, 'hour')
  const clampedStart = start.isBefore(dayStart) ? dayStart : start
  const clampedEnd = end.isAfter(dayEnd) ? dayEnd : end
  const total = rangeTotalMinutes()
  const topMin = Math.max(0, clampedStart.diff(dayStart, 'minute'))
  const durMin = Math.max(12, clampedEnd.diff(clampedStart, 'minute'))
  const cols = Math.max(1, layout?.cols ?? 1)
  const col = layout?.col ?? 0
  const widthPct = 100 / cols
  const leftPct = col * widthPct
  return {
    top: `${(topMin / total) * 100}%`,
    height: `${(durMin / total) * 100}%`,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    right: 'auto',
  }
}

function shiftDay(delta: number) {
  let next = cursor.value.add(delta, 'day')
  for (let i = 0; i < 14; i++) {
    if (!isBusinessClosed(next)) {
      cursor.value = next
      return
    }
    next = next.add(delta, 'day')
  }
  cursor.value = cursor.value.add(delta, 'day')
}

function shift(delta: number) {
  if (mode.value === 'Día') shiftDay(delta)
  else if (mode.value === 'Semana') cursor.value = cursor.value.add(delta, 'week')
  else cursor.value = cursor.value.add(delta, 'month')
}

function goToday() {
  cursor.value = dayjs().startOf('day')
}

function setMode(next: Mode) {
  mode.value = next
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [apps, scheduleRes, workers] = await Promise.all([
      api<Appointment[]>('/appointments'),
      api<{ schedules: DaySchedule[] }>('/branches/main/schedules').catch(
        async () => {
          try {
            return await api<{ schedules: DaySchedule[] }>('/branches/main')
          } catch {
            return { schedules: [] as DaySchedule[] }
          }
        },
      ),
      api<WorkerOption[]>('/workers').catch(() => [] as WorkerOption[]),
    ])
    appointments.value = apps
    businessSchedules.value = scheduleRes.schedules || []
    workersList.value = workers
    if (auth.workerId) {
      selectedWorkerId.value = auth.workerId
    } else if (
      selectedWorkerId.value &&
      !workers.some((w) => w.id === selectedWorkerId.value && w.isActive !== false)
    ) {
      selectedWorkerId.value = ''
    }
    if (selected.value) {
      selected.value =
        appointments.value.find((a) => a.id === selected.value!.id) || null
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la agenda'
  } finally {
    loading.value = false
  }
}

async function setStatus(
  item: Appointment,
  next: string,
  opts?: { confirmTitle?: string; confirmText?: string; reason?: string },
) {
  if (opts?.confirmTitle) {
    const ok = await confirmAction({
      title: opts.confirmTitle,
      text: opts.confirmText,
      confirmText: 'Sí, continuar',
    })
    if (!ok) return
  }

  busyId.value = item.id
  try {
    await api(`/appointments/${item.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: next,
        version: item.version,
        reason: opts?.reason,
      }),
    })
    await toastSuccess('Cita actualizada', statusLabel[next] || next)
    await load()
  } catch (e) {
    await toastError(
      'No se pudo actualizar',
      e instanceof Error ? e.message : 'Error desconocido',
    )
  } finally {
    busyId.value = null
  }
}

async function cancelAppointment(item: Appointment) {
  if (busyId.value) return
  const reason = await promptText({
    title: '¿Cancelar esta cita?',
    text: 'El cliente recibirá el motivo por WhatsApp.',
    inputLabel: 'Motivo de cancelación',
    inputPlaceholder: 'Ej. El profesional no estará disponible…',
    confirmText: 'Cancelar cita',
    cancelText: 'Volver',
    danger: true,
    minLength: 5,
  })
  if (!reason) return

  await setStatus(item, 'CANCELLED', { reason })
}

onMounted(load)
</script>

<template>
  <section class="animate-fade-in space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="section-eyebrow">Agenda</p>
        <h1 class="font-display mt-2 text-display-md font-bold">{{ calendarTitle }}</h1>
      </div>
      <div class="flex rounded-full bg-black/5 p-1 dark:bg-white/5">
        <button
          v-for="item in (['Día', 'Semana', 'Mes'] as Mode[])"
          :key="item"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold transition"
          :class="
            mode === item
              ? 'bg-white text-brand-800 shadow-soft dark:bg-ink-soft dark:text-brand-300'
              : 'text-ink-muted'
          "
          @click="setMode(item)"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <p v-if="error" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>
    <p v-else-if="loading" class="text-ink-muted">Cargando citas…</p>

    <template v-else>
      <div class="surface space-y-4 p-4 sm:p-5">
        <div v-if="!isWorkerView">
          <p class="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Trabajador
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition"
              :class="
                !selectedWorkerId
                  ? 'bg-brand-700 text-white shadow-soft'
                  : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15'
              "
              @click="selectWorker('')"
            >
              <span
                class="grid h-8 w-8 place-items-center rounded-full"
                :class="!selectedWorkerId ? 'bg-white/20' : 'bg-brand-700/15 text-brand-800 dark:text-brand-300'"
              >
                <UsersRound class="h-4 w-4" />
              </span>
              Todo el equipo
            </button>
            <button
              v-for="w in activeWorkers"
              :key="w.id"
              type="button"
              class="inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition"
              :class="
                selectedWorkerId === w.id
                  ? 'bg-brand-700 text-white shadow-soft'
                  : 'bg-black/5 text-ink hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15'
              "
              @click="selectWorker(w.id)"
            >
              <img
                v-if="w.photoUrl"
                :src="mediaUrl(w.photoUrl)"
                :alt="workerLabel(w)"
                class="h-8 w-8 rounded-full object-cover"
              />
              <span
                v-else
                class="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold"
                :class="
                  selectedWorkerId === w.id
                    ? 'bg-white/20 text-white'
                    : 'bg-brand-700/15 text-brand-800 dark:text-brand-300'
                "
              >
                {{ workerInitials(w) }}
              </span>
              {{ workerLabel(w) }}
            </button>
          </div>
          <p v-if="selectedWorker" class="mt-2 text-sm text-ink-muted">
            Viendo solo la agenda y el horario de
            <span class="font-semibold text-ink">{{ workerLabel(selectedWorker) }}</span>.
          </p>
        </div>
        <p v-else class="text-sm text-ink-muted">
          Tu agenda personal
          <span v-if="selectedWorker" class="font-semibold text-ink">
            · {{ workerLabel(selectedWorker) }}
          </span>
        </p>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-4 dark:border-white/10">
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn-ghost !px-3 !py-2" @click="shift(-1)">
              <ChevronLeft class="h-4 w-4" />
            </button>
            <button type="button" class="btn-ghost !px-3 !py-2" @click="goToday">Hoy</button>
            <button type="button" class="btn-ghost !px-3 !py-2" @click="shift(1)">
              <ChevronRight class="h-4 w-4" />
            </button>
            <p class="ml-2 font-display text-lg font-bold capitalize">{{ periodLabel }}</p>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <label class="group flex min-w-[160px] flex-col gap-1.5">
              <span class="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Servicio
              </span>
              <div class="relative">
                <select
                  v-model="service"
                  class="h-11 w-full appearance-none rounded-2xl border border-brand-700/15 bg-mist/60 py-2.5 pl-4 pr-10 text-sm font-semibold text-ink shadow-soft outline-none transition hover:border-brand-700/30 hover:bg-white focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-700/10 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.09] dark:focus:border-brand-400 dark:focus:ring-brand-400/15"
                >
                  <option v-for="s in services" :key="s">{{ s }}</option>
                </select>
                <ChevronDown
                  class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700/70 dark:text-brand-300"
                />
              </div>
            </label>
            <label class="group flex min-w-[160px] flex-col gap-1.5">
              <span class="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Estado
              </span>
              <div class="relative">
                <select
                  v-model="status"
                  class="h-11 w-full appearance-none rounded-2xl border border-brand-700/15 bg-mist/60 py-2.5 pl-4 pr-10 text-sm font-semibold text-ink shadow-soft outline-none transition hover:border-brand-700/30 hover:bg-white focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-700/10 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.09] dark:focus:border-brand-400 dark:focus:ring-brand-400/15"
                >
                  <option value="Todos">Todos</option>
                  <option v-for="(label, key) in statusLabel" :key="key" :value="key">
                    {{ label }}
                  </option>
                </select>
                <ChevronDown
                  class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-700/70 dark:text-brand-300"
                />
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- MES -->
      <div v-if="mode === 'Mes'" class="surface overflow-hidden">
        <div class="grid grid-cols-7 border-b border-black/5 dark:border-white/10">
          <div
            v-for="d in weekHeaderDays"
            :key="d.format('dd')"
            class="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-ink-muted"
          >
            {{ d.format('ddd') }}
          </div>
        </div>
        <div class="grid grid-cols-7">
          <button
            v-for="day in monthCells"
            :key="day.toISOString()"
            type="button"
            class="min-h-[110px] border-b border-r border-black/5 p-2 text-left transition hover:bg-mist/50 dark:border-white/5 dark:hover:bg-white/[0.03]"
            :class="[
              day.month() !== cursor.month() ? 'bg-black/[0.02] opacity-50 dark:bg-white/[0.02]' : '',
              isBusinessClosed(day) ? 'bg-black/[0.03] dark:bg-white/[0.04]' : '',
            ]"
            @click="cursor = day; mode = 'Día'"
          >
            <div class="flex items-center justify-between gap-1">
              <span
                class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold"
                :class="
                  sameDay(day, dayjs())
                    ? 'bg-brand-700 text-white'
                    : 'text-ink'
                "
              >
                {{ day.date() }}
              </span>
              <span
                v-if="isBusinessClosed(day)"
                class="text-[10px] font-bold uppercase tracking-wide text-ink-muted"
              >
                Cerrado
              </span>
            </div>
            <div v-if="!isBusinessClosed(day)" class="mt-1 space-y-1">
              <button
                v-for="item in appsForDay(day).slice(0, 3)"
                :key="item.id"
                type="button"
                class="block w-full truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                :class="statusTone[item.status] || statusTone.PENDING"
                @click.stop="selected = item"
              >
                {{ dayjs(item.startAt).format('HH:mm') }}
                {{ item.client.firstName }}
              </button>
              <p
                v-if="appsForDay(day).length > 3"
                class="px-1 text-[10px] font-semibold text-ink-muted"
              >
                +{{ appsForDay(day).length - 3 }} más
              </p>
            </div>
          </button>
        </div>
      </div>

      <!-- SEMANA -->
      <div v-else-if="mode === 'Semana'" class="surface overflow-x-auto">
        <div class="min-w-[900px]">
          <div
            class="grid border-b border-black/5 dark:border-white/10"
            :style="{
              gridTemplateColumns: `64px repeat(${weekDays.length}, minmax(0, 1fr))`,
            }"
          >
            <div />
            <div
              v-for="day in weekDays"
              :key="day.toISOString()"
              class="border-l border-black/5 px-2 py-3 text-center dark:border-white/10"
            >
              <p class="text-xs font-bold uppercase text-ink-muted">{{ day.format('ddd') }}</p>
              <p
                class="mx-auto mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-bold"
                :class="sameDay(day, dayjs()) ? 'bg-brand-700 text-white' : ''"
              >
                {{ day.date() }}
              </p>
              <p
                v-if="appsForDay(day).length"
                class="mt-1 text-[10px] font-bold text-brand-700 dark:text-brand-300"
              >
                {{ appsForDay(day).length }}
                {{ appsForDay(day).length === 1 ? 'cita' : 'citas' }}
              </p>
            </div>
          </div>
          <div
            class="grid"
            :style="{
              gridTemplateColumns: `64px repeat(${weekDays.length}, minmax(0, 1fr))`,
            }"
          >
            <div class="relative" :style="{ height: `${gridHeightPx}px` }">
              <div
                v-for="h in hours"
                :key="h"
                class="absolute left-0 right-0 border-t border-black/5 px-1 text-[10px] text-ink-muted dark:border-white/10"
                :style="{ top: hourLineTop(h) }"
              >
                {{ String(h).padStart(2, '0') }}:00
              </div>
            </div>
            <div
              v-for="day in weekDays"
              :key="`col-${day.toISOString()}`"
              class="relative border-l border-black/5 dark:border-white/10"
              :style="{ height: `${gridHeightPx}px` }"
            >
              <div
                v-for="h in hours"
                :key="`${day.toISOString()}-${h}`"
                class="absolute left-0 right-0 border-t border-black/5 dark:border-white/10"
                :style="{ top: hourLineTop(h) }"
              />
              <div
                v-for="(block, idx) in openBlocks(day)"
                :key="`open-${day.toISOString()}-${idx}`"
                class="pointer-events-none absolute inset-x-0 bg-brand-700/[0.06] dark:bg-brand-300/[0.08]"
                :style="blockBandStyle(block)"
              />
              <button
                v-for="slot in layoutDay(day)"
                :key="slot.item.id"
                type="button"
                class="absolute z-10 overflow-hidden rounded-lg border px-1.5 py-1 text-left text-[11px] shadow-soft transition hover:brightness-95"
                :class="statusTone[slot.item.status] || statusTone.PENDING"
                :style="eventStyle(slot.item, slot)"
                @click="selected = slot.item"
              >
                <p class="font-bold leading-tight">
                  {{ dayjs(slot.item.startAt).format('HH:mm') }}
                  {{ slot.item.client.firstName }}
                </p>
                <p class="truncate opacity-80">
                  <template v-if="!selectedWorkerId">{{ slot.item.worker.firstName }} · </template>
                  {{ slot.item.service.name }}
                </p>
                <p
                  v-if="slot.cols > 1"
                  class="mt-0.5 text-[9px] font-bold uppercase opacity-70"
                >
                  {{ slot.col + 1 }}/{{ slot.cols }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- DÍA -->
      <div v-else class="surface overflow-hidden">
        <div
          v-if="isBusinessClosed(cursor)"
          class="grid place-items-center px-6 py-16 text-center"
        >
          <p class="font-display text-xl font-bold">
            {{ selectedWorker ? 'Día no laborable' : 'Negocio cerrado' }}
          </p>
          <p class="mt-2 text-sm text-ink-muted">
            {{
              selectedWorker
                ? `${workerLabel(selectedWorker)} no trabaja este día según su horario.`
                : 'Este día no está habilitado en la configuración horaria.'
            }}
          </p>
          <button type="button" class="btn-ghost mt-4" @click="shiftDay(1)">
            Ir al próximo día abierto
          </button>
        </div>
        <div v-else class="grid grid-cols-[72px_minmax(0,1fr)]">
          <div
            class="relative border-r border-black/5 dark:border-white/10"
            :style="{ height: `${gridHeightPx}px` }"
          >
            <div
              v-for="h in hours"
              :key="h"
              class="absolute left-0 right-0 border-t border-black/5 px-2 text-xs text-ink-muted dark:border-white/10"
              :style="{ top: hourLineTop(h) }"
            >
              {{ String(h).padStart(2, '0') }}:00
            </div>
          </div>
          <div class="relative" :style="{ height: `${gridHeightPx}px` }">
            <div
              v-for="h in hours"
              :key="`day-${h}`"
              class="absolute left-0 right-0 border-t border-black/5 dark:border-white/10"
              :style="{ top: hourLineTop(h) }"
            />
            <div
              v-for="(block, idx) in openBlocks(cursor)"
              :key="`day-open-${idx}`"
              class="pointer-events-none absolute inset-x-0 bg-brand-700/[0.06] dark:bg-brand-300/[0.08]"
              :style="blockBandStyle(block)"
            />
            <button
              v-for="slot in layoutDay(cursor)"
              :key="slot.item.id"
              type="button"
              class="absolute z-10 overflow-hidden rounded-xl border px-3 py-2 text-left shadow-soft transition hover:brightness-95"
              :class="statusTone[slot.item.status] || statusTone.PENDING"
              :style="eventStyle(slot.item, slot)"
              @click="selected = slot.item"
            >
              <p class="font-semibold">
                {{ dayjs(slot.item.startAt).format('HH:mm') }}–{{
                  dayjs(slot.item.startAt)
                    .add(eventDurationMinutes(slot.item), 'minute')
                    .format('HH:mm')
                }}
                ·
                {{ slot.item.client.firstName }} {{ slot.item.client.lastName }}
              </p>
              <p class="text-sm opacity-80">
                {{ slot.item.service.name }} · {{ slot.item.worker.firstName }}
                {{ slot.item.worker.lastName }}
              </p>
            </button>
            <p
              v-if="!appsForDay(cursor).length"
              class="absolute inset-0 grid place-items-center text-sm text-ink-muted"
            >
              No hay citas este día.
            </p>
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="selected"
      class="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      @click.self="selected = null"
    >
      <div class="surface w-full max-w-md p-6 shadow-lift">
        <p class="section-eyebrow">Cita</p>
        <h2 class="font-display mt-1 text-2xl font-bold">
          {{ selected.client.firstName }} {{ selected.client.lastName }}
        </h2>
        <p class="mt-2 text-sm text-ink-muted">
          {{ selected.service.name }} · {{ selected.worker.firstName }}
          {{ selected.worker.lastName }}
        </p>
        <p class="mt-1 font-display text-lg font-bold">
          {{ dayjs(selected.startAt).format('DD/MM/YYYY HH:mm') }}
        </p>
        <p class="mt-2 text-sm font-semibold">
          {{ statusLabel[selected.status] || selected.status }}
        </p>

        <div v-if="isActive(selected.status)" class="mt-6 grid gap-2">
          <button
            v-if="selected.status !== 'CONFIRMED' && selected.status !== 'ON_THE_WAY'"
            type="button"
            class="btn-primary !py-3"
            :disabled="busyId === selected.id"
            @click="setStatus(selected, 'CONFIRMED')"
          >
            Marcar confirmada
          </button>
          <button
            type="button"
            class="btn-ghost !py-3"
            :disabled="busyId === selected.id"
            @click="setStatus(selected, 'COMPLETED')"
          >
            Marcar atendida / completada
          </button>
          <button
            type="button"
            class="btn-ghost !py-3 text-red-700"
            :disabled="busyId === selected.id"
            @click="cancelAppointment(selected)"
          >
            Cancelar cita
          </button>
        </div>
        <p v-else class="mt-4 text-sm text-ink-muted">
          Esta cita ya está cerrada ({{ statusLabel[selected.status] }}).
        </p>

        <button type="button" class="btn-ghost mt-4 w-full !py-3" @click="selected = null">
          Cerrar
        </button>
      </div>
    </div>
  </section>
</template>
