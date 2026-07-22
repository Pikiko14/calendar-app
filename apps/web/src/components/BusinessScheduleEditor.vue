<script setup lang="ts">
import { reactive, watch } from 'vue'

export type DayKey =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'

export type ScheduleBlock = { startTime: string; endTime: string }
export type DaySchedule = {
  dayOfWeek: DayKey
  isClosed: boolean
  blocks: ScheduleBlock[]
}

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
  schedules?: Array<{
    dayOfWeek: string
    isClosed?: boolean
    isOff?: boolean
    blocks: ScheduleBlock[]
  }>
}>()

function emptyWeek(): Record<DayKey, DaySchedule> {
  return Object.fromEntries(
    DAYS.map(({ key }) => [
      key,
      {
        dayOfWeek: key,
        isClosed: key === 'SUNDAY',
        blocks:
          key === 'SUNDAY'
            ? []
            : key === 'SATURDAY'
              ? [{ startTime: '09:00', endTime: '14:00' }]
              : [
                  { startTime: '09:00', endTime: '13:00' },
                  { startTime: '14:00', endTime: '19:00' },
                ],
      },
    ]),
  ) as Record<DayKey, DaySchedule>
}

const week = reactive(emptyWeek())

function hydrate() {
  const next = emptyWeek()
  for (const s of props.schedules || []) {
    const key = s.dayOfWeek as DayKey
    if (!next[key]) continue
    const closed = Boolean(s.isClosed ?? s.isOff)
    next[key] = {
      dayOfWeek: key,
      isClosed: closed,
      blocks:
        closed || !s.blocks?.length
          ? []
          : s.blocks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
    }
  }
  for (const d of DAYS) {
    week[d.key] = next[d.key]
  }
}

watch(() => props.schedules, hydrate, { immediate: true, deep: true })

function addBlock(day: DayKey) {
  week[day].blocks.push({ startTime: '14:00', endTime: '18:00' })
  week[day].isClosed = false
}

function removeBlock(day: DayKey, index: number) {
  week[day].blocks.splice(index, 1)
  if (!week[day].blocks.length) week[day].isClosed = true
}

function toggleClosed(day: DayKey) {
  week[day].isClosed = !week[day].isClosed
  if (week[day].isClosed) {
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
      isClosed: mon.isClosed,
      blocks: mon.blocks.map((b) => ({ ...b })),
    }
  }
}

function toPayload() {
  return DAYS.map(({ key }) => ({
    dayOfWeek: key,
    isClosed: week[key].isClosed,
    blocks: week[key].isClosed
      ? []
      : week[key].blocks.filter(
          (b) => b.startTime && b.endTime && b.startTime < b.endTime,
        ),
  }))
}

function validate(): string | null {
  for (const day of DAYS) {
    const d = week[day.key]
    if (!d.isClosed && !d.blocks.length) {
      return `Define al menos un bloque en ${day.label} o márcalo como cerrado.`
    }
  }
  return null
}

defineExpose({ toPayload, validate, week })
</script>

<template>
  <div class="space-y-4">
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
          :class="week[day.key].isClosed ? 'bg-black/5 text-ink-muted' : 'bg-brand-50 text-brand-800'"
          @click="toggleClosed(day.key)"
        >
          {{ week[day.key].isClosed ? 'Cerrado' : 'Abierto' }}
        </button>
      </div>

      <div v-if="!week[day.key].isClosed" class="mt-3 space-y-2">
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
</template>
