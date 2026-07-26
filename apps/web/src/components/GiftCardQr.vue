<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { toGiftCardQrDataUrl } from '@/lib/giftCardQr'

const props = withDefaults(
  defineProps<{
    code: string
    size?: number
    light?: boolean
  }>(),
  { size: 120, light: false },
)

const src = ref('')
const failed = ref(false)

async function load() {
  if (!props.code?.trim()) {
    src.value = ''
    return
  }
  failed.value = false
  try {
    src.value = await toGiftCardQrDataUrl(props.code, props.size)
  } catch {
    failed.value = true
    src.value = ''
  }
}

onMounted(load)
watch(() => [props.code, props.size], load)
</script>

<template>
  <div
    class="inline-flex flex-col items-center"
    :class="light ? 'rounded-xl bg-white p-2 shadow-sm' : ''"
  >
    <img
      v-if="src"
      :src="src"
      :alt="`QR ${code}`"
      :width="size"
      :height="size"
      class="block rounded-lg"
      draggable="false"
    />
    <span v-else-if="failed" class="text-[10px] text-ink-muted">QR no disponible</span>
    <span v-else class="text-[10px] text-ink-muted">Generando QR…</span>
  </div>
</template>
