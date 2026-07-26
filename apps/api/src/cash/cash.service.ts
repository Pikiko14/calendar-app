import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  async open(
    tenantId: string,
    dto: { openingFloat?: number; branchId?: string; notes?: string; openedById?: string },
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

  async close(tenantId: string, id: string, dto: { closingCash: number; notes?: string }) {
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

    return this.prisma.cashRegister.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closingCash: dto.closingCash,
        notes: dto.notes
          ? `${reg.notes || ''}\nCierre: ${dto.notes}`.trim()
          : reg.notes,
      },
      // return summary in response via wrapper
    }).then((closed) => ({
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
    dto: { category: string; amount: number; description?: string; date?: string },
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
