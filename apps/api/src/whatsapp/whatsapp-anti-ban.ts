/**
 * Utilidades para reducir riesgo de bloqueo en WhatsApp Web (Baileys):
 * cola serial, delays humanos, rate limits, typing, backoff.
 */

export type AntiBanOptions = {
  /** Gap mínimo entre envíos del mismo tenant (ms) */
  minGapMs: number;
  /** Delay extra por carácter del mensaje (ms) */
  msPerChar: number;
  /** Delay mínimo / máximo de "escritura" */
  typingMinMs: number;
  typingMaxMs: number;
  /** Máx. mensajes salientes por minuto por tenant */
  maxPerMinuteTenant: number;
  /** Máx. mensajes salientes por minuto por chat */
  maxPerMinuteChat: number;
  /** Debounce de mensajes entrantes del mismo chat (ms) */
  inboundDebounceMs: number;
};

export const DEFAULT_ANTI_BAN: AntiBanOptions = {
  minGapMs: 1800,
  msPerChar: 12,
  typingMinMs: 800,
  typingMaxMs: 4500,
  maxPerMinuteTenant: 18,
  maxPerMinuteChat: 8,
  inboundDebounceMs: 900,
};

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function jitter(minMs: number, maxMs: number) {
  const a = Math.min(minMs, maxMs);
  const b = Math.max(minMs, maxMs);
  return a + Math.floor(Math.random() * (b - a + 1));
}

/** Delay de typing según longitud del texto, con tope. */
export function typingDelayMs(text: string, opts: AntiBanOptions) {
  const byLen = opts.typingMinMs + text.length * opts.msPerChar;
  return Math.min(opts.typingMaxMs, Math.max(opts.typingMinMs, byLen));
}

/** Ventana deslizante de timestamps (1 minuto). */
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();

  count(key: string, windowMs = 60_000) {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    this.hits.set(key, arr);
    return arr.length;
  }

  push(key: string, windowMs = 60_000) {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    return arr.length;
  }
}

/** Cola FIFO serial por clave (p.ej. tenantId). */
export class SerialQueue {
  private tail = new Map<string, Promise<unknown>>();

  enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tail.get(key) || Promise.resolve();
    const next = prev.then(task, task);
    this.tail.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }
}
