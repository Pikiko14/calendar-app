import { Injectable } from '@nestjs/common';
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
      include: { appointment: true },
      orderBy: { paidAt: 'asc' },
    });
  }

  async csv(tenantId: string, from: Date, to: Date) {
    const rows = await this.revenue(tenantId, from, to);
    const lines = [
      'fecha,monto,metodo,cita',
      ...rows.map(
        (x) =>
          `${x.paidAt?.toISOString() ?? ''},${x.amount},${x.method},${x.appointmentId ?? ''}`,
      ),
    ];
    return lines.join('\n');
  }
}
