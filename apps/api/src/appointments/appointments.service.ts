import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClientsService } from '../clients/clients.service';
import {
  blockCoversRange,
  dayEnumFromIndex,
  intersectBlocks,
  type TimeBlock,
} from '../common/schedule.util';
import {
  AvailabilityDto,
  CreateAppointmentDto,
  RescheduleDto,
  StatusDto,
} from './dto/appointments.dto';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

const ACTIVE: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ON_THE_WAY,
];

/** Intervalo entre inicios = duración del servicio (mín. 5 min). */
function slotStepMinutes(durationMinutes: number) {
  return Math.max(5, Number(durationMinutes) || 15);
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
    private readonly clients: ClientsService,
  ) {}

  private range(
    start: string,
    service: {
      durationMinutes: number;
      prepMinutes: number;
      cleanMinutes: number;
      travelMinutes: number;
    },
  ) {
    const begin = dayjs(start);
    if (!begin.isValid()) {
      throw new ConflictException('La fecha de la cita no es válida.');
    }
    const startAt = begin.toDate();
    const endAt = begin.add(service.durationMinutes, 'minute').toDate();
    return {
      startAt,
      endAt,
      bufferStartAt: begin.subtract(service.prepMinutes, 'minute').toDate(),
      bufferEndAt: begin
        .add(
          service.durationMinutes + service.cleanMinutes + service.travelMinutes,
          'minute',
        )
        .toDate(),
    };
  }

  private async resolveBranchId(
    tenantId: string,
    preferredId?: string | null,
  ): Promise<string | null> {
    if (preferredId) {
      const found = await this.prisma.branch.findFirst({
        where: { id: preferredId, tenantId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      if (found) return found.id;
    }
    const main = await this.prisma.branch.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return main?.id ?? null;
  }

  /**
   * Horario efectivo del día = negocio ∩ trabajador.
   * Si el trabajador no tiene schedule ese día, hereda el del negocio.
   */
  private async effectiveBlocks(
    _tenantId: string,
    workerId: string,
    branchId: string | null,
    date: Date,
    tz: string,
  ): Promise<TimeBlock[]> {
    const local = dayjs(date).tz(tz);
    const day = dayEnumFromIndex(local.day());
    const dateStr = local.format('YYYY-MM-DD');

    let businessBlocks: TimeBlock[] | null = null;

    if (branchId) {
      const holiday = await this.prisma.branchHoliday.findFirst({
        where: {
          branchId,
          date: new Date(`${dateStr}T00:00:00.000Z`),
        },
      });
      if (holiday) return [];

      const branchSchedule = await this.prisma.branchSchedule.findFirst({
        where: { branchId, dayOfWeek: day },
        include: { blocks: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!branchSchedule || branchSchedule.isClosed) return [];
      businessBlocks = branchSchedule.blocks.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    }

    const workerSchedule = await this.prisma.workerSchedule.findFirst({
      where: { workerId, dayOfWeek: day },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });

    if (workerSchedule?.isOff) return [];

    const workerBlocks =
      workerSchedule && !workerSchedule.isOff
        ? workerSchedule.blocks.map((b) => ({
            startTime: b.startTime,
            endTime: b.endTime,
          }))
        : null;

    // Sin horario de negocio: solo trabajador (compat)
    if (!businessBlocks) {
      return workerBlocks ?? [];
    }
    // Sin horario de trabajador: hereda negocio
    if (!workerBlocks) {
      return businessBlocks;
    }
    return intersectBlocks(businessBlocks, workerBlocks);
  }

  private async assertAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateAppointmentDto,
    range: {
      startAt: Date;
      endAt: Date;
      bufferStartAt: Date;
      bufferEndAt: Date;
    },
  ) {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { timezone: true },
    });
    const tz = tenant?.timezone || 'America/Bogota';

    const [worker, client, service] = await Promise.all([
      tx.worker.findFirst({
        where: { id: dto.workerId, tenantId, deletedAt: null, isActive: true },
        include: {
          timeOffs: {
            where: {
              startAt: { lt: range.bufferEndAt },
              endAt: { gt: range.bufferStartAt },
            },
          },
        },
      }),
      tx.client.findFirst({
        where: { id: dto.clientId, tenantId, deletedAt: null },
      }),
      tx.service.findFirst({
        where: {
          id: dto.serviceId,
          tenantId,
          deletedAt: null,
          isActive: true,
        },
      }),
    ]);

    if (!worker) throw new NotFoundException('Profesional no encontrado.');
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    if (!service) throw new NotFoundException('Servicio no encontrado.');

    if (worker.timeOffs.length) {
      throw new ConflictException(
        'El profesional no está disponible por una ausencia o bloqueo.',
      );
    }

    const branchId =
      dto.branchId ||
      worker.branchId ||
      (
        await tx.branch.findFirst({
          where: { tenantId, deletedAt: null, isActive: true },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          select: { id: true },
        })
      )?.id ||
      null;

    const blocks = await this.effectiveBlocksForTx(
      tx,
      worker.id,
      branchId,
      range.startAt,
      tz,
    );
    const startHm = dayjs(range.startAt).tz(tz).format('HH:mm');
    const endHm = dayjs(range.endAt).tz(tz).format('HH:mm');
    if (!blockCoversRange(blocks, startHm, endHm)) {
      throw new ConflictException(
        'El horario no está disponible (negocio o profesional).',
      );
    }

    // El profesional no puede ofrecer un servicio si tiene asignaciones y no incluye este
    const serviceLinks = await tx.workerService.count({
      where: { workerId: dto.workerId },
    });
    if (serviceLinks > 0) {
      const canDo = await tx.workerService.findFirst({
        where: { workerId: dto.workerId, serviceId: dto.serviceId },
      });
      if (!canDo) {
        throw new ConflictException(
          'Este profesional no ofrece ese servicio.',
        );
      }
    }

    const conflict = await tx.appointment.findFirst({
      where: {
        tenantId,
        workerId: dto.workerId,
        deletedAt: null,
        status: { in: ACTIVE },
        OR: [
          {
            startAt: { lt: range.endAt },
            endAt: { gt: range.startAt },
          },
          {
            bufferStartAt: { lt: range.bufferEndAt },
            bufferEndAt: { gt: range.bufferStartAt },
          },
        ],
      },
      include: { service: { select: { name: true } } },
    });
    if (conflict) {
      throw new ConflictException(
        `El profesional ya tiene una reserva (${conflict.service.name}) en ese momento.`,
      );
    }

    return { worker, client, service, branchId };
  }

  private async effectiveBlocksForTx(
    tx: Prisma.TransactionClient,
    workerId: string,
    branchId: string | null,
    date: Date,
    tz: string,
  ): Promise<TimeBlock[]> {
    const local = dayjs(date).tz(tz);
    const day = dayEnumFromIndex(local.day());
    const dateStr = local.format('YYYY-MM-DD');

    let businessBlocks: TimeBlock[] | null = null;
    if (branchId) {
      const holiday = await tx.branchHoliday.findFirst({
        where: {
          branchId,
          date: new Date(`${dateStr}T00:00:00.000Z`),
        },
      });
      if (holiday) return [];

      const branchSchedule = await tx.branchSchedule.findFirst({
        where: { branchId, dayOfWeek: day },
        include: { blocks: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!branchSchedule || branchSchedule.isClosed) return [];
      businessBlocks = branchSchedule.blocks.map((b) => ({
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    }

    const workerSchedule = await tx.workerSchedule.findFirst({
      where: { workerId, dayOfWeek: day },
      include: { blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (workerSchedule?.isOff) return [];

    const workerBlocks =
      workerSchedule && !workerSchedule.isOff
        ? workerSchedule.blocks.map((b) => ({
            startTime: b.startTime,
            endTime: b.endTime,
          }))
        : null;

    if (!businessBlocks) return workerBlocks ?? [];
    if (!workerBlocks) return businessBlocks;
    return intersectBlocks(businessBlocks, workerBlocks);
  }

  async create(tenantId: string, dto: CreateAppointmentDto) {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    const range = this.range(dto.startAt, service);
    const source = dto.source ?? 'web';
    // Citas del bot WhatsApp: auto-confirmadas. Web/admin: PENDING (+ WA de confirmación).
    const autoConfirm = source === 'whatsapp';

    const appointment = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.workerId}))`;
        const ctx = await this.assertAvailable(tx, tenantId, dto, range);
        return tx.appointment.create({
          data: {
            tenantId,
            clientId: dto.clientId,
            workerId: dto.workerId,
            serviceId: dto.serviceId,
            branchId: dto.branchId ?? ctx.branchId ?? undefined,
            startAt: range.startAt,
            endAt: range.endAt,
            bufferStartAt: range.bufferStartAt,
            bufferEndAt: range.bufferEndAt,
            price: ctx.service.price,
            notes: dto.notes,
            source,
            status: autoConfirm
              ? AppointmentStatus.CONFIRMED
              : AppointmentStatus.PENDING,
            confirmedAt: autoConfirm ? new Date() : undefined,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Portal / admin: enviar confirmación por WhatsApp (en el bot ya se responde en el chat).
    if (source !== 'whatsapp') {
      void this.notifications
        .sendBookingConfirmation(tenantId, appointment.id)
        .catch((e) =>
          this.logger.warn(
            `No se pudo enviar confirmación: ${e instanceof Error ? e.message : e}`,
          ),
        );
    }

    return appointment;
  }

  list(tenantId: string) {
    return this.prisma.appointment.findMany({
      where: { tenantId, deletedAt: null },
      include: { client: true, worker: true, service: true, branch: true },
      orderBy: { startAt: 'asc' },
    });
  }

  async updateStatus(tenantId: string, id: string, dto: StatusDto) {
    const current = await this.prisma.appointment.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { clientId: true, status: true, version: true },
    });
    if (!current) {
      throw new ConflictException(
        'La cita cambió o ya no existe. Actualice la información.',
      );
    }

    const updated = await this.prisma.appointment.updateMany({
      where: { id, tenantId, version: dto.version, deletedAt: null },
      data: {
        status: dto.status,
        version: { increment: 1 },
        cancelledAt:
          dto.status === AppointmentStatus.CANCELLED ? new Date() : undefined,
        cancelReason: dto.reason,
        confirmedAt:
          dto.status === AppointmentStatus.CONFIRMED ? new Date() : undefined,
        completedAt:
          dto.status === AppointmentStatus.COMPLETED ? new Date() : undefined,
        noShowAt:
          dto.status === AppointmentStatus.NO_SHOW ? new Date() : undefined,
      },
    });
    if (!updated.count) {
      throw new ConflictException(
        'La cita cambió o ya no existe. Actualice la información.',
      );
    }

    if (
      current.status === AppointmentStatus.COMPLETED ||
      dto.status === AppointmentStatus.COMPLETED
    ) {
      await this.clients.refreshStats(tenantId, current.clientId).catch((e) =>
        this.logger.warn(
          `No se pudo actualizar gasto del cliente: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }

    const becameCompleted =
      current.status !== AppointmentStatus.COMPLETED &&
      dto.status === AppointmentStatus.COMPLETED;

    if (becameCompleted) {
      void this.notifications
        .sendReviewRequest(tenantId, id)
        .catch((e) =>
          this.logger.warn(
            `No se pudo enviar solicitud de reseña: ${e instanceof Error ? e.message : e}`,
          ),
        );
    }

    const becameCancelled =
      current.status !== AppointmentStatus.CANCELLED &&
      dto.status === AppointmentStatus.CANCELLED;
    const clientCancelledViaWhatsapp = /whatsapp/i.test(dto.reason || '');

    if (becameCancelled && !clientCancelledViaWhatsapp) {
      void this.notifications
        .sendCancellationNotice(tenantId, id, dto.reason)
        .catch((e) =>
          this.logger.warn(
            `No se pudo notificar cancelación: ${e instanceof Error ? e.message : e}`,
          ),
        );
    }

    return this.prisma.appointment.findUnique({ where: { id } });
  }

  async reschedule(tenantId: string, id: string, dto: RescheduleDto) {
    const original = await this.prisma.appointment.findFirst({
      where: { id, tenantId, version: dto.version, deletedAt: null },
    });
    if (!original) {
      throw new ConflictException('La cita cambió o ya no existe.');
    }
    const next = await this.create(tenantId, dto);
    await this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.RESCHEDULED,
        rescheduledFrom: next.id,
        version: { increment: 1 },
      },
    });
    return next;
  }

  cancel(tenantId: string, id: string, dto: StatusDto) {
    return this.updateStatus(tenantId, id, {
      ...dto,
      status: AppointmentStatus.CANCELLED,
    });
  }

  async availability(tenantId: string, dto: AvailabilityDto) {
    const [service, tenant] = await Promise.all([
      this.prisma.service.findFirst({
        where: { id: dto.serviceId, tenantId, deletedAt: null },
      }),
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        include: { settings: true },
      }),
    ]);
    if (!service) throw new NotFoundException('Servicio no encontrado.');
    if (!tenant) throw new NotFoundException('Negocio no encontrado.');

    const tz = tenant.timezone || 'America/Bogota';
    const settings = tenant.settings;
    const noticeMin = settings?.minBookingNoticeMinutes ?? 60;
    const maxDays = settings?.maxBookingDaysAhead ?? 60;

    const localDate = dayjs.tz(dto.date, tz).startOf('day');
    if (!localDate.isValid()) return [];

    const now = dayjs().tz(tz);
    const maxDate = now.add(maxDays, 'day').endOf('day');
    if (localDate.isAfter(maxDate)) return [];

    const worker = await this.prisma.worker.findFirst({
      where: { id: dto.workerId, tenantId, deletedAt: null, isActive: true },
      include: {
        timeOffs: {
          where: {
            startAt: { lt: localDate.add(1, 'day').toDate() },
            endAt: { gt: localDate.toDate() },
          },
        },
      },
    });
    if (!worker || worker.timeOffs.length) return [];

    const branchId = await this.resolveBranchId(
      tenantId,
      dto.branchId || worker.branchId,
    );

    const blocks = await this.effectiveBlocks(
      tenantId,
      worker.id,
      branchId,
      localDate.toDate(),
      tz,
    );
    if (!blocks.length) return [];

    const dayStart = localDate.toDate();
    const dayEnd = localDate.add(1, 'day').toDate();
    const apps = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        workerId: dto.workerId,
        deletedAt: null,
        status: { in: ACTIVE },
        OR: [
          {
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
          {
            bufferStartAt: { lt: dayEnd },
            bufferEndAt: { gt: dayStart },
          },
        ],
      },
      select: {
        startAt: true,
        endAt: true,
        bufferStartAt: true,
        bufferEndAt: true,
      },
    });

    const occupy =
      service.durationMinutes + service.cleanMinutes + service.travelMinutes;
    const step = slotStepMinutes(service.durationMinutes);
    const earliest = now.add(noticeMin, 'minute');
    const slots: string[] = [];

    for (const block of blocks) {
      let cursor = dayjs.tz(
        `${localDate.format('YYYY-MM-DD')} ${block.startTime}`,
        'YYYY-MM-DD HH:mm',
        tz,
      );
      const finish = dayjs.tz(
        `${localDate.format('YYYY-MM-DD')} ${block.endTime}`,
        'YYYY-MM-DD HH:mm',
        tz,
      );

      while (!cursor.add(occupy, 'minute').isAfter(finish)) {
        if (!cursor.isBefore(earliest)) {
          const range = this.range(cursor.toISOString(), service);
          const busy = apps.some(
            (a) =>
              (a.startAt < range.endAt && a.endAt > range.startAt) ||
              (a.bufferStartAt < range.bufferEndAt &&
                a.bufferEndAt > range.bufferStartAt),
          );
          if (!busy) slots.push(cursor.toISOString());
        }
        cursor = cursor.add(step, 'minute');
      }
    }

    return slots;
  }
}
