import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialtyDto, UpdateSpecialtyDto } from './dto/specialties.dto';

@Injectable()
export class SpecialtiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.specialty.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(tenantId: string, dto: SpecialtyDto) {
    const exists = await this.prisma.specialty.findFirst({
      where: {
        tenantId,
        name: { equals: dto.name.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (exists) {
      throw new ConflictException('Ya existe una especialidad con ese nombre.');
    }
    return this.prisma.specialty.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        color: dto.color || '#0F766E',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSpecialtyDto) {
    const specialty = await this.prisma.specialty.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!specialty) throw new NotFoundException('Especialidad no encontrada.');

    if (dto.name && dto.name.trim() !== specialty.name) {
      const exists = await this.prisma.specialty.findFirst({
        where: {
          tenantId,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          deletedAt: null,
          NOT: { id },
        },
      });
      if (exists) {
        throw new ConflictException('Ya existe una especialidad con ese nombre.');
      }
    }

    const updated = await this.prisma.specialty.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    // Mantener cache de nombres en workers
    await this.syncWorkerSpecialtyNames(id);
    return updated;
  }

  async remove(tenantId: string, id: string) {
    const specialty = await this.prisma.specialty.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!specialty) throw new NotFoundException('Especialidad no encontrada.');

    const affected = await this.prisma.workerSpecialty.findMany({
      where: { specialtyId: id },
      select: { workerId: true },
    });
    await this.prisma.workerSpecialty.deleteMany({ where: { specialtyId: id } });
    await this.prisma.specialty.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    for (const { workerId } of affected) {
      await this.refreshWorkerCache(workerId);
    }
    return { ok: true };
  }

  private async syncWorkerSpecialtyNames(specialtyId: string) {
    const links = await this.prisma.workerSpecialty.findMany({
      where: { specialtyId },
      select: { workerId: true },
    });
    for (const { workerId } of links) {
      await this.refreshWorkerCache(workerId);
    }
  }

  async refreshWorkerCache(workerId: string) {
    const links = await this.prisma.workerSpecialty.findMany({
      where: { workerId, specialty: { deletedAt: null, isActive: true } },
      include: { specialty: { select: { name: true } } },
      orderBy: { specialty: { name: 'asc' } },
    });
    await this.prisma.worker.update({
      where: { id: workerId },
      data: { specialties: links.map((l) => l.specialty.name) },
    });
  }

  async ensureDefaults(tenantId: string) {
    const defaults = ['Corte', 'Barba', 'Tintura', 'Masaje', 'Facial'];
    for (const name of defaults) {
      await this.prisma.specialty.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name },
        update: {},
      });
    }
    return this.list(tenantId);
  }
}
