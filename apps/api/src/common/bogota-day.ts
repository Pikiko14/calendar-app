/** Rango del día calendario en America/Bogota (UTC-5, sin DST). */
export function bogotaDayRange(now = new Date()) {
  const shiftMs = -5 * 60 * 60 * 1000;
  const bogota = new Date(now.getTime() + shiftMs);
  const y = bogota.getUTCFullYear();
  const m = bogota.getUTCMonth();
  const d = bogota.getUTCDate();
  // Medianoche Bogotá = 05:00 UTC del mismo día civil
  const dayStart = new Date(Date.UTC(y, m, d, 5, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(y, m, d + 1, 5, 0, 0, 0) - 1);
  return { dayStart, dayEnd };
}

/**
 * Rango inclusivo desde/hasta (YYYY-MM-DD) en calendario Bogotá.
 * Evita el error de usar T00:00:00.000Z (que corre el día en Colombia).
 */
export function bogotaDateRange(fromYmd: string, toYmd: string) {
  const parse = (ymd: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim());
    if (!m) return null;
    return {
      y: Number(m[1]),
      m: Number(m[2]),
      d: Number(m[3]),
    };
  };
  const from = parse(fromYmd);
  const to = parse(toYmd);
  if (!from || !to) {
    return bogotaDayRange();
  }
  const dayStart = new Date(Date.UTC(from.y, from.m - 1, from.d, 5, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(to.y, to.m - 1, to.d + 1, 5, 0, 0, 0) - 1);
  return { dayStart, dayEnd };
}
