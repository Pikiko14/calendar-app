/** Abre ePayco Smart Checkout (v2) con una sessionId del backend. */
export async function openEpaycoCheckout(opts: {
  publicKey: string
  sessionId: string
  test?: boolean
}) {
  await loadEpaycoScript()
  const w = window as Window & {
    ePayco?: {
      checkout?: {
        configure: (cfg: { key: string; test?: boolean }) => {
          open: (data: Record<string, unknown>) => void
        }
      }
      Checkout?: new (cfg: { key: string; test?: boolean }) => {
        open: (data: Record<string, unknown>) => void
      }
    }
  }

  if (w.ePayco?.Checkout) {
    const checkout = new w.ePayco.Checkout({
      key: opts.publicKey,
      test: opts.test !== false,
    })
    checkout.open({ sessionId: opts.sessionId })
    return
  }

  if (w.ePayco?.checkout?.configure) {
    const handler = w.ePayco.checkout.configure({
      key: opts.publicKey,
      test: opts.test !== false,
    })
    handler.open({ sessionId: opts.sessionId })
    return
  }

  throw new Error('No se pudo cargar el checkout de ePayco.')
}

function loadEpaycoScript() {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-epayco-checkout]',
    )
    if (existing) {
      if ((window as any).ePayco) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Error cargando checkout.js de ePayco')),
      )
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.epayco.co/checkout.js'
    script.async = true
    script.dataset.epaycoCheckout = '1'
    script.onload = () => resolve()
    script.onerror = () =>
      reject(new Error('Error cargando checkout.js de ePayco'))
    document.head.appendChild(script)
  })
}
