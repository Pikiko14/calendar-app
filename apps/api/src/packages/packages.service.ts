import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

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

  listClientPackages(tenantId: string, clientId?: string) {
    return this.prisma.clientPackage.findMany({
      where: {
        tenantId,
        ...(clientId ? { clientId } : {}),
        isActive: true,
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        package: true,
      },
      orderBy: { purchasedAt: 'desc' },
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

    const [purchase] = await this.prisma.$transaction([
      this.prisma.clientPackage.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          packageId: pkg.id,
          totalSessions: pkg.sessions,
          usedSessions: 0,
          expiresAt,
          notes: dto.notes,
        },
        include: { package: true, client: true },
      }),
      this.prisma.payment.create({
        data: {
          tenantId,
          amount: pkg.price,
          currency: 'COP',
          status: 'PAID',
          method: 'CASH',
          provider: 'LOCAL',
          paidAt: new Date(),
          metadata: {
            type: 'package',
            packageId: pkg.id,
            clientId: dto.clientId,
          },
        },
      }),
    ]);

    return purchase;
  }

  async consume(tenantId: string, id: string) {
    const row = await this.prisma.clientPackage.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!row) throw new NotFoundException('Membresía no encontrada.');
    if (row.expiresAt && row.expiresAt < new Date()) {
      throw new BadRequestException('Paquete vencido.');
    }
    if (row.usedSessions >= row.totalSessions) {
      throw new BadRequestException('Sin sesiones disponibles.');
    }
    const used = row.usedSessions + 1;
    return this.prisma.clientPackage.update({
      where: { id },
      data: {
        usedSessions: used,
        isActive: used < row.totalSessions,
      },
    });
  }
}
