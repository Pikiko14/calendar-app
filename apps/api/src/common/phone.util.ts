/**
 * Normaliza teléfonos a dígitos internacionales (sin +).
 * CO: móvil 10 dígitos (3…) → 57…
 */
export function normalizePhone(phone: string): string {
  let num = String(phone || '').replace(/\D/g, '');
  if (num.startsWith('00')) num = num.slice(2);
  if (num.length === 10 && num.startsWith('3')) num = `57${num}`;
  return num;
}

/** Variantes posibles guardadas en BD para buscar el mismo número. */
export function phoneLookupVariants(phone: string): string[] {
  const n = normalizePhone(phone);
  if (!n) return [];
  const set = new Set<string>([n, `+${n}`]);
  if (n.startsWith('57') && n.length === 12) {
    const local = n.slice(2);
    set.add(local);
    set.add(`+${local}`);
  }
  return [...set];
}
