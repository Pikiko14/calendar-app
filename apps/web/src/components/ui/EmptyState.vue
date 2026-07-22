<script setup lang="ts">defineProps<{ title: string; description?: string }>()</script>
<template><div class="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700"><p class="font-display text-xl">{{ title }}</p><p v-if="description" class="mt-2 text-sm text-slate-500">{{ description }}</p><slot /></div></template>
