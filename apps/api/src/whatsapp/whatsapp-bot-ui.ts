/** Acciones interactivas del bot (botones / lista WhatsApp). */
export type BotAction = {
  id: string;
  title: string;
  description?: string;
};

export type BotReply = {
  reply: string;
  state: string;
  actions?: BotAction[];
};

export function navActions(): BotAction[] {
  return [
    { id: 'nav:back', title: 'Atrás' },
    { id: 'nav:menu', title: 'Menú' },
  ];
}

export function menuActions(): BotAction[] {
  return [
    { id: 'menu:1', title: 'Reservar cita', description: 'Agendar un servicio' },
    { id: 'menu:2', title: 'Consultar cita', description: 'Ver próximas reservas' },
    { id: 'menu:3', title: 'Cancelar cita', description: 'Liberar horario' },
    { id: 'menu:4', title: 'Reprogramar', description: 'Cambiar fecha/hora' },
    { id: 'menu:5', title: 'Promociones', description: 'Ofertas activas' },
    { id: 'menu:6', title: 'Hablar con asesor', description: 'Atención humana' },
    { id: 'menu:7', title: 'Preguntas (IA)', description: 'FAQ automática' },
  ];
}

export function choiceActions(
  labels: Array<string | { title: string; description?: string }>,
  opts?: { includeNav?: boolean; startAt?: number },
): BotAction[] {
  const start = opts?.startAt ?? 1;
  const actions: BotAction[] = labels.map((label, i) => {
    const n = start + i;
    if (typeof label === 'string') {
      return {
        id: `opt:${n}`,
        title: truncate(`${n}. ${label}`, 24),
        description: label.length > 24 ? truncate(label, 72) : undefined,
      };
    }
    return {
      id: `opt:${n}`,
      title: truncate(`${n}. ${label.title}`, 24),
      description: label.description
        ? truncate(label.description, 72)
        : undefined,
    };
  });
  if (opts?.includeNav !== false) {
    actions.push(...navActions());
  }
  return actions;
}

/**
 * Convierte acciones a texto numerado (Baileys MD no entrega botones
 * de forma fiable en móviles personales).
 */
export function formatReplyWithActions(
  text: string,
  actions?: BotAction[],
): string {
  if (!actions?.length) return text;

  const choices = actions.filter(
    (a) => a.id.startsWith('menu:') || a.id.startsWith('opt:'),
  );
  const hasNumberedList = /^\s*\d+\.\s+/m.test(text);
  const parts: string[] = [text.trimEnd()];

  if (choices.length && !hasNumberedList) {
    const lines = choices.map((a) => {
      const n = a.id.split(':')[1] || '';
      const label = a.title.replace(/^\d+\.\s*/, '').trim();
      return `${n}. ${label}`;
    });
    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n');
}

export function resolveInteractiveInput(raw: string): string {
  const t = raw.trim();
  if (t === 'nav:back') return '*';
  if (t === 'nav:menu') return 'MENU';
  if (t.startsWith('menu:')) return t.slice(5);
  if (t.startsWith('opt:')) return t.slice(4);
  return t;
}

function truncate(s: string, max: number) {
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
