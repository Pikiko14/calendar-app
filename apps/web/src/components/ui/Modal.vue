<script setup lang="ts">defineEmits<{ close: [] }>()</script>
<template><div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-5" @click.self="$emit('close')"><div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900"><slot /></div></div></template>
