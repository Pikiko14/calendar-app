<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' }>(), { variant: 'primary' })
</script>

<template>
  <button
    type="button"
    :class="variant === 'primary' ? 'btn-primary' : 'btn-ghost'"
  >
    <slot />
  </button>
</template>
