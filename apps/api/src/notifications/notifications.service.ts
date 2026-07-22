import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AppointmentStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsappBaileysService } from '../whatsapp/whatsapp-baileys.service';
import { normalizePhone, phoneLookupVariants } from '../common/phone.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Evita doble aviso de cancelación (doble click / 2 instancias / race con flush). */
  private readonly cancelLocks = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsapp: WhatsappService,
    @Inject(forwardRef(() => WhatsappBaileysService))
    private readonly baileys: WhatsappBaileysService,
  ) {}

  async send(
    tenantId: string,
    channel: NotificationChannel,
    to: string,
    body: string,
    subject?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    const row = await this.prisma.notification.create({
      data: {
        tenantId,
        channel,
        to,
        body,
        subject,
        metadata: metadata ?? undefined,
        status: NotificationStatus.PENDING,
      },
    });

    if (channel === NotificationChannel.WHATSAPP) {
      try {
        await this.baileys.sendText(tenantId, to, body);
        return this.prisma.notification.update({
          where: { id: row.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date() },
        });
      } catch (e) {
        this.logger.warn(
          `WhatsApp no enviado a ${to}: ${e instanceof Error ? e.message : e}`,
        );
        const failedMeta = {
          ...((metadata as Record<string, unknown> | undefined) || {}),
          error: e instanceof Error ? e.message : String(e),
        } as Prisma.InputJsonValue;
        return this.prisma.notification.update({
          where: { id: row.id },
          data: {
            status: NotificationStatus.FAILED,
            metadata: failedMeta,
          },
        });
      }
    }

    return row;
  }

  /** Confirmación inmediata al crear una reserva (portal / admin). */
  async sendBookingConfirmation(tenantId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, deletedAt: null },
      include: {
        client: true,
        worker: true,
        service: true,
        tenant: true,
      },
    });
    if (!appointment) return null;

    const rawPhone =
      appointment.client.whatsapp || appointment.client.phone || null;
    if (!rawPhone) {
      this.logger.warn(
        `Sin teléfono para pedir confirmación de cita ${appointmentId}`,
      );
      return null;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      this.logger.warn(
        `Teléfono inválido para pedir confirmación de cita ${appointmentId}`,
      );
      return null;
    }

    // Alinear cliente + conversación al formato canónico (evita que el "1" no confirme)
    try {
      await this.prisma.client.update({
        where: { id: appointment.clientId },
        data: { phone, whatsapp: phone },
      });
    } catch {
      /* unique conflict: ya existe la variante canónica */
    }

    const address = [appointment.tenant.address, appointment.tenant.city]
      .filter(Boolean)
      .join(', ');
    const body = [
      `Hola ${appointment.client.firstName}, recibimos tu reserva 🗓️`,
      '',
      `Servicio: ${appointment.service.name}`,
      `Profesional: ${appointment.worker.firstName} ${appointment.worker.lastName}`,
      `Fecha: ${dayjs(appointment.startAt).format('DD/MM/YYYY')}`,
      `Hora: ${dayjs(appointment.startAt).format('HH:mm')}`,
      address ? `Dirección: ${address}` : null,
      appointment.tenant.mapUrl
        ? `Mapa: ${appointment.tenant.mapUrl}`
        : null,
      '',
      'Por favor confirma tu cita respondiendo:',
      '1 Confirmar',
      '2 Reprogramar',
      '3 Cancelar',
    ]
      .filter(Boolean)
      .join('\n');

    const variants = phoneLookupVariants(phone);
    const existingConvo = await this.prisma.whatsAppConversation.findFirst({
      where: {
        tenantId,
        OR: [
          { phone: { in: variants } },
          { clientId: appointment.clientId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const confirmContext = {
      appointmentId: appointment.id,
      awaitingConfirm: true,
    };

    if (existingConvo) {
      await this.prisma.whatsAppConversation.update({
        where: { id: existingConvo.id },
        data: {
          phone,
          clientId: appointment.clientId,
          state: 'BOOKING_CONFIRM',
          context: confirmContext,
        },
      });
    } else {
      await this.prisma.whatsAppConversation.create({
        data: {
          tenantId,
          clientId: appointment.clientId,
          phone,
          state: 'BOOKING_CONFIRM',
          context: confirmContext,
        },
      });
    }

    return this.send(
      tenantId,
      NotificationChannel.WHATSAPP,
      phone,
      body,
      'Confirmar cita',
    );
  }

  /** Avisa al cliente que su cita fue cancelada (incluye motivo). */
  async sendCancellationNotice(
    tenantId: string,
    appointmentId: string,
    reason?: string | null,
  ) {
    const lockKey = `${tenantId}:${appointmentId}`;
    if (this.cancelLocks.has(lockKey)) {
      this.logger.debug(`Cancelación en curso, se omite duplicado: ${appointmentId}`);
      return null;
    }
    this.cancelLocks.add(lockKey);

    try {
      const already = await this.prisma.notification.findFirst({
        where: {
          tenantId,
          channel: NotificationChannel.WHATSAPP,
          subject: 'Cita cancelada',
          createdAt: { gte: dayjs().subtract(30, 'minute').toDate() },
          metadata: {
            path: ['appointmentId'],
            equals: appointmentId,
          },
        },
      });
      if (already) {
        this.logger.debug(
          `Cancelación ya notificada (${already.id}) para ${appointmentId}`,
        );
        return already;
      }

      const appointment = await this.prisma.appointment.findFirst({
        where: { id: appointmentId, tenantId },
        include: {
          client: true,
          worker: true,
          service: true,
          tenant: true,
        },
      });
      if (!appointment) return null;

      const rawPhone =
        appointment.client.whatsapp || appointment.client.phone || null;
      if (!rawPhone) {
        this.logger.warn(
          `Sin teléfono para avisar cancelación de cita ${appointmentId}`,
        );
        return null;
      }
      const phone = normalizePhone(rawPhone);
      if (!phone) return null;

      const motive =
        (reason || appointment.cancelReason || '').trim() ||
        'No especificado';

      const body = [
        `Hola ${appointment.client.firstName}, tu cita fue cancelada.`,
        '',
        `Servicio: ${appointment.service.name}`,
        `Profesional: ${appointment.worker.firstName} ${appointment.worker.lastName}`,
        `Fecha: ${dayjs(appointment.startAt).format('DD/MM/YYYY')}`,
        `Hora: ${dayjs(appointment.startAt).format('HH:mm')}`,
        '',
        `Motivo: ${motive}`,
        '',
        'Si deseas agendar de nuevo, responde HOLA o MENU.',
      ].join('\n');

      return this.send(
        tenantId,
        NotificationChannel.WHATSAPP,
        phone,
        body,
        'Cita cancelada',
        { appointmentId, kind: 'cancellation' },
      );
    } finally {
      setTimeout(() => this.cancelLocks.delete(lockKey), 8_000);
    }
  }

  /** Pide reseña 1–5 por WhatsApp y deja la conversación en estado REVIEW. */
  async sendReviewRequest(tenantId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, deletedAt: null },
      include: {
        client: true,
        worker: true,
        service: true,
        review: true,
        tenant: { include: { settings: true } },
      },
    });
    if (!appointment) return null;
    if (appointment.review) return null;
    if (appointment.tenant.settings?.reviewRequestEnabled === false) {
      return null;
    }

    const rawPhone =
      appointment.client.whatsapp || appointment.client.phone || null;
    if (!rawPhone) {
      this.logger.warn(
        `Sin teléfono para pedir reseña de cita ${appointmentId}`,
      );
      return null;
    }
    const phone = normalizePhone(rawPhone);
    if (!phone) return null;

    const workerName =
      `${appointment.worker.firstName} ${appointment.worker.lastName}`.trim();
    const body = this.whatsapp.buildReviewRequest(
      appointment.client.firstName,
      workerName,
    );

    const variants = phoneLookupVariants(phone);
    const existingConvo = await this.prisma.whatsAppConversation.findFirst({
      where: {
        tenantId,
        OR: [
          { phone: { in: variants } },
          { clientId: appointment.clientId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingConvo) {
      await this.prisma.whatsAppConversation.update({
        where: { id: existingConvo.id },
        data: {
          phone,
          clientId: appointment.clientId,
          state: 'REVIEW',
          context: { appointmentId: appointment.id },
        },
      });
    } else {
      await this.prisma.whatsAppConversation.create({
        data: {
          tenantId,
          clientId: appointment.clientId,
          phone,
          state: 'REVIEW',
          context: { appointmentId: appointment.id },
        },
      });
    }

    return this.send(
      tenantId,
      NotificationChannel.WHATSAPP,
      phone,
      body,
      'Solicitud de reseña',
    );
  }

  /** Reintenta notificaciones WhatsApp pendientes (sesión reconectada, etc.) */
  @Cron(CronExpression.EVERY_MINUTE)
  async flushPendingWhatsapp() {
    // No tocar avisos recién creados: el envío original aún puede estar en cola/typing.
    const olderThan = dayjs().subtract(90, 'second').toDate();
    const pending = await this.prisma.notification.findMany({
      where: {
        channel: NotificationChannel.WHATSAPP,
        status: NotificationStatus.PENDING,
        createdAt: { lte: olderThan },
      },
      take: 30,
      orderBy: { createdAt: 'asc' },
    });
    for (const row of pending) {
      try {
        await this.baileys.sendText(row.tenantId, row.to, row.body);
        await this.prisma.notification.update({
          where: { id: row.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date() },
        });
      } catch {
        /* se reintenta en el próximo ciclo si la sesión no está lista */
      }
    }
  }

  /** Recordatorio 24h antes */
  @Cron(CronExpression.EVERY_HOUR)
  async remind24h() {
    const from = dayjs().add(23, 'hour').toDate();
    const to = dayjs().add(25, 'hour').toDate();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        startAt: { gte: from, lte: to },
      },
      include: {
        client: true,
        tenant: { include: { settings: true } },
      },
    });

    for (const a of appointments) {
      if (!a.tenant.settings?.reminderHoursBefore) continue;
      const phoneRaw = a.client.whatsapp || a.client.phone;
      if (!phoneRaw) continue;
      const phone = normalizePhone(phoneRaw);
      if (!phone) continue;
      const body = this.whatsapp.buildReminder24h(
        a.client.firstName,
        dayjs(a.startAt).format('h:mm A'),
      );
      await this.send(
        a.tenantId,
        NotificationChannel.WHATSAPP,
        phone,
        body,
        'Recordatorio 24h',
      );
      await this.prisma.whatsAppConversation.upsert({
        where: { tenantId_phone: { tenantId: a.tenantId, phone } },
        create: {
          tenantId: a.tenantId,
          clientId: a.clientId,
          phone,
          state: 'BOOKING_CONFIRM',
          context: { appointmentId: a.id, awaitingConfirm: true },
        },
        update: {
          state: 'BOOKING_CONFIRM',
          context: { appointmentId: a.id, awaitingConfirm: true },
        },
      });
    }
    if (appointments.length) {
      this.logger.log(`Recordatorios 24h encolados: ${appointments.length}`);
    }
  }

  /** Recordatorio 2h antes */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async remind2h() {
    const from = dayjs().add(110, 'minute').toDate();
    const to = dayjs().add(130, 'minute').toDate();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        startAt: { gte: from, lte: to },
      },
      include: { client: true, tenant: { include: { settings: true } } },
    });

    for (const a of appointments) {
      if (!a.tenant.settings?.reminder2HoursBefore) continue;
      const phone = a.client.whatsapp || a.client.phone;
      if (!phone) continue;
      const body = this.whatsapp.buildReminder2h(a.client.firstName);
      await this.send(
        a.tenantId,
        NotificationChannel.WHATSAPP,
        phone,
        body,
        'Recordatorio 2h',
      );
    }
  }

  /** Solicitud de reseña post-cita */
  @Cron(CronExpression.EVERY_HOUR)
  async requestReviews() {
    const from = dayjs().subtract(3, 'hour').toDate();
    const to = dayjs().subtract(1, 'hour').toDate();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        deletedAt: null,
        status: AppointmentStatus.COMPLETED,
        completedAt: { gte: from, lte: to },
        review: null,
      },
      include: {
        client: true,
        worker: true,
        tenant: { include: { settings: true } },
      },
    });

    for (const a of appointments) {
      if (!a.tenant.settings?.reviewRequestEnabled) continue;
      const phone = a.client.whatsapp || a.client.phone;
      if (!phone) continue;
      const workerName =
        `${a.worker.firstName} ${a.worker.lastName}`.trim() || undefined;
      const body = this.whatsapp.buildReviewRequest(
        a.client.firstName,
        workerName,
      );
      await this.send(
        a.tenantId,
        NotificationChannel.WHATSAPP,
        phone,
        body,
        'Reseña',
      );
      await this.prisma.whatsAppConversation.upsert({
        where: { tenantId_phone: { tenantId: a.tenantId, phone } },
        create: {
          tenantId: a.tenantId,
          clientId: a.clientId,
          phone,
          state: 'REVIEW',
          context: { appointmentId: a.id },
        },
        update: { state: 'REVIEW', context: { appointmentId: a.id } },
      });
    }
  }
}
