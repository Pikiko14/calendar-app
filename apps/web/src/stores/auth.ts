import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api/client'
import { applyBrandTheme, resetBrandTheme } from '@/lib/brand'

export type AuthUser = {
  id: string
  email: string
  firstName?: string
  lastName?: string
  role?: string
  tenantId?: string | null
  worker?: { id: string; firstName: string; lastName: string } | null
  tenant?: {
    id: string
    name: string
    slug: string
    logoUrl?: string | null
    primaryColor?: string | null
  } | null
}

type AuthResponse = {
  accessToken: string
  refreshToken: string
  user: {
    id: string
    email: string
    role: string
    tenantId: string | null
  }
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)
  const error = ref('')
  const token = ref<string | null>(localStorage.getItem('beautybook-token'))

  const isAuthenticated = computed(() => Boolean(token.value))
  const isWorker = computed(() => user.value?.role === 'WORKER')
  const workerId = computed(() => user.value?.worker?.id ?? null)
  const displayName = computed(() => {
    if (!user.value) return ''
    if (user.value.firstName) return `${user.value.firstName} ${user.value.lastName ?? ''}`.trim()
    return user.value.email
  })

  function homeRoute() {
    return isWorker.value ? 'calendar' : 'dashboard'
  }

  function persistTokens(tokens: AuthResponse) {
    localStorage.setItem('beautybook-token', tokens.accessToken)
    localStorage.setItem('beautybook-refresh', tokens.refreshToken)
    token.value = tokens.accessToken
  }

  async function login(email: string, password: string) {
    loading.value = true
    error.value = ''
    try {
      const result = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      persistTokens(result)
      await fetchMe()
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al iniciar sesión'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register(input: {
    tenantName: string
    email: string
    password: string
    firstName?: string
    lastName?: string
  }) {
    loading.value = true
    error.value = ''
    try {
      const slug = slugify(input.tenantName) || `negocio-${Date.now()}`
      const result = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          tenantName: input.tenantName,
          slug,
          email: input.email,
          password: input.password,
          firstName: input.firstName || input.tenantName.split(' ')[0] || 'Admin',
          lastName: input.lastName || 'Owner',
        }),
      })
      persistTokens(result)
      await fetchMe()
      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Error al registrar'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    if (!localStorage.getItem('beautybook-token')) {
      user.value = null
      return null
    }
    try {
      const me = await api<AuthUser>('/auth/me')
      user.value = me
      applyBrandTheme(me.tenant?.primaryColor)
      return me
    } catch {
      signOut()
      return null
    }
  }

  function signOut() {
    localStorage.removeItem('beautybook-token')
    localStorage.removeItem('beautybook-refresh')
    token.value = null
    user.value = null
    error.value = ''
    resetBrandTheme()
  }

  function patchTenant(
    patch: Partial<NonNullable<AuthUser['tenant']>>,
  ) {
    if (!user.value?.tenant) return
    user.value = {
      ...user.value,
      tenant: { ...user.value.tenant, ...patch },
    }
    if (patch.primaryColor !== undefined) {
      applyBrandTheme(patch.primaryColor)
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isWorker,
    workerId,
    displayName,
    homeRoute,
    login,
    register,
    fetchMe,
    signOut,
    patchTenant,
  }
})
