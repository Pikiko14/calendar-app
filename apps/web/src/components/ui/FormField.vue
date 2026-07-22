<script setup lang="ts">
import { useField } from 'vee-validate'
import { computed, toRef } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    label?: string
    type?: string
    placeholder?: string
    hint?: string
    as?: 'input' | 'textarea'
    min?: string | number
    step?: string | number
    autocomplete?: string
  }>(),
  {
    type: 'text',
    as: 'input',
  },
)

const nameRef = toRef(props, 'name')
const { value, errorMessage, meta, handleBlur, handleChange } = useField(nameRef)

const showError = computed(() => Boolean(errorMessage.value) && (meta.touched || meta.validated))
const fieldClass = computed(() => [
  'input-field',
  showError.value
    ? '!border-red-400 focus:!border-red-500 focus:!ring-red-500/15'
    : '',
])
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="label" :for="name" class="block text-sm font-medium text-ink-muted">
      {{ label }}
    </label>

    <textarea
      v-if="as === 'textarea'"
      :id="name"
      :name="name"
      :value="String(value ?? '')"
      :placeholder="placeholder"
      rows="3"
      :class="fieldClass"
      @input="handleChange"
      @blur="handleBlur"
    />
    <input
      v-else
      :id="name"
      :name="name"
      :type="type"
      :value="value as string | number"
      :placeholder="placeholder"
      :min="min"
      :step="step"
      :autocomplete="autocomplete"
      :class="fieldClass"
      @input="handleChange"
      @blur="handleBlur"
    />

    <p v-if="showError" class="flex items-start gap-1.5 text-xs font-medium text-red-600">
      <span class="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
      {{ errorMessage }}
    </p>
    <p v-else-if="hint" class="text-xs text-ink-muted">{{ hint }}</p>
  </div>
</template>
