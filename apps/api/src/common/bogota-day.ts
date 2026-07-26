/** Rango del día calendario en America/Bogota (UTC-5, sin DST). */
export function bogotaDayRange(now = new Date()) {
  const shiftMs = -5 * 60 * 60 * 1000
  const bogota = new Date(now.getTime() + shiftMs)
  const y = bogota.getUTCFullYear()
  const m = bogota.getUTCMonth()
  const d = bogota.getUTCDate()
  // Medianoche Bogotá = 05:00 UTC del mismo día civil
  const dayStart = new Date(Date.UTC(y, m, d, 5, 0, 0, 0))
  const dayEnd = new Date(Date.UTC(y, m, d + 1, 5, 0, 0, 0) - 1)
  return { dayStart, dayEnd }
}
