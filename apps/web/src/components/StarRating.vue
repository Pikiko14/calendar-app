<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    avg?: number | null
    count?: number | null
    size?: 'sm' | 'md'
    showCount?: boolean
  }>(),
  {
    avg: 0,
    count: 0,
    size: 'sm',
    showCount: true,
  },
)

const value = computed(() => Math.max(0, Math.min(5, Number(props.avg) || 0)))
const filled = computed(() => Math.round(value.value))
const label = computed(() => (value.value > 0 ? value.value.toFixed(1) : '—'))
const starClass = computed(() =>
  props.size === 'md' ? 'text-base' : 'text-xs',
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 text-ink-muted"
    :class="starClass"
    :title="count ? `${label} de 5 · ${count} reseñas` : 'Sin reseñas aún'"
  >
    <span class="tracking-tight text-amber-500" aria-hidden="true">
      <span v-for="n in 5" :key="n">{{ n <= filled ? '★' : '☆' }}</span>
    </span>
    <span class="font-semibold text-ink">{{ label }}</span>
    <span v-if="showCount && count" class="text-ink-muted">({{ count }})</span>
  </span>
</template>
