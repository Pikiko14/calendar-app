import { Injectable, NotFoundException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { SpecialtiesService } from '../specialties/specialties.service';
import {
  TimeOffDto,
  UpdateWorkerDto,
  WorkerDto,
  WorkerScheduleDto,
  WeeklyScheduleDto,
} from './dto/workers.dto';

@Injectable()
export class WorkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly specialties: SpecialtiesService,
  ) {}

  list(tenantId: string) {
    return this.prisma.worker.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        services: { include: { service: true } },
        specialtyLinks: { include: { specialty: true } },
        schedules: { include: { blocks: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { firstName: 'asc' }],
    });
  }

  async create(tenantId: string, dto: WorkerDto) {
    const main = await this.branches.getOrCreateMain(tenantId);
    const { specialtyIds, ...rest } = dto;
    const worker = await this.prisma.worker.create({
      data: {
        tenantId,
        branchId: rest.branchId || main.id,
        firstName: rest.firstName,
        lastName: rest.lastName,
        email: rest.email,
        phone: rest.phone,
        photoUrl: rest.photoUrl,
        isActive: rest.isActive ?? true,
      },
    });
    await this.branches.copyScheduleToWorker(tenantId, worker.id);

    const services = await this.prisma.service.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (services.length) {
      await this.prisma.workerService.createMany({
        data: services.map((s: { id: string }) => ({
          workerId: worker.id,
          serviceId: s.id,
        })),
        skipDuplicates: true,
      });
    }

    if (specialtyIds?.length) {
      await this.setSpecialties(tenantId, worker.id, specialtyIds);
    }

    return this.findOne(tenantId, worker.id);
  }

  private findOne(tenantId: string, id: string) {
    return this.prisma.worker.findFirst({
      where: { id, tenantId },
      include: {
        services: { include: { service: true } },
        specialtyLinks: { include: { specialty: true } },
        schedules: { include: { blocks: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateWorkerDto) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!worker) throw new NotFoundException('Profesional no encontrado.');

    const { specialtyIds, ...rest } = dto;
    await this.prisma.worker.update({ where: { id }, data: rest });

    if (specialtyIds !== undefined) {
      await this.setSpecialties(tenantId, id, specialtyIds);
    }

    return this.findOne(tenantId, id);
  }

  async setSpecialties(tenantId: string, workerId: string, specialtyIds: string[]) {
    await this.updateExists(tenantId, workerId);
    const valid = await this.prisma.specialty.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        id: { in: specialtyIds },
      },
      select: { id: true },
    });
    await this.prisma.workerSpecialty.deleteMany({ where: { workerId } });
    if (valid.length) {
      await this.prisma.workerSpecialty.createMany({
        data: valid.map((s: { id: string }) => ({ workerId, specialtyId: s.id })),
        skipDuplicates: true,
      });
    }
    await this.specialties.refreshWorkerCache(workerId);
    return this.findOne(tenantId, workerId);
  }

  private async updateExists(tenantId: string, id: string) {
    const worker = await this.prisma.worker.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!worker) throw new NotFoundException('Profesional no encontrado.');
  }

  async remove(tenantId: string, id: string) {
    await this.updateExists(tenantId, id);
    return this.prisma.worker.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async services(tenantId: string, id: string, serviceIds: string[]) {
    await this.updateExists(tenantId, id);
    await this.prisma.workerService.deleteMany({ where: { workerId: id } });
    return this.prisma.workerService.createMany({
      data: serviceIds.map((serviceId) => ({ workerId: id, serviceId })),
    });
  }

  async schedule(tenantId: string, id: string, dto: WorkerScheduleDto) {
    await this.updateExists(tenantId, id);
    const dayOfWeek = dto.dayOfWeek as DayOfWeek;
    const blocks = dto.isOff ? [] : dto.blocks;
    return this.prisma.workerSchedule.upsert({
      where: { workerId_dayOfWeek: { workerId: id, dayOfWeek } },
      create: {
        workerId: id,
        dayOfWeek,
        isOff: dto.isOff ?? false,
        blocks: { create: blocks.map((b, i) => ({ ...b, sortOrder: i })) },
      },
      update: {
        isOff: dto.isOff ?? false,
        blocks: {
          deleteMany: {},
          create: blocks.map((b, i) => ({ ...b, sortOrder: i })),
        },
      },
      include: { blocks: true },
    });
  }

  async setWeeklySchedule(tenantId: string, id: string, dto: WeeklyScheduleDto) {
    await this.updateExists(tenantId, id);
    for (const day of dto.days) {
      await this.schedule(tenantId, id, day);
    }
    return this.findOne(tenantId, id);
  }

  async timeOff(tenantId: string, id: string, dto: TimeOffDto) {
    await this.updateExists(tenantId, id);
    return this.prisma.workerTimeOff.create({
      data: {
        workerId: id,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        reason: dto.reason,
        type: (dto.type as any) ?? 'VACATION',
      },
    });
  }
}
