<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { mediaUrl } from '@/api/client'
import { toGiftCardQrDataUrl } from '@/lib/giftCardQr'

const props = withDefaults(
  defineProps<{
    code: string
    size?: number
    light?: boolean
    /** URL ya guardada en S3 /uploads */
    imageUrl?: string | null
  }>(),
  { size: 120, light: false, imageUrl: null },
)

const src = ref('')
const failed = ref(false)

async function load() {
  failed.value = false
  if (props.imageUrl) {
    src.value = mediaUrl(props.imageUrl)
    return
  }
  if (!props.code?.trim()) {
    src.value = ''
    return
  }
  try {
    src.value = await toGiftCardQrDataUrl(props.code, props.size)
  } catch {
    failed.value = true
    src.value = ''
  }
}

onMounted(load)
watch(() => [props.code, props.size, props.imageUrl], load)
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
      class="block rounded-lg object-contain"
      draggable="false"
    />
    <span v-else-if="failed" class="text-[10px] text-ink-muted">QR no disponible</span>
    <span v-else class="text-[10px] text-ink-muted">Generando QR…</span>
  </div>
</template>
