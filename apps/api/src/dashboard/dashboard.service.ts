import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async metrics(tenantId: string) {
    const dayStart = dayjs().startOf('day').toDate();
    const dayEnd = dayjs().endOf('day').toDate();
    const weekStart = dayjs().startOf('week').toDate();
    const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month').toDate();

    const [
      today,
      completedToday,
      revenueToday,
      cancelled,
      noShows,
      weekAppointments,
      monthInvoices,
      topServiceGroups,
      topWorkerGroups,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: { tenantId, startAt: { gte: dayStart, lte: dayEnd }, deletedAt: null },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          status: 'COMPLETED',
          startAt: { gte: dayStart, lte: dayEnd },
          deletedAt: null,
        },
      }),
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: 'PAID',
          paidAt: { gte: dayStart, lte: dayEnd },
        },
        _sum: { total: true },
      }),
      this.prisma.appointment.count({
        where: { tenantId, status: 'CANCELLED', startAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.prisma.appointment.count({
        where: { tenantId, status: 'NO_SHOW', startAt: { gte: dayStart, lte: dayEnd } },
      }),
      this.prisma.appointment.findMany({
        where: { tenantId, startAt: { gte: weekStart }, deletedAt: null },
        select: { startAt: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          status: 'PAID',
          paidAt: { gte: sixMonthsAgo },
        },
        select: { total: true, paidAt: true },
      }),
      this.prisma.appointment.groupBy({
        by: ['serviceId'],
        where: { tenantId, deletedAt: null, status: { in: ['COMPLETED', 'CONFIRMED', 'PENDING'] } },
        _count: { serviceId: true },
        orderBy: { _count: { serviceId: 'desc' } },
        take: 5,
      }),
      this.prisma.appointment.groupBy({
        by: ['workerId'],
        where: { tenantId, deletedAt: null, status: { in: ['COMPLETED', 'CONFIRMED', 'PENDING'] } },
        _count: { workerId: true },
        orderBy: { _count: { workerId: 'desc' } },
        take: 5,
      }),
    ]);

    const serviceIds = topServiceGroups.map((g) => g.serviceId);
    const workerIds = topWorkerGroups.map((g) => g.workerId);
    const [services, workers] = await Promise.all([
      this.prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } }),
      this.prisma.worker.findMany({
        where: { id: { in: workerIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    const weekLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekCounts = Array(7).fill(0);
    for (const a of weekAppointments) {
      weekCounts[dayjs(a.startAt).day()] += 1;
    }
    const weekly = {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      data: [
        weekCounts[1],
        weekCounts[2],
        weekCounts[3],
        weekCounts[4],
        weekCounts[5],
        weekCounts[6],
        weekCounts[0],
      ],
    };

    const monthlyMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const m = dayjs().subtract(i, 'month');
      monthlyMap.set(m.format('MMM'), 0);
    }
    for (const inv of monthInvoices) {
      if (!inv.paidAt) continue;
      const key = dayjs(inv.paidAt).format('MMM');
      if (monthlyMap.has(key)) {
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(inv.total));
      }
    }

    return {
      today,
      completedToday,
      revenue: Number(revenueToday._sum.total ?? 0),
      cancelled,
      noShows,
      weekly,
      monthly: {
        labels: [...monthlyMap.keys()],
        data: [...monthlyMap.values()],
      },
      topServices: topServiceGroups.map((g) => ({
        id: g.serviceId,
        name: services.find((s) => s.id === g.serviceId)?.name ?? 'Servicio',
        count: g._count.serviceId,
      })),
      topWorkers: topWorkerGroups.map((g) => {
        const w = workers.find((x) => x.id === g.workerId);
        return {
          id: g.workerId,
          name: w ? `${w.firstName} ${w.lastName}` : 'Profesional',
          count: g._count.workerId,
        };
      }),
      weekLabels,
    };
  }
}
