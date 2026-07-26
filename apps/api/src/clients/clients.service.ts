import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { isValidDocument, normalizeDocument } from '../common/document.util';
import { normalizePhone, phoneLookupVariants } from '../common/phone.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClientDto } from './dto/client.dto';

type ClientStats = {
  visitCount: number;
  totalSpent: number;
  lastVisitAt: Date | null;
};

export type ResolveClientInput = {
  documentNumber: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
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
    const documentNumber = dto.documentNumber
      ? normalizeDocument(dto.documentNumber)
      : undefined;
    if (dto.documentNumber && !isValidDocument(dto.documentNumber)) {
      throw new BadRequestException('Número de documento inválido.');
    }
    return this.prisma.client.create({
      data: {
        tenantId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        whatsapp: dto.whatsapp,
        notes: dto.notes,
        tags: dto.tags,
        documentNumber: documentNumber || null,
      },
    });
  }

  async update(tenantId: string, id: string, dto: Partial<ClientDto>) {
    await this.one(tenantId, id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.documentNumber !== undefined) {
      if (dto.documentNumber && !isValidDocument(dto.documentNumber)) {
        throw new BadRequestException('Número de documento inválido.');
      }
      data.documentNumber = dto.documentNumber
        ? normalizeDocument(dto.documentNumber)
        : null;
    }
    return this.prisma.client.update({ where: { id }, data });
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

  /**
   * Identifica o crea cliente por documento (clave principal).
   * Si no existe el documento, reutiliza el cliente del teléfono cuando aplica.
   */
  async resolveByDocument(tenantId: string, input: ResolveClientInput) {
    if (!isValidDocument(input.documentNumber)) {
      throw new BadRequestException(
        'Número de documento inválido. Usa tu cédula (mín. 5 dígitos).',
      );
    }
    const documentNumber = normalizeDocument(input.documentNumber);
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();

    const byDoc = await this.prisma.client.findFirst({
      where: { tenantId, documentNumber, deletedAt: null },
    });

    if (byDoc) {
      const data: Record<string, unknown> = {};
      if (firstName) data.firstName = firstName;
      if (lastName) data.lastName = lastName;
      if (input.email) data.email = input.email;
      if (phone && phone !== byDoc.phone) {
        const phoneTaken = await this.prisma.client.findFirst({
          where: {
            tenantId,
            phone,
            deletedAt: null,
            NOT: { id: byDoc.id },
          },
          select: { id: true },
        });
        if (!phoneTaken) {
          data.phone = phone;
          data.whatsapp = phone;
        }
      }
      if (!Object.keys(data).length) return byDoc;
      return this.prisma.client.update({ where: { id: byDoc.id }, data });
    }

    if (phone) {
      const variants = phoneLookupVariants(phone);
      const byPhone = await this.prisma.client.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { phone: { in: variants } },
            { whatsapp: { in: variants } },
          ],
        },
      });
      if (byPhone) {
        if (
          byPhone.documentNumber &&
          byPhone.documentNumber !== documentNumber
        ) {
          throw new BadRequestException(
            'Este teléfono ya está asociado a otro documento.',
          );
        }
        return this.prisma.client.update({
          where: { id: byPhone.id },
          data: {
            documentNumber,
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(input.email ? { email: input.email } : {}),
            phone,
            whatsapp: phone,
          },
        });
      }
    }

    if (!firstName || !lastName) {
      throw new BadRequestException(
        'Nombre y apellido son obligatorios para registrar el cliente.',
      );
    }

    return this.prisma.client.create({
      data: {
        tenantId,
        documentNumber,
        firstName,
        lastName,
        phone: phone || null,
        whatsapp: phone || null,
        email: input.email,
      },
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
