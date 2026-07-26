<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Check, ChevronDown } from '@lucide/vue'

export type AppSelectOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue?: string | null
    options: AppSelectOption[]
    placeholder?: string
    disabled?: boolean
    /** Clases extra en el botón trigger */
    buttonClass?: string
  }>(),
  {
    modelValue: '',
    placeholder: 'Selecciona…',
    disabled: false,
    buttonClass: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selected = computed(() =>
  props.options.find((o) => o.value === (props.modelValue ?? '')),
)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}

function pick(opt: AppSelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  open.value = false
}

function onDocClick(e: MouseEvent) {
  const t = e.target as Node | null
  if (!root.value || !t || root.value.contains(t)) return
  open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="root" class="relative" data-app-select>
    <button
      type="button"
      class="input-field flex w-full items-center justify-between gap-3 text-left !rounded-xl"
      :class="[
        buttonClass,
        disabled ? 'cursor-not-allowed opacity-60' : '',
        open ? 'border-brand-600 ring-4 ring-brand-700/10' : '',
      ]"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <span
        class="min-w-0 flex-1 truncate"
        :class="selected ? 'text-ink dark:text-mist' : 'text-ink-muted/60'"
      >
        <template v-if="selected">
          <span class="block truncate font-medium">{{ selected.label }}</span>
          <span
            v-if="selected.description"
            class="mt-0.5 block truncate text-xs font-normal text-ink-muted"
          >
            {{ selected.description }}
          </span>
        </template>
        <template v-else>{{ placeholder }}</template>
      </span>
      <ChevronDown
        class="h-4 w-4 shrink-0 text-ink-muted transition"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <div
      v-if="open"
      class="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-auto rounded-2xl border border-black/10 bg-white py-1.5 shadow-lift dark:border-white/10 dark:bg-ink-soft"
    >
      <p v-if="!options.length" class="px-4 py-3 text-sm text-ink-muted">
        Sin opciones.
      </p>
      <button
        v-for="opt in options"
        :key="opt.value === '' ? '__empty' : opt.value"
        type="button"
        class="flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm transition"
        :class="[
          opt.disabled
            ? 'cursor-not-allowed opacity-50'
            : 'hover:bg-brand-50 dark:hover:bg-brand-950/40',
          modelValue === opt.value
            ? 'bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200'
            : 'text-ink dark:text-mist',
        ]"
        :disabled="opt.disabled"
        @click.stop="pick(opt)"
      >
        <Check
          class="mt-0.5 h-4 w-4 shrink-0"
          :class="modelValue === opt.value ? 'opacity-100' : 'opacity-0'"
        />
        <span class="min-w-0">
          <span class="block font-medium">{{ opt.label }}</span>
          <span
            v-if="opt.description"
            class="mt-0.5 block text-xs text-ink-muted"
          >
            {{ opt.description }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
