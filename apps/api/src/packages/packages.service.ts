import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.servicePackage.findMany({
      where: { tenantId },
      include: { service: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    tenantId: string,
    dto: {
      name: string;
      description?: string;
      serviceId?: string;
      sessions: number;
      price: number;
      validityDays?: number;
    },
  ) {
    if (dto.sessions < 1) {
      throw new BadRequestException('Sesiones debe ser >= 1.');
    }
    return this.prisma.servicePackage.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        serviceId: dto.serviceId,
        sessions: dto.sessions,
        price: new Prisma.Decimal(dto.price),
        validityDays: dto.validityDays,
      },
      include: { service: true },
    });
  }

  async toggle(tenantId: string, id: string, isActive: boolean) {
    const pkg = await this.prisma.servicePackage.findFirst({
      where: { id, tenantId },
    });
    if (!pkg) throw new NotFoundException('Paquete no encontrado.');
    return this.prisma.servicePackage.update({
      where: { id },
      data: { isActive },
    });
  }

  async remove(tenantId: string, id: string) {
    const pkg = await this.prisma.servicePackage.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { purchases: true } } },
    });
    if (!pkg) throw new NotFoundException('Paquete no encontrado.');

    await this.prisma.$transaction([
      this.prisma.clientPackage.deleteMany({
        where: { tenantId, packageId: id },
      }),
      this.prisma.servicePackage.delete({ where: { id } }),
    ]);

    return {
      ok: true,
      deletedPurchases: pkg._count.purchases,
    };
  }

  listClientPackages(
    tenantId: string,
    clientId?: string,
    opts?: { activeOnly?: boolean },
  ) {
    return this.prisma.clientPackage.findMany({
      where: {
        tenantId,
        ...(clientId ? { clientId } : {}),
        ...(opts?.activeOnly ? { isActive: true } : {}),
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        package: { include: { service: { select: { id: true, name: true } } } },
      },
      orderBy: [{ isActive: 'desc' }, { purchasedAt: 'desc' }],
    });
  }

  async sell(
    tenantId: string,
    dto: { packageId: string; clientId: string; notes?: string },
  ) {
    const pkg = await this.prisma.servicePackage.findFirst({
      where: { id: dto.packageId, tenantId, isActive: true },
    });
    if (!pkg) throw new NotFoundException('Paquete no encontrado.');

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado.');

    const expiresAt = pkg.validityDays
      ? new Date(Date.now() + pkg.validityDays * 86400000)
      : null;

    const purchase = await this.prisma.clientPackage.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        packageId: pkg.id,
        totalSessions: pkg.sessions,
        usedSessions: 0,
        expiresAt,
        notes: dto.notes,
      },
      include: {
        package: true,
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });

    const amount = Number(pkg.price);
    const { invoice, payment } = await this.invoices.issuePaidSale(tenantId, {
      clientId: dto.clientId,
      description: `Paquete ${pkg.name} (${pkg.sessions} visitas)`,
      amount,
      notes: dto.notes || `Venta de paquete ${pkg.name}`,
      metadata: {
        type: 'package',
        packageId: pkg.id,
        clientPackageId: purchase.id,
        clientId: dto.clientId,
      },
    });

    return {
      ...purchase,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: invoice.total,
        status: invoice.status,
      },
      payment: { id: payment.id, amount: payment.amount },
    };
  }

  private purchaseInclude() {
    return {
      client: {
        select: { id: true, firstName: true, lastName: true, phone: true },
      },
      package: { include: { service: { select: { id: true, name: true } } } },
    } as const;
  }

  async consume(tenantId: string, id: string) {
    const row = await this.prisma.clientPackage.findFirst({
      where: { id, tenantId },
      include: this.purchaseInclude(),
    });
    if (!row) throw new NotFoundException('Paquete del cliente no encontrado.');
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new BadRequestException('Paquete vencido.');
    }
    if (row.usedSessions >= row.totalSessions) {
      throw new BadRequestException('Sin visitas disponibles.');
    }
    const used = row.usedSessions + 1;
    return this.prisma.clientPackage.update({
      where: { id },
      data: {
        usedSessions: used,
        isActive: used < row.totalSessions,
      },
      include: this.purchaseInclude(),
    });
  }

  /** Devuelve una visita (si se descontó por error). */
  async restore(tenantId: string, id: string) {
    const row = await this.prisma.clientPackage.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Paquete del cliente no encontrado.');
    if (row.usedSessions < 1) {
      throw new BadRequestException('No hay visitas para devolver.');
    }
    const used = row.usedSessions - 1;
    return this.prisma.clientPackage.update({
      where: { id },
      data: {
        usedSessions: used,
        isActive: true,
      },
      include: this.purchaseInclude(),
    });
  }

  /**
   * Descuenta 1 visita del mejor paquete activo del cliente.
   * Prefiere packs del mismo servicio; luego packs “cualquier servicio”.
   */
  async consumeForClient(
    tenantId: string,
    clientId: string,
    serviceId?: string | null,
  ) {
    const now = new Date();
    const eligible = (
      await this.prisma.clientPackage.findMany({
        where: {
          tenantId,
          clientId,
          isActive: true,
        },
        include: {
          package: { select: { id: true, name: true, serviceId: true } },
          client: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { purchasedAt: 'asc' },
      })
    ).filter(
      (r) =>
        r.usedSessions < r.totalSessions &&
        (!r.expiresAt || r.expiresAt >= now),
    );

    if (!eligible.length) return null;

    const matchService = serviceId
      ? eligible.find((r) => r.package.serviceId === serviceId)
      : undefined;
    const anyService = eligible.find((r) => !r.package.serviceId);
    const pick = matchService || anyService || eligible[0];

    const updated = await this.consume(tenantId, pick.id);
    return {
      purchaseId: updated.id,
      packageName: updated.package?.name || pick.package.name,
      usedSessions: updated.usedSessions,
      totalSessions: updated.totalSessions,
      remaining: updated.totalSessions - updated.usedSessions,
      clientName:
        `${updated.client?.firstName || ''} ${updated.client?.lastName || ''}`.trim(),
    };
  }
}
