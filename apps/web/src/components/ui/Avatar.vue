<script setup lang="ts">defineProps<{ name: string }>()</script>
<template><div class="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{{ name.split(' ').map(part => part[0]).join('').slice(0,2) }}</div></template>
