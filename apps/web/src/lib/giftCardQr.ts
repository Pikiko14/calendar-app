/** Prefijo para distinguir QRs de gift card al escanear. */
export const GIFT_CARD_QR_PREFIX = 'BBGC:'

/** Payload embebido en el QR (escaneable → código de gift card). */
export function giftCardQrPayload(code: string) {
  return `${GIFT_CARD_QR_PREFIX}${code.trim().toUpperCase()}`
}

/** Extrae el código desde texto escaneado (QR con prefijo o código plano). */
export function parseGiftCardScan(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const upper = value.toUpperCase()
  if (upper.startsWith(GIFT_CARD_QR_PREFIX)) {
    const code = upper.slice(GIFT_CARD_QR_PREFIX.length).trim()
    return code || null
  }
  // Código plano (escáner de teclado / apps genéricas)
  const plain = upper.replace(/\s+/g, '')
  if (/^[A-Z0-9_-]{4,32}$/.test(plain)) return plain
  return null
}

/** URL de imagen QR (fallback online). */
export function giftCardQrImageUrl(code: string, size = 180) {
  const data = encodeURIComponent(giftCardQrPayload(code))
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&ecc=M&data=${data}`
}

type QrLib = {
  toDataURL: (
    text: string,
    opts?: {
      width?: number
      margin?: number
      errorCorrectionLevel?: string
      color?: { dark?: string; light?: string }
    },
  ) => Promise<string>
}

let qrLibPromise: Promise<QrLib> | null = null

function loadQrLib(): Promise<QrLib> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('QR solo disponible en el navegador'))
  }
  const existing = (window as Window & { QRCode?: QrLib }).QRCode
  if (existing?.toDataURL) return Promise.resolve(existing)

  if (!qrLibPromise) {
    qrLibPromise = new Promise((resolve, reject) => {
      const src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js'
      const prev = document.querySelector<HTMLScriptElement>(`script[data-bb-qrcode]`)
      if (prev) {
        prev.addEventListener('load', () => {
          const lib = (window as Window & { QRCode?: QrLib }).QRCode
          if (lib?.toDataURL) resolve(lib)
          else reject(new Error('No se cargó la librería QR'))
        })
        prev.addEventListener('error', () => reject(new Error('Error cargando QR')))
        return
      }
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.dataset.bbQrcode = '1'
      s.onload = () => {
        const lib = (window as Window & { QRCode?: QrLib }).QRCode
        if (lib?.toDataURL) resolve(lib)
        else reject(new Error('No se cargó la librería QR'))
      }
      s.onerror = () => reject(new Error('Error cargando QR'))
      document.head.appendChild(s)
    })
  }
  return qrLibPromise
}

/**
 * Genera un data URL PNG del QR.
 * Si falla la lib CDN, usa URL de imagen online.
 */
export async function toGiftCardQrDataUrl(code: string, size = 180): Promise<string> {
  try {
    const QRCode = await loadQrLib()
    return await QRCode.toDataURL(giftCardQrPayload(code), {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1f1c', light: '#ffffff' },
    })
  } catch {
    return giftCardQrImageUrl(code, size)
  }
}
