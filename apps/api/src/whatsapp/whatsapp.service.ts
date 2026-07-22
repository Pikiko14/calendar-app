import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppointmentStatus,
  WhatsAppConversationState,
} from '@prisma/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { AppointmentsService } from '../appointments/appointments.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewsService } from '../reviews/reviews.service';
import {
  choiceActions,
  menuActions,
  navActions,
  type BotAction,
  type BotReply,
} from './whatsapp-bot-ui';
import { normalizePhone, phoneLookupVariants } from '../common/phone.util';

dayjs.extend(customParseFormat);

type ConvoContext = {
  serviceId?: string;
  workerId?: string;
  date?: string;
  startAt?: string;
  appointmentId?: string;
  /** Reserva web/recordatorio esperando 1/2/3 */
  awaitingConfirm?: boolean;
  autoWorker?: boolean;
  services?: string[];
  workers?: string[];
  slots?: string[];
  appointmentIds?: string[];
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AppointmentsService))
    private readonly appointments: AppointmentsService,
    private readonly ai: AiService,
    private readonly config: ConfigService,
    private readonly reviews: ReviewsService,
  ) {}

  async handleIncoming(tenantId: string, phone: string, text: string) {
    const normalized = text.trim();
    const phoneKey = normalizePhone(phone);
    if (!phoneKey) {
      throw new BadRequestException('Teléfono inválido.');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { settings: true, whatsappBot: true },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada.');

    if (tenant.whatsappBot && tenant.whatsappBot.enabled === false) {
      return {
        reply: 'El bot de WhatsApp de este negocio está desactivado temporalmente.',
        state: 'IDLE',
      } satisfies BotReply;
    }

    const client = await this.resolveClient(tenantId, phoneKey);
    let convo = await this.resolveConversation(tenantId, client.id, phoneKey);

    convo = await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: { clientId: client.id, lastMessage: normalized, phone: phoneKey },
    });

    const ctx = (convo.context ?? {}) as ConvoContext;
    const business = tenant.whatsappBot?.businessName || tenant.name;
    const upper = normalized.toUpperCase();

    // Menú principal (reset total)
    if (['HOLA', 'HI', 'BUENAS', 'MENU', 'MENÚ', 'INICIO'].includes(upper)) {
      return this.setState(
        convo.id,
        WhatsAppConversationState.MENU,
        {},
        this.welcome(business, tenant.whatsappBot?.welcomeMsg),
        menuActions(),
      );
    }

    // Un paso atrás
    if (this.isBackCommand(normalized) && convo.state !== WhatsAppConversationState.MENU && convo.state !== WhatsAppConversationState.IDLE) {
      return this.goBack(tenantId, convo.id, business, convo.state, ctx);
    }

    // Confirmación de cita web/recordatorio (1/2/3).
    // Solo no interceptar si ya avanzó en un flujo nuevo (fecha/hora/reprogramar/etc.).
    // En BOOKING_SERVICE sí: si hay PENDING, "1" confirma (evita el bug de menú de servicios).
    const deepInNewBooking: WhatsAppConversationState[] = [
      WhatsAppConversationState.BOOKING_DATE,
      WhatsAppConversationState.BOOKING_WORKER,
      WhatsAppConversationState.BOOKING_TIME,
      WhatsAppConversationState.RESCHEDULE,
      WhatsAppConversationState.CANCEL,
      WhatsAppConversationState.REVIEW,
    ];
    const isDeepInNewBooking = deepInNewBooking.includes(convo.state);

    if (!isDeepInNewBooking && ['1', '2', '3'].includes(normalized)) {
      const pendingId = await this.resolveConfirmAppointmentId(
        tenantId,
        client.id,
        phoneKey,
        ctx,
        convo.state,
      );
      if (pendingId) {
        return this.handleReminderReply(
          tenantId,
          convo.id,
          client.id,
          { ...ctx, appointmentId: pendingId, awaitingConfirm: true },
          normalized,
        );
      }
    }

    switch (convo.state) {
      case WhatsAppConversationState.IDLE:
      case WhatsAppConversationState.MENU:
        return this.handleMenu(tenantId, convo.id, client.id, business, normalized, ctx);
      case WhatsAppConversationState.BOOKING_CONFIRM:
        return this.setState(
          convo.id,
          WhatsAppConversationState.BOOKING_CONFIRM,
          ctx,
          'Para tu reserva pendiente responde:\n1 Confirmar\n2 Reprogramar\n3 Cancelar',
        );
      case WhatsAppConversationState.BOOKING_SERVICE:
        return this.handleBookingService(tenantId, convo.id, normalized);
      case WhatsAppConversationState.BOOKING_DATE:
        return this.handleBookingDate(tenantId, convo.id, ctx, normalized);
      case WhatsAppConversationState.BOOKING_WORKER:
        return this.handleBookingWorker(tenantId, convo.id, ctx, normalized);
      case WhatsAppConversationState.BOOKING_TIME:
        return this.handleBookingTime(tenantId, convo.id, client.id, ctx, normalized, tenant);
      case WhatsAppConversationState.CONSULT:
        return this.handleConsult(tenantId, client.id, convo.id);
      case WhatsAppConversationState.CANCEL:
        return this.handleCancel(tenantId, client.id, convo.id, normalized);
      case WhatsAppConversationState.RESCHEDULE:
        return this.handleReschedule(tenantId, client.id, convo.id, ctx, normalized);
      case WhatsAppConversationState.REVIEW:
        return this.handleReview(tenantId, client.id, convo.id, ctx, normalized);
      case WhatsAppConversationState.ADVISOR:
        return this.setState(
          convo.id,
          WhatsAppConversationState.MENU,
          {},
          'Un asesor te contactará pronto. Escribe MENU para volver.',
          menuActions(),
        );
      case WhatsAppConversationState.AI_CHAT:
        return this.handleAi(tenantId, convo.id, normalized);
      default:
        return this.setState(
          convo.id,
          WhatsAppConversationState.MENU,
          {},
          this.welcome(business),
          menuActions(),
        );
    }
  }

  private isBackCommand(text: string) {
    const t = text.trim().toUpperCase();
    return ['*', 'ATRAS', 'ATRÁS', 'VOLVER', 'BACK', '<<', 'ANTERIOR'].includes(t);
  }

  private withNav(message: string) {
    return `${message}\n\nTambién puedes escribir * (atrás) o MENU.`;
  }

  private async goBack(
    tenantId: string,
    convoId: string,
    business: string,
    state: WhatsAppConversationState,
    ctx: ConvoContext,
  ) {
    switch (state) {
      case WhatsAppConversationState.BOOKING_SERVICE:
      case WhatsAppConversationState.CANCEL:
      case WhatsAppConversationState.AI_CHAT:
      case WhatsAppConversationState.ADVISOR:
      case WhatsAppConversationState.REVIEW:
      case WhatsAppConversationState.BOOKING_CONFIRM:
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          this.welcome(business),
          menuActions(),
        );

      case WhatsAppConversationState.BOOKING_DATE:
        return this.promptServices(tenantId, convoId);

      case WhatsAppConversationState.BOOKING_WORKER:
        return this.setState(
          convoId,
          WhatsAppConversationState.BOOKING_DATE,
          { serviceId: ctx.serviceId, services: ctx.services },
          this.withNav(
            '¿Qué día? Escribe la fecha (YYYY-MM-DD), por ejemplo 2026-07-20',
          ),
          navActions(),
        );

      case WhatsAppConversationState.BOOKING_TIME:
        return this.promptWorkers(tenantId, convoId, {
          serviceId: ctx.serviceId,
          date: ctx.date,
          services: ctx.services,
        });

      case WhatsAppConversationState.RESCHEDULE:
        if (ctx.date || ctx.slots?.length) {
          return this.setState(
            convoId,
            WhatsAppConversationState.RESCHEDULE,
            {
              appointmentId: ctx.appointmentId,
              serviceId: ctx.serviceId,
              workerId: ctx.workerId,
            },
            this.withNav('¿Qué día prefieres? (YYYY-MM-DD)'),
            navActions(),
          );
        }
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          this.welcome(business),
          menuActions(),
        );

      default:
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          this.welcome(business),
          menuActions(),
        );
    }
  }

  private async promptServices(tenantId: string, convoId: string) {
    const services = await this.prisma.service.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    if (!services.length) {
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        'No hay servicios disponibles por ahora.',
        menuActions(),
      );
    }
    const list = services
      .map(
        (s, i) =>
          `${i + 1}. ${s.name} — ${s.durationMinutes} min — $${Number(s.price).toLocaleString('es-CO')}`,
      )
      .join('\n');
    return this.setState(
      convoId,
      WhatsAppConversationState.BOOKING_SERVICE,
      { services: services.map((s) => s.id) },
      this.withNav(`¿Qué servicio deseas?\n\n${list}`),
      choiceActions(
        services.map((s) => ({
          title: s.name,
          description: `${s.durationMinutes} min · $${Number(s.price).toLocaleString('es-CO')}`,
        })),
      ),
    );
  }

  private async promptWorkers(tenantId: string, convoId: string, ctx: ConvoContext) {
    if (!ctx.serviceId || !ctx.date) {
      return this.promptServices(tenantId, convoId);
    }
    const workers = await this.prisma.worker.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        services: { some: { serviceId: ctx.serviceId } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    if (!workers.length) {
      return this.setState(
        convoId,
        WhatsAppConversationState.BOOKING_DATE,
        { serviceId: ctx.serviceId },
        this.withNav('No hay profesionales. Elige otra fecha (YYYY-MM-DD).'),
        navActions(),
      );
    }
    const list = [
      '0. Cualquiera (automático)',
      ...workers.map((w, i) => `${i + 1}. ${w.firstName} ${w.lastName}`),
    ].join('\n');
    const actions: BotAction[] = [
      {
        id: 'opt:0',
        title: '0. Cualquiera',
        description: 'Asignación automática',
      },
      ...choiceActions(
        workers.map((w) => `${w.firstName} ${w.lastName}`),
        { includeNav: false },
      ),
      ...navActions(),
    ];
    return this.setState(
      convoId,
      WhatsAppConversationState.BOOKING_WORKER,
      {
        serviceId: ctx.serviceId,
        date: ctx.date,
        workers: workers.map((w) => w.id),
        services: ctx.services,
      },
      this.withNav(`¿Qué trabajador prefieres?\n\n${list}`),
      actions,
    );
  }

  private welcome(business: string, custom?: string | null) {
    const menu = menuActions()
      .map((a) => `${a.id.split(':')[1]}. ${a.title}`)
      .join('\n');
    if (custom?.trim()) {
      const base = custom.trim();
      if (/^\s*\d+\.\s+/m.test(base)) return base;
      return `${base}\n\n${menu}\n\nResponde con el número de la opción.`;
    }
    return `Bienvenido a ${business}.\n¿Cómo podemos ayudarte?\n\n${menu}\n\nResponde con el número de la opción.`;
  }

  private async setState(
    id: string,
    state: WhatsAppConversationState,
    context: ConvoContext,
    reply: string,
    actions?: BotAction[],
  ): Promise<BotReply> {
    await this.prisma.whatsAppConversation.update({
      where: { id },
      data: { state, context: context as object },
    });
    return { reply, state, actions };
  }

  private async handleMenu(
    tenantId: string,
    convoId: string,
    clientId: string,
    business: string,
    text: string,
    ctx: ConvoContext,
  ) {
    switch (text.trim()) {
      case '1':
        return this.promptServices(tenantId, convoId);
      case '2':
        return this.handleConsult(tenantId, clientId, convoId);
      case '3': {
        const upcoming = await this.nextAppointments(tenantId, clientId);
        if (!upcoming.length) {
          return this.setState(
            convoId,
            WhatsAppConversationState.MENU,
            {},
            'No tienes citas próximas para cancelar.',
            menuActions(),
          );
        }
        const list = upcoming
          .map((a, i) => `${i + 1}. ${dayjs(a.startAt).format('DD/MM HH:mm')} — ${a.service.name} con ${a.worker.firstName}`)
          .join('\n');
        return this.setState(
          convoId,
          WhatsAppConversationState.CANCEL,
          { appointmentIds: upcoming.map((a) => a.id) },
          this.withNav(`¿Cuál cita deseas cancelar?\n\n${list}`),
          choiceActions(
            upcoming.map(
              (a) =>
                `${dayjs(a.startAt).format('DD/MM HH:mm')} · ${a.service.name}`,
            ),
          ),
        );
      }
      case '4': {
        const upcoming = await this.nextAppointments(tenantId, clientId);
        if (!upcoming.length) {
          return this.setState(
            convoId,
            WhatsAppConversationState.MENU,
            {},
            'No tienes citas para reprogramar.',
            menuActions(),
          );
        }
        const a = upcoming[0];
        return this.setState(
          convoId,
          WhatsAppConversationState.RESCHEDULE,
          { appointmentId: a.id, serviceId: a.serviceId, workerId: a.workerId },
          this.withNav(
            `Reprogramaremos: ${a.service.name} el ${dayjs(a.startAt).format('DD/MM HH:mm')}.\n¿Qué día prefieres? (YYYY-MM-DD)`,
          ),
          navActions(),
        );
      }
      case '5': {
        const promos = await this.prisma.promotion.findMany({
          where: { tenantId, isActive: true, startAt: { lte: new Date() }, endAt: { gte: new Date() } },
        });
        const body = promos.length
          ? promos.map((p: { name: string; description: string | null }) => `• ${p.name}${p.description ? `: ${p.description}` : ''}`).join('\n')
          : 'Por ahora no hay promociones activas.';
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          `${body}\n\nElige otra opción:`,
          menuActions(),
        );
      }
      case '6':
        return this.setState(
          convoId,
          WhatsAppConversationState.ADVISOR,
          {},
          `Un asesor de ${business} te atenderá pronto.`,
          navActions(),
        );
      case '7':
        return this.setState(
          convoId,
          WhatsAppConversationState.AI_CHAT,
          {},
          'Pregúntame sobre horarios, ubicación, servicios o precios.',
          navActions(),
        );
      default:
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          ctx,
          this.welcome(business),
          menuActions(),
        );
    }
  }

  /** Acepta "2", "2.", " 2 " etc. */
  private parseChoice(text: string) {
    const n = Number.parseInt(text.trim(), 10);
    return Number.isFinite(n) ? n : NaN;
  }

  private async handleBookingService(tenantId: string, convoId: string, text: string) {
    const convo = await this.prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convoId } });
    const stored = (convo.context ?? {}) as ConvoContext;
    const idx = this.parseChoice(text) - 1;
    const serviceId = stored.services?.[idx];
    if (!serviceId) {
      return this.promptServices(tenantId, convoId);
    }
    return this.setState(
      convoId,
      WhatsAppConversationState.BOOKING_DATE,
      { serviceId, services: stored.services },
      this.withNav(
        '¿Qué día? Escribe la fecha (YYYY-MM-DD), por ejemplo 2026-07-20',
      ),
      navActions(),
    );
  }

  private async handleBookingDate(tenantId: string, convoId: string, ctx: ConvoContext, text: string) {
    const date = dayjs(text.trim(), 'YYYY-MM-DD', true);
    if (!date.isValid()) {
      return this.setState(
        convoId,
        WhatsAppConversationState.BOOKING_DATE,
        ctx,
        this.withNav('Fecha inválida. Usa YYYY-MM-DD.'),
        navActions(),
      );
    }
    return this.promptWorkers(tenantId, convoId, {
      ...ctx,
      date: date.format('YYYY-MM-DD'),
    });
  }

  private async handleBookingWorker(tenantId: string, convoId: string, ctx: ConvoContext, text: string) {
    const convo = await this.prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convoId } });
    const stored = (convo.context ?? {}) as ConvoContext;
    const choice = this.parseChoice(text);
    let workerId = stored.workers?.[choice - 1];
    let autoWorker = false;
    if (choice === 0) {
      autoWorker = true;
      workerId = stored.workers?.[0];
    }
    if (!workerId) {
      return this.setState(
        convoId,
        WhatsAppConversationState.BOOKING_WORKER,
        stored,
        this.withNav('Opción inválida.'),
        stored.workers
          ? [
              { id: 'opt:0', title: '0. Cualquiera' },
              ...choiceActions(
                stored.workers.map((_, i) => `Profesional ${i + 1}`),
                { includeNav: false },
              ),
              ...navActions(),
            ]
          : navActions(),
      );
    }

    const nextCtx: ConvoContext = {
      ...ctx,
      ...stored,
      workerId,
      autoWorker,
      date: stored.date ?? ctx.date,
    };
    const slots = await this.collectSlots(tenantId, nextCtx);
    if (!slots.length) {
      const suggestion = await this.suggestNext(tenantId, nextCtx);
      return this.setState(
        convoId,
        WhatsAppConversationState.BOOKING_DATE,
        { serviceId: nextCtx.serviceId, services: nextCtx.services },
        this.withNav(
          suggestion
            ? `No hay disponibilidad ese día. Siguiente horario: ${dayjs(suggestion).format('DD/MM HH:mm')}.\nPrueba otra fecha (YYYY-MM-DD).`
            : 'Sin disponibilidad. Escribe otra fecha (YYYY-MM-DD) o usa Atrás.',
        ),
        navActions(),
      );
    }
    const slotIso = slots.slice(0, 12).map((s) => dayjs(s).toISOString());
    const list = slotIso.map((s, i) => `${i + 1}. ${dayjs(s).format('HH:mm')}`).join('\n');
    return this.setState(
      convoId,
      WhatsAppConversationState.BOOKING_TIME,
      { ...nextCtx, slots: slotIso },
      this.withNav(`¿Qué hora?\n\n${list}`),
      choiceActions(slotIso.map((s) => dayjs(s).format('HH:mm'))),
    );
  }

  private async handleBookingTime(
    tenantId: string,
    convoId: string,
    clientId: string,
    ctx: ConvoContext,
    text: string,
    tenant: { name: string; address: string | null; mapUrl: string | null; city: string | null },
  ) {
    const convo = await this.prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convoId } });
    const stored = (convo.context ?? {}) as ConvoContext;
    const idx = this.parseChoice(text) - 1;
    const startAt = stored.slots?.[idx];
    if (!startAt || !stored.serviceId || !stored.workerId) {
      return this.setState(
        convoId,
        WhatsAppConversationState.BOOKING_TIME,
        stored,
        this.withNav('Opción inválida.'),
        stored.slots
          ? choiceActions(stored.slots.map((s) => dayjs(s).format('HH:mm')))
          : navActions(),
      );
    }

    try {
      let workerId = stored.workerId;
      if (stored.autoWorker) {
        const workers = (stored as { workers?: string[] }).workers ?? [workerId];
        for (const w of workers) {
          const slots = await this.appointments.availability(tenantId, {
            serviceId: stored.serviceId,
            workerId: w,
            date: stored.date!,
          });
          if (slots.includes(startAt) || slots.some((s) => dayjs(s).isSame(startAt))) {
            workerId = w;
            break;
          }
        }
      }

      const appointment = await this.appointments.create(tenantId, {
        clientId,
        workerId,
        serviceId: stored.serviceId,
        startAt,
        source: 'whatsapp',
      });

      const full = await this.prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: { service: true, worker: true },
      });

      const address = [tenant.address, tenant.city].filter(Boolean).join(', ');
      const map = tenant.mapUrl ? `\nMapa: ${tenant.mapUrl}` : '';
      const cal = `${this.config.get('APP_URL')}/calendar?start=${encodeURIComponent(startAt)}`;

      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        `Tu cita quedó agendada ✅\n\nFecha: ${dayjs(full.startAt).format('DD/MM/YYYY')}\nHora: ${dayjs(full.startAt).format('HH:mm')}\nTrabajador: ${full.worker.firstName} ${full.worker.lastName}\nServicio: ${full.service.name}\nDirección: ${address || 'Consultar con el negocio'}${map}\nAgregar al calendario: ${cal}`,
        menuActions(),
      );
    } catch (e) {
      this.logger.warn(`WhatsApp booking failed: ${String(e)}`);
      const msg = e instanceof BadRequestException || e instanceof Error ? e.message : 'No se pudo agendar.';
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        msg,
        menuActions(),
      );
    }
  }

  private async handleConsult(tenantId: string, clientId: string, convoId: string) {
    const upcoming = await this.nextAppointments(tenantId, clientId);
    if (!upcoming.length) {
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        'No tienes citas próximas.',
        menuActions(),
      );
    }
    const list = upcoming
      .map(
        (a: {
          startAt: Date;
          status: string;
          service: { name: string };
          worker: { firstName: string };
        }) =>
          `• ${dayjs(a.startAt).format('DD/MM HH:mm')} — ${a.service.name} con ${a.worker.firstName} (${a.status})`,
      )
      .join('\n');
    return this.setState(
      convoId,
      WhatsAppConversationState.MENU,
      {},
      `Tus próximas citas:\n\n${list}`,
      menuActions(),
    );
  }

  private async handleCancel(tenantId: string, clientId: string, convoId: string, text: string) {
    const convo = await this.prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convoId } });
    const stored = (convo.context ?? {}) as ConvoContext;
    const id = stored.appointmentIds?.[this.parseChoice(text) - 1];
    if (!id) {
      return this.setState(
        convoId,
        WhatsAppConversationState.CANCEL,
        stored,
        this.withNav('Opción inválida.'),
        stored.appointmentIds
          ? choiceActions(stored.appointmentIds.map((_, i) => `Cita ${i + 1}`))
          : navActions(),
      );
    }
    const appt = await this.prisma.appointment.findFirst({ where: { id, tenantId, clientId } });
    if (!appt) throw new NotFoundException('Cita no encontrada.');
    await this.appointments.cancel(tenantId, id, { status: AppointmentStatus.CANCELLED, version: appt.version, reason: 'Cancelado por WhatsApp' });
    return this.setState(
      convoId,
      WhatsAppConversationState.MENU,
      {},
      'Cita cancelada. El horario quedó libre.',
      menuActions(),
    );
  }

  private async handleReschedule(
    tenantId: string,
    clientId: string,
    convoId: string,
    ctx: ConvoContext,
    text: string,
  ) {
    if (!ctx.appointmentId) {
      return this.setState(convoId, WhatsAppConversationState.MENU, {}, 'Sesión expirada. Escribe MENU.');
    }
    if (!ctx.date) {
      const date = dayjs(text, 'YYYY-MM-DD', true);
      if (!date.isValid()) {
        return this.setState(
          convoId,
          WhatsAppConversationState.RESCHEDULE,
          ctx,
          this.withNav('Fecha inválida. YYYY-MM-DD'),
          navActions(),
        );
      }
      const next = { ...ctx, date: date.format('YYYY-MM-DD') };
      const slots = await this.collectSlots(tenantId, next);
      if (!slots.length) {
        return this.setState(
          convoId,
          WhatsAppConversationState.RESCHEDULE,
          ctx,
          this.withNav('Sin horarios ese día. Prueba otra fecha.'),
          navActions(),
        );
      }
      const slotIso = slots.slice(0, 12).map((s) => dayjs(s).toISOString());
      const list = slotIso.map((s, i) => `${i + 1}. ${dayjs(s).format('HH:mm')}`).join('\n');
      return this.setState(
        convoId,
        WhatsAppConversationState.RESCHEDULE,
        { ...next, slots: slotIso },
        this.withNav(`Elige hora:\n${list}`),
        choiceActions(slotIso.map((s) => dayjs(s).format('HH:mm'))),
      );
    }

    const convo = await this.prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convoId } });
    const stored = (convo.context ?? {}) as ConvoContext;
    const startAt = stored.slots?.[this.parseChoice(text) - 1];
    if (!startAt) {
      return this.setState(
        convoId,
        WhatsAppConversationState.RESCHEDULE,
        stored,
        this.withNav('Opción inválida.'),
        stored.slots
          ? choiceActions(stored.slots.map((s) => dayjs(s).format('HH:mm')))
          : navActions(),
      );
    }
    const original = await this.prisma.appointment.findFirstOrThrow({
      where: { id: ctx.appointmentId, tenantId, clientId },
    });
    await this.appointments.reschedule(tenantId, original.id, {
      clientId,
      workerId: ctx.workerId!,
      serviceId: ctx.serviceId!,
      startAt,
      version: original.version,
      source: 'whatsapp',
    });
    return this.setState(
      convoId,
      WhatsAppConversationState.MENU,
      {},
      `Cita reprogramada a ${dayjs(startAt).format('DD/MM/YYYY HH:mm')}.`,
      menuActions(),
    );
  }

  private async resolveClient(tenantId: string, phoneKey: string) {
    const variants = phoneLookupVariants(phoneKey);
    const existing = await this.prisma.client.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ phone: { in: variants } }, { whatsapp: { in: variants } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      if (existing.phone !== phoneKey || existing.whatsapp !== phoneKey) {
        try {
          return await this.prisma.client.update({
            where: { id: existing.id },
            data: { phone: phoneKey, whatsapp: phoneKey },
          });
        } catch {
          return existing;
        }
      }
      return existing;
    }
    return this.prisma.client.create({
      data: {
        tenantId,
        phone: phoneKey,
        whatsapp: phoneKey,
        firstName: 'Cliente',
        lastName: phoneKey.slice(-4),
      },
    });
  }

  private async resolveConversation(
    tenantId: string,
    clientId: string,
    phoneKey: string,
  ) {
    const variants = phoneLookupVariants(phoneKey);
    const matches = await this.prisma.whatsAppConversation.findMany({
      where: {
        tenantId,
        OR: [{ phone: { in: variants } }, { clientId }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });
    if (matches.length) {
      // Preferir la conversación que espera confirmación de reserva
      const awaiting = matches.find((c) => {
        const cctx = (c.context ?? {}) as ConvoContext;
        return (
          c.state === WhatsAppConversationState.BOOKING_CONFIRM ||
          Boolean(cctx.awaitingConfirm) ||
          Boolean(cctx.appointmentId)
        );
      });
      return awaiting ?? matches[0];
    }
    return this.prisma.whatsAppConversation.create({
      data: {
        tenantId,
        clientId,
        phone: phoneKey,
        state: WhatsAppConversationState.IDLE,
        context: {},
      },
    });
  }

  private async clientIdsForPhone(tenantId: string, phoneKey: string) {
    const variants = phoneLookupVariants(phoneKey);
    const rows = await this.prisma.client.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [{ phone: { in: variants } }, { whatsapp: { in: variants } }],
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Cita pendiente de confirmar por WhatsApp (reserva web / recordatorio).
   * Busca por teléfono (todas las fichas del mismo número), no solo clientId.
   * En IDLE / MENU / BOOKING_CONFIRM prioriza confirmar antes que “1 = Reservar”.
   */
  private async resolveConfirmAppointmentId(
    tenantId: string,
    clientId: string,
    phoneKey: string,
    ctx: ConvoContext,
    state: WhatsAppConversationState,
  ): Promise<string | null> {
    const clientIds = await this.clientIdsForPhone(tenantId, phoneKey);
    if (!clientIds.includes(clientId)) clientIds.push(clientId);

    if (ctx.appointmentId) {
      const fromCtx = await this.prisma.appointment.findFirst({
        where: {
          id: ctx.appointmentId,
          tenantId,
          deletedAt: null,
          status: {
            in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
          },
        },
        select: { id: true },
      });
      if (fromCtx) return fromCtx.id;
    }

    const shouldScanPending =
      state === WhatsAppConversationState.IDLE ||
      state === WhatsAppConversationState.MENU ||
      state === WhatsAppConversationState.BOOKING_CONFIRM ||
      state === WhatsAppConversationState.BOOKING_SERVICE ||
      Boolean(ctx.awaitingConfirm);

    if (!shouldScanPending) return null;

    const recent = await this.prisma.appointment.findFirst({
      where: {
        tenantId,
        clientId: { in: clientIds },
        deletedAt: null,
        status: AppointmentStatus.PENDING,
        startAt: { gte: new Date() },
        createdAt: { gte: dayjs().subtract(48, 'hour').toDate() },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return recent?.id ?? null;
  }

  private async handleReminderReply(
    tenantId: string,
    convoId: string,
    _clientId: string,
    ctx: ConvoContext,
    text: string,
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: ctx.appointmentId, tenantId, deletedAt: null },
    });
    if (!appt) {
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        'No encontramos esa cita.',
        menuActions(),
      );
    }
    if (text === '1') {
      if (appt.status === AppointmentStatus.CONFIRMED) {
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          'Tu cita ya estaba confirmada ✅',
          menuActions(),
        );
      }
      if (appt.status !== AppointmentStatus.PENDING) {
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          `Esta cita ya no se puede confirmar (${appt.status}).`,
          menuActions(),
        );
      }
      try {
        await this.appointments.updateStatus(tenantId, appt.id, {
          status: AppointmentStatus.CONFIRMED,
          version: appt.version,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo confirmar.';
        return this.setState(
          convoId,
          WhatsAppConversationState.BOOKING_CONFIRM,
          { appointmentId: appt.id, awaitingConfirm: true },
          `${msg}\n\nResponde 1 para reintentar, o MENU.`,
        );
      }
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        'Cita confirmada ✅ ¡Te esperamos!',
        menuActions(),
      );
    }
    if (text === '3') {
      if (
        appt.status !== AppointmentStatus.PENDING &&
        appt.status !== AppointmentStatus.CONFIRMED
      ) {
        return this.setState(
          convoId,
          WhatsAppConversationState.MENU,
          {},
          'Esta cita ya no se puede cancelar.',
          menuActions(),
        );
      }
      await this.appointments.cancel(tenantId, appt.id, {
        status: AppointmentStatus.CANCELLED,
        version: appt.version,
        reason: 'Cancelado desde confirmación WhatsApp',
      });
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        'Cita cancelada. Horario liberado.',
        menuActions(),
      );
    }
    // 2 = reprogramar
    return this.setState(
      convoId,
      WhatsAppConversationState.RESCHEDULE,
      {
        appointmentId: appt.id,
        serviceId: appt.serviceId,
        workerId: appt.workerId,
      },
      this.withNav('¿Qué día prefieres? (YYYY-MM-DD)'),
      navActions(),
    );
  }

  private async handleReview(tenantId: string, clientId: string, convoId: string, ctx: ConvoContext, text: string) {
    const rating = Number(text.replace(/[^1-5]/g, '').slice(0, 1));
    if (!rating || !ctx.appointmentId) {
      return this.setState(
        convoId,
        WhatsAppConversationState.REVIEW,
        ctx,
        '¿Cuántas estrellas das al estilista? (1 a 5)',
        choiceActions(['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'], {
          includeNav: false,
        }),
      );
    }
    try {
      await this.reviews.createFromAppointment(
        tenantId,
        ctx.appointmentId,
        clientId,
        rating,
        text,
      );
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        '¡Gracias por tu reseña! ⭐',
        menuActions(),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar la reseña.';
      return this.setState(
        convoId,
        WhatsAppConversationState.MENU,
        {},
        msg,
        menuActions(),
      );
    }
  }

  private async handleAi(tenantId: string, convoId: string, text: string) {
    if (text.toUpperCase() === 'MENU') {
      return this.setState(convoId, WhatsAppConversationState.MENU, {}, 'Menú principal. Elige 1-7.');
    }
    try {
      const reply = await this.ai.answerFaq(tenantId, text);
      return { reply, state: WhatsAppConversationState.AI_CHAT };
    } catch {
      return {
        reply: 'Puedo ayudarte con horarios, servicios y precios. Escribe MENU para el menú.',
        state: WhatsAppConversationState.AI_CHAT,
      };
    }
  }

  private nextAppointments(tenantId: string, clientId: string) {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        clientId,
        deletedAt: null,
        startAt: { gte: new Date() },
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.ON_THE_WAY] },
      },
      include: { service: true, worker: true },
      orderBy: { startAt: 'asc' },
      take: 5,
    });
  }

  private async collectSlots(tenantId: string, ctx: ConvoContext) {
    if (!ctx.serviceId || !ctx.workerId || !ctx.date) return [];
    if (ctx.autoWorker) {
      const workers = await this.prisma.worker.findMany({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
          services: { some: { serviceId: ctx.serviceId } },
        },
      });
      const all = new Set<string>();
      for (const w of workers) {
        const slots = await this.appointments.availability(tenantId, {
          serviceId: ctx.serviceId,
          workerId: w.id,
          date: ctx.date,
        });
        slots.forEach((s) => all.add(s));
      }
      return [...all].sort();
    }
    return this.appointments.availability(tenantId, {
      serviceId: ctx.serviceId,
      workerId: ctx.workerId,
      date: ctx.date,
    });
  }

  private async suggestNext(tenantId: string, ctx: ConvoContext) {
    if (!ctx.serviceId || !ctx.workerId) return null;
    for (let i = 1; i <= 7; i++) {
      const date = dayjs(ctx.date).add(i, 'day').format('YYYY-MM-DD');
      const slots = await this.appointments.availability(tenantId, {
        serviceId: ctx.serviceId,
        workerId: ctx.workerId,
        date,
      });
      if (slots[0]) return slots[0];
    }
    return null;
  }

  /** Plantillas de mensajes programados (usadas por cron/BullMQ) */
  buildReminder24h(clientName: string, time: string) {
    return `Hola ${clientName}.\nTe recordamos tu cita mañana a las ${time}.\n\nResponder:\n1 Confirmar\n2 Reprogramar\n3 Cancelar`;
  }

  buildReminder2h(clientName: string) {
    return `Hola ${clientName}.\nTe esperamos en 2 horas. ¡Nos vemos pronto!`;
  }

  buildReviewRequest(clientName: string, workerName?: string) {
    const who = workerName ? ` a ${workerName}` : ' a tu estilista';
    return [
      `Gracias por visitarnos, ${clientName}.`,
      `¿Cómo calificarías${who}?`,
      '',
      'Responde con un número:',
      '1 ⭐',
      '2 ⭐⭐',
      '3 ⭐⭐⭐',
      '4 ⭐⭐⭐⭐',
      '5 ⭐⭐⭐⭐⭐',
    ].join('\n');
  }

  async getBotConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw new NotFoundException('Empresa no encontrada.');

    const config = await this.prisma.whatsAppBotConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: false,
        businessName: tenant.name,
      },
      update: {},
    });

    return {
      ...config,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      sessionKey: tenantId,
    };
  }

  async updateBotConfig(
    tenantId: string,
    dto: {
      enabled?: boolean;
      welcomeMsg?: string;
      businessName?: string;
      aiEnabled?: boolean;
    },
  ) {
    await this.getBotConfig(tenantId);
    return this.prisma.whatsAppBotConfig.update({
      where: { tenantId },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.welcomeMsg !== undefined ? { welcomeMsg: dto.welcomeMsg } : {}),
        ...(dto.businessName !== undefined
          ? { businessName: dto.businessName || null }
          : {}),
        ...(dto.aiEnabled !== undefined ? { aiEnabled: dto.aiEnabled } : {}),
      },
    });
  }
}
