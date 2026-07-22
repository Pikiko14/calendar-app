<script setup lang="ts">
defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-5 pt-20 backdrop-blur-sm md:pt-24"
    @click.self="$emit('close')"
  >
    <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
      <slot />
    </div>
  </div>
</template>
