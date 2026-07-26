/**
 * Normaliza documento de identidad a dígitos (cédula / NIT sin DV).
 * Acepta puntos, guiones y espacios.
 */
export function normalizeDocument(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function isValidDocument(value: string): boolean {
  const n = normalizeDocument(value);
  return n.length >= 5 && n.length <= 15;
}
