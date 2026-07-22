import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createFromAppointment(
    tenantId: string,
    appointmentId: string,
    clientId: string,
    rating: number,
    comment?: string | null,
  ) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('La calificación debe ser entre 1 y 5.');
    }

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        tenantId,
        clientId,
        deletedAt: null,
      },
      include: { review: true },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada.');
    if (appointment.review) {
      throw new ConflictException('Esta cita ya tiene una reseña.');
    }

    const review = await this.prisma.review.create({
      data: {
        tenantId,
        workerId: appointment.workerId,
        appointmentId,
        clientId,
        rating,
        comment: comment?.trim() || null,
      },
    });

    await this.recalculateWorkerRating(appointment.workerId);
    return review;
  }

  async recalculateWorkerRating(workerId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { workerId },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    const avg = count ? Number(agg._avg.rating ?? 0) : 0;
    await this.prisma.worker.update({
      where: { id: workerId },
      data: {
        ratingCount: count,
        ratingAvg: Math.round(avg * 10) / 10,
      },
    });
  }

  /** Promedio del local = media de ratingAvg de estilistas con al menos 1 reseña. */
  async getTenantRating(tenantId: string) {
    const workers = await this.prisma.worker.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        ratingCount: { gt: 0 },
      },
      select: { ratingAvg: true, ratingCount: true },
    });
    if (!workers.length) {
      return { avg: 0, count: 0, stylistCount: 0 };
    }
    const avg =
      workers.reduce((sum, w) => sum + w.ratingAvg, 0) / workers.length;
    const count = workers.reduce((sum, w) => sum + w.ratingCount, 0);
    return {
      avg: Math.round(avg * 10) / 10,
      count,
      stylistCount: workers.length,
    };
  }

  /** Backfill tenantId/workerId y caches (reviews antiguas). */
  async backfill() {
    const orphan = await this.prisma.review.findMany({
      where: { OR: [{ tenantId: '' }, { workerId: '' }] },
      include: { appointment: { select: { tenantId: true, workerId: true } } },
    });
    // Reviews sin relación válida: las que fallen el migrate se rellenan por SQL.
    // Aquí recalculamos todos los workers con reviews.
    const workerIds = await this.prisma.review.findMany({
      select: { workerId: true },
      distinct: ['workerId'],
    });
    for (const { workerId } of workerIds) {
      await this.recalculateWorkerRating(workerId);
    }
    return { workersUpdated: workerIds.length, orphansChecked: orphan.length };
  }
}
