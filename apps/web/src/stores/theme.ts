import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { usePreferredDark } from '@vueuse/core'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(localStorage.getItem('beautybook-theme') === 'dark' || (!localStorage.getItem('beautybook-theme') && usePreferredDark().value))
  watch(isDark, (value) => {
    document.documentElement.classList.toggle('dark', value)
    localStorage.setItem('beautybook-theme', value ? 'dark' : 'light')
  }, { immediate: true })
  return { isDark, toggle: () => (isDark.value = !isDark.value) }
})
