import { parseGiftCardScan } from '@/lib/giftCardQr'

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
}

function getBarcodeDetector():
  | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
  | null {
  const BD = (window as Window & { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
    .BarcodeDetector
  return BD || null
}

export function canScanGiftCardQr() {
  return typeof window !== 'undefined' && !!getBarcodeDetector() && !!navigator.mediaDevices?.getUserMedia
}

/**
 * Abre la cámara, detecta un QR de gift card y devuelve el código.
 * Cancela con AbortSignal o cerrando el stream.
 */
export async function scanGiftCardQr(opts: {
  video: HTMLVideoElement
  signal?: AbortSignal
}): Promise<string> {
  const Detector = getBarcodeDetector()
  if (!Detector) {
    throw new Error('Este navegador no soporta escaneo de QR. Usa Chrome/Edge o ingresa el código.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  opts.video.srcObject = stream
  await opts.video.play()

  const detector = new Detector({ formats: ['qr_code'] })

  const stop = () => {
    stream.getTracks().forEach((t) => t.stop())
    opts.video.srcObject = null
  }

  try {
    while (!opts.signal?.aborted) {
      if (opts.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const codes = await detector.detect(opts.video)
        for (const c of codes) {
          const parsed = parseGiftCardScan(c.rawValue || '')
          if (parsed) {
            stop()
            return parsed
          }
        }
      }
      await new Promise((r) => setTimeout(r, 280))
    }
    throw new Error('Escaneo cancelado')
  } finally {
    stop()
  }
}
