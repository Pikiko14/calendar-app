import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { bogotaDayRange } from '../common/bogota-day';
import { dayEnumFromIndex, toMinutes } from '../common/schedule.util';

/** Minutos antes del cierre del negocio para pedir cerrar caja. */
const CLOSE_WARN_MINUTES = 30;

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  current(tenantId: string) {
    return this.prisma.cashRegister.findFirst({
      where: { tenantId, closedAt: null },
      orderBy: { openedAt: 'desc' },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  list(tenantId: string) {
    return this.prisma.cashRegister.findMany({
      where: { tenantId },
      orderBy: { openedAt: 'desc' },
      take: 30,
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  /**
   * Estado operativo de caja + horario de la sede principal (Bogotá).
   * Sirve para pedir apertura al entrar y cierre cerca del cierre del local.
   */
  async status(tenantId: string) {
    const { dayStart, dayEnd } = bogotaDayRange();
    const now = new Date();

    const [open, openedToday, branch] = await Promise.all([
      this.current(tenantId),
      this.prisma.cashRegister.findFirst({
        where: {
          tenantId,
          openedAt: { gte: dayStart, lte: dayEnd },
        },
        orderBy: { openedAt: 'desc' },
      }),
      this.prisma.branch.findFirst({
        where: { tenantId, deletedAt: null, isMain: true },
        include: {
          schedules: {
            include: { blocks: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      }),
    ]);

    // Día civil Bogotá (UTC-5)
    const bogotaShifted = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const dayKey = dayEnumFromIndex(bogotaShifted.getUTCDay()) as DayOfWeek;

    const schedule =
      branch?.schedules?.find((s) => s.dayOfWeek === dayKey) || null;
    const blocks = schedule?.isClosed ? [] : schedule?.blocks || [];
    const businessOpenToday = blocks.length > 0;

    let openingTime: string | null = null;
    let closingTime: string | null = null;
    let closingAt: Date | null = null;
    let minutesUntilClose: number | null = null;

    if (businessOpenToday) {
      let minStart = Infinity;
      let maxEnd = -Infinity;
      for (const b of blocks) {
        minStart = Math.min(minStart, toMinutes(b.startTime));
        maxEnd = Math.max(maxEnd, toMinutes(b.endTime));
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      openingTime = `${pad(Math.floor(minStart / 60))}:${pad(minStart % 60)}`;
      closingTime = `${pad(Math.floor(maxEnd / 60))}:${pad(maxEnd % 60)}`;

      const y = bogotaShifted.getUTCFullYear();
      const m = bogotaShifted.getUTCMonth();
      const d = bogotaShifted.getUTCDate();
      // cierre Bogotá → UTC (+5h)
      closingAt = new Date(
        Date.UTC(y, m, d, Math.floor(maxEnd / 60) + 5, maxEnd % 60, 0, 0),
      );
      minutesUntilClose = Math.round(
        (closingAt.getTime() - now.getTime()) / 60000,
      );
    }

    const alreadyClosedToday = Boolean(openedToday?.closedAt);
    const isOpen = Boolean(open && !open.closedAt);

    // Pedir abrir: no hay caja abierta, el local abre hoy y aún no se cerró el día
    const needsOpen = !isOpen && businessOpenToday && !alreadyClosedToday;

    // Pedir cerrar: hay caja abierta y faltan ≤30 min (o ya pasó el cierre)
    const needsClose =
      isOpen &&
      minutesUntilClose != null &&
      minutesUntilClose <= CLOSE_WARN_MINUTES;

    return {
      register: open,
      isOpen,
      businessOpenToday,
      alreadyClosedToday,
      openingTime,
      closingTime,
      closingAt,
      minutesUntilClose,
      closeWarnMinutes: CLOSE_WARN_MINUTES,
      needsOpen,
      needsClose,
      branch: branch ? { id: branch.id, name: branch.name } : null,
    };
  }

  async open(
    tenantId: string,
    dto: {
      openingFloat?: number;
      branchId?: string;
      notes?: string;
      openedById?: string;
    },
  ) {
    const open = await this.current(tenantId);
    if (open) {
      throw new BadRequestException('Ya hay una caja abierta. Ciérrala primero.');
    }
    return this.prisma.cashRegister.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        openedById: dto.openedById,
        openingFloat: dto.openingFloat ?? 0,
        notes: dto.notes,
      },
    });
  }

  async close(
    tenantId: string,
    id: string,
    dto: { closingCash: number; notes?: string },
  ) {
    const reg = await this.prisma.cashRegister.findFirst({
      where: { id, tenantId, closedAt: null },
    });
    if (!reg) throw new NotFoundException('Caja no encontrada o ya cerrada.');

    const sales = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        status: 'PAID',
        paidAt: { gte: reg.openedAt },
        method: { in: ['CASH', 'CARD', 'TRANSFER', 'OTHER'] },
        invoiceId: { not: null },
      },
      _sum: { amount: true },
    });

    const expenses = await this.prisma.expense.aggregate({
      where: {
        tenantId,
        date: { gte: reg.openedAt },
      },
      _sum: { amount: true },
    });

    const expected =
      Number(reg.openingFloat) +
      Number(sales._sum.amount || 0) -
      Number(expenses._sum.amount || 0);

    return this.prisma.cashRegister
      .update({
        where: { id },
        data: {
          closedAt: new Date(),
          closingCash: dto.closingCash,
          notes: dto.notes
            ? `${reg.notes || ''}\nCierre: ${dto.notes}`.trim()
            : reg.notes,
        },
      })
      .then((closed) => ({
        ...closed,
        summary: {
          openingFloat: Number(reg.openingFloat),
          sales: Number(sales._sum.amount || 0),
          expenses: Number(expenses._sum.amount || 0),
          expected,
          closingCash: Number(dto.closingCash),
          difference: Number(dto.closingCash) - expected,
        },
      }));
  }

  listExpenses(tenantId: string) {
    return this.prisma.expense.findMany({
      where: { tenantId },
      orderBy: { date: 'desc' },
      take: 100,
    });
  }

  createExpense(
    tenantId: string,
    dto: {
      category: string;
      amount: number;
      description?: string;
      date?: string;
    },
  ) {
    return this.prisma.expense.create({
      data: {
        tenantId,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
  }
}
