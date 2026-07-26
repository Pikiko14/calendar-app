import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { confirmAction, promptMoney, toastError, toastSuccess } from '@/lib/swal'

export type CashStatus = {
  register: {
    id: string
    openingFloat: string | number
    openedAt: string
    closedAt?: string | null
  } | null
  isOpen: boolean
  businessOpenToday: boolean
  alreadyClosedToday: boolean
  openingTime: string | null
  closingTime: string | null
  closingAt: string | null
  minutesUntilClose: number | null
  closeWarnMinutes: number
  needsOpen: boolean
  needsClose: boolean
  branch: { id: string; name: string } | null
}

const CASH_ROLES = new Set(['ADMIN', 'RECEPTIONIST', 'SUPER_ADMIN'])
const POLL_MS = 60_000

function bogotaDayKey() {
  const shifted = new Date(Date.now() - 5 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dismissedOpenKey() {
  return `cash-dismiss-open:${bogotaDayKey()}`
}

function dismissedCloseKey(registerId: string) {
  return `cash-dismiss-close:${registerId}:${bogotaDayKey()}`
}

export function useCashGuard() {
  const auth = useAuthStore()
  const router = useRouter()
  const status = ref<CashStatus | null>(null)
  const loading = ref(false)
  const busy = ref(false)
  const bannerHidden = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let prompting = false
  let lastBannerKind: 'open' | 'close' | null = null

  const enabled = computed(() => {
    if (auth.isWorker) return false
    const role = auth.user?.role || ''
    return CASH_ROLES.has(role)
  })

  const showBanner = computed(() => {
    const s = status.value
    if (!s || bannerHidden.value) return false
    return s.needsOpen || s.needsClose
  })

  const banner = computed(() => {
    const s = status.value
    if (!s) return null
    if (s.needsOpen) {
      return {
        kind: 'open' as const,
        title: 'Caja del día sin abrir',
        text: s.openingTime
          ? `El local abre a las ${s.openingTime}. Abre la caja para operar hoy.`
          : 'Abre la caja para registrar ventas y gastos del día.',
        actionLabel: 'Abrir caja',
      }
    }
    if (s.needsClose && s.isOpen) {
      const mins = s.minutesUntilClose
      const when =
        mins != null && mins <= 0
          ? 'ya pasó la hora de cierre'
          : mins != null
            ? `faltan ~${mins} min para el cierre (${s.closingTime || '—'})`
            : `cerca del cierre (${s.closingTime || '—'})`
      return {
        kind: 'close' as const,
        title: 'Hora de cerrar caja',
        text: `Según el horario de ${s.branch?.name || 'la sede'}, ${when}.`,
        actionLabel: 'Cerrar caja',
      }
    }
    return null
  })

  function syncBannerVisibility() {
    const kind = banner.value?.kind ?? null
    if (kind && kind !== lastBannerKind) {
      bannerHidden.value = false
    }
    lastBannerKind = kind
  }

  async function refresh(withPrompt = false) {
    if (!enabled.value) {
      status.value = null
      return
    }
    loading.value = true
    try {
      status.value = await api<CashStatus>('/cash/status')
      syncBannerVisibility()
      if (withPrompt) await maybePrompt()
    } catch {
      // no bloquear la app
    } finally {
      loading.value = false
    }
  }

  async function openCashFromPrompt() {
    const amount = await promptMoney({
      title: 'Abrir caja del día',
      text: status.value?.openingTime
        ? `Horario de apertura: ${status.value.openingTime}. Indica el fondo inicial en efectivo.`
        : 'Indica el fondo inicial en efectivo.',
      inputLabel: 'Fondo inicial (COP)',
      confirmText: 'Abrir caja',
      cancelText: 'Más tarde',
      defaultValue: 0,
    })
    if (amount == null) {
      sessionStorage.setItem(dismissedOpenKey(), '1')
      return false
    }
    busy.value = true
    try {
      await api('/cash/open', {
        method: 'POST',
        body: JSON.stringify({ openingFloat: amount }),
      })
      sessionStorage.removeItem(dismissedOpenKey())
      await toastSuccess('Caja abierta')
      await refresh(false)
      return true
    } catch (e) {
      await toastError('No se pudo abrir', e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      busy.value = false
    }
  }

  async function closeCashFromPrompt() {
    const reg = status.value?.register
    if (!reg) return false
    const amount = await promptMoney({
      title: 'Cerrar caja',
      text: status.value?.closingTime
        ? `Cierre del local: ${status.value.closingTime}. Indica el efectivo contado en caja.`
        : 'Indica el efectivo contado en caja.',
      inputLabel: 'Efectivo al cierre (COP)',
      confirmText: 'Cerrar caja',
      cancelText: 'Más tarde',
      defaultValue: Number(reg.openingFloat || 0),
    })
    if (amount == null) {
      sessionStorage.setItem(dismissedCloseKey(reg.id), '1')
      return false
    }
    const ok = await confirmAction({
      title: '¿Confirmar cierre?',
      text: `Arqueo con $${amount.toLocaleString('es-CO')}.`,
      confirmText: 'Cerrar ahora',
    })
    if (!ok) return false
    busy.value = true
    try {
      const res = await api<{ summary?: { expected: number; difference: number } }>(
        `/cash/${reg.id}/close`,
        {
          method: 'POST',
          body: JSON.stringify({ closingCash: amount }),
        },
      )
      sessionStorage.removeItem(dismissedCloseKey(reg.id))
      const s = res.summary
      await toastSuccess(
        s
          ? `Cerrada. Esperado $${Math.round(s.expected).toLocaleString('es-CO')} · Diff $${Math.round(s.difference).toLocaleString('es-CO')}`
          : 'Caja cerrada',
      )
      await refresh(false)
      return true
    } catch (e) {
      await toastError('No se pudo cerrar', e instanceof Error ? e.message : 'Error')
      return false
    } finally {
      busy.value = false
    }
  }

  async function maybePrompt() {
    const s = status.value
    if (!s || !enabled.value || prompting) return
    prompting = true
    try {
      if (s.needsOpen && !sessionStorage.getItem(dismissedOpenKey())) {
        await openCashFromPrompt()
        return
      }
      if (
        s.needsClose &&
        s.register &&
        !sessionStorage.getItem(dismissedCloseKey(s.register.id))
      ) {
        await closeCashFromPrompt()
      }
    } finally {
      prompting = false
    }
  }

  async function bannerAction() {
    if (banner.value?.kind === 'open') await openCashFromPrompt()
    else if (banner.value?.kind === 'close') await closeCashFromPrompt()
  }

  function dismissBanner() {
    const s = status.value
    if (!s) return
    if (s.needsOpen) sessionStorage.setItem(dismissedOpenKey(), '1')
    if (s.needsClose && s.register) {
      sessionStorage.setItem(dismissedCloseKey(s.register.id), '1')
    }
    bannerHidden.value = true
  }

  watch(
    () => [enabled.value, auth.user?.id] as const,
    async ([on]) => {
      if (!on) {
        status.value = null
        return
      }
      await refresh(true)
    },
  )

  onMounted(async () => {
    if (enabled.value) await refresh(true)
    timer = setInterval(() => {
      void refresh(true)
    }, POLL_MS)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  return {
    status,
    banner,
    showBanner,
    loading,
    busy,
    enabled,
    refresh,
    openCashFromPrompt,
    closeCashFromPrompt,
    bannerAction,
    dismissBanner,
    goToCash: () => router.push('/app/cash'),
  }
}
