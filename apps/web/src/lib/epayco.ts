/** Abre ePayco Smart Checkout v2 con sessionId del backend. */
export async function openEpaycoCheckout(opts: {
  sessionId: string
  test?: boolean
  type?: 'onpage' | 'standard'
}) {
  await loadEpaycoScript()

  const w = window as Window & {
    ePayco?: {
      checkout?: {
        configure: (cfg: {
          sessionId: string
          type?: 'onpage' | 'standard'
          test?: boolean
        }) => {
          open: () => void
          onCreated?: (cb: () => void) => void
          onErrors?: (cb: (err: unknown) => void) => void
          onClosed?: (cb: () => void) => void
        }
      }
    }
  }

  if (!w.ePayco?.checkout?.configure) {
    throw new Error('No se pudo cargar el checkout de ePayco.')
  }

  const checkout = w.ePayco.checkout.configure({
    sessionId: opts.sessionId,
    type: opts.type ?? 'onpage',
    test: opts.test !== false,
  })

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : 'Error en checkout ePayco'
      reject(new Error(msg))
    }

    checkout.onErrors?.(fail)
    checkout.onCreated?.(() => {
      if (settled) return
      settled = true
      resolve()
    })
    checkout.onClosed?.(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    })

    try {
      checkout.open()
    } catch (e) {
      fail(e)
      return
    }

    // Si no hay callbacks, no bloquear la UI.
    window.setTimeout(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    }, 2500)
  })
}

function loadEpaycoScript() {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-epayco-checkout-v2]',
    )
    if (existing) {
      if ((window as any).ePayco?.checkout) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Error cargando checkout-v2.js de ePayco')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.epayco.co/checkout-v2.js'
    script.async = true
    script.dataset.epaycoCheckoutV2 = '1'
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Error cargando checkout-v2.js de ePayco'))
    document.head.appendChild(script)
  })
}
