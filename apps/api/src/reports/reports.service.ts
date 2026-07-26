import { Injectable } from '@nestjs/common';
import { AppointmentStatus, InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bogotaDateRange } from '../common/bogota-day';

type SaleKind = 'appointment' | 'package' | 'gift_card' | 'other';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private rangeFromQuery(from: string, to: string) {
    const fromKey = (from || '').slice(0, 10);
    const toKey = (to || '').slice(0, 10);
    return bogotaDateRange(
      fromKey || new Date().toISOString().slice(0, 10),
      toKey || new Date().toISOString().slice(0, 10),
    );
  }

  private saleKind(metadata: unknown, appointmentId?: string | null): SaleKind {
    const meta = (metadata || {}) as Record<string, unknown>;
    const type = String(meta.type || '');
    if (type === 'package') return 'package';
    if (type === 'gift_card') return 'gift_card';
    if (appointmentId) return 'appointment';
    return 'other';
  }

  /** Listado de ventas (facturas PAID) del periodo — base de reportes. */
  async paidSales(tenantId: string, from: string, to: string) {
    const { dayStart, dayEnd } = this.rangeFromQuery(from, to);
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: InvoiceStatus.PAID,
        OR: [
          { paidAt: { gte: dayStart, lte: dayEnd } },
          { paidAt: null, issuedAt: { gte: dayStart, lte: dayEnd } },
        ],
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        client: {
          select: { firstName: true, lastName: true },
        },
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
      orderBy: [{ paidAt: 'asc' }, { issuedAt: 'asc' }],
    });
  }

  async csv(tenantId: string, from: string, to: string) {
    const rows = await this.paidSales(tenantId, from, to);
    const lines = [
      'fecha,factura,tipo,monto,cliente,servicio,estilista',
      ...rows.map((inv) => {
        const kind = this.saleKind(inv.metadata, inv.appointmentId);
        const when = (inv.paidAt || inv.issuedAt)?.toISOString() ?? '';
        const client = inv.client
          ? `${inv.client.firstName} ${inv.client.lastName}`.trim()
          : '';
        const svc = inv.appointment?.service?.name ?? inv.items[0]?.description ?? '';
        const w = inv.appointment?.worker
          ? `${inv.appointment.worker.firstName} ${inv.appointment.worker.lastName}`
          : '';
        return `${when},${inv.number},${kind},${Number(inv.total)},${client},${svc},${w}`;
      }),
    ];
    return lines.join('\n');
  }

  async overview(tenantId: string, from: string, to: string) {
    const { dayStart, dayEnd } = this.rangeFromQuery(from, to);

    const [invoices, appointments, noShows, cancelled, completed] =
      await Promise.all([
        this.paidSales(tenantId, from, to),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            startAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.NO_SHOW,
            startAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.CANCELLED,
            startAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.appointment.count({
          where: {
            tenantId,
            deletedAt: null,
            status: AppointmentStatus.COMPLETED,
            startAt: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

    const revenueTotal = invoices.reduce((s, inv) => s + Number(inv.total), 0);

    const breakdown = {
      appointments: 0,
      packages: 0,
      giftCards: 0,
      other: 0,
    };

    const byService = new Map<
      string,
      { name: string; count: number; revenue: number }
    >();
    const byWorker = new Map<
      string,
      { name: string; count: number; revenue: number; commission: number }
    >();

    for (const inv of invoices) {
      const amount = Number(inv.total);
      const kind = this.saleKind(inv.metadata, inv.appointmentId);
      if (kind === 'package') breakdown.packages += amount;
      else if (kind === 'gift_card') breakdown.giftCards += amount;
      else if (kind === 'appointment') breakdown.appointments += amount;
      else breakdown.other += amount;

      const svc = inv.appointment?.service;
      const w = inv.appointment?.worker;
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
      from: dayStart,
      to: dayEnd,
      revenueTotal,
      invoicesCount: invoices.length,
      paymentsCount: invoices.length, // compat UI antigua
      breakdown,
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

  /** @deprecated usar paidSales; se mantiene por compat del endpoint /revenue */
  revenue(tenantId: string, from: Date, to: Date) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        status: 'PAID',
        paidAt: { gte: from, lte: to },
        invoiceId: { not: null },
        method: { not: 'EPAYCO' },
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
            client: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { paidAt: 'asc' },
    });
  }
}
