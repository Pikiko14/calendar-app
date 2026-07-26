import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string, status?: WaitlistStatus) {
    return this.prisma.waitlistEntry.findMany({
      where: {
        tenantId,
        ...(status ? { status } : { status: { not: WaitlistStatus.CANCELLED } }),
      },
      include: {
        client: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        service: { select: { id: true, name: true } },
        worker: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async create(
    tenantId: string,
    dto: {
      clientId?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      serviceId: string;
      workerId?: string;
      preferredDate?: string;
      preferredTime?: string;
    },
  ) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });
    if (settings && !settings.waitlistEnabled) {
      throw new BadRequestException('Lista de espera desactivada.');
    }

    let clientId = dto.clientId;
    if (!clientId) {
      if (!dto.phone || !dto.firstName) {
        throw new BadRequestException('Cliente o datos de contacto requeridos.');
      }
      const client = await this.prisma.client.upsert({
        where: {
          tenantId_phone: { tenantId, phone: dto.phone },
        },
        create: {
          tenantId,
          firstName: dto.firstName,
          lastName: dto.lastName || '',
          phone: dto.phone,
          whatsapp: dto.phone,
        },
        update: {
          firstName: dto.firstName,
          lastName: dto.lastName || undefined,
        },
      });
      clientId = client.id;
    }

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId, deletedAt: null },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado.');

    return this.prisma.waitlistEntry.create({
      data: {
        tenantId,
        clientId,
        serviceId: dto.serviceId,
        workerId: dto.workerId,
        preferredDate: dto.preferredDate
          ? new Date(dto.preferredDate)
          : undefined,
        preferredTime: dto.preferredTime,
        status: WaitlistStatus.WAITING,
      },
      include: {
        client: true,
        service: true,
        worker: true,
      },
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: WaitlistStatus,
  ) {
    const entry = await this.prisma.waitlistEntry.findFirst({
      where: { id, tenantId },
    });
    if (!entry) throw new NotFoundException('Entrada no encontrada.');
    return this.prisma.waitlistEntry.update({
      where: { id },
      data: {
        status,
        notifiedAt:
          status === WaitlistStatus.OFFERED ? new Date() : entry.notifiedAt,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    return this.updateStatus(tenantId, id, WaitlistStatus.CANCELLED);
  }
}
