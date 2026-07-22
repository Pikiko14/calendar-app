const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  ?? 'http://localhost:3000/api/v1'

/** Origen del API sin /api/v1 — para imágenes estáticas /uploads */
export const API_ORIGIN = baseUrl.replace(/\/api\/v1\/?$/, '') || 'http://localhost:3000'

type ApiEnvelope<T> = { data: T; timestamp?: string }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const msg = (payload as { message?: unknown }).message
  if (Array.isArray(msg)) return msg.join(', ')
  if (typeof msg === 'string') return msg
  return fallback
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as unknown

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('beautybook-token')
      localStorage.removeItem('beautybook-refresh')
    }
    throw new ApiError(extractMessage(payload, 'No fue posible completar la solicitud.'), response.status)
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('beautybook-token')
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new ApiError(
      'No se pudo conectar con la API. ¿Está corriendo en http://localhost:3000?',
      0,
    )
  }

  return parseResponse<T>(response)
}

/** Subida multipart (ej. foto de trabajador) */
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  return api<T>(path, { method: 'POST', body: formData })
}

export function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export { baseUrl as API_BASE_URL }
