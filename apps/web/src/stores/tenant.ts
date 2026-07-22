import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useTenantStore = defineStore('tenant', () => {
  const tenant = ref({ name: 'Studio Marea', slug: 'studio-marea', timezone: 'America/Mexico_City' })
  return { tenant }
})
