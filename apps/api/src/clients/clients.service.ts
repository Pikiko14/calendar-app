import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientDto } from './dto/client.dto';

type ClientStats = {
  visitCount: number;
  totalSpent: number;
  lastVisitAt: Date | null;
};

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const clients = await this.prisma.client.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const stats = await this.statsFromCompleted(
      tenantId,
      clients.map((c) => c.id),
    );
    return clients.map((c) => ({ ...c, ...stats.get(c.id)! }));
  }

  async one(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');
    const stats = await this.statsFromCompleted(tenantId, [id]);
    return { ...client, ...stats.get(id)! };
  }

  create(tenantId: string, dto: ClientDto) {
    return this.prisma.client.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: Partial<ClientDto>) {
    await this.one(tenantId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.one(tenantId, id);
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async history(tenantId: string, id: string) {
    await this.prisma.client.findFirstOrThrow({
      where: { id, tenantId, deletedAt: null },
    });
    return this.prisma.appointment.findMany({
      where: { tenantId, clientId: id, deletedAt: null },
      include: { service: true, worker: true },
      orderBy: { startAt: 'desc' },
    });
  }

  /** Recalcula y persiste visitas/gasto desde citas COMPLETED. */
  async refreshStats(tenantId: string, clientId: string) {
    const stats = await this.statsFromCompleted(tenantId, [clientId]);
    const s = stats.get(clientId)!;
    return this.prisma.client.update({
      where: { id: clientId },
      data: {
        visitCount: s.visitCount,
        totalSpent: s.totalSpent,
        lastVisitAt: s.lastVisitAt,
      },
    });
  }

  private async statsFromCompleted(
    tenantId: string,
    clientIds: string[],
  ): Promise<Map<string, ClientStats>> {
    const map = new Map<string, ClientStats>();
    for (const id of clientIds) {
      map.set(id, { visitCount: 0, totalSpent: 0, lastVisitAt: null });
    }
    if (!clientIds.length) return map;

    const rows = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        clientId: { in: clientIds },
        deletedAt: null,
        status: AppointmentStatus.COMPLETED,
      },
      select: {
        clientId: true,
        startAt: true,
        completedAt: true,
        service: { select: { price: true } },
      },
    });

    for (const a of rows) {
      const cur = map.get(a.clientId);
      if (!cur) continue;
      cur.visitCount += 1;
      cur.totalSpent += Number(a.service.price);
      const when = a.completedAt ?? a.startAt;
      if (!cur.lastVisitAt || when > cur.lastVisitAt) {
        cur.lastVisitAt = when;
      }
    }
    return map;
  }
}
