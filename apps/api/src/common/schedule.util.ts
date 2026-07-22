export type TimeBlock = { startTime: string; endTime: string };

const DAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type DayKey = (typeof DAYS)[number];

export function dayEnum(date: Date): DayKey {
  return DAYS[date.getDay()];
}

/** Preferible con dayjs ya en timezone del negocio (0 = domingo). */
export function dayEnumFromIndex(dayIndex: number): DayKey {
  return DAYS[((dayIndex % 7) + 7) % 7];
}

export function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Intersección de bloques A ∩ B (HH:mm). */
export function intersectBlocks(a: TimeBlock[], b: TimeBlock[]): TimeBlock[] {
  const result: TimeBlock[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(toMinutes(x.startTime), toMinutes(y.startTime));
      const end = Math.min(toMinutes(x.endTime), toMinutes(y.endTime));
      if (start < end) {
        result.push({ startTime: fromMinutes(start), endTime: fromMinutes(end) });
      }
    }
  }
  return result.sort((p, q) => toMinutes(p.startTime) - toMinutes(q.startTime));
}

export function blockCoversRange(
  blocks: TimeBlock[],
  startHm: string,
  endHm: string,
): boolean {
  return blocks.some(
    (b) => b.startTime <= startHm && b.endTime >= endHm,
  );
}

export const DEFAULT_WEEK_BLOCKS: Record<
  DayKey,
  { isClosed: boolean; blocks: TimeBlock[] }
> = {
  MONDAY: {
    isClosed: false,
    blocks: [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '19:00' },
    ],
  },
  TUESDAY: {
    isClosed: false,
    blocks: [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '19:00' },
    ],
  },
  WEDNESDAY: {
    isClosed: false,
    blocks: [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '19:00' },
    ],
  },
  THURSDAY: {
    isClosed: false,
    blocks: [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '19:00' },
    ],
  },
  FRIDAY: {
    isClosed: false,
    blocks: [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '19:00' },
    ],
  },
  SATURDAY: {
    isClosed: false,
    blocks: [{ startTime: '09:00', endTime: '14:00' }],
  },
  SUNDAY: { isClosed: true, blocks: [] },
};
