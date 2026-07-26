import { Injectable } from '@nestjs/common';
import { AppointmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  revenue(tenantId: string, from: Date, to: Date) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'PAID',
        paidAt: { gte: from, lte: to },
      },
      include: {
        appointment: {
          include: {
            worker: { select: { id: true, firstName: true, lastName: true, commissionPct: true } },
            service: { select: { id: true, name: true } },
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { paidAt: 'asc' },
    });
  }

  async csv(tenantId: string, from: Date, to: Date) {
    const rows = await this.revenue(tenantId, from, to);
    const lines = [
      'fecha,monto,metodo,cita,servicio,estilista',
      ...rows.map((x) => {
        const svc = x.appointment?.service?.name ?? '';
        const w = x.appointment?.worker
          ? `${x.appointment.worker.firstName} ${x.appointment.worker.lastName}`
          : '';
        return `${x.paidAt?.toISOString() ?? ''},${x.amount},${x.method},${x.appointmentId ?? ''},${svc},${w}`;
      }),
    ];
    return lines.join('\n');
  }

  async overview(tenantId: string, from: Date, to: Date) {
    const [payments, appointments, noShows, cancelled, completed] =
      await Promise.all([
        this.prisma.payment.findMany({
          where: {
            tenantId,
            status: 'PAID',
            paidAt: { gte: from, lte: to },
          },
          include: {
            appointment: {
              include: {
                worker: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    commissionPct: true,
                  },
                },
                service: { select: { id: true, name: true } },
              },
            },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            startAt: { gte: from, lte: to },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.NO_SHOW,
            startAt: { gte: from, lte: to },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.CANCELLED,
            startAt: { gte: from, lte: to },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.COMPLETED,
            startAt: { gte: from, lte: to },
          },
        }),
      ]);

    const revenueTotal = payments.reduce((s, p) => s + Number(p.amount), 0);

    const byService = new Map<string, { name: string; count: number; revenue: number }>();
    const byWorker = new Map<
      string,
      { name: string; count: number; revenue: number; commission: number }
    >();

    for (const p of payments) {
      const amount = Number(p.amount);
      const svc = p.appointment?.service;
      const w = p.appointment?.worker;
      if (svc) {
        const cur = byService.get(svc.id) || {
          name: svc.name,
          count: 0,
          revenue: 0,
        };
        cur.count += 1;
        cur.revenue += amount;
        byService.set(svc.id, cur);
      }
      if (w) {
        const pct = Number(w.commissionPct || 0);
        const cur = byWorker.get(w.id) || {
          name: `${w.firstName} ${w.lastName}`.trim(),
          count: 0,
          revenue: 0,
          commission: 0,
        };
        cur.count += 1;
        cur.revenue += amount;
        cur.commission += (amount * pct) / 100;
        byWorker.set(w.id, cur);
      }
    }

    const noShowRate =
      appointments > 0 ? Math.round((noShows / appointments) * 1000) / 10 : 0;

    return {
      from,
      to,
      revenueTotal,
      paymentsCount: payments.length,
      appointments,
      completed,
      cancelled,
      noShows,
      noShowRate,
      topServices: [...byService.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
      topWorkers: [...byWorker.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8),
    };
  }
}
