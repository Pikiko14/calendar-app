<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { api } from '@/api/client'

export type DayKey =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

export type ScheduleBlock = { startTime: string; endTime: string }
export type DaySchedule = { dayOfWeek: DayKey; isOff: boolean; blocks: ScheduleBlock[] }

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'MONDAY', label: 'Lunes' },
  { key: 'TUESDAY', label: 'Martes' },
  { key: 'WEDNESDAY', label: 'Miércoles' },
  { key: 'THURSDAY', label: 'Jueves' },
  { key: 'FRIDAY', label: 'Viernes' },
  { key: 'SATURDAY', label: 'Sábado' },
  { key: 'SUNDAY', label: 'Domingo' },
]

const props = defineProps<{
  workerId: string
  workerName: string
  schedules?: Array<{
    dayOfWeek: string
    isOff: boolean
    blocks: ScheduleBlock[]
  }>
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

function emptyWeek(): Record<DayKey, DaySchedule> {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      {
        dayOfWeek: key,
        isOff: key === 'SUNDAY',
        blocks: key === 'SUNDAY' ? [] : [{ startTime: '09:00', endTime: '18:00' }],
      },
    ]),
  ) as Record<DayKey, DaySchedule>
}

const week = reactive(emptyWeek())
const saving = ref(false)
const error = ref('')

function hydrate() {
  const next = emptyWeek()
  for (const s of props.schedules || []) {
    const key = s.dayOfWeek as DayKey
    if (!next[key]) continue
    next[key] = {
      dayOfWeek: key,
      isOff: s.isOff,
      blocks:
        s.isOff || !s.blocks?.length
          ? []
          : s.blocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
    }
  }
  for (const d of DAYS) {
    week[d.key] = next[d.key]
  }
}

watch(() => [props.workerId, props.schedules], hydrate, { immediate: true, deep: true })

function addBlock(day: DayKey) {
  week[day].blocks.push({ startTime: '14:00', endTime: '18:00' })
  week[day].isOff = false
}

function removeBlock(day: DayKey, index: number) {
  week[day].blocks.splice(index, 1)
  if (!week[day].blocks.length) week[day].isOff = true
}

function toggleOff(day: DayKey) {
  week[day].isOff = !week[day].isOff
  if (week[day].isOff) {
    week[day].blocks = []
  } else if (!week[day].blocks.length) {
    week[day].blocks = [{ startTime: '09:00', endTime: '18:00' }]
  }
}

function copyMondayToWeekdays() {
  const mon = week.MONDAY
  for (const key of ['TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as DayKey[]) {
    week[key] = {
      dayOfWeek: key,
      isOff: mon.isOff,
      blocks: mon.blocks.map((b) => ({ ...b })),
    }
  }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const days = DAYS.map(({ key }) => ({
      dayOfWeek: key,
      isOff: week[key].isOff,
      blocks: week[key].isOff
        ? []
        : week[key].blocks.filter((b) => b.startTime && b.endTime && b.startTime < b.endTime),
    }))

    for (const day of days) {
      if (!day.isOff && !day.blocks.length) {
        throw new Error(`Define al menos un bloque en ${DAYS.find((d) => d.key === day.dayOfWeek)?.label} o márcalo como libre.`)
      }
    }

    await api(`/workers/${props.workerId}/schedules/week`, {
      method: 'PUT',
      body: JSON.stringify({ days }),
    })
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar el horario'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4 backdrop-blur-sm">
    <div class="surface flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden shadow-lift">
      <div class="border-b border-black/5 px-6 py-5 dark:border-white/5">
        <p class="section-eyebrow">Horario semanal</p>
        <h2 class="font-display mt-1 text-2xl font-bold">{{ workerName }}</h2>
        <p class="mt-1 text-sm text-ink-muted">
          Configura días libres y bloques (ej. 08:00–12:00 y 14:00–18:00). Solo se ofrecerán
          citas en la intersección con el horario del negocio.
        </p>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <p v-if="error" class="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{{ error }}</p>

        <button type="button" class="text-xs font-semibold text-brand-700" @click="copyMondayToWeekdays">
          Copiar lunes → martes a viernes
        </button>

        <article
          v-for="day in DAYS"
          :key="day.key"
          class="rounded-2xl border border-black/5 p-4 dark:border-white/10"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-semibold">{{ day.label }}</h3>
            <button
              type="button"
              class="rounded-full px-3 py-1 text-xs font-bold transition"
              :class="week[day.key].isOff ? 'bg-black/5 text-ink-muted' : 'bg-brand-50 text-brand-800'"
              @click="toggleOff(day.key)"
            >
              {{ week[day.key].isOff ? 'Día libre' : 'Trabaja' }}
            </button>
          </div>

          <div v-if="!week[day.key].isOff" class="mt-3 space-y-2">
            <div
              v-for="(block, index) in week[day.key].blocks"
              :key="`${day.key}-${index}`"
              class="flex flex-wrap items-center gap-2"
            >
              <input v-model="block.startTime" type="time" class="input-field !w-auto !py-2" />
              <span class="text-ink-muted">→</span>
              <input v-model="block.endTime" type="time" class="input-field !w-auto !py-2" />
              <button
                type="button"
                class="text-xs font-semibold text-red-600"
                :disabled="week[day.key].blocks.length === 1"
                @click="removeBlock(day.key, index)"
              >
                Quitar
              </button>
            </div>
            <button type="button" class="text-xs font-semibold text-brand-700" @click="addBlock(day.key)">
              + Añadir bloque
            </button>
          </div>
          <p v-else class="mt-2 text-sm text-ink-muted">Sin atención este día.</p>
        </article>
      </div>

      <div class="flex justify-end gap-3 border-t border-black/5 px-6 py-4 dark:border-white/5">
        <button type="button" class="btn-ghost !py-2.5" @click="emit('close')">Cancelar</button>
        <button type="button" class="btn-primary !py-2.5" :disabled="saving" @click="save">
          {{ saving ? 'Guardando…' : 'Guardar horario' }}
        </button>
      </div>
    </div>
  </div>
</template>
